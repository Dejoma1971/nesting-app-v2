/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useCallback, useEffect } from 'react';
import { partJsonToClipper } from '../utils/GeometrySanitizer';
import type { ImportedPart } from '../components/types';
import type { PlacedPart } from '../utils/nestingCore'; 

// Configuração
const ROTATIONS = [0, 90, 180, 270]; 
const SPACING = 5; 
const SAFETY_MARGIN = 0.5; // Margem visual para evitar "toque"
const MAX_BINS = 50; // Limite de segurança

// --- HELPER: NORMALIZADOR DE GEOMETRIA ---
// 1. Encontra os limites (onde a peça foi desenhada no CAD)
// 2. Move para (0,0) para o cálculo matemático funcionar
// 3. Retorna a geometria limpa e o offset original para compensação visual posterior
const normalizeAndScale = (clipperPath: {X:number, Y:number}[]) => {
    if (!clipperPath || clipperPath.length === 0) return null;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const p of clipperPath) {
        if (p.X < minX) minX = p.X;
        if (p.X > maxX) maxX = p.X;
        if (p.Y < minY) minY = p.Y;
        if (p.Y > maxY) maxY = p.Y;
    }

    const SCALE = 1000; 

    // Move pontos para (0,0) e converte para mm (Float)
    const points = clipperPath.map(p => ({
        x: (p.X - minX) / SCALE,
        y: (p.Y - minY) / SCALE
    }));

    return {
        geometry: points,
        width: (maxX - minX) / SCALE,
        height: (maxY - minY) / SCALE,
        area: ((maxX - minX) * (maxY - minY)) / (SCALE * SCALE),
        // O segredo para não "explodir": Guardamos onde ela estava
        offset: { x: minX / SCALE, y: minY / SCALE }
    };
};

// Helper simples para "Point in Polygon" (Ray Casting)
function isPointInPolygon(point: {x:number, y:number}, vs: {x:number, y:number}[]) {
    const { x, y } = point;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const { x: xi, y: yi } = vs[i];
        const { x: xj, y: yj } = vs[j];
        
        const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export const useNfpNesting = (binWidth: number, binHeight: number) => {
  const [isNesting, setIsNesting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [placedParts, setPlacedParts] = useState<PlacedPart[]>([]);
  
  const workerRef = useRef<Worker | null>(null);
  const pendingRequestRef = useRef<((value: any) => void) | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/nfpNesting.worker.ts', import.meta.url));
    
    workerRef.current.onmessage = (e) => {
      const { type, nfp, key, message } = e.data;
      
      if (type === 'NFP_RESULT') {
        if (pendingRequestRef.current) {
          pendingRequestRef.current({ success: true, nfp, key: JSON.parse(key) });
          pendingRequestRef.current = null;
        }
      } else if (type === 'NFP_ERROR' || type === 'ERROR') {
        if (pendingRequestRef.current) {
          pendingRequestRef.current({ success: false, message });
          pendingRequestRef.current = null;
        }
      }
    };

    return () => workerRef.current?.terminate();
  }, []);

  const getNfpFromWorker = useCallback((pairData: any): Promise<any> => {
    return new Promise((resolve) => {
      if (!workerRef.current) {
        resolve({ success: false, message: 'Worker not ready' });
        return;
      }
      pendingRequestRef.current = resolve;
      workerRef.current.postMessage({ type: 'CALCULATE_NFP', pair: pairData });
    });
  }, []);

  const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 10));

  const startNesting = useCallback(async (partsToNest: ImportedPart[]) => {
    if (isNesting || partsToNest.length === 0) return;
    
    setIsNesting(true);
    setPlacedParts([]);
    setProgress(0);

    try {
        // --- FASE 1: PREPARAÇÃO E NORMALIZAÇÃO ---
        const queue: any[] = [];
        const BATCH_SIZE = 5; 

        for (let i = 0; i < partsToNest.length; i++) {
            const part = partsToNest[i];
            
            // Sanitiza (Clipper Int)
            const polyClipper = partJsonToClipper(part);
            
            // Normaliza (Float mm em 0,0)
            const normalized = normalizeAndScale(polyClipper[0]);

            if (normalized) {
                queue.push({ 
                    ...part, 
                    geometry: normalized.geometry, 
                    width: normalized.width,
                    height: normalized.height,
                    area: normalized.area,
                    originalOffset: normalized.offset // Guarda para restaurar posição depois
                });
            }

            if (i % BATCH_SIZE === 0) {
                await yieldToMain();
                setProgress(Math.round((i / partsToNest.length) * 10)); 
            }
        }

        queue.sort((a, b) => b.area - a.area);

        const resultPlaced: PlacedPart[] = [];
        
        // --- FASE 2: LOOP DE ENCAIXE ---
        for (let i = 0; i < queue.length; i++) {
            const currentPart = queue[i];
            let placed = false;
            let currentBinIndex = 0;

            while (!placed && currentBinIndex < MAX_BINS) {
                let bestPosition = null;
                const partsInThisBin = resultPlaced.filter(p => p.binId === currentBinIndex);

                // Se chapa vazia, tenta encaixar no canto (10,10)
                if (partsInThisBin.length === 0) {
                     for (const rotation of ROTATIONS) {
                         // Verifica dimensões aproximadas
                         const dim = (rotation === 90 || rotation === 270) 
                            ? { w: currentPart.height, h: currentPart.width }
                            : { w: currentPart.width, h: currentPart.height };

                         if (dim.w <= binWidth && dim.h <= binHeight) {
                             bestPosition = { x: 10, y: 10, rotation: 0 }; // Começa sempre sem rotação se couber
                             break;
                         }
                     }
                } else {
                    // Chapa ocupada: NFP
                    for (const rotation of ROTATIONS) {
                        const combinedNfp: any[] = [];
                        let skipRotation = false;

                        for (const placed of partsInThisBin) {
                            const placedOriginal = queue.find(p => p.id === placed.partId);
                            if (!placedOriginal) continue;

                            // OBS: Usamos xPlacement/yPlacement internos (normalizados) para o cálculo
                            // Mas `placed` contém coordenadas visuais (deslocadas).
                            // Precisamos reconstruir a posição "Física" (0,0 based) da peça colocada.
                            
                            // A peça colocada está visualmente em `placed.x`.
                            // O offset dela era `placedOriginal.originalOffset.x`.
                            // Então sua posição física normalizada é:
                            // physX = placed.x_rotated - ??? 
                            
                            // SIMPLIFICAÇÃO ROBUSTA:
                            // Para o cálculo NFP, precisamos saber onde a peça A está RELATIVA à origem da chapa,
                            // considerando que a peça A é o modelo normalizado (0,0).
                            // Se salvamos `placementX` (físico) no objeto `placed`, facilitaria.
                            // Como salvamos `x` (visual), vamos recalcular o físico inverso.
                            
                            // Recupera o offset rotacionado da peça A
                            const radA = placed.rotation * Math.PI / 180;
                            const cosA = Math.cos(radA);
                            const sinA = Math.sin(radA);
                            const offX = placedOriginal.originalOffset.x;
                            const offY = placedOriginal.originalOffset.y;
                            
                            // O deslocamento visual que aplicamos foi:
                            const visShiftX = offX * cosA - offY * sinA;
                            const visShiftY = offX * sinA + offY * cosA;

                            // Então a posição física é:
                            const physX = placed.x - visShiftX;
                            const physY = placed.y - visShiftY;

                            // Agora pedimos o NFP entre as geometrias NORMALIZADAS (0,0)
                            const workerA = placedOriginal.geometry; 
                            const workerB = currentPart.geometry;

                            const response = await getNfpFromWorker({
                                A: workerA,
                                B: workerB,
                                A_id: placed.partId,
                                B_id: currentPart.id,
                                rotationA: placed.rotation,
                                rotationB: rotation,
                                inside: false
                            });

                            if (response.success && response.nfp) {
                                // Soma a posição física da peça A ao NFP
                                const finalNfp = response.nfp.map((p: any) => ({
                                    x: p.x + physX,
                                    y: p.y + physY
                                }));
                                combinedNfp.push(finalNfp);
                            } else {
                                skipRotation = true; break;
                            }
                        }

                        if (skipRotation) continue;

                        // Candidatos
                        const candidates: {x:number, y:number}[] = [{x: SPACING, y: SPACING}];
                        combinedNfp.forEach(poly => {
                            poly.forEach((p: any) => {
                                candidates.push({ x: p.x + SAFETY_MARGIN, y: p.y + SAFETY_MARGIN }); 
                            });
                        });
                        
                        candidates.sort((a, b) => (a.y - b.y) || (a.x - b.x));

                        for (const point of candidates) {
                            let collides = false;
                            for (const nfpPoly of combinedNfp) {
                                if (isPointInPolygon(point, nfpPoly)) {
                                    collides = true; break;
                                }
                            }
                            if (collides) continue;

                            // Verifica limites (usando Bounding Box rotacionado aproximado)
                            const dim = (rotation === 90 || rotation === 270) 
                                ? { w: currentPart.height, h: currentPart.width }
                                : { w: currentPart.width, h: currentPart.height };
                            
                            if (point.x + dim.w > binWidth || point.y + dim.h > binHeight) continue;

                            bestPosition = { x: point.x, y: point.y, rotation };
                            break; 
                        }
                        if (bestPosition) break; 
                    }
                }

                if (bestPosition) {
                    // --- CÁLCULO FINAL DE COMPENSAÇÃO VISUAL ---
                    // O `bestPosition` é onde a peça NORMALIZADA (0,0) deve ficar (Física).
                    // Mas o `InteractiveCanvas` desenha a peça ORIGINAL (ex: 5000,2000).
                    // Precisamos somar o offset rotacionado para que, quando o Canvas desenhar,
                    // a peça caia exatamente no `bestPosition`.
                    
                    const rad = bestPosition.rotation * Math.PI / 180;
                    const cos = Math.cos(rad);
                    const sin = Math.sin(rad);
                    
                    const ox = currentPart.originalOffset.x;
                    const oy = currentPart.originalOffset.y;

                    // Rotação do vetor offset
                    const rotOffsetX = ox * cos - oy * sin;
                    const rotOffsetY = ox * sin + oy * cos;

                    // Posição Visual = Posição Física + Offset Rotacionado
                    // (Ex: Se a peça começa em 5000 e queremos ela em 10, e offset é 5000 -> 10 + (-5000)?? Não.)
                    // CORREÇÃO:
                    // Visual = Físico.
                    // O Canvas aplica `translate(VisualX, VisualY)`.
                    // A geometria interna desenha em `(ox, oy)`.
                    // Resultado na tela = VisualX + ox.
                    // Queremos que Resultado = bestPosition.
                    // Logo: VisualX + ox = bestPosition
                    // VisualX = bestPosition - ox.
                    // (Aplicando rotação no offset):
                    
                    const finalVisualX = bestPosition.x - rotOffsetX;
                    const finalVisualY = bestPosition.y - rotOffsetY;

                    resultPlaced.push({
                        uuid: crypto.randomUUID(),
                        partId: currentPart.id,
                        x: finalVisualX, 
                        y: finalVisualY,
                        rotation: bestPosition.rotation,
                        binId: currentBinIndex
                    });
                    placed = true;
                    setPlacedParts([...resultPlaced]); 
                } else {
                    currentBinIndex++;
                }
            }

            const realProgress = 10 + Math.round(((i + 1) / queue.length) * 90);
            setProgress(realProgress);
            await yieldToMain();
        }

    } catch (error) {
        console.error("Erro NFP:", error);
    } finally {
        setIsNesting(false);
    }
  }, [binWidth, binHeight, getNfpFromWorker, isNesting]);

  return { startNesting, isNesting, progress, placedParts };
};