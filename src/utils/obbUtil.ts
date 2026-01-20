// src/utils/obbUtil.ts

export interface Point {
  x: number;
  y: number;
}

/**
 * Converte graus para radianos
 */
const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Rotaciona um ponto (px, py) ao redor de um centro (cx, cy)
 */
const rotatePoint = (px: number, py: number, cx: number, cy: number, rad: number): Point => {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = px - cx;
  const dy = py - cy;

  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
};

/**
 * 1. GET OBB CORNERS
 * Calcula os 4 vértices exatos de um retângulo rotacionado (OBB).
 * Assumindo que x, y são o canto superior esquerdo (ou inferior esquerdo dependendo do sistema)
 * do retângulo NÃO rotacionado.
 */
export const getOBBCorners = (
  x: number,
  y: number,
  width: number,
  height: number,
  rotationDeg: number
): Point[] => {
  if (rotationDeg === 0) {
    return [
      { x, y }, // Top-Left
      { x: x + width, y }, // Top-Right
      { x: x + width, y: y + height }, // Bottom-Right
      { x, y: y + height }, // Bottom-Left
    ];
  }

  const cx = x + width / 2;
  const cy = y + height / 2;
  const rad = toRad(rotationDeg);

  // Pontos originais (sem rotação) relativos ao centro
  // A ordem (TL, TR, BR, BL) é importante para desenhar o polígono corretamente
  const p1 = rotatePoint(x, y, cx, cy, rad); // TL
  const p2 = rotatePoint(x + width, y, cx, cy, rad); // TR
  const p3 = rotatePoint(x + width, y + height, cx, cy, rad); // BR
  const p4 = rotatePoint(x, y + height, cx, cy, rad); // BL

  return [p1, p2, p3, p4];
};

/**
 * 2. POINT IN POLYGON (Ray Casting Algorithm)
 * Verifica se um ponto (mouse) está dentro de um polígono arbitrário (OBB).
 * Essencial para o clique simples.
 */
export const isPointInPolygon = (point: Point, vs: Point[]): boolean => {
  // ray-casting algorithm based on
  // https://github.com/substack/point-in-polygon
  const x = point.x, y = point.y;
  let inside = false;

  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y;
    const xj = vs[j].x, yj = vs[j].y;

    const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
};

/**
 * 3. POLYGON INTERSECTION (Separating Axis Theorem - SAT)
 * Verifica se dois polígonos convexos (dois OBBs ou SelectionBox vs OBB) se sobrepõem.
 * Essencial para a "Crossing Selection" (Verde).
 */
export const doPolygonsIntersect = (a: Point[], b: Point[]): boolean => {
  const polygons = [a, b];
  let minA, maxA, projected, i, i1, j, minB, maxB;

  for (i = 0; i < polygons.length; i++) {
      // Para cada polígono, olhamos para cada aresta (Normal)
      const polygon = polygons[i];
      for (i1 = 0; i1 < polygon.length; i1++) {

          // Pega a aresta atual e a próxima
          const i2 = (i1 + 1) % polygon.length;
          const p1 = polygon[i1];
          const p2 = polygon[i2];

          // Calcula a normal (perpendicular) à aresta
          // Normal = (-y, x)
          const normal = { x: p2.y - p1.y, y: p1.x - p2.x };

          minA = maxA = undefined;
          // Projeta todos os vértices de A na normal
          for (j = 0; j < a.length; j++) {
              projected = normal.x * a[j].x + normal.y * a[j].y;
              if (minA === undefined || projected < minA) minA = projected;
              if (maxA === undefined || projected > maxA) maxA = projected;
          }

          minB = maxB = undefined;
          // Projeta todos os vértices de B na normal
          for (j = 0; j < b.length; j++) {
              projected = normal.x * b[j].x + normal.y * b[j].y;
              if (minB === undefined || projected < minB) minB = projected;
              if (maxB === undefined || projected > maxB) maxB = projected;
          }

          // Se houver um GAP entre as projeções, não há intersecção
          if (maxA! < minB! || maxB! < minA!) {
              return false;
          }
      }
  }
  return true;
};

/**
 * 4. IS POLYGON INSIDE RECT (Window Selection)
 * Verifica se o Polígono B (Peça) está TOTALMENTE dentro do Polígono A (Seleção Azul).
 * Para isso, todos os pontos de B devem estar dentro de A.
 */
export const isPolygonInsidePolygon = (inner: Point[], outer: Point[]): boolean => {
  // Se qualquer ponto de Inner estiver fora de Outer, retorna falso.
  for (let i = 0; i < inner.length; i++) {
    if (!isPointInPolygon(inner[i], outer)) {
      return false;
    }
  }
  return true;
};