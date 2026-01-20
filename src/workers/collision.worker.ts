// src/workers/collision.worker.ts

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
}

interface PlacedPartData {
  uuid: string;
  partId: string;
  x: number;
  y: number;
  rotation: number;
}

// --- NOVA INTERFACE PARA LINHAS DE RETALHO ---
interface CropLine {
  id: string;
  type: "horizontal" | "vertical";
  position: number;
}

interface WorkerData {
  placedParts: PlacedPartData[];
  partsData: PartData[];
  binWidth: number;
  binHeight: number;
  margin: number;
  cropLines?: CropLine[]; // <--- ADICIONADO AQUI
}

// Estrutura para suportar Furos e Ilhas
interface PartGeometry {
  uuid: string;
  outer: Point[]; // Contorno Externo (Sólido)
  holes: Point[][]; // Contornos Internos (Vazios)
  bounds: { minX: number; maxX: number; minY: number; maxY: number }; // Bounding Box Global
}

interface GeometrySegment {
  points: Point[];
  start: Point;
  end: Point;
  used: boolean;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const EPSILON = 0.01;

// --- FUNÇÕES AUXILIARES ---

const bulgeToArc = (p1: Point, p2: Point, bulge: number) => {
  const chordDx = p2.x - p1.x;
  const chordDy = p2.y - p1.y;
  const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy);
  const radius = (chordLen * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  const cx = (p1.x + p2.x) / 2 - (chordDy * (1 - bulge * bulge)) / (4 * bulge);
  const cy = (p1.y + p2.y) / 2 + (chordDx * (1 - bulge * bulge)) / (4 * bulge);
  return { radius, cx, cy };
};

// COSTUREIRO V2: Encontra TODOS os loops (Externo + Furos)
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

    if (currentLoop.length > 2) {
      loops.push(currentLoop);
    }
    remaining = remaining.filter((s) => !s.used);
  }

  return loops;
};

// --- GERAÇÃO DE GEOMETRIA COM SUPORTE A FUROS ---

const getPartGeometry = (
  part: PartData,
  placed: PlacedPartData
): PartGeometry => {
  const rawSegments: GeometrySegment[] = [];
  const CURVE_SEGMENTS = 24;

  const traverse = (
    entities: EntityData[],
    offsetX: number,
    offsetY: number
  ) => {
    entities.forEach((ent: EntityData) => {
      if (ent.type === "INSERT" && ent.name && part.blocks) {
        const block = part.blocks[ent.name];
        if (block && block.entities) {
          traverse(
            block.entities,
            offsetX + (ent.position?.x || 0),
            offsetY + (ent.position?.y || 0)
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

            if (ent.type === "LINE" && isLast) {
              segPoints.push({ x: v1.x + offsetX, y: v1.y + offsetY });
              continue;
            }
            if (ent.type !== "LINE" && isLast) {
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
      } else if (ent.type === "CIRCLE") {
        if (ent.center && ent.radius !== undefined) {
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
        }
      } else if (ent.type === "ARC") {
        if (ent.center && ent.radius !== undefined) {
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

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  allLoops.forEach((loop) => {
    loop.forEach((p) => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });
  });

  const w = maxX - minX;
  const h = maxY - minY;
  const localCenterX = minX + w / 2;
  const localCenterY = minY + h / 2;

  const angleRad = toRad(placed.rotation);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  // A NOVA LÓGICA (Trigonométrica) deve ser igual à do NestingBoard:
  const occupiedW = w * Math.abs(cos) + h * Math.abs(sin);
  const occupiedH = w * Math.abs(sin) + h * Math.abs(cos);
  
  // Agora o cálculo do centro no mundo baterá com o visual da mesa
  const worldCenterX = placed.x + occupiedW / 2;
  const worldCenterY = placed.y + occupiedH / 2;

  const transformedLoops = allLoops.map((loop) => {
    return loop.map((p) => {
      const lx = p.x - localCenterX;
      const ly = p.y - localCenterY;
      const rx = lx * cos - ly * sin;
      const ry = lx * sin + ly * cos;
      return { x: rx + worldCenterX, y: ry + worldCenterY };
    });
  });

  let outerLoop: Point[] = transformedLoops[0];
  let holes: Point[][] = [];

  if (transformedLoops.length > 1) {
    let maxDiag = -1;
    let outerIndex = 0;

    transformedLoops.forEach((loop, idx) => {
      let lxMin = Infinity,
        lxMax = -Infinity,
        lyMin = Infinity,
        lyMax = -Infinity;
      loop.forEach((p) => {
        if (p.x < lxMin) lxMin = p.x;
        if (p.x > lxMax) lxMax = p.x;
        if (p.y < lyMin) lyMin = p.y;
        if (p.y > lyMax) lyMax = p.y;
      });
      const diag = Math.hypot(lxMax - lxMin, lyMax - lyMin);
      if (diag > maxDiag) {
        maxDiag = diag;
        outerIndex = idx;
      }
    });

    outerLoop = transformedLoops[outerIndex];
    holes = transformedLoops.filter((_, idx) => idx !== outerIndex);
  } else {
    outerLoop = transformedLoops[0];
  }

  let fMinX = Infinity,
    fMinY = Infinity,
    fMaxX = -Infinity,
    fMaxY = -Infinity;
  outerLoop.forEach((p) => {
    if (p.x < fMinX) fMinX = p.x;
    if (p.x > fMaxX) fMaxX = p.x;
    if (p.y < fMinY) fMinY = p.y;
    if (p.y > fMaxY) fMaxY = p.y;
  });

  return {
    uuid: placed.uuid,
    outer: outerLoop,
    holes: holes,
    bounds: { minX: fMinX, maxX: fMaxX, minY: fMinY, maxY: fMaxY },
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

const isPointInMaterial = (p: Point, geom: PartGeometry) => {
  if (!isPointInPolygon(p, geom.outer)) return false;
  for (const hole of geom.holes) {
    if (isPointInPolygon(p, hole)) {
      return false;
    }
  }
  return true;
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

  if (rxs === 0 && qpxr === 0) return false;
  if (rxs === 0 && qpxr !== 0) return false;

  const t = crossProduct(subtract(q1, p1), s) / rxs;
  const u = crossProduct(subtract(q1, p1), r) / rxs;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
};

// --- LÓGICA PRINCIPAL DO WORKER ---

self.onmessage = (e: MessageEvent<WorkerData>) => {
  const { placedParts, partsData, binWidth, binHeight, margin, cropLines } =
    e.data;
  const collidingIds: string[] = [];

  const geometries = new Map<string, PartGeometry>();

  // 1. PREPARAÇÃO
  placedParts.forEach((placed) => {
    const data = partsData.find((p) => p.id === placed.partId);
    if (data) {
      const geom = getPartGeometry(data, placed);
      geometries.set(placed.uuid, geom);
    }
  });

  // 2. CHECK DE FRONTEIRA (MESA)
  const minSafeX = margin;
  const maxSafeX = binWidth - margin;
  const minSafeY = margin;
  const maxSafeY = binHeight - margin;

  placedParts.forEach((placed) => {
    const geom = geometries.get(placed.uuid);
    if (!geom) return;

    if (
      geom.bounds.minX >= minSafeX &&
      geom.bounds.maxX <= maxSafeX &&
      geom.bounds.minY >= minSafeY &&
      geom.bounds.maxY <= maxSafeY
    ) {
      // Se a caixa inteira está dentro, não verifica vértices
    } else {
      // Verifica apenas o contorno externo contra a mesa
      for (const p of geom.outer) {
        if (
          p.x < minSafeX - 0.01 ||
          p.x > maxSafeX + 0.01 ||
          p.y < minSafeY - 0.01 ||
          p.y > maxSafeY + 0.01
        ) {
          if (!collidingIds.includes(placed.uuid))
            collidingIds.push(placed.uuid);
          break;
        }
      }
    }
  });

  // --- 2.1 CHECK DE LINHAS DE RETALHO (NOVO) ---
  if (cropLines && cropLines.length > 0) {
    placedParts.forEach((placed) => {
      // Se já colidiu (ex: fora da mesa), pula para economizar
      if (collidingIds.includes(placed.uuid)) return;

      const geom = geometries.get(placed.uuid);
      if (!geom) return;

      for (const line of cropLines) {
        let q1: Point, q2: Point;

        // Define o segmento da linha de retalho
        if (line.type === "vertical") {
          q1 = { x: line.position, y: 0 };
          q2 = { x: line.position, y: binHeight };
        } else {
          q1 = { x: 0, y: line.position };
          q2 = { x: binWidth, y: line.position };
        }

        // Verifica intersecção com todas as arestas da peça (externo e furos)
        const allLoops = [geom.outer, ...geom.holes];
        let hitLine = false;

        loopCheck: for (const loop of allLoops) {
          for (let k = 0; k < loop.length; k++) {
            const p1 = loop[k];
            const p2 = loop[(k + 1) % loop.length];

            if (doLineSegmentsIntersect(p1, p2, q1, q2)) {
              hitLine = true;
              break loopCheck;
            }
          }
        }

        if (hitLine) {
          collidingIds.push(placed.uuid);
          break; // Se bateu em uma linha, já é colisão
        }
      }
    });
  }

  // 3. CHECK PEÇA x PEÇA
  for (let i = 0; i < placedParts.length; i++) {
    for (let j = i + 1; j < placedParts.length; j++) {
      const pA = placedParts[i];
      const pB = placedParts[j];

      // Se ambos já estão colidindo (ex: fora da mesa ou na linha), não precisa testar entre si
      if (collidingIds.includes(pA.uuid) && collidingIds.includes(pB.uuid))
        continue;

      const geomA = geometries.get(pA.uuid);
      const geomB = geometries.get(pB.uuid);

      if (!geomA || !geomB) continue;

      // Broad Phase (Caixas Globais)
      if (
        geomA.bounds.maxX < geomB.bounds.minX ||
        geomA.bounds.minX > geomB.bounds.maxX ||
        geomA.bounds.maxY < geomB.bounds.minY ||
        geomA.bounds.minY > geomB.bounds.maxY
      ) {
        continue;
      }

      // Narrow Phase (True Shape com Furos)
      let collision = false;

      // TESTE 1: Interseção de Arestas
      const allLoopsA = [geomA.outer, ...geomA.holes];
      const allLoopsB = [geomB.outer, ...geomB.holes];

      outerLoopCheck: for (const loopA of allLoopsA) {
        for (let a = 0; a < loopA.length; a++) {
          const p1 = loopA[a];
          const p2 = loopA[(a + 1) % loopA.length];

          for (const loopB of allLoopsB) {
            for (let b = 0; b < loopB.length; b++) {
              const q1 = loopB[b];
              const q2 = loopB[(b + 1) % loopB.length];

              if (doLineSegmentsIntersect(p1, p2, q1, q2)) {
                collision = true;
                break outerLoopCheck;
              }
            }
          }
        }
      }

      // TESTE 2: Inclusão (Um dentro do outro sem tocar bordas)
      if (!collision) {
        const sampleA = geomA.outer[0];
        if (isPointInMaterial(sampleA, geomB)) {
          collision = true;
        } else {
          const sampleB = geomB.outer[0];
          if (isPointInMaterial(sampleB, geomA)) {
            collision = true;
          }
        }
      }

      if (collision) {
        if (!collidingIds.includes(pA.uuid)) collidingIds.push(pA.uuid);
        if (!collidingIds.includes(pB.uuid)) collidingIds.push(pB.uuid);
      }
    }
  }

  self.postMessage(collidingIds);
};
