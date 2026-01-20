// src/workers/smartNestNew.worker.ts

// ----------------------------------------------------------------------
// PARTE 1: IMPORTS E INTERFACES (Igual ao original)
// ----------------------------------------------------------------------
import {
  getOffsetPartGeometry,
  type WorkerPartGeometry,
} from "../utils/geometryCore";
import type { ImportedPart } from "../components/types";

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
  iterations: number;
  targetEfficiency?: number;
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

// ----------------------------------------------------------------------
// PARTE 2: HELPERS DE GEOMETRIA (Mantidos idênticos para segurança)
// ----------------------------------------------------------------------

const toRad = (deg: number) => (deg * Math.PI) / 180;

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

  if (rxs === 0) return false;

  const t = crossProduct(subtract(q1, p1), s) / rxs;
  const u = qpxr / rxs;

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
};

const checkCollision = (geomA: PartGeometry, geomB: PartGeometry): boolean => {
  // 1. CHECAGEM DE CAIXA (AABB)
  if (
    geomA.bounds.maxX < geomB.bounds.minX ||
    geomA.bounds.minX > geomB.bounds.maxX ||
    geomA.bounds.maxY < geomB.bounds.minY ||
    geomA.bounds.minY > geomB.bounds.maxY
  ) {
    return false;
  }

  // 2. CHECAGEM DE PONTOS
  for (const p of geomA.outer) {
    if (isPointInPolygon(p, geomB.outer)) return true;
  }
  for (const p of geomB.outer) {
    if (isPointInPolygon(p, geomA.outer)) return true;
  }

  // 3. CHECAGEM DE ARESTAS
  const polyA = geomA.outer;
  const polyB = geomB.outer;

  for (let i = 0; i < polyA.length; i++) {
    const p1 = polyA[i];
    const p2 = polyA[(i + 1) % polyA.length];

    for (let j = 0; j < polyB.length; j++) {
      const q1 = polyB[j];
      const q2 = polyB[(j + 1) % polyB.length];

      if (doLineSegmentsIntersect(p1, p2, q1, q2)) {
        return true;
      }
    }
  }

  return false;
};

// ----------------------------------------------------------------------
// PARTE 3: NOVO MOTOR (FIRST FIT / MULTI-BIN)
// ----------------------------------------------------------------------

// Estrutura para armazenar o estado de cada chapa
interface BinState {
  id: number;
  geometries: PartGeometry[];
  areaUsed: number;
}

self.onmessage = (e: MessageEvent<NestingParams>) => {
  const {
    parts,
    quantities,
    binWidth,
    binHeight,
    margin,
    gap,
    rotationStep,
    targetEfficiency = 95, // Aumentei um pouco o target pois agora reaproveitamos chapas
  } = e.data;

  // 1. Preparação das Geometrias Base (Inflação)
  const baseGeometries = new Map<string, PartGeometry>();
  const todoList: string[] = [];
  const inflationOffset = gap / 2;

  parts.forEach((p) => {
    const geom = getOffsetPartGeometry(p, inflationOffset);
    const geomWithId: PartGeometry = { ...geom, uuid: p.id };
    baseGeometries.set(p.id, geomWithId);

    const qty = quantities[p.id] || 0;
    for (let i = 0; i < qty; i++) {
      todoList.push(p.id);
    }
  });

  // 2. Ordenação (Decrescente por Área) - CRUCIAL
  todoList.sort(
    (a, b) => baseGeometries.get(b)!.area - baseGeometries.get(a)!.area
  );

  const placedParts: PlacedPart[] = [];
  const failedParts: string[] = [];

  // --- MUDANÇA AQUI: Array de Chapas Abertas ---
  const openBins: BinState[] = [];
  // Inicializa a primeira chapa
  openBins.push({ id: 0, geometries: [], areaUsed: 0 });

  const binArea = binWidth * binHeight;
  const stepX = Math.max(gap, 5);
  const stepY = Math.max(gap, 5);

  // Prepara rotações globais
  const rotations: number[] = [];
  for (let r = 0; r < 360; r += rotationStep) rotations.push(r);

  // 3. Função Auxiliar de Tentativa de Encaixe (Agora recebe as geometrias da chapa alvo)
  const tryToPlaceInBin = (
    targetBinGeometries: PartGeometry[],
    currentBinAreaUsed: number,
    partId: string
  ): { x: number; y: number; r: number; geom: PartGeometry } | null => {
    
    // Otimização: Se a chapa já estiver muito cheia, ignora (economiza CPU)
    if ((currentBinAreaUsed / binArea) * 100 >= targetEfficiency) return null;

    const baseGeom = baseGeometries.get(partId)!;
    const originalPart = parts.find((p) => p.id === partId);

    // Verifica trava de rotação
    const allowedRotations = originalPart?.isRotationLocked ? [0] : rotations;

    // Loop de Posição
    for (const r of allowedRotations) {
      for (let y = margin; y < binHeight - margin; y += stepY) {
        for (let x = margin; x < binWidth - margin; x += stepX) {
          
          // Transforma
          const candidateGeom = transformGeometry(baseGeom, x, y, r);

          // Limites da Mesa
          if (
            candidateGeom.bounds.maxX > binWidth - margin ||
            candidateGeom.bounds.maxY > binHeight - margin ||
            candidateGeom.bounds.minX < margin ||
            candidateGeom.bounds.minY < margin
          ) {
            continue;
          }

          // Colisão com peças JÁ colocadas nesta chapa
          let colides = false;
          // Fase Broad (Caixa rápida) - Opcional se checkCollision já faz isso, mas ajuda a explicitar
          for (const placedGeom of targetBinGeometries) {
             // checkCollision já faz a verificação de Caixa primeiro, então chamamos direto
             if (checkCollision(candidateGeom, placedGeom)) {
               colides = true;
               break;
             }
          }

          if (!colides) {
            return {
              x: x + inflationOffset,
              y: y + inflationOffset,
              r,
              geom: candidateGeom,
            };
          }
        }
      }
    }
    return null;
  };

  // 4. Loop Principal (Processa Peça por Peça)
  for (const partId of todoList) {
    let placed = false;

    // TENTA EM TODAS AS CHAPAS ABERTAS (First Fit)
    for (const bin of openBins) {
      const result = tryToPlaceInBin(bin.geometries, bin.areaUsed, partId);

      if (result) {
        // Sucesso! Salva nesta chapa
        const uuid = `${partId}_${placedParts.length}`;
        placedParts.push({
          uuid,
          partId,
          x: result.x,
          y: result.y,
          rotation: result.r,
          binId: bin.id,
        });

        result.geom.uuid = uuid;
        bin.geometries.push(result.geom);
        bin.areaUsed += baseGeometries.get(partId)!.area;
        
        placed = true;
        break; // Para de procurar chapas, vai para a próxima peça
      }
    }

    // Se não coube em NENHUMA chapa existente, cria uma nova
    if (!placed) {
      const newBinId = openBins.length;
      const newBin: BinState = { id: newBinId, geometries: [], areaUsed: 0 };
      openBins.push(newBin);

      // Tenta colocar na nova chapa (deve caber, a menos que a peça seja maior que a mesa)
      const result = tryToPlaceInBin(newBin.geometries, newBin.areaUsed, partId);

      if (result) {
        const uuid = `${partId}_${placedParts.length}`;
        placedParts.push({
          uuid,
          partId,
          x: result.x,
          y: result.y,
          rotation: result.r,
          binId: newBinId,
        });

        result.geom.uuid = uuid;
        newBin.geometries.push(result.geom);
        newBin.areaUsed += baseGeometries.get(partId)!.area;
      } else {
        // Se falhar numa mesa vazia, a peça é grande demais
        failedParts.push(partId);
      }
    }
  }

  // Calcula eficiência média ou total
  // (Aqui enviamos um valor aproximado da última chapa ou média, mas o frontend calcula o real)
  const totalAreaUsed = openBins.reduce((acc, bin) => acc + bin.areaUsed, 0);
  const totalAreaAvailable = openBins.length * binArea;

  self.postMessage({
    placed: placedParts,
    failed: failedParts,
    efficiency: (totalAreaUsed / totalAreaAvailable) * 100,
    totalBins: openBins.length,
  });
};

export {};