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

interface WorkerData {
  placedParts: PlacedPartData[];
  partsData: PartData[];
  binWidth: number;
  binHeight: number;
  margin: number;
}

// Interface auxiliar para o "Costureiro" de geometria
interface GeometrySegment {
  points: Point[];
  start: Point;
  end: Point;
  used: boolean;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;
const EPSILON = 0.01; // Tolerância para considerar pontos conectados

// --- FUNÇÃO AUXILIAR: CALCULAR ARCO A PARTIR DE BULGE ---
const bulgeToArc = (p1: Point, p2: Point, bulge: number) => {
  const chordDx = p2.x - p1.x;
  const chordDy = p2.y - p1.y;
  const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy);

  const radius = (chordLen * (1 + bulge * bulge)) / (4 * Math.abs(bulge));

  const cx = (p1.x + p2.x) / 2 - (chordDy * (1 - bulge * bulge)) / (4 * bulge);
  const cy = (p1.y + p2.y) / 2 + (chordDx * (1 - bulge * bulge)) / (4 * bulge);

  return { radius, cx, cy };
};

// --- ALGORITMO DE COSTURA (CHAINING) ---
const chainSegments = (segments: GeometrySegment[]): Point[] => {
  if (segments.length === 0) return [];

  const orderedPoints: Point[] = [];

  // CORREÇÃO AQUI: Mudado de 'let' para 'const'
  const current = segments[0];
  current.used = true;

  // Adiciona pontos do primeiro segmento
  current.points.forEach((p) => orderedPoints.push(p));

  let finding = true;
  while (finding) {
    finding = false;
    const tail = orderedPoints[orderedPoints.length - 1];

    // Procura o próximo segmento que começa (ou termina) onde o atual parou
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.used) continue;

      const distStart = Math.hypot(seg.start.x - tail.x, seg.start.y - tail.y);
      const distEnd = Math.hypot(seg.end.x - tail.x, seg.end.y - tail.y);

      if (distStart < EPSILON) {
        // Conexão direta (Cabeça com Cauda)
        // Pula o primeiro ponto para não duplicar
        for (let k = 1; k < seg.points.length; k++)
          orderedPoints.push(seg.points[k]);
        seg.used = true;
        finding = true;
        break;
      } else if (distEnd < EPSILON) {
        // Conexão invertida (Cauda com Cauda) -> Precisamos inverter o segmento
        const reversed = [...seg.points].reverse();
        for (let k = 1; k < reversed.length; k++)
          orderedPoints.push(reversed[k]);
        seg.used = true;
        finding = true;
        break;
      }
    }
  }

  return orderedPoints;
};

// --- MATEMÁTICA GEOMÉTRICA (TRUE SHAPE) ---

const getTransformedPolygon = (
  part: PartData,
  placed: PlacedPartData
): Point[] => {
  const rawSegments: GeometrySegment[] = [];
  const CURVE_SEGMENTS = 16;

  // 1. Extração: Transforma tudo em segmentos soltos
  const traverse = (
    entities: EntityData[],
    offsetX: number,
    offsetY: number
  ) => {
    entities.forEach((ent: EntityData) => {
      // BLOCOS
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

      // LINHAS / POLILINHAS
      if (
        ent.type === "LINE" ||
        ent.type === "LWPOLYLINE" ||
        ent.type === "POLYLINE"
      ) {
        if (ent.vertices && ent.vertices.length > 0) {
          for (let i = 0; i < ent.vertices.length; i++) {
            const v1 = ent.vertices[i];
            // Em polilinhas abertas ou linhas soltas, não fechamos loop automaticamente aqui.
            // O "Costureiro" vai fechar depois.
            const isLast = i === ent.vertices.length - 1;
            if (ent.type === "LINE" && isLast) {
              segPoints.push({ x: v1.x + offsetX, y: v1.y + offsetY }); // Ponto final da linha
              continue;
            }
            if (ent.type !== "LINE" && isLast) {
              // LWPOLYLINE ultimo ponto
              segPoints.push({ x: v1.x + offsetX, y: v1.y + offsetY });
              continue;
            }

            const v2 = ent.vertices[i + 1];

            segPoints.push({ x: v1.x + offsetX, y: v1.y + offsetY });

            // Bulge
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
          // Adiciona o último ponto se for LINE (já tratado acima, mas garantindo consistência)
          if (ent.type === "LINE" && ent.vertices.length === 2) {
            // LINE tem lógica simples: Start -> End. Já foi capturado no loop?
            // O loop acima para LINE vai i=0 (Start). i=1 (End) entra no isLast.
          }
        }
      }
      // CÍRCULOS (Já são fechados, tratamos como segmento único fechado)
      else if (ent.type === "CIRCLE") {
        if (ent.center && ent.radius !== undefined) {
          const r = ent.radius;
          const cx = ent.center.x + offsetX;
          const cy = ent.center.y + offsetY;
          for (let i = 0; i <= CURVE_SEGMENTS; i++) {
            // <= para fechar o circulo
            const theta = (i / CURVE_SEGMENTS) * 2 * Math.PI;
            segPoints.push({
              x: cx + r * Math.cos(theta),
              y: cy + r * Math.sin(theta),
            });
          }
        }
      }
      // ARCOS
      else if (ent.type === "ARC") {
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

      // Registra o segmento se tiver pontos
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

  // 2. Costura (Ordenação dos pontos)
  // Se tivermos segmentos soltos (como no seu DXF), isso vai organizá-los
  let points: Point[] = [];
  if (rawSegments.length > 0) {
    points = chainSegments(rawSegments);
  }

  // Fallback de segurança
  if (points.length < 3) {
    points = [
      { x: 0, y: 0 },
      { x: part.width, y: 0 },
      { x: part.width, y: part.height },
      { x: 0, y: part.height },
    ];
  }

  // 3. Normalização e Transformação (Igual ao anterior)
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  points.forEach((p) => {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  });
  const w = maxX - minX;
  const h = maxY - minY;

  const localCenterX = minX + w / 2;
  const localCenterY = minY + h / 2;

  const angleRad = toRad(placed.rotation);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  const occupiedW = placed.rotation % 180 !== 0 ? h : w;
  const occupiedH = placed.rotation % 180 !== 0 ? w : h;

  const worldCenterX = placed.x + occupiedW / 2;
  const worldCenterY = placed.y + occupiedH / 2;

  return points.map((p) => {
    const lx = p.x - localCenterX;
    const ly = p.y - localCenterY;
    const rx = lx * cos - ly * sin;
    const ry = lx * sin + ly * cos;
    return { x: rx + worldCenterX, y: ry + worldCenterY };
  });
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

  if (rxs === 0 && qpxr === 0) return false;
  if (rxs === 0 && qpxr !== 0) return false;

  const t = crossProduct(subtract(q1, p1), s) / rxs;
  const u = crossProduct(subtract(q1, p1), r) / rxs;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
};

// --- LÓGICA PRINCIPAL DO WORKER ---

self.onmessage = (e: MessageEvent<WorkerData>) => {
  const { placedParts, partsData, binWidth, binHeight, margin } = e.data;
  const collidingIds: string[] = [];

  const partPolygons = new Map<string, Point[]>();
  const partBounds = new Map<
    string,
    { minX: number; maxX: number; minY: number; maxY: number }
  >();

  // 1. PREPARAÇÃO
  placedParts.forEach((placed) => {
    const data = partsData.find((p) => p.id === placed.partId);
    if (data) {
      const poly = getTransformedPolygon(data, placed);
      partPolygons.set(placed.uuid, poly);

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      poly.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
      partBounds.set(placed.uuid, { minX, maxX, minY, maxY });
    }
  });

  // 2. CHECK DE FRONTEIRA
  const minSafeX = margin;
  const maxSafeX = binWidth - margin;
  const minSafeY = margin;
  const maxSafeY = binHeight - margin;

  placedParts.forEach((placed) => {
    const bounds = partBounds.get(placed.uuid);
    if (!bounds) return;

    if (
      bounds.minX >= minSafeX &&
      bounds.maxX <= maxSafeX &&
      bounds.minY >= minSafeY &&
      bounds.maxY <= maxSafeY
    ) {
      return;
    }

    const poly = partPolygons.get(placed.uuid);
    if (poly) {
      for (const p of poly) {
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

  // 3. CHECK PEÇA x PEÇA
  for (let i = 0; i < placedParts.length; i++) {
    for (let j = i + 1; j < placedParts.length; j++) {
      const pA = placedParts[i];
      const pB = placedParts[j];

      const boxA = partBounds.get(pA.uuid);
      const boxB = partBounds.get(pB.uuid);

      if (!boxA || !boxB) continue;

      if (
        boxA.maxX < boxB.minX ||
        boxA.minX > boxB.maxX ||
        boxA.maxY < boxB.minY ||
        boxA.minY > boxB.maxY
      ) {
        continue;
      }

      let collision = false;
      const polyA = partPolygons.get(pA.uuid)!;
      const polyB = partPolygons.get(pB.uuid)!;

      for (let a = 0; a < polyA.length; a++) {
        const p1 = polyA[a];
        const p2 = polyA[(a + 1) % polyA.length];
        for (let b = 0; b < polyB.length; b++) {
          const q1 = polyB[b];
          const q2 = polyB[(b + 1) % polyB.length];
          if (doLineSegmentsIntersect(p1, p2, q1, q2)) {
            collision = true;
            break;
          }
        }
        if (collision) break;
      }

      if (!collision) {
        if (
          isPointInPolygon(polyA[0], polyB) ||
          isPointInPolygon(polyB[0], polyA)
        ) {
          collision = true;
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
