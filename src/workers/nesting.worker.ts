// src/workers/nesting.worker.ts

// --- INTERFACES ---
interface Point {
  x: number;
  y: number;
  bulge?: number;
}
interface EntityData {
  type: string;
  name?: string;
  position?: Point;
  vertices?: Point[];
  center?: Point;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
}
interface BlockData {
  entities: EntityData[];
}
interface PartData {
  id: string;
  width: number;
  height: number;
  entities: EntityData[];
  blocks?: Record<string, BlockData>;
  area?: number;
}
interface GeometrySegment {
  points: Point[];
  start: Point;
  end: Point;
  used: boolean;
}

interface NestingParams {
  parts: PartData[];
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

interface PartGeometry {
  uuid?: string;
  outer: Point[];
  holes: Point[][];
  bounds: { minX: number; maxX: number; minY: number; maxY: number }; // Bounds "Puros" da geometria
  area: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const EPSILON = 0.01;

// --- FUNÇÕES GEOMÉTRICAS BÁSICAS ---

const bulgeToArc = (p1: Point, p2: Point, bulge: number) => {
  const chordDx = p2.x - p1.x;
  const chordDy = p2.y - p1.y;
  const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy);
  const radius = (chordLen * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  const cx = (p1.x + p2.x) / 2 - (chordDy * (1 - bulge * bulge)) / (4 * bulge);
  const cy = (p1.y + p2.y) / 2 + (chordDx * (1 - bulge * bulge)) / (4 * bulge);
  return { radius, cx, cy };
};

const calculatePolygonArea = (points: Point[]) => {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
};

// Algoritmo de Costura (Mantido para garantir geometria correta dos furos)
const chainAllLoops = (segments: GeometrySegment[]): Point[][] => {
  const loops: Point[][] = [];
  let remaining = [...segments];

  while (remaining.length > 0) {
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
          seg.start.y - tail.y
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

// --- PREPARAÇÃO DE GEOMETRIA ---

const getBaseGeometry = (part: PartData): PartGeometry => {
  const rawSegments: GeometrySegment[] = [];
  const CURVE_SEGMENTS = 12; // Precisão para furos

  const traverse = (
    entities: EntityData[],
    offsetX: number,
    offsetY: number
  ) => {
    entities.forEach((ent: EntityData) => {
      if (ent.type === "INSERT" && ent.name && part.blocks) {
        const block = part.blocks[ent.name];
        if (block)
          traverse(
            block.entities,
            offsetX + (ent.position?.x || 0),
            offsetY + (ent.position?.y || 0)
          );
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
            if (isLast) {
              segPoints.push({ x: v1.x + offsetX, y: v1.y + offsetY });
              continue;
            }
            const v2 = ent.vertices[i + 1];
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
                  CURVE_SEGMENTS * (Math.abs(sweepAngle) / (2 * Math.PI))
                )
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
        const r = ent.radius;
        const cx = ent.center.x + offsetX;
        const cy = ent.center.y + offsetY;
        for (let i = 0; i <= CURVE_SEGMENTS; i++) {
          const theta = (i / CURVE_SEGMENTS) * 2 * Math.PI;
          segPoints.push({
            x: cx + r * Math.cos(theta),
            y: cy + r * Math.sin(theta),
          });
        }
      } else if (ent.type === "ARC" && ent.center && ent.radius) {
        const r = ent.radius;
        const cx = ent.center.x + offsetX;
        const cy = ent.center.y + offsetY;
        const start = ent.startAngle || 0;
        let end = ent.endAngle || 2 * Math.PI;
        if (end < start) end += 2 * Math.PI;
        const sweep = end - start;
        const arcSegments = Math.max(
          2,
          Math.floor(CURVE_SEGMENTS * (sweep / (2 * Math.PI)))
        );
        for (let i = 0; i <= arcSegments; i++) {
          const theta = start + (i / arcSegments) * sweep;
          segPoints.push({
            x: cx + r * Math.cos(theta),
            y: cy + r * Math.sin(theta),
          });
        }
      }
      if (segPoints.length > 1)
        rawSegments.push({
          points: segPoints,
          start: segPoints[0],
          end: segPoints[segPoints.length - 1],
          used: false,
        });
    });
  };

  if (part.entities) traverse(part.entities, 0, 0);

  const allLoops = chainAllLoops(rawSegments);
  if (allLoops.length === 0) {
    allLoops.push([
      { x: 0, y: 0 },
      { x: part.width, y: 0 },
      { x: part.width, y: part.height },
      { x: 0, y: part.height },
    ]);
  }

  let outerLoop = allLoops[0];
  let holes: Point[][] = [];
  if (allLoops.length > 1) {
    let maxArea = -1;
    let outerIndex = 0;
    allLoops.forEach((loop, idx) => {
      const area = calculatePolygonArea(loop);
      if (area > maxArea) {
        maxArea = area;
        outerIndex = idx;
      }
    });
    outerLoop = allLoops[outerIndex];
    holes = allLoops.filter((_, idx) => idx !== outerIndex);
  }

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  outerLoop.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });

  let totalArea = calculatePolygonArea(outerLoop);
  holes.forEach((h) => (totalArea -= calculatePolygonArea(h)));

  const normalizedOuter = outerLoop.map((p) => ({
    x: p.x - minX,
    y: p.y - minY,
  }));
  const normalizedHoles = holes.map((hole) =>
    hole.map((p) => ({ x: p.x - minX, y: p.y - minY }))
  );

  return {
    outer: normalizedOuter,
    holes: normalizedHoles,
    bounds: { minX: 0, maxX: maxX - minX, minY: 0, maxY: maxY - minY },
    area: totalArea,
  };
};

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

// --- LÓGICA DE COLISÃO OTIMIZADA (CAIXA RÍGIDA + FURO INTELIGENTE) ---

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

// Verifica se 'inner' está totalmente contido em algum furo de 'outer'
const isInsideHole = (
  inner: PartGeometry,
  outer: PartGeometry,
  gap: number
): boolean => {
  // Se a peça 'outer' não tem furos, impossível estar dentro
  if (outer.holes.length === 0) return false;

  // Verifica bounding box primeiro: 'inner' deve ser menor que 'outer'
  if (
    inner.bounds.maxX - inner.bounds.minX >
    outer.bounds.maxX - outer.bounds.minX
  )
    return false;

  // Testa cada vértice do outer loop da peça interna contra os furos da peça externa
  // Estratégia: Se todos os pontos de 'inner' estiverem dentro de UM furo de 'outer', então cabe.
  // + Considerar GAP: O furo deve ser maior que inner + gap.

  for (const hole of outer.holes) {
    // Verifica se o bounding box do inner cabe no bounding box do furo (aprox)
    let holeMinX = Infinity,
      holeMaxX = -Infinity,
      holeMinY = Infinity,
      holeMaxY = -Infinity;
    hole.forEach((p) => {
      if (p.x < holeMinX) holeMinX = p.x;
      if (p.x > holeMaxX) holeMaxX = p.x;
      if (p.y < holeMinY) holeMinY = p.y;
      if (p.y > holeMaxY) holeMaxY = p.y;
    });

    if (
      inner.bounds.maxX + gap > holeMaxX ||
      inner.bounds.minX - gap < holeMinX ||
      inner.bounds.maxY + gap > holeMaxY ||
      inner.bounds.minY - gap < holeMinY
    ) {
      continue; // Nem cabe na caixa do furo
    }

    // Teste fino: Todos os pontos de inner devem estar dentro deste furo
    let allPointsInside = true;
    for (const p of inner.outer) {
      // "Estar dentro do furo" geometricamente
      // Nota: Gap check aqui seria 'distToSegment > gap', mas 'isPointInPolygon' é binário.
      // Assumimos que a verificação de caixa acima já filtrou grosserias.
      if (!isPointInPolygon(p, hole)) {
        allPointsInside = false;
        break;
      }
    }

    if (allPointsInside) return true; // Sucesso! Cabe no furo.
  }

  return false;
};

const checkCollision = (
  geomA: PartGeometry,
  geomB: PartGeometry,
  gap: number
): boolean => {
  // 1. CHECAGEM DE CAIXA (BOUNDING BOX) ESTRITA
  // Se as caixas infladas pelo GAP se tocam, consideramos colisão potencial.
  const boxOverlap = !(
    geomA.bounds.maxX + gap < geomB.bounds.minX ||
    geomA.bounds.minX - gap > geomB.bounds.maxX ||
    geomA.bounds.maxY + gap < geomB.bounds.minY ||
    geomA.bounds.minY - gap > geomB.bounds.maxY
  );

  if (!boxOverlap) {
    return false; // Estão longe, seguro.
  }

  // 2. SE AS CAIXAS SE TOCAM -> É COLISÃO! (Abordagem Conservadora/Rápida)
  // EXCETO SE: Uma estiver DENTRO DO FURO da outra.

  // Tenta salvar a colisão verificando furos:
  if (isInsideHole(geomA, geomB, gap)) return false; // A cabe no furo de B
  if (isInsideHole(geomB, geomA, gap)) return false; // B cabe no furo de A

  return true; // Colisão confirmada (Caixas se tocam e não é furo)
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

  parts.forEach((p) => {
    const geom = getBaseGeometry(p);
    baseGeometries.set(p.id, geom);
    p.area = geom.area;

    const qty = quantities[p.id] || 0;
    for (let i = 0; i < qty; i++) {
      todoList.push(p.id);
    }
  });

  // Ordena: Maior área primeiro
  todoList.sort(
    (a, b) => baseGeometries.get(b)!.area - baseGeometries.get(a)!.area
  );

  const placedParts: PlacedPart[] = [];
  const failedParts: string[] = [];

  let currentBinId = 0;
  let placedGeometriesOnCurrentBin: PartGeometry[] = [];
  let currentBinAreaUsed = 0;
  const binArea = binWidth * binHeight;

  // Passo maior para velocidade, já que o ajuste fino é manual depois
  const stepX = Math.max(gap, 5);
  const stepY = Math.max(gap, 5);

  const rotations: number[] = [];
  for (let r = 0; r < 360; r += rotationStep) rotations.push(r);

  for (const partId of todoList) {
    let placedOnCurrent = false;

    const tryToPlace = (
      currentPlacedGeoms: PartGeometry[]
    ): { x: number; y: number; r: number; geom: PartGeometry } | null => {
      const efficiency = (currentBinAreaUsed / binArea) * 100;
      if (efficiency >= targetEfficiency) return null;

      const baseGeom = baseGeometries.get(partId)!;

      for (const r of rotations) {
        // Tenta posicionar
        for (let y = margin; y < binHeight - margin; y += stepY) {
          for (let x = margin; x < binWidth - margin; x += stepX) {
            const candidateGeom = transformGeometry(baseGeom, x, y, r);

            // 1. Limites da Mesa (Rápido)
            if (
              candidateGeom.bounds.maxX > binWidth - margin ||
              candidateGeom.bounds.maxY > binHeight - margin
            ) {
              continue;
            }

            // 2. Colisão com Peças Existentes
            let colides = false;
            for (const placedGeom of currentPlacedGeoms) {
              if (checkCollision(candidateGeom, placedGeom, gap)) {
                colides = true;
                break;
              }
            }

            if (!colides) {
              return { x, y, r, geom: candidateGeom };
            }
          }
        }
      }
      return null;
    };

    // Tenta na chapa atual
    let result = tryToPlace(placedGeometriesOnCurrentBin);

    if (result) {
      placedOnCurrent = true;
    } else {
      // Nova chapa
      currentBinId++;
      placedGeometriesOnCurrentBin = [];
      currentBinAreaUsed = 0;

      result = tryToPlace(placedGeometriesOnCurrentBin);
      if (result) {
        placedOnCurrent = true;
      }
    }

    if (placedOnCurrent && result) {
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
