// src/workers/smartNestV3.worker.ts

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

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface EntityData {
  type: string;
  name?: string;
  position?: Point;
  vertices?: (Point & { bulge?: number })[];
  center?: Point;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  shape?: boolean;
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

// Geometria Otimizada: Furos agora têm suas próprias Bounds pré-calculadas
type PartGeometry = WorkerPartGeometry & {
  uuid?: string;
  holesBounds?: Bounds[]; // Otimização crítica
};

interface GeometrySegment {
  points: Point[];
  start: Point;
  end: Point;
  used: boolean;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const EPSILON = 0.01;

// --- 1. FUNÇÕES DE COSTURA (PARSER DXF SIMPLIFICADO) ---

const bulgeToArc = (p1: Point, p2: Point, bulge: number) => {
  const chordDx = p2.x - p1.x;
  const chordDy = p2.y - p1.y;
  const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy);
  const radius = (chordLen * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  const cx = (p1.x + p2.x) / 2 - (chordDy * (1 - bulge * bulge)) / (4 * bulge);
  const cy = (p1.y + p2.y) / 2 + (chordDx * (1 - bulge * bulge)) / (4 * bulge);
  return { radius, cx, cy };
};

const getBounds = (points: Point[]): Bounds => {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
};

const chainAllLoops = (segments: GeometrySegment[]): Point[][] => {
  const loops: Point[][] = [];
  let remaining = [...segments];
  let loopSafety = 0;
  const MAX_LOOPS = 2000; // Limite de segurança reduzido

  while (remaining.length > 0) {
    loopSafety++;
    if (loopSafety > MAX_LOOPS) break;

    const firstSeg = remaining.find((s) => !s.used);
    if (!firstSeg) break;

    const currentLoop: Point[] = [];
    firstSeg.used = true;
    firstSeg.points.forEach((p) => currentLoop.push(p));

    let finding = true;
    while (finding) {
      finding = false;
      const tail = currentLoop[currentLoop.length - 1];

      for (const seg of remaining) {
        if (seg.used) continue;
        const distStart = Math.hypot(
          seg.start.x - tail.x,
          seg.start.y - tail.y,
        );
        const distEnd = Math.hypot(seg.end.x - tail.x, seg.end.y - tail.y);

        if (distStart < EPSILON) {
          for (let k = 1; k < seg.points.length; k++)
            currentLoop.push(seg.points[k]);
          seg.used = true;
          finding = true;
          break;
        } else if (distEnd < EPSILON) {
          const reversed = [...seg.points].reverse();
          for (let k = 1; k < reversed.length; k++)
            currentLoop.push(reversed[k]);
          seg.used = true;
          finding = true;
          break;
        }
      }
    }
    if (currentLoop.length > 2) loops.push(currentLoop);
    remaining = remaining.filter((s) => !s.used);
  }
  return loops;
};

const extractExactGeometry = (
  part: ImportedPart,
): { outer: Point[]; holes: Point[][] } | null => {
  const rawSegments: GeometrySegment[] = [];
  const CURVE_SEGMENTS = 6; // Resolução Baixa para Velocidade

  const traverse = (
    entities: EntityData[],
    offsetX: number,
    offsetY: number,
  ) => {
    entities.forEach((ent) => {
      if (ent.type === "INSERT" && ent.name && part.blocks) {
        const blocksRecord = part.blocks as Record<
          string,
          { entities: EntityData[] }
        >;
        const block = blocksRecord[ent.name];
        if (block && block.entities) {
          traverse(
            block.entities,
            offsetX + (ent.position?.x || 0),
            offsetY + (ent.position?.y || 0),
          );
        }
        return;
      }
      const segPoints: Point[] = [];
      if (
        ent.type === "LINE" ||
        ent.type === "LWPOLYLINE" ||
        ent.type === "POLYLINE"
      ) {
        if (ent.vertices && ent.vertices.length > 0) {
          for (let i = 0; i < ent.vertices.length; i++) {
            const v1 = ent.vertices[i];
            const isLast = i === ent.vertices.length - 1;
            if (isLast && ent.type === "LINE") {
              segPoints.push({ x: v1.x + offsetX, y: v1.y + offsetY });
              continue;
            }
            if (isLast && !ent.shape) {
              segPoints.push({ x: v1.x + offsetX, y: v1.y + offsetY });
              continue;
            }
            const v2 = ent.vertices[(i + 1) % ent.vertices.length];
            segPoints.push({ x: v1.x + offsetX, y: v1.y + offsetY });

            if (v1.bulge && v1.bulge !== 0) {
              const p1 = { x: v1.x + offsetX, y: v1.y + offsetY };
              const p2 = { x: v2.x + offsetX, y: v2.y + offsetY };
              const { radius, cx, cy } = bulgeToArc(p1, p2, v1.bulge);
              const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
              const sweepAngle = 4 * Math.atan(v1.bulge);
              const segments = Math.max(
                2,
                Math.floor(
                  CURVE_SEGMENTS * (Math.abs(sweepAngle) / (2 * Math.PI)),
                ),
              );
              for (let j = 1; j < segments; j++) {
                const theta = startAngle + (j / segments) * sweepAngle;
                segPoints.push({
                  x: cx + radius * Math.cos(theta),
                  y: cy + radius * Math.sin(theta),
                });
              }
            }
          }
        }
      } else if (ent.type === "CIRCLE" && ent.center && ent.radius) {
        const cx = ent.center.x + offsetX;
        const cy = ent.center.y + offsetY;
        for (let i = 0; i <= CURVE_SEGMENTS; i++) {
          const theta = (i / CURVE_SEGMENTS) * 2 * Math.PI;
          segPoints.push({
            x: cx + ent.radius * Math.cos(theta),
            y: cy + ent.radius * Math.sin(theta),
          });
        }
      }
      if (segPoints.length > 1) {
        rawSegments.push({
          points: segPoints,
          start: segPoints[0],
          end: segPoints[segPoints.length - 1],
          used: false,
        });
      }
    });
  };

  if (part.entities) traverse(part.entities as EntityData[], 0, 0);

  const allLoops = chainAllLoops(rawSegments);
  if (allLoops.length === 0) return null;

  let maxDiag = -1;
  let outerIndex = 0;
  const loopsWithBounds = allLoops.map((loop, idx) => {
    const b = getBounds(loop);
    return { loop, diag: Math.hypot(b.maxX - b.minX, b.maxY - b.minY), idx };
  });

  loopsWithBounds.forEach((l) => {
    if (l.diag > maxDiag) {
      maxDiag = l.diag;
      outerIndex = l.idx;
    }
  });

  // FILTRO DE ÁREA: Ignora furos minúsculos (< 100mm²)
  const holes = allLoops
    .filter((_, i) => i !== outerIndex)
    .filter((loop) => {
      const b = getBounds(loop);
      const approxArea = (b.maxX - b.minX) * (b.maxY - b.minY);
      return approxArea > 100; // <--- FILTRO DE SEGURANÇA
    });

  return { outer: allLoops[outerIndex], holes };
};

// --- 2. LÓGICA RÁPIDA DE GEOMETRIA ---

const transformGeometry = (
  base: PartGeometry,
  x: number,
  y: number,
  rotation: number,
): PartGeometry => {
  // Recalculo local otimizado
  // Assumimos que base.bounds é válido
  const w = base.bounds.maxX - base.bounds.minX;
  const h = base.bounds.maxY - base.bounds.minY;
  const localCenterX = base.bounds.minX + w / 2;
  const localCenterY = base.bounds.minY + h / 2;

  const angleRad = toRad(rotation);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  const occupiedW = w * Math.abs(cos) + h * Math.abs(sin);
  const occupiedH = w * Math.abs(sin) + h * Math.abs(cos);

  const worldCenterX = x + occupiedW / 2;
  const worldCenterY = y + occupiedH / 2;

  // Função de transformação in-line
  const tx = (px: number, py: number) => {
    const lx = px - localCenterX;
    const ly = py - localCenterY;
    return {
      x: lx * cos - ly * sin + worldCenterX,
      y: lx * sin + ly * cos + worldCenterY,
    };
  };

  const newOuter = base.outer.map((p) => tx(p.x, p.y));
  const newHoles = base.holes.map((hole) => hole.map((p) => tx(p.x, p.y)));

  // Recalcula bounds dos furos transformados (CRÍTICO PARA PERFORMANCE)
  const newHolesBounds = newHoles.map((hole) => getBounds(hole));

  return {
    outer: newOuter,
    holes: newHoles,
    holesBounds: newHolesBounds, // Guarda bounds para check rápido
    bounds: { minX: x, maxX: x + occupiedW, minY: y, maxY: y + occupiedH },
    area: base.area,
    uuid: base.uuid,
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

// --- CHECK DE MATÉRIA OTIMIZADO ---
const isPointInMaterial = (p: Point, part: PartGeometry) => {
  // 1. Check Externo
  if (!isPointInPolygon(p, part.outer)) return false;

  // 2. Check Interno (Furos) com Otimização de Bounds
  if (part.holes && part.holes.length > 0) {
    for (let i = 0; i < part.holes.length; i++) {
      const bounds = part.holesBounds
        ? part.holesBounds[i]
        : getBounds(part.holes[i]);

      // Check Rápido: Se o ponto está fora da caixa do furo, não pode estar no furo
      if (
        p.x < bounds.minX ||
        p.x > bounds.maxX ||
        p.y < bounds.minY ||
        p.y > bounds.maxY
      ) {
        continue;
      }

      // Check Lento: Geometria
      if (isPointInPolygon(p, part.holes[i])) return false; // Caiu no buraco
    }
  }
  return true;
};

const doLineSegmentsIntersect = (
  p1: Point,
  p2: Point,
  q1: Point,
  q2: Point,
): boolean => {
  const subtract = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
  const crossProduct = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
  const r = subtract(p2, p1);
  const s = subtract(q2, q1);
  const rxs = crossProduct(r, s);
  if (rxs === 0) return false;
  const t = crossProduct(subtract(q1, p1), s) / rxs;
  const qpxr = crossProduct(subtract(q1, p1), r);
  const u = qpxr / rxs;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
};

const checkCollision = (geomA: PartGeometry, geomB: PartGeometry): boolean => {
  // Broad Phase
  if (
    geomA.bounds.maxX < geomB.bounds.minX ||
    geomA.bounds.minX > geomB.bounds.maxX ||
    geomA.bounds.maxY < geomB.bounds.minY ||
    geomA.bounds.minY > geomB.bounds.maxY
  )
    return false;

  // Narrow Phase (Vertices vs Material)
  for (const p of geomA.outer) {
    if (isPointInMaterial(p, geomB)) return true;
  }
  for (const p of geomB.outer) {
    if (isPointInMaterial(p, geomA)) return true;
  }

  // Narrow Phase (Edges)
  // OTIMIZAÇÃO: Loop com for clássico para velocidade
  const lenA = geomA.outer.length;
  for (let i = 0; i < lenA; i++) {
    const p1 = geomA.outer[i];
    const p2 = geomA.outer[(i + 1) % lenA];

    const lenB = geomB.outer.length;
    for (let j = 0; j < lenB; j++) {
      const q1 = geomB.outer[j];
      const q2 = geomB.outer[(j + 1) % lenB];
      if (doLineSegmentsIntersect(p1, p2, q1, q2)) return true;
    }
    // Checa arestas dos furos de B
    if (geomB.holes) {
      for (const hole of geomB.holes) {
        const lenH = hole.length;
        for (let k = 0; k < lenH; k++) {
          const q1 = hole[k];
          const q2 = hole[(k + 1) % lenH];
          if (doLineSegmentsIntersect(p1, p2, q1, q2)) return true;
        }
      }
    }
  }
  return false;
};

// --- 3. WORKER PRINCIPAL ---

interface BinState {
  id: number;
  width: number;
  height: number;
  placedGeometries: PartGeometry[];
  freeHoles: { poly: Point[]; bounds: Bounds }[]; // Furos agora têm cache de bounds
  areaUsed: number;
}

const fitInHole = (
  candidate: PartGeometry,
  holePoly: Point[],
  holeBounds: Bounds,
  existingParts: PartGeometry[],
): boolean => {
  // 1. Check Bounds Rápido
  if (
    candidate.bounds.maxX > holeBounds.maxX ||
    candidate.bounds.minX < holeBounds.minX ||
    candidate.bounds.maxY > holeBounds.maxY ||
    candidate.bounds.minY < holeBounds.minY
  )
    return false;

  // 2. Check Containment
  for (const p of candidate.outer) {
    if (!isPointInPolygon(p, holePoly)) return false;
  }

  // 3. Check Obstacles
  for (let i = existingParts.length - 1; i >= 0; i--) {
    if (checkCollision(candidate, existingParts[i])) return false;
  }
  return true;
};

self.onmessage = (e: MessageEvent<NestingParams>) => {
  const {
    parts,
    quantities,
    binWidth,
    binHeight,
    margin,
    gap,
    rotationStep,
    targetEfficiency = 96,
  } = e.data;
  const startTime = Date.now();
  // TIMEOUT DE SEGURANÇA GERAL (20 segundos)
  const MAX_GLOBAL_TIME = 20000;

  const baseGeometries = new Map<string, PartGeometry>();
  const todoList: string[] = [];
  const inflationOffset = gap / 2;

  parts.forEach((p) => {
    const exact = extractExactGeometry(p);
    const offsetGeom = getOffsetPartGeometry(p, inflationOffset);
    const finalHoles = exact ? exact.holes : offsetGeom.holes || [];

    // Calcula bounds dos furos iniciais
    const holesBounds = finalHoles.map((h) => getBounds(h));

    const geomWithId: PartGeometry = {
      outer: offsetGeom.outer,
      holes: finalHoles,
      holesBounds: holesBounds,
      bounds: offsetGeom.bounds,
      area: offsetGeom.area,
      uuid: p.id,
    };
    baseGeometries.set(p.id, geomWithId);
    const qty = quantities[p.id] || 0;
    for (let i = 0; i < qty; i++) todoList.push(p.id);
  });

  todoList.sort(
    (a, b) => baseGeometries.get(b)!.area - baseGeometries.get(a)!.area,
  );

  const placedParts: PlacedPart[] = [];
  const failedParts: string[] = [];
  const openBins: BinState[] = [
    {
      id: 0,
      width: binWidth,
      height: binHeight,
      placedGeometries: [],
      freeHoles: [],
      areaUsed: 0,
    },
  ];

  const rotations: number[] = [];
  for (let r = 0; r < 360; r += rotationStep) rotations.push(r);

  // Passo maior para garantir performance
  const stepX = Math.max(gap, 15);
  const stepY = Math.max(gap, 15);

  let processedCount = 0;

  for (const partId of todoList) {
    // TRAVA DE SEGURANÇA 1: Tempo Global
    if (Date.now() - startTime > MAX_GLOBAL_TIME) {
      console.warn("V3: Timeout Global atingido. Parando.");
      failedParts.push(...todoList.slice(processedCount));
      break;
    }
    processedCount++;

    const partStartTime = Date.now();
    let placed = false;
    const baseGeom = baseGeometries.get(partId)!;
    const allowedRotations = parts.find((p) => p.id === partId)
      ?.isRotationLocked
      ? [0]
      : rotations;

    binLoop: for (const bin of openBins) {
      if ((bin.areaUsed / (bin.width * bin.height)) * 100 > targetEfficiency)
        continue;

      // --- A. TENTAR NOS FUROS ---
      if (bin.freeHoles.length > 0) {
        for (const holeData of bin.freeHoles) {
          const { poly: holePoly, bounds: holeBounds } = holeData;

          // Check de tamanho bruto
          if (
            baseGeom.bounds.maxX - baseGeom.bounds.minX >
              holeBounds.maxX - holeBounds.minX ||
            baseGeom.bounds.maxY - baseGeom.bounds.minY >
              holeBounds.maxY - holeBounds.minY
          )
            continue;

          for (const r of allowedRotations) {
            // TRAVA DE SEGURANÇA 2: Tempo por Peça (2s max)
            if (Date.now() - partStartTime > 2000) break;

            const holeStep = Math.max(gap, 10);
            for (let y = holeBounds.minY; y < holeBounds.maxY; y += holeStep) {
              for (
                let x = holeBounds.minX;
                x < holeBounds.maxX;
                x += holeStep
              ) {
                const candidate = transformGeometry(baseGeom, x, y, r);
                if (
                  fitInHole(
                    candidate,
                    holePoly,
                    holeBounds,
                    bin.placedGeometries,
                  )
                ) {
                  const uuid = `${partId}_${placedParts.length}`;
                  placedParts.push({
                    uuid,
                    partId,
                    x: candidate.bounds.minX,
                    y: candidate.bounds.minY,
                    rotation: r,
                    binId: bin.id,
                  });
                  candidate.uuid = uuid;
                  bin.placedGeometries.push(candidate);
                  bin.areaUsed += baseGeom.area;
                  if (candidate.holes && candidate.holes.length > 0) {
                    // Adiciona novos furos com bounds calculados
                    candidate.holes.forEach((h, idx) => {
                      if (candidate.holesBounds) {
                        bin.freeHoles.push({
                          poly: h,
                          bounds: candidate.holesBounds[idx],
                        });
                      }
                    });
                  }
                  placed = true;
                  break binLoop;
                }
              }
            }
          }
        }
      }

      // --- B. CHAPA NORMAL ---
      if (!placed) {
        for (const r of allowedRotations) {
          // TRAVA DE SEGURANÇA 2: Tempo por Peça (2s max)
          if (Date.now() - partStartTime > 2000) break;

          for (let y = margin; y < bin.height - margin; y += stepY) {
            for (let x = margin; x < bin.width - margin; x += stepX) {
              const candidate = transformGeometry(baseGeom, x, y, r);

              if (
                candidate.bounds.maxX > bin.width - margin ||
                candidate.bounds.maxY > bin.height - margin
              )
                continue;

              let colides = false;
              for (let i = bin.placedGeometries.length - 1; i >= 0; i--) {
                if (checkCollision(candidate, bin.placedGeometries[i])) {
                  colides = true;
                  break;
                }
              }

              if (!colides) {
                const uuid = `${partId}_${placedParts.length}`;
                placedParts.push({
                  uuid,
                  partId,
                  x: x + inflationOffset,
                  y: y + inflationOffset,
                  rotation: r,
                  binId: bin.id,
                });
                candidate.uuid = uuid;
                bin.placedGeometries.push(candidate);
                bin.areaUsed += baseGeom.area;
                if (candidate.holes && candidate.holes.length > 0) {
                  candidate.holes.forEach((h, idx) => {
                    if (candidate.holesBounds) {
                      bin.freeHoles.push({
                        poly: h,
                        bounds: candidate.holesBounds[idx],
                      });
                    }
                  });
                }
                placed = true;
                break binLoop;
              }
            }
            if (placed) break;
          }
          if (placed) break;
        }
      }
    }

    if (!placed) {
      // Se estourou o tempo da peça, não cria nova chapa, marca como falha e segue
      if (Date.now() - partStartTime > 2000) {
        failedParts.push(partId);
        continue;
      }

      // Cria nova chapa
      const newBinId = openBins.length;
      const x = margin,
        y = margin,
        r = 0; // Tenta simples
      const candidate = transformGeometry(baseGeom, x, y, r);
      if (
        candidate.bounds.maxX <= binWidth - margin &&
        candidate.bounds.maxY <= binHeight - margin
      ) {
        const uuid = `${partId}_${placedParts.length}`;
        placedParts.push({
          uuid,
          partId,
          x: x + inflationOffset,
          y: y + inflationOffset,
          rotation: r,
          binId: newBinId,
        });
        candidate.uuid = uuid;

        const newHolesData = (candidate.holes || []).map((h, i) => ({
          poly: h,
          bounds: candidate.holesBounds![i],
        }));

        openBins.push({
          id: newBinId,
          width: binWidth,
          height: binHeight,
          placedGeometries: [candidate],
          freeHoles: newHolesData,
          areaUsed: baseGeom.area,
        });
      } else {
        failedParts.push(partId);
      }
    }
  }

  const totalAreaUsed = openBins.reduce((acc, bin) => acc + bin.areaUsed, 0);
  const totalAreaAvailable = openBins.length * (binWidth * binHeight);

  self.postMessage({
    placed: placedParts,
    failed: failedParts,
    efficiency: (totalAreaUsed / totalAreaAvailable) * 100,
    totalBins: openBins.length,
  });
};

export {};
