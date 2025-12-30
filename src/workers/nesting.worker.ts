// src/workers/nesting.worker.ts
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

const toRad = (deg: number) => (deg * Math.PI) / 180;

// --- TRANSFORM GEOMETRY ---
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

// --- MATEMÁTICA DE INTERSECÇÃO (ADICIONADO) ---

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

// Verifica se dois segmentos de reta se cruzam
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

  // Colineares ou paralelos (ignoramos para simplificar, o PointInPolygon pega sobreposição total)
  if (rxs === 0) return false;

  const t = crossProduct(subtract(q1, p1), s) / rxs;
  const u = qpxr / rxs; // <--- CORREÇÃO AQUI: Usando a variável qpxr existente

  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
};

// --- LÓGICA DE COLISÃO ROBUSTA ---
const checkCollision = (geomA: PartGeometry, geomB: PartGeometry): boolean => {
  // 1. CHECAGEM DE CAIXA (RÁPIDA)
  if (
    geomA.bounds.maxX < geomB.bounds.minX ||
    geomA.bounds.minX > geomB.bounds.maxX ||
    geomA.bounds.maxY < geomB.bounds.minY ||
    geomA.bounds.minY > geomB.bounds.maxY
  ) {
    return false;
  }

  // 2. CHECAGEM DE PONTOS (UM DENTRO DO OUTRO)
  for (const p of geomA.outer) {
    if (isPointInPolygon(p, geomB.outer)) return true;
  }
  for (const p of geomB.outer) {
    if (isPointInPolygon(p, geomA.outer)) return true;
  }

  // 3. CHECAGEM DE ARESTAS (CRUZAMENTO) - ADICIONADO AGORA
  // Isso resolve o problema de peças cruzadas que não têm vértices contidos
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

// --- MOTOR DE NESTING ---

self.onmessage = (e: MessageEvent<NestingParams>) => {
  const {
    parts,
    quantities,
    binWidth,
    binHeight,
    margin,
    gap,
    rotationStep,
    targetEfficiency = 85,
  } = e.data;

  const baseGeometries = new Map<string, PartGeometry>();
  const todoList: string[] = [];

  const inflationOffset = gap / 2;

  parts.forEach((p) => {
    // Geometria inflada para o cálculo
    const geom = getOffsetPartGeometry(p, inflationOffset);
    const geomWithId: PartGeometry = { ...geom, uuid: p.id };

    baseGeometries.set(p.id, geomWithId);

    const qty = quantities[p.id] || 0;
    for (let i = 0; i < qty; i++) {
      todoList.push(p.id);
    }
  });

  // Ordena pela área da geometria inflada
  todoList.sort(
    (a, b) => baseGeometries.get(b)!.area - baseGeometries.get(a)!.area
  );

  const placedParts: PlacedPart[] = [];
  const failedParts: string[] = [];

  let currentBinId = 0;
  let placedGeometriesOnCurrentBin: PartGeometry[] = [];
  let currentBinAreaUsed = 0;
  const binArea = binWidth * binHeight;

  const stepX = Math.max(gap, 5);
  const stepY = Math.max(gap, 5);

  const rotations: number[] = [];
  for (let r = 0; r < 360; r += rotationStep) rotations.push(r);

  for (const partId of todoList) {
    const tryToPlace = (
      currentPlacedGeoms: PartGeometry[]
    ): { x: number; y: number; r: number; geom: PartGeometry } | null => {
      const efficiency = (currentBinAreaUsed / binArea) * 100;
      if (efficiency >= targetEfficiency) return null;

      const baseGeom = baseGeometries.get(partId)!;

      for (const r of rotations) {
        for (let y = margin; y < binHeight - margin; y += stepY) {
          for (let x = margin; x < binWidth - margin; x += stepX) {
            const candidateGeom = transformGeometry(baseGeom, x, y, r);

            // Verifica Limites da Mesa
            if (
              candidateGeom.bounds.maxX > binWidth - margin ||
              candidateGeom.bounds.maxY > binHeight - margin ||
              candidateGeom.bounds.minX < margin ||
              candidateGeom.bounds.minY < margin
            ) {
              continue;
            }

            // Verifica Colisão (Agora com arestas)
            let colides = false;
            for (const placedGeom of currentPlacedGeoms) {
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

    let result = tryToPlace(placedGeometriesOnCurrentBin);

    if (!result) {
      currentBinId++;
      placedGeometriesOnCurrentBin = [];
      currentBinAreaUsed = 0;
      result = tryToPlace(placedGeometriesOnCurrentBin);
    }

    if (result) {
      const uuid = `${partId}_${placedParts.length}`;
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
      currentBinAreaUsed += baseGeometries.get(partId)!.area;
    } else {
      failedParts.push(partId);
    }
  }

  self.postMessage({
    placed: placedParts,
    failed: failedParts,
    efficiency: (currentBinAreaUsed / binArea) * 100,
    totalBins: currentBinId + 1,
  });
};

export {};
