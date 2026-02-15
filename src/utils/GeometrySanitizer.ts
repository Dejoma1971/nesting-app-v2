/* eslint-disable @typescript-eslint/no-explicit-any */
import ClipperLib from 'clipper-lib'; 

const SCALE = 1000; 
const TOLERANCE = 0.1; // Tolerância fina (o Gatekeeper garante que os dados são bons)

interface Point { x: number; y: number; }

// --- 1. MATEMÁTICA DE MATRIZES (Para aplicar Rotação/Escala do Bloco) ---

function applyTransform(p: Point, transform: { x: number, y: number, scale: {x:number, y:number}, rotation: number }): Point {
    // 1. Escala
    let x = p.x * transform.scale.x;
    let y = p.y * transform.scale.y;

    // 2. Rotação (Se houver)
    if (transform.rotation !== 0) {
        const rad = transform.rotation * (Math.PI / 180);
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const rx = x * cos - y * sin;
        const ry = x * sin + y * cos;
        x = rx;
        y = ry;
    }

    // 3. Translação
    return {
        x: x + transform.x,
        y: y + transform.y
    };
}

// --- 2. AUXILIARES DE GEOMETRIA ---

function discretizeArc(
  center: Point, 
  radius: number, 
  startAngle: number, 
  endAngle: number
): Point[] {
  const points: Point[] = [];
  let totalAngle = endAngle - startAngle;
  
  if (totalAngle <= 0) totalAngle += 2 * Math.PI;
  if (Math.abs(totalAngle) < 1e-4) totalAngle = 2 * Math.PI;

  const arcLength = radius * totalAngle;
  let segments = Math.ceil(arcLength / 2); 
  segments = Math.max(12, Math.min(64, segments));

  const step = totalAngle / segments;

  for (let i = 0; i <= segments; i++) {
    const theta = startAngle + (step * i);
    points.push({
      x: center.x + radius * Math.cos(theta),
      y: center.y + radius * Math.sin(theta)
    });
  }
  return points;
}

// Converte "Bulge" (curvatura de polyline) em arco
function bulgeToArc(p1: Point, p2: Point, bulge: number): Point[] {
    if (bulge === 0) return [p1, p2];

    const chordDx = p2.x - p1.x;
    const chordDy = p2.y - p1.y;
    const chordLen = Math.sqrt(chordDx*chordDx + chordDy*chordDy);
    
    const radius = chordLen * (1 + bulge*bulge) / (4 * Math.abs(bulge));
    const centerScale = (1 - bulge*bulge) / (4 * bulge);
    
    const cx = (p1.x + p2.x)/2 - chordDy * centerScale;
    const cy = (p1.y + p2.y)/2 + chordDx * centerScale;
    
    const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
    const endAngle = Math.atan2(p2.y - cy, p2.x - cx);
    
    // Define direção baseada no sinal do bulge
    let sAngle = startAngle;
    let eAngle = endAngle;
    
    if (bulge < 0) {
       const temp = sAngle; sAngle = eAngle; eAngle = temp;
    }
    
    const points = discretizeArc({x: cx, y: cy}, radius, sAngle, eAngle);
    
    if (bulge < 0) points.reverse();
    
    return points;
}

function arePointsEqual(p1: Point, p2: Point): boolean {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return (dx*dx + dy*dy) < (TOLERANCE * TOLERANCE);
}

// --- 3. EXTRATOR COM LOGICA GATEKEEPER ---

function extractSegments(partData: any): { start: Point, end: Point, path: Point[] }[] {
    const segments: { start: Point, end: Point, path: Point[] }[] = [];
    
    // --- GATEKEEPER: Só aceita se tiver INSERT (Bloco) ---
    const insert = partData.entities.find((e: any) => e.type === 'INSERT');
    
    if (!insert || !partData.blocks || !partData.blocks[insert.name]) {
        console.warn(`[Gatekeeper] Peça ${partData.name} ignorada: Não é um bloco válido.`);
        return [];
    }

    const entities = partData.blocks[insert.name].entities;
    
    // Prepara a matriz de transformação do bloco
    const transform = {
        x: insert.position?.x || 0,
        y: insert.position?.y || 0,
        scale: insert.scale || {x:1, y:1, z:1},
        rotation: insert.rotation || 0
    };

    // Helper para transformar pontos
    const tr = (p: Point) => applyTransform(p, transform);

    entities.forEach((ent: any) => {
        if (ent.type === 'LINE') {
            const p1 = tr(ent.vertices[0]);
            const p2 = tr(ent.vertices[1]);
            segments.push({ start: p1, end: p2, path: [p1, p2] });
        } 
        else if (ent.type === 'ARC') {
            // Gera arco localmente e depois transforma os pontos
            // Isso garante que rotações distorçam o arco corretamente (ex: virando elipse se escala desigual)
            const rawPoints = discretizeArc(ent.center, ent.radius, ent.startAngle, ent.endAngle);
            const path = rawPoints.map(tr);
            segments.push({ start: path[0], end: path[path.length-1], path: path });
        }
        else if (ent.type === 'CIRCLE') {
            const rawPoints = discretizeArc(ent.center, ent.radius, 0, 2 * Math.PI);
            const path = rawPoints.map(tr);
            // Circle fecha em si mesmo, tratamos como segmento fechado
            segments.push({ start: path[0], end: path[path.length-1], path: path });
        }
        else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.vertices) {
             for(let i=0; i<ent.vertices.length; i++) {
                 const rawV1 = ent.vertices[i];
                 const nextIdx = (i + 1) % ent.vertices.length;
                 
                 // Se não for fechado e for o último, para
                 if (!ent.shape && i === ent.vertices.length - 1) break;
                 
                 const rawV2 = ent.vertices[nextIdx];
                 
                 let path: Point[];
                 if (rawV1.bulge) {
                     // Resolve curva localmente, depois transforma
                     const arcPoints = bulgeToArc(rawV1, rawV2, rawV1.bulge);
                     path = arcPoints.map(tr);
                 } else {
                     path = [tr(rawV1), tr(rawV2)];
                 }
                 
                 segments.push({ start: path[0], end: path[path.length-1], path: path });
             }
        }
    });

    return segments;
}

// --- 4. COSTUREIRO (STITCHER) ---

function stitchSegments(segments: { start: Point, end: Point, path: Point[] }[]): Point[][] {
    const polygons: Point[][] = [];
    const usedIndices = new Set<number>();

    // Ordena por tamanho do caminho (prioriza contornos grandes)
    // segments.sort((a, b) => b.path.length - a.path.length);

    while (usedIndices.size < segments.length) {
        let startIdx = -1;
        // Pega o primeiro não usado
        for(let i=0; i<segments.length; i++) {
            if(!usedIndices.has(i)) { startIdx = i; break; }
        }
        if (startIdx === -1) break;

        const currentLoop: Point[] = [];
        usedIndices.add(startIdx);
        
        // Adiciona path inicial
        segments[startIdx].path.forEach(p => currentLoop.push(p));
        
        let lookingFor = segments[startIdx].end; 
        let loopClosed = false;
        let chainCount = 0;

        while (!loopClosed && chainCount < segments.length) {
            chainCount++;
            let foundNext = false;

            for(let i=0; i<segments.length; i++) {
                if (usedIndices.has(i)) continue;

                // Conexão Direta (Fim -> Inicio)
                if (arePointsEqual(segments[i].start, lookingFor)) {
                    usedIndices.add(i);
                    // Pula o primeiro ponto para não duplicar
                    for(let k=1; k<segments[i].path.length; k++) currentLoop.push(segments[i].path[k]);
                    lookingFor = segments[i].end;
                    foundNext = true;
                    break; 
                }
                // Conexão Inversa (Fim -> Fim) - A linha foi desenhada ao contrário
                else if (arePointsEqual(segments[i].end, lookingFor)) {
                    usedIndices.add(i);
                    for(let k=segments[i].path.length-2; k>=0; k--) currentLoop.push(segments[i].path[k]);
                    lookingFor = segments[i].start;
                    foundNext = true;
                    break; 
                }
            }

            if (arePointsEqual(lookingFor, currentLoop[0])) {
                loopClosed = true;
            } else if (!foundNext) {
                // Se não achou continuação, fecha o loop forçado
                // (Em desenhos bem feitos pelo Gatekeeper, isso é raro, mas seguro)
                loopClosed = true; 
            }
        }
        
        if (currentLoop.length > 2) {
            polygons.push(currentLoop);
        }
    }

    return polygons;
}

// --- 5. EXPORT ---

export function partJsonToClipper(partData: any): any[] {
    const segments = extractSegments(partData);
    
    if (segments.length === 0) return []; // Gatekeeper bloqueou ou vazio

    const loops = stitchSegments(segments);
    
    const clipperPaths = loops.map(loop => 
        loop.map(p => ({ X: Math.round(p.x * SCALE), Y: Math.round(p.y * SCALE) }))
    );

    if (typeof ClipperLib !== 'undefined') {
        const clean = (ClipperLib.Clipper as any).CleanPolygons(clipperPaths, 0.1 * SCALE);
        const simple = (ClipperLib.Clipper as any).SimplifyPolygons(clean, ClipperLib.PolyFillType.pftNonZero);
        return simple;
    }

    return clipperPaths; 
}