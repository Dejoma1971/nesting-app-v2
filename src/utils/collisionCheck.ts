import type { ImportedPart } from "../components/types";
import type { PlacedPart } from "./nestingCore";

interface CropLine {
  id: string;
  type: "horizontal" | "vertical";
  position: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

interface Point {
  x: number;
  y: number;
}

// --- FUNÇÃO AUXILIAR PARA CURVAS (Igual ao Worker) ---
const bulgeToArc = (p1: Point, p2: Point, bulge: number) => {
  const chordDx = p2.x - p1.x;
  const chordDy = p2.y - p1.y;
  const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy);
  const radius = (chordLen * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  const cx = (p1.x + p2.x) / 2 - (chordDy * (1 - bulge * bulge)) / (4 * bulge);
  const cy = (p1.y + p2.y) / 2 + (chordDx * (1 - bulge * bulge)) / (4 * bulge);
  return { radius, cx, cy };
};

// --- 1. CONVERTER ENTIDADES DA PEÇA EM UM POLÍGONO PRECISO ---
const getTransformedPolygon = (
  part: ImportedPart,
  placed: PlacedPart,
): Point[] => {
  const points: Point[] = [];
  const CURVE_SEGMENTS = 16; // Reduzi um pouco para manter a performance no "Drag" (Worker usa 24)

  part.entities.forEach((ent) => {
    // LINHAS E POLILINHAS
    if (
      ent.type === "LINE" ||
      ent.type === "LWPOLYLINE" ||
      ent.type === "POLYLINE"
    ) {
      if (ent.vertices && ent.vertices.length > 0) {
        for (let i = 0; i < ent.vertices.length; i++) {
          const v1 = ent.vertices[i];
          // Adiciona o ponto atual
          points.push({ x: v1.x, y: v1.y });

          // Se tiver bulge (curva), segmenta o arco até o próximo ponto
          if (v1.bulge && v1.bulge !== 0 && i < ent.vertices.length - 1) {
            const v2 = ent.vertices[i + 1];
            const { radius, cx, cy } = bulgeToArc(v1, v2, v1.bulge);

            const startAngle = Math.atan2(v1.y - cy, v1.x - cx);
            let endAngle = Math.atan2(v2.y - cy, v2.x - cx);

            // Ajuste de sentido do arco baseado no bulge
            if (v1.bulge > 0 && endAngle < startAngle) endAngle += 2 * Math.PI;
            if (v1.bulge < 0 && endAngle > startAngle) endAngle -= 2 * Math.PI;

            const sweep = endAngle - startAngle;
            // Segmentação dinâmica
            const segs = Math.max(
              2,
              Math.floor(CURVE_SEGMENTS * (Math.abs(sweep) / (2 * Math.PI))),
            );

            for (let j = 1; j < segs; j++) {
              const theta = startAngle + (j / segs) * sweep;
              points.push({
                x: cx + radius * Math.cos(theta),
                y: cy + radius * Math.sin(theta),
              });
            }
          }
        }
        // Adiciona último ponto se não for fechado pelo loop
        // (Geralmente polígonos fecham, mas garantimos o último vértice)
        // Nota: LWPolyline fechado geralmente é tratado na renderização,
        // aqui assumimos vertices sequenciais.
      }
    }
    // CÍRCULOS (Agora segmentados, não quadrados cruzados!)
    else if (ent.type === "CIRCLE") {
      const r = ent.radius;
      const c = ent.center;
      for (let i = 0; i < CURVE_SEGMENTS; i++) {
        const theta = (i / CURVE_SEGMENTS) * 2 * Math.PI;
        points.push({
          x: c.x + r * Math.cos(theta),
          y: c.y + r * Math.sin(theta),
        });
      }
    }
    // ARCOS
    else if (ent.type === "ARC") {
      const r = ent.radius;
      const c = ent.center;
      const start = ent.startAngle || 0;
      let end = ent.endAngle || 2 * Math.PI;
      if (end < start) end += 2 * Math.PI;

      const sweep = end - start;
      const segs = Math.max(
        2,
        Math.floor(CURVE_SEGMENTS * (sweep / (2 * Math.PI))),
      );

      for (let i = 0; i <= segs; i++) {
        const theta = start + (i / segs) * sweep;
        points.push({
          x: c.x + r * Math.cos(theta),
          y: c.y + r * Math.sin(theta),
        });
      }
    }
  });

  // Fallback de segurança se não tiver geometria
  if (points.length === 0) {
    points.push({ x: 0, y: 0 });
    points.push({ x: part.width, y: 0 });
    points.push({ x: part.width, y: part.height });
    points.push({ x: 0, y: part.height });
  }

  // --- CÁLCULO DE TRANSFORMAÇÃO ---
  // Recalcula o centro local baseando-se na nuvem de pontos real
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

  // Bounding Box Rotacionado para determinar a posição do centro no mundo
  const occupiedW = w * Math.abs(cos) + h * Math.abs(sin);
  const occupiedH = w * Math.abs(sin) + h * Math.abs(cos);

  const worldCenterX = placed.x + occupiedW / 2;
  const worldCenterY = placed.y + occupiedH / 2;

  // Aplica rotação e translação em cada ponto
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
  // Otimização: Apenas roda se passar pelo Bounding Box simples do poligono
  // (O check de bbox já é feito na função principal, então aqui é direto)

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
  q2: Point,
): boolean => {
  const subtract = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
  const crossProduct = (a: Point, b: Point) => a.x * b.y - a.y * b.x;

  const r = subtract(p2, p1);
  const s = subtract(q2, q1);

  const rxs = crossProduct(r, s);
  const qpxr = crossProduct(subtract(q1, p1), r);

  // Colineares
  if (Math.abs(rxs) < 1e-9 && Math.abs(qpxr) < 1e-9) return false;
  if (Math.abs(rxs) < 1e-9 && Math.abs(qpxr) >= 1e-9) return false;

  const t = crossProduct(subtract(q1, p1), s) / rxs;
  const u = crossProduct(subtract(q1, p1), r) / rxs;

  // Reduzi a estrita igualdade (t >= 0) para (t > 0.001) para permitir toque de bordas (snapping)
  // Se o nesting permite toque, relaxamos aqui. Se não, mantemos >= 0.
  // Assumindo que toque leve é permitido no "arraste":
  const EPSILON = 0.0001;
  return t >= EPSILON && t <= 1 - EPSILON && u >= EPSILON && u <= 1 - EPSILON;
};

// --- FUNÇÃO PRINCIPAL ---
export const detectCollisions = (
  placedParts: PlacedPart[],
  partsData: ImportedPart[],
  binWidth: number,
  binHeight: number,
  margin: number,
  cropLines: CropLine[] = [],
): string[] => {
  const collidingIds: string[] = [];
  const partPolygons = new Map<string, Point[]>();

  placedParts.forEach((placed) => {
    const data = partsData.find((p) => p.id === placed.partId);
    if (data) {
      partPolygons.set(placed.uuid, getTransformedPolygon(data, placed));
    }
  });

  // --- 1. VERIFICAÇÃO DE FRONTEIRA ---
  const minSafeX = margin;
  const maxSafeX = binWidth - margin;
  const minSafeY = margin;
  const maxSafeY = binHeight - margin;

  placedParts.forEach((placed) => {
    const poly = partPolygons.get(placed.uuid);
    if (!poly) return;

    for (const p of poly) {
      if (
        p.x < minSafeX - 0.01 ||
        p.x > maxSafeX + 0.01 ||
        p.y < minSafeY - 0.01 ||
        p.y > maxSafeY + 0.01
      ) {
        if (!collidingIds.includes(placed.uuid)) collidingIds.push(placed.uuid);
        break;
      }
    }
  });

  // --- 2. VERIFICAÇÃO DE CROP LINES ---
  if (cropLines.length > 0) {
    placedParts.forEach((placed) => {
      if (collidingIds.includes(placed.uuid)) return;
      const poly = partPolygons.get(placed.uuid);
      if (!poly) return;

      for (const line of cropLines) {
        let q1: Point, q2: Point;
        if (line.type === "vertical") {
          q1 = { x: line.position, y: -1000 }; // Estende além da mesa para garantir
          q2 = { x: line.position, y: binHeight + 1000 };
        } else {
          q1 = { x: -1000, y: line.position };
          q2 = { x: binWidth + 1000, y: line.position };
        }

        for (let k = 0; k < poly.length; k++) {
          const p1 = poly[k];
          const p2 = poly[(k + 1) % poly.length];
          if (doLineSegmentsIntersect(p1, p2, q1, q2)) {
            if (!collidingIds.includes(placed.uuid))
              collidingIds.push(placed.uuid);
            return; // Sai do loop das linhas para esta peça
          }
        }
      }
    });
  }

  // --- 3. VERIFICAÇÃO PEÇA X PEÇA ---
  for (let i = 0; i < placedParts.length; i++) {
    for (let j = i + 1; j < placedParts.length; j++) {
      const pA = placedParts[i];
      const pB = placedParts[j];

      if (collidingIds.includes(pA.uuid) && collidingIds.includes(pB.uuid))
        continue;

      const polyA = partPolygons.get(pA.uuid);
      const polyB = partPolygons.get(pB.uuid);
      if (!polyA || !polyB) continue;

      // Bounding Box Rápido (Broad Phase)
      let minXA = Infinity,
        maxXA = -Infinity,
        minYA = Infinity,
        maxYA = -Infinity;
      for (const p of polyA) {
        if (p.x < minXA) minXA = p.x;
        if (p.x > maxXA) maxXA = p.x;
        if (p.y < minYA) minYA = p.y;
        if (p.y > maxYA) maxYA = p.y;
      }

      let minXB = Infinity,
        maxXB = -Infinity,
        minYB = Infinity,
        maxYB = -Infinity;
      for (const p of polyB) {
        if (p.x < minXB) minXB = p.x;
        if (p.x > maxXB) maxXB = p.x;
        if (p.y < minYB) minYB = p.y;
        if (p.y > maxYB) maxYB = p.y;
      }

      if (maxXA < minXB || minXA > maxXB || maxYA < minYB || minYA > maxYB) {
        continue; // Não colidem
      }

      // Narrow Phase
      let collision = false;

      // Verifica interseção de arestas
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

      // Verifica um dentro do outro
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

  return collidingIds;
};
