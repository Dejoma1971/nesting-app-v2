import type { ImportedPart } from "../components/types";
import {
  convertPartToClipperShape,
  clipperShapeToPolygons,
  calculatePolygonArea,
  type Point,
  type WorkerPartGeometry
} from "./geometryCore";

// --- TIPAGEM ESTENDIDA ---
// Estendemos a interface original para incluir o MABB (Caixa Amarela)
export interface WisePartGeometry extends WorkerPartGeometry {
  mabb: Point[]; 
}

// --- ALGORITMOS DE GEOMETRIA COMPUTACIONAL (MABB) ---

// Produto vetorial 2D
const crossProduct = (o: Point, a: Point, b: Point) => {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
};

// Calcula o Fecho Convexo (Convex Hull) - Algoritmo Monotone Chain
const getConvexHull = (points: Point[]): Point[] => {
  if (points.length <= 2) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  
  const upper: Point[] = [];
  for (const p of sorted) {
    while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  const lower: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  upper.pop();
  lower.pop();
  return [...upper, ...lower];
};

// Calcula o Retângulo de Área Mínima (MABB) - Algoritmo Rotating Calipers
const calculateMinAreaRect = (points: Point[]): Point[] => {
  if (points.length === 0) return [];
  const hull = getConvexHull(points);
  
  // Se for muito simples, retorna a caixa normal como fallback
  if (hull.length < 3) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      points.forEach(p => {
          if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
      });
      return [{x: minX, y: minY}, {x: maxX, y: minY}, {x: maxX, y: maxY}, {x: minX, y: maxY}];
  }

  let minArea = Infinity;
  let bestCorners: Point[] = [];

  // Itera sobre cada aresta do fecho convexo
  for (let i = 0; i < hull.length; i++) {
      const p1 = hull[i];
      const p2 = hull[(i + 1) % hull.length];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;

      // Vetores unitários da base (eixo U) e altura (eixo V)
      const ux = dx / len;
      const uy = dy / len;
      const vx = -uy;
      const vy = ux;

      // Projeta todos os pontos nesses eixos locais
      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
      
      for (const p of hull) {
          const u = p.x * ux + p.y * uy;
          const v = p.x * vx + p.y * vy;
          if (u < minU) minU = u;
          if (u > maxU) maxU = u;
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
      }

      const area = (maxU - minU) * (maxV - minV);
      
      if (area < minArea) {
          minArea = area;
          // Reconstrói os 4 cantos no sistema de coordenadas original
          const c1 = { x: minU * ux + minV * vx, y: minU * uy + minV * vy };
          const c2 = { x: maxU * ux + minV * vx, y: maxU * uy + minV * vy };
          const c3 = { x: maxU * ux + maxV * vx, y: maxU * uy + maxV * vy };
          const c4 = { x: minU * ux + maxV * vx, y: minU * uy + maxV * vy };
          bestCorners = [c1, c2, c3, c4];
      }
  }
  return bestCorners;
};

// --- FUNÇÃO PRINCIPAL WISE ---
// Esta função substitui a getOffsetPartGeometry apenas para o Wise Nest
export const getWiseOffsetPartGeometry = (part: ImportedPart, offset: number): WisePartGeometry => {
  // Reusa a conversão robusta do geometryCore.ts
  const shape = convertPartToClipperShape(part);
  
  const inflated = shape.offset(offset, {
    jointType: "jtRound",
    endType: "etClosedPolygon",
    miterLimit: 2.0,
    arcTolerance: 0.25,
  });

  const polygons = clipperShapeToPolygons(inflated);

  if (polygons.length === 0) {
    const p = offset;
    // Fallback: caixa simples
    return {
        outer: [{x:-p,y:-p}, {x:part.width+p,y:-p}, {x:part.width+p,y:part.height+p}, {x:-p,y:part.height+p}],
        holes: [],
        bounds: { minX:-p, maxX:part.width+p, minY:-p, maxY:part.height+p },
        mabb: [{x:-p,y:-p}, {x:part.width+p,y:-p}, {x:part.width+p,y:part.height+p}, {x:-p,y:part.height+p}],
        area: part.width * part.height
    };
  }

  // Identifica Outer Loop (maior área) vs Holes
  let maxArea = -1;
  let outerIndex = 0;
  polygons.forEach((poly, idx) => {
    const area = calculatePolygonArea(poly);
    if (area > maxArea) { maxArea = area; outerIndex = idx; }
  });

  const outerLoop = polygons[outerIndex];
  const holes = polygons.filter((_, i) => i !== outerIndex);

  // Calcula AABB Padrão (Caixa Vermelha - Alinhada aos Eixos)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  outerLoop.forEach(p => {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  });

  // --- O CÁLCULO NOVO: MABB (Caixa Amarela - Área Mínima) ---
  const mabb = calculateMinAreaRect(outerLoop);

  let totalArea = maxArea;
  holes.forEach(h => totalArea -= calculatePolygonArea(h));

  return {
    outer: outerLoop,
    holes: holes,
    bounds: { minX, maxX, minY, maxY },
    mabb: mabb, // Retorna os 4 cantos da caixa otimizada
    area: totalArea,
  };
};