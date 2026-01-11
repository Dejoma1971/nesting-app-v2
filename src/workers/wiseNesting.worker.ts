import {
  getOffsetPartGeometry,
  type WorkerPartGeometry,
} from "../utils/geometryCore";
import type { ImportedPart } from "../components/types";

// --- INTERFACES ---
interface Point {
  x: number;
  y: number;
}

interface NestingParams {
  parts: ImportedPart[];
  quantities: Record<string, number>;
  binWidth: number;
  binHeight: number;
  margin: number;
  gap: number;
  rotationStep: number;
  iterations?: number;
}

interface PlacedPart {
  uuid: string;
  partId: string;
  x: number;
  y: number;
  rotation: number;
  binId: number;
}

type PartGeometry = WorkerPartGeometry & { uuid?: string };

const toRad = (deg: number) => (deg * Math.PI) / 180;

// --- GEOMETRIA E TRANSFORMAÇÃO ---

const transformGeometry = (
  base: PartGeometry,
  x: number,
  y: number,
  rotation: number
): PartGeometry => {
  const angleRad = toRad(rotation);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  const rotate = (p: Point) => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  });

  const newOuter = base.outer.map(rotate);
  const newHoles = base.holes.map((h) => h.map(rotate));

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  
  newOuter.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  // Ajusta para a posição (x, y) ser o canto inferior esquerdo da bounding box
  const finalOuter = newOuter.map((p) => ({
    x: p.x - minX + x,
    y: p.y - minY + y,
  }));
  
  const finalHoles = newHoles.map((h) =>
    h.map((p) => ({ x: p.x - minX + x, y: p.y - minY + y }))
  );

  return {
    outer: finalOuter,
    holes: finalHoles,
    bounds: {
      minX: x,
      maxX: x + (maxX - minX),
      minY: y,
      maxY: y + (maxY - minY),
    },
    area: base.area,
  };
};

// --- ALGORITMOS DE INTERSECÇÃO ---

// Verifica se Ponto P está dentro do Polígono
const isPointInPolygon = (p: Point, polygon: Point[]) => {
  let isInside = false;
  let i = 0,
    j = polygon.length - 1;
  for (; i < polygon.length; j = i++) {
    if (
      polygon[i].y > p.y !== polygon[j].y > p.y &&
      p.x <
        ((polygon[j].x - polygon[i].x) * (p.y - polygon[i].y)) /
          (polygon[j].y - polygon[i].y) +
          polygon[i].x
    ) {
      isInside = !isInside;
    }
  }
  return isInside;
};

// Verifica se Polígono A está totalmente dentro de Polígono B
const isPolygonInsidePolygon = (inner: Point[], outer: Point[]) => {
    // Para estar totalmente dentro, todos os pontos de 'inner' devem estar em 'outer'
    for (const p of inner) {
        if (!isPointInPolygon(p, outer)) return false;
    }
    return true;
};

// Verifica intersecção de segmentos de reta
const doLineSegmentsIntersect = (
  p1: Point,
  p2: Point,
  q1: Point,
  q2: Point
): boolean => {
  const subtract = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
  const crossProduct = (a: Point, b: Point) => a.x * b.y - a.y * b.x;

  const r = subtract(p2, p1);
  const s = subtract(q2, q1);
  const rxs = crossProduct(r, s);
  const qpxr = crossProduct(subtract(q1, p1), r);

  if (rxs === 0) return false; // Paralelos/Colineares (simplificado)

  const t = crossProduct(subtract(q1, p1), s) / rxs;
  const u = qpxr / rxs;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
};

// --- COLISÃO WISE (COM SUPORTE A FUROS) ---
const checkWiseCollision = (candidate: PartGeometry, placed: PartGeometry): boolean => {
  // 1. Otimização de Bounding Box
  if (
    candidate.bounds.maxX < placed.bounds.minX ||
    candidate.bounds.minX > placed.bounds.maxX ||
    candidate.bounds.maxY < placed.bounds.minY ||
    candidate.bounds.minY > placed.bounds.maxY
  ) {
    return false; // Estão longe um do outro
  }

  // 2. Verifica se Candidate está DENTRO de um Furo de Placed
  // Se a peça 'candidate' couber inteira num buraco da 'placed', NÃO é colisão.
  if (placed.holes && placed.holes.length > 0) {
      for (const hole of placed.holes) {
          // Verifica bounding box do furo primeiro (rápido)
          let hMinX = Infinity, hMaxX = -Infinity, hMinY = Infinity, hMaxY = -Infinity;
          hole.forEach(p => {
              if (p.x < hMinX) hMinX = p.x; if (p.x > hMaxX) hMaxX = p.x;
              if (p.y < hMinY) hMinY = p.y; if (p.y > hMaxY) hMaxY = p.y;
          });
          
          if (candidate.bounds.minX >= hMinX && candidate.bounds.maxX <= hMaxX &&
              candidate.bounds.minY >= hMinY && candidate.bounds.maxY <= hMaxY) {
               // Se passou na caixa, verifica geometria fina
               if (isPolygonInsidePolygon(candidate.outer, hole)) {
                   return false; // SALVO PELO GONGO: Está dentro do furo!
               }
          }
      }
  }

  // 3. Checagem Padrão de Sobreposição (Outer vs Outer)
  // A) Pontos dentro
  for (const p of candidate.outer) {
    if (isPointInPolygon(p, placed.outer)) return true;
  }
  for (const p of placed.outer) {
    if (isPointInPolygon(p, candidate.outer)) return true;
  }

  // B) Cruzamento de arestas
  const polyA = candidate.outer;
  const polyB = placed.outer;
  for (let i = 0; i < polyA.length; i++) {
    const p1 = polyA[i];
    const p2 = polyA[(i + 1) % polyA.length];
    for (let j = 0; j < polyB.length; j++) {
      const q1 = polyB[j];
      const q2 = polyB[(j + 1) % polyB.length];
      if (doLineSegmentsIntersect(p1, p2, q1, q2)) return true;
    }
  }

  return false; // Nenhuma colisão detectada
};

// --- MOTOR DE EXECUÇÃO ---

const runNestingPass = (
    sortedIds: string[],
    baseGeometries: Map<string, PartGeometry>,
    binWidth: number,
    binHeight: number,
    margin: number,
    gap: number,
    rotations: number[],
    inflationOffset: number
) => {
    const placedParts: PlacedPart[] = [];
    const failedParts: string[] = [];
    
    let currentBinId = 0;
    let placedGeometriesOnCurrentBin: PartGeometry[] = [];
    const binArea = binWidth * binHeight;

    const stepX = Math.max(gap, 2); // Mais preciso que o Smart Nest (era 5)
    const stepY = Math.max(gap, 2); 

    for (const partId of sortedIds) {
        const tryToPlace = (currentPlacedGeoms: PartGeometry[]): { x: number; y: number; r: number; geom: PartGeometry } | null => {
            const baseGeom = baseGeometries.get(partId)!;

            // Tenta todas as rotações (0-90)
            for (const r of rotations) {
                // Varredura
                for (let y = margin; y < binHeight - margin; y += stepY) {
                    for (let x = margin; x < binWidth - margin; x += stepX) {
                        
                        const candidateGeom = transformGeometry(baseGeom, x, y, r);

                        // Limites da Mesa
                        if (candidateGeom.bounds.maxX > binWidth - margin || 
                            candidateGeom.bounds.maxY > binHeight - margin ||
                            candidateGeom.bounds.minX < margin ||
                            candidateGeom.bounds.minY < margin) {
                            continue;
                        }

                        // Colisão Wise
                        let colides = false;
                        for (const placedGeom of currentPlacedGeoms) {
                            if (checkWiseCollision(candidateGeom, placedGeom)) {
                                colides = true;
                                break;
                            }
                        }

                        if (!colides) {
                            return { x: x + inflationOffset, y: y + inflationOffset, r, geom: candidateGeom };
                        }
                    }
                }
            }
            return null;
        };

        let result = tryToPlace(placedGeometriesOnCurrentBin);

        // Se não coube, nova chapa
        if (!result) {
            currentBinId++;
            placedGeometriesOnCurrentBin = [];
            result = tryToPlace(placedGeometriesOnCurrentBin);
        }

        if (result) {
            const uuid = `${partId}_${placedParts.length}_wise`;
            placedParts.push({
                uuid,
                partId,
                x: result.x,
                y: result.y,
                rotation: result.r,
                binId: currentBinId,
            });
            result.geom.uuid = uuid;
            placedGeometriesOnCurrentBin.push(result.geom);
        } else {
            failedParts.push(partId);
        }
    }

    // Calcula eficiência global (média das chapas ou total)
    // Aqui usamos uma métrica simples: (Área Total Usada / (Num Chapas * Área Chapa))
    const totalAreaUsed = sortedIds.reduce((acc, id) => acc + baseGeometries.get(id)!.area, 0) - failedParts.reduce((acc, id) => acc + baseGeometries.get(id)!.area, 0);
    const totalSheetsArea = (currentBinId + 1) * binArea;
    const efficiency = (totalAreaUsed / totalSheetsArea) * 100;

    return { placed: placedParts, failed: failedParts, efficiency, totalBins: currentBinId + 1 };
};

self.onmessage = (e: MessageEvent<NestingParams>) => {
  const {
    parts,
    quantities,
    binWidth,
    binHeight,
    margin,
    gap,
    rotationStep
  } = e.data;

  const baseGeometries = new Map<string, PartGeometry>();
  const allPartIds: string[] = [];

  const inflationOffset = gap / 2;

  // 1. Prepara Geometria Inflada
  parts.forEach((p) => {
    const geom = getOffsetPartGeometry(p, inflationOffset);
    const geomWithId: PartGeometry = { ...geom, uuid: p.id };
    baseGeometries.set(p.id, geomWithId);

    const qty = quantities[p.id] || 0;
    for (let i = 0; i < qty; i++) {
      allPartIds.push(p.id);
    }
  });

  // Define Rotações (0 a 90 graus)
  const rotations: number[] = [];
  // Garante 0 e 90, e passos intermediários se o usuário pediu precisão
  // Limitamos a 0-90 conforme diretiva
  const safeStep = Math.max(5, rotationStep); // Mínimo 5 graus para não travar
  for (let r = 0; r <= 90; r += safeStep) {
      rotations.push(r);
  }
  // Garante que 90 está incluso se o passo não bater exato
  if (!rotations.includes(90)) rotations.push(90);


  // --- ESTRATÉGIA 1: ORDENAR POR ÁREA (Decrescente) ---
  const listByArea = [...allPartIds].sort((a, b) => baseGeometries.get(b)!.area - baseGeometries.get(a)!.area);
  
  // --- ESTRATÉGIA 2: ORDENAR POR MAIOR DIMENSÃO (Lado mais longo primeiro) ---
  // Ajuda a encaixar vigas ou tiras longas antes de bloquear a chapa
  const getMaxDim = (id: string) => {
      const b = baseGeometries.get(id)!.bounds;
      return Math.max(b.maxX - b.minX, b.maxY - b.minY);
  }
  const listByDim = [...allPartIds].sort((a, b) => getMaxDim(b) - getMaxDim(a));

  // Executa os dois cenários
  
  const resultA = runNestingPass(listByArea, baseGeometries, binWidth, binHeight, margin, gap, rotations, inflationOffset);
  const resultB = runNestingPass(listByDim, baseGeometries, binWidth, binHeight, margin, gap, rotations, inflationOffset);

  // Comparação: Quem usou menos chapas? Se empate, quem teve maior eficiência?
  let winner = resultA;
  
  if (resultB.totalBins < resultA.totalBins) {
      winner = resultB;
  } else if (resultB.totalBins === resultA.totalBins) {
      if (resultB.efficiency > resultA.efficiency) {
          winner = resultB;
      }
  }

  self.postMessage(winner);
};

export {};