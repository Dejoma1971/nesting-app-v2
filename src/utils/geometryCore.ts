/* eslint-disable @typescript-eslint/no-explicit-any */
import ClipperShape from "@doodle3d/clipper-js";
import type { ImportedPart } from "../components/types";

// --- CONSTANTES E TIPOS ---
const SCALE = 1000; // Fator de escala para precisão do Clipper
const ARC_TOLERANCE = 0.5;

export interface Point {
  x: number;
  y: number;
} // Padronizei para minúsculo para bater com o resto do projeto
interface EntityBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

// --- 1. ESTRUTURAS DE DADOS (UnionFind) ---
export class UnionFind {
  parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(i: number): number {
    if (this.parent[i] === i) return i;
    this.parent[i] = this.find(this.parent[i]);
    return this.parent[i];
  }
  union(i: number, j: number) {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) this.parent[rootI] = rootJ;
  }
}

// --- 2. MATEMÁTICA BÁSICA (Rotação, Bulge, Distância) ---

export const rotatePoint = (x: number, y: number, angleDeg: number): Point => {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: x * Math.cos(rad) - y * Math.sin(rad),
    y: x * Math.sin(rad) + y * Math.cos(rad),
  };
};

export const bulgeToArc = (
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  bulge: number
) => {
  const chordDx = p2.x - p1.x;
  const chordDy = p2.y - p1.y;
  const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy);
  const radius = (chordLen * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  const cx = (p1.x + p2.x) / 2 - (chordDy * (1 - bulge * bulge)) / (4 * bulge);
  const cy = (p1.y + p2.y) / 2 + (chordDx * (1 - bulge * bulge)) / (4 * bulge);
  return { radius, cx, cy };
};

export const arePointsClose = (
  p1: Point,
  p2: Point,
  tolerance: number = 1.0
) => {
  return Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance;
};

// --- MATEMÁTICA DE B-SPLINE (NURBS) ---
// Função auxiliar para calcular o vetor de nós (Knots) se não vier no DXF
const generateUniformKnots = (
  degree: number,
  numControlPoints: number
): number[] => {
  const n = numControlPoints - 1;
  const knots: number[] = [];
  for (let i = 0; i <= degree; i++) knots.push(0);
  for (let i = 1; i < n - degree + 1; i++) knots.push(i / (n - degree + 1));
  for (let i = 0; i <= degree; i++) knots.push(1);
  return knots;
};

// Algoritmo de De Boor para avaliar um ponto na B-Spline
const interpolateBSpline = (
  controlPoints: Point[],
  degree: number,
  knots: number[],
  t: number
): Point => {
  let k = -1;
  // Encontrar o intervalo de nós (knot span)
  for (let i = 0; i < knots.length - 1; i++) {
    if (t >= knots[i] && t < knots[i + 1]) {
      k = i;
      break;
    }
  }
  // Tratamento para o último ponto exato (t=1)
  if (t === knots[knots.length - 1]) k = knots.length - degree - 2;

  if (k === -1) return controlPoints[0]; // Fallback

  // Copiar pontos de controle afetados
  const d: Point[] = [];
  for (let i = 0; i <= degree; i++) {
    d[i] = { ...controlPoints[k - degree + i] };
  }

  // Calcular interpolação
  for (let r = 1; r <= degree; r++) {
    for (let i = degree; i >= r; i--) {
      const alpha =
        (t - knots[k - degree + i]) /
        (knots[k + 1 + i - r] - knots[k - degree + i]);
      const x = (1 - alpha) * d[i - 1].x + alpha * d[i].x;
      const y = (1 - alpha) * d[i - 1].y + alpha * d[i].y;
      d[i] = { x, y };
    }
  }
  return d[degree];
};

// Converte a entidade SPLINE do DXF para uma lista de vértices (Polilinha)
const convertSplineToPolyline = (
  entity: any,
  samples: number = 50
): Point[] => {
  // Verifica se tem pontos de controle
  if (!entity.controlPoints || entity.controlPoints.length === 0) return [];

  const degree = entity.degreeOfSplineDegree || 3;
  const controlPoints = entity.controlPoints;
  let knots = entity.knotValues;

  // Se não tiver nós, gera nós uniformes
  if (!knots || knots.length === 0) {
    knots = generateUniformKnots(degree, controlPoints.length);
  }

  const polyline: Point[] = [];
  const minKnot = knots[degree]; // Domínio válido começa aqui
  const maxKnot = knots[knots.length - 1 - degree]; // Termina aqui

  // Amostragem
  for (let i = 0; i <= samples; i++) {
    const t = minKnot + (i / samples) * (maxKnot - minKnot);
    // Pequena proteção para precisão numérica no último ponto
    const safeT = i === samples ? maxKnot - 0.000001 : t;
    polyline.push(interpolateBSpline(controlPoints, degree, knots, safeT));
  }

  return polyline;
};

// --- 3. GEOMETRIA DE ENTIDADES (Conexões, Áreas) ---

export const getConnectionPoints = (ent: any): Point[] => {
  if (ent.type === "LINE") return ent.vertices;
  if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") return ent.vertices;
  if (ent.type === "ARC") {
    const r = ent.radius;
    const cx = ent.center.x;
    const cy = ent.center.y;
    const p1 = {
      x: cx + r * Math.cos(ent.startAngle),
      y: cy + r * Math.sin(ent.startAngle),
    };
    const p2 = {
      x: cx + r * Math.cos(ent.endAngle),
      y: cy + r * Math.sin(ent.endAngle),
    };
    return [p1, p2];
  }
  return [];
};

export const entitiesTouch = (ent1: any, ent2: any) => {
  const pts1 = getConnectionPoints(ent1);
  const pts2 = getConnectionPoints(ent2);
  for (const p1 of pts1) {
    for (const p2 of pts2) {
      if (arePointsClose(p1, p2)) return true;
    }
  }
  return false;
};

export const calculatePolygonArea = (vertices: Point[]) => {
  let area = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(area) / 2;
};

export const calculatePartNetArea = (entities: any[]): number => {
  let netArea = 0;
  entities.forEach((ent) => {
    if (ent.type === "CIRCLE") {
      netArea += Math.PI * (ent.radius * ent.radius);
    } else if (
      (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") &&
      ent.shape
    ) {
      netArea += calculatePolygonArea(ent.vertices);
    }
  });
  return netArea;
};

// --- 4. CÁLCULO DE BOUNDING BOX (Caixa Delimitadora) ---

export const calculateBoundingBox = (
  entities: any[],
  blocks: any = {}
): EntityBox & { width: number; height: number; cx: number; cy: number } => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  const update = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  const checkArcBounds = (
    cx: number,
    cy: number,
    r: number,
    startAngle: number,
    endAngle: number
  ) => {
    let start = startAngle % (2 * Math.PI);
    if (start < 0) start += 2 * Math.PI;
    let end = endAngle % (2 * Math.PI);
    if (end < 0) end += 2 * Math.PI;
    if (end < start) end += 2 * Math.PI;
    update(cx + r * Math.cos(startAngle), cy + r * Math.sin(startAngle));
    update(cx + r * Math.cos(endAngle), cy + r * Math.sin(endAngle));
    const cardinals = [
      0,
      Math.PI / 2,
      Math.PI,
      (3 * Math.PI) / 2,
      2 * Math.PI,
      (5 * Math.PI) / 2,
    ];
    for (const ang of cardinals) {
      if (ang > start && ang < end)
        update(cx + r * Math.cos(ang), cy + r * Math.sin(ang));
    }
  };

  const traverse = (ents: any[], ox = 0, oy = 0) => {
    if (!ents) return;
    ents.forEach((ent) => {
      if (ent.type === "INSERT") {
        const block = blocks[ent.name];
        if (block && block.entities) {
          // Recursividade para blocos
          traverse(
            block.entities,
            ox + (ent.position?.x || 0),
            oy + (ent.position?.y || 0)
          );
        } else {
          update(ox + (ent.position?.x || 0), oy + (ent.position?.y || 0));
        }
      } else if (ent.vertices) {
        ent.vertices.forEach((v: any, i: number) => {
          update(v.x + ox, v.y + oy);
          // Lógica de Bulge (Arcos em Polilinhas)
          if (v.bulge && v.bulge !== 0) {
            const v2 = ent.vertices[(i + 1) % ent.vertices.length];
            if (i === ent.vertices.length - 1 && !ent.shape) return;
            const { cx, cy, radius } = bulgeToArc(v, v2, v.bulge);
            const startAngle = Math.atan2(v.y - cy, v.x - cx);
            let endAngle = Math.atan2(v2.y - cy, v2.x - cx);
            if (v.bulge > 0 && endAngle < startAngle) endAngle += 2 * Math.PI;
            if (v.bulge < 0 && endAngle > startAngle) endAngle -= 2 * Math.PI;

            if (v.bulge < 0)
              checkArcBounds(cx + ox, cy + oy, radius, endAngle, startAngle);
            else checkArcBounds(cx + ox, cy + oy, radius, startAngle, endAngle);
          }
        });
      } else if (ent.type === "CIRCLE") {
        update(ent.center.x + ox - ent.radius, ent.center.y + oy - ent.radius);
        update(ent.center.x + ox + ent.radius, ent.center.y + oy + ent.radius);
      } else if (ent.type === "ARC") {
        checkArcBounds(
          ent.center.x + ox,
          ent.center.y + oy,
          ent.radius,
          ent.startAngle,
          ent.endAngle
        );
      }
    });
  };

  traverse(entities);

  if (minX === Infinity)
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      area: 0,
      width: 0,
      height: 0,
      cx: 0,
      cy: 0,
    };
  return {
    minX,
    minY,
    maxX,
    maxY,
    area: (maxX - minX) * (maxY - minY),
    width: maxX - minX,
    height: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
};

export const isContained = (inner: EntityBox, outer: EntityBox) => {
  const eps = 0.5;
  return (
    inner.minX >= outer.minX - eps &&
    inner.maxX <= outer.maxX + eps &&
    inner.minY >= outer.minY - eps &&
    inner.maxY <= outer.maxY + eps
  );
};

// --- 5. MANIPULAÇÃO DE GEOMETRIA (Flatten, Rotate Part) ---

// --- ATUALIZE A FUNÇÃO 'flattenGeometry' PARA INCLUIR A LÓGICA DE SPLINE ---

// --- EM geometryCore.ts ---

// Mantenha os imports e classes existentes (UnionFind, Point, etc.)
// ...

// --- 1. FUNÇÕES AUXILIARES DE MATEMÁTICA (Adicione estas) ---

/**
 * Calcula a "Área com Sinal" (Signed Area).
 * Se positivo: Sentido Anti-Horário (CCW).
 * Se negativo: Sentido Horário (CW).
 * Útil para detectar espelhamento (Peças espelhadas invertem o sinal).
 */
export const calculateSignedArea = (
  vertices: { x: number; y: number }[]
): number => {
  let area = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return area / 2;
};

/**
 * Calcula o Centroide (Centro de Massa Geométrico) do polígono.
 * Diferente da BoundingBox, o Centroide muda de posição relativa se a peça for espelhada.
 */
export const calculatePolygonCentroid = (
  vertices: { x: number; y: number }[]
): { x: number; y: number } => {
  let cx = 0,
    cy = 0,
    signedArea = 0;
  for (let i = 0; i < vertices.length; i++) {
    const p0 = vertices[i];
    const p1 = vertices[(i + 1) % vertices.length];
    const a = p0.x * p1.y - p1.x * p0.y;
    signedArea += a;
    cx += (p0.x + p1.x) * a;
    cy += (p0.y + p1.y) * a;
  }
  signedArea *= 0.5;
  if (Math.abs(signedArea) < 1e-6) return { x: 0, y: 0 }; // Evita divisão por zero em linhas
  cx /= 6 * signedArea;
  cy /= 6 * signedArea;
  return { x: cx, y: cy };
};

// --- 2. NOVA LÓGICA DE TRANSFORMAÇÃO E FLATTEN ---

/**
 * Aplica uma transformação completa (Escala -> Rotação -> Translação) a um ponto.
 * Suporta Escalas Negativas (Espelhamento).
 */
// --- EM src/utils/geometryCore.ts ---

// 1. FUNÇÕES AUXILIARES MATEMÁTICAS (Adicione ou Substitua)

/**
 * Aplica transformação matricial completa a um ponto (Escala, Rotação, Translação)
 */
const transformPoint = (
  x: number,
  y: number,
  t: { x: number; y: number; scaleX: number; scaleY: number; rotation: number }
) => {
  // Escala (inclui espelhamento se negativo)
  const sx = x * t.scaleX;
  const sy = y * t.scaleY;

  // Rotação (em radianos)
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const rx = sx * cos - sy * sin;
  const ry = sx * sin + sy * cos;

  // Translação
  return {
    x: rx + t.x,
    y: ry + t.y,
  };
};

/**
 * Recalcula o ângulo de um arco após transformação linear.
 * Necessário porque espelhamento altera o quadrante dos ângulos.
 */
const transformAngle = (
  angleDeg: number,
  t: { scaleX: number; scaleY: number; rotation: number }
): number => {
  const rad = (angleDeg * Math.PI) / 180;
  // Ponto unitário no círculo
  const px = Math.cos(rad);
  const py = Math.sin(rad);

  // Aplica apenas escala e rotação (sem translação)
  const sx = px * t.scaleX;
  const sy = py * t.scaleY;

  const rotRad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);

  const rx = sx * cos - sy * sin;
  const ry = sx * sin + sy * cos;

  // Calcula novo ângulo
  let newRad = Math.atan2(ry, rx);
  if (newRad < 0) newRad += 2 * Math.PI;

  return (newRad * 180) / Math.PI;
};

/**
 * Converte uma ELIPSE (paramétrica do DXF) em Polilinha (lista de vértices).
 * Matemática: P(t) = C + M*cos(t) + N*sin(t)
 * Onde M é o vetor do Eixo Maior e N é o vetor do Eixo Menor (ortogonal).
 */
/**
 * Converte uma ELIPSE (paramétrica do DXF) em Polilinha (lista de vértices).
 * Matemática: P(t) = C + M*cos(t) + N*sin(t)
 */
const convertEllipseToPolyline = (
  ent: any,
  segments: number = 64
): { x: number; y: number }[] => {
  const vertices: { x: number; y: number }[] = [];

  const cx = ent.center.x;
  const cy = ent.center.y;

  // Vetor do Eixo Maior
  const majorX = ent.majorAxisEndPoint.x;
  const majorY = ent.majorAxisEndPoint.y;

  // Razão do Eixo Menor
  const ratio = ent.axisRatio;

  // Vetor do Eixo Menor
  const minorX = -majorY * ratio;
  const minorY = majorX * ratio;

  // CORREÇÃO AQUI: Mudamos de 'let' para 'const' pois não é reatribuída
  const startParam = ent.startParameter || 0;

  // Este continua 'let' pois pode ser ajustado abaixo
  let endParam = ent.endParameter || 2 * Math.PI;

  // Normalização
  if (Math.abs(endParam - startParam) < 1e-6) {
    endParam = startParam + 2 * Math.PI;
  }
  if (endParam < startParam) endParam += 2 * Math.PI;

  const step = (endParam - startParam) / segments;

  for (let i = 0; i <= segments; i++) {
    const t = startParam + step * i;
    const cos = Math.cos(t);
    const sin = Math.sin(t);

    const x = cx + majorX * cos + minorX * sin;
    const y = cy + majorY * cos + minorY * sin;

    vertices.push({ x, y });
  }

  return vertices;
};

// 2. O NOVO FLATTEN GEOMETRY (ROBUSTO)

export const flattenGeometry = (
  entities: any[],
  blocks: any,
  parentTransform = { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
): any[] => {
  let flatList: any[] = [];
  if (!entities) return [];

  // Detecta se esta transformação inverte a geometria (Espelhamento)
  // Se scaleX * scaleY < 0, houve um número ímpar de espelhamentos -> Geometria invertida.
  const isMirrored = parentTransform.scaleX * parentTransform.scaleY < 0;

  entities.forEach((ent) => {
    // --- CASO 1: INSERT (Blocos) ---
    if (ent.type === "INSERT" && blocks[ent.name]) {
      const blockDef = blocks[ent.name];

      const insertTransform = {
        x: ent.position?.x || 0,
        y: ent.position?.y || 0,
        scaleX: ent.scale?.x !== undefined ? ent.scale.x : 1,
        scaleY: ent.scale?.y !== undefined ? ent.scale.y : 1,
        rotation: ent.rotation || 0,
      };

      // Compõe a transformação do pai com a do filho
      // (Nota: Esta é uma simplificação válida para 2D orthogonal/uniforme.
      // Matrizes completas seriam ideais, mas isso resolve 99% dos casos DXF industriais)
      const globalPos = transformPoint(
        insertTransform.x,
        insertTransform.y,
        parentTransform
      );

      const combinedTransform = {
        x: globalPos.x,
        y: globalPos.y,
        scaleX: parentTransform.scaleX * insertTransform.scaleX,
        scaleY: parentTransform.scaleY * insertTransform.scaleY,
        rotation: parentTransform.rotation + insertTransform.rotation,
      };

      const subEntities = flattenGeometry(
        blockDef.entities,
        blocks,
        combinedTransform
      );
      flatList = flatList.concat(subEntities);
    }

    // --- CASO 2: SPLINE (Converte para Polilinha) ---
    else if (ent.type === "SPLINE") {
      // (Assume que você tem a função convertSplineToPolyline no arquivo)
      // Se não tiver, use uma lógica simples ou importe
      const rawVertices = convertSplineToPolyline
        ? convertSplineToPolyline(ent, 64)
        : [];

      if (rawVertices.length > 0) {
        const transformedVertices = rawVertices.map((v) =>
          transformPoint(v.x, v.y, parentTransform)
        );
        if (isMirrored) transformedVertices.reverse(); // Corrige ordem dos pontos

        flatList.push({
          type: "LWPOLYLINE",
          vertices: transformedVertices,
          layer: ent.layer || "0",
        });
      }
    }

    // --- CASO NOVO: ELLIPSE ---
    else if (ent.type === "ELLIPSE") {
      // 1. Converte a matemática paramétrica para pontos físicos
      const rawVertices = convertEllipseToPolyline(ent, 64); // 64 segmentos = boa precisão

      if (rawVertices.length > 0) {
        // 2. Aplica as transformações de matriz (Espelhamento, Rotação do Bloco pai, etc.)
        const transformedVertices = rawVertices.map((v) =>
          transformPoint(v.x, v.y, parentTransform)
        );

        // 3. Verifica Espelhamento (Inverte ordem se necessário para manter o Winding Order)
        if (isMirrored) {
          transformedVertices.reverse();
        }

        flatList.push({
          type: "LWPOLYLINE", // Convertemos para Polilinha para facilitar o Nesting
          vertices: transformedVertices,
          layer: ent.layer || "0",
          shape: true, // Elipses completas são fechadas (ou arcos elípticos se parciais)
        });
      }
    }

    // --- CASO 3: ARC (O vilão dos espelhamentos) ---
    else if (ent.type === "ARC") {
      const clone = JSON.parse(JSON.stringify(ent));

      // 1. Transforma o Centro
      clone.center = transformPoint(
        ent.center.x,
        ent.center.y,
        parentTransform
      );

      // 2. Escala o Raio (Média simples se for elíptico, ou assume uniforme)
      clone.radius = ent.radius * Math.abs(parentTransform.scaleX);

      // 3. Recalcula Ângulos
      const startA = transformAngle(ent.startAngle, parentTransform);
      const endA = transformAngle(ent.endAngle, parentTransform);

      if (isMirrored) {
        // Se espelhado, o sentido do arco inverte. O Start vira End e vice-versa.
        clone.startAngle = endA;
        clone.endAngle = startA;
      } else {
        clone.startAngle = startA;
        clone.endAngle = endA;
      }

      flatList.push(clone);
    }

    // --- CASO 4: LWPOLYLINE (Com Bulge) ---
    else if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
      const clone = JSON.parse(JSON.stringify(ent));

      if (clone.vertices) {
        clone.vertices = clone.vertices.map((v: any) => {
          const p = transformPoint(v.x, v.y, parentTransform);
          // Importante: Bulge também precisa ser escalado/invertido?
          // Se espelhado, a curva inverte a concavidade -> bulge * -1
          let newBulge = v.bulge || 0;
          if (isMirrored) newBulge = -newBulge;

          return { ...v, x: p.x, y: p.y, bulge: newBulge };
        });

        // Se espelhado, a ordem dos vértices inverteu.
        // No DXF, o 'bulge' de um vértice define a curva até o PRÓXIMO vértice.
        // Ao inverter o array, o bulge precisa "viajar" para o vértice anterior na nova ordem.
        if (isMirrored) {
          const reversed = [];
          const len = clone.vertices.length;
          // Lógica complexa de inversão de polilinha com bulge
          for (let i = 0; i < len; i++) {
            const originalIdx = len - 1 - i;
            const v = clone.vertices[originalIdx];

            // O bulge deste vértice deve vir do vértice que "era" anterior a ele
            // Na inversão: Bulge[i] vira Bulge do vértice anterior na lista invertida
            // Simplificação robusta para Nesting: Apenas inverter array funciona para linhas retas.
            // Para curvas, movemos o bulge.

            let prevBulge = 0;
            if (originalIdx > 0) {
              prevBulge = clone.vertices[originalIdx - 1].bulge || 0;
            } else if (clone.shape) {
              // Fechado
              prevBulge = clone.vertices[len - 1].bulge || 0;
            }

            // Como invertemos o bulge no map acima, usamos o valor já negado
            let correctedBulge = prevBulge;
            if (isMirrored) correctedBulge = -prevBulge; // Reforça a negação

            reversed.push({ ...v, bulge: correctedBulge });
          }
          clone.vertices = reversed;
        }
      }
      flatList.push(clone);
    }

    // --- CASO 5: LINE, CIRCLE, ETC ---
    else {
      const clone = JSON.parse(JSON.stringify(ent));
      if (clone.vertices) {
        clone.vertices = clone.vertices.map((v: any) =>
          transformPoint(v.x, v.y, parentTransform)
        );
        if (isMirrored) clone.vertices.reverse();
      }
      if (clone.center) {
        clone.center = transformPoint(
          clone.center.x,
          clone.center.y,
          parentTransform
        );
        if (clone.radius) clone.radius *= Math.abs(parentTransform.scaleX);
      }
      flatList.push(clone);
    }
  });

  return flatList;
};

// --- 6. INTEGRAÇÃO COM CLIPPER (MANTIDO E MELHORADO) ---

// Transforma um Círculo/Arco em uma lista de pontos (Polígono)
const discretizeArc = (
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
  isCircle: boolean = false
): { X: number; Y: number }[] => {
  const points: { X: number; Y: number }[] = [];

  // Garante sentido anti-horário positivo
  let sweep = endAngle - startAngle;
  if (sweep < 0) sweep += 2 * Math.PI;
  if (isCircle) sweep = 2 * Math.PI;

  // Calcula passos baseado na qualidade desejada
  const segments = Math.ceil(
    Math.abs(sweep) / (2 * Math.acos(1 - ARC_TOLERANCE / r))
  );
  const numSegments = Math.max(segments, 24); // Mínimo 12 segmentos

  const step = sweep / numSegments;

  for (let i = 0; i <= numSegments; i++) {
    if (isCircle && i === numSegments) break;
    const theta = startAngle + step * i;
    points.push({
      X: Math.round((cx + r * Math.cos(theta)) * SCALE),
      Y: Math.round((cy + r * Math.sin(theta)) * SCALE),
    });
  }
  return points;
};

const entityToPath = (ent: any): { X: number; Y: number }[] => {
  const path: { X: number; Y: number }[] = [];
  if (ent.type === "LINE") {
    ent.vertices.forEach((v: any) => {
      path.push({ X: Math.round(v.x * SCALE), Y: Math.round(v.y * SCALE) });
    });
  } else if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
    if (ent.vertices) {
      ent.vertices.forEach((v: any) => {
        // Lógica simples para vértices. Para suportar Bulge no Clipper, teríamos que discretizar aqui também.
        // Por enquanto mantendo simples como estava, mas idealmente usaria discretizeArc se tiver bulge.
        path.push({ X: Math.round(v.x * SCALE), Y: Math.round(v.y * SCALE) });
      });
    }
  } else if (ent.type === "CIRCLE") {
    return discretizeArc(ent.center.x, ent.center.y, ent.radius, 0, 0, true);
  } else if (ent.type === "ARC") {
    return discretizeArc(
      ent.center.x,
      ent.center.y,
      ent.radius,
      ent.startAngle,
      ent.endAngle
    );
  }
  return path;
};

export const convertPartToClipperShape = (part: ImportedPart): ClipperShape => {
  const allPaths: { X: number; Y: number }[][] = [];
  // Nota: Se a peça tiver blocos, idealmente deveríamos usar flattenGeometry antes!
  // Mas para manter compatibilidade, vamos varrer entities direto.
  part.entities.forEach((ent) => {
    const path = entityToPath(ent);
    if (path.length > 0) allPaths.push(path);
  });
  const shape = new ClipperShape(allPaths, false);
  const simplified = shape.simplify("NonZero");
  return simplified;
};

export const clipperShapeToPolygons = (
  shape: ClipperShape
): { x: number; y: number }[][] => {
  if (!shape) return [];
  const paths = (shape as any).paths || [];
  return paths.map((path: any[]) => {
    return path.map((pt) => ({
      x: pt.X / SCALE,
      y: pt.Y / SCALE,
    }));
  });
};

// ... (Mantenha todo o código anterior do geometryCore.ts igual) ...

// --- ADICIONE ISTO NO FINAL DO ARQUIVO ---

// Interface compatível com o Worker
export interface WorkerPartGeometry {
  outer: Point[];
  holes: Point[][];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  area: number;
}

/**
 * Gera a geometria da peça já inflada com metade do GAP.
 * Isso permite que a colisão seja checada com gap=0, garantindo precisão True Shape.
 */
export const getOffsetPartGeometry = (
  part: ImportedPart,
  offset: number
): WorkerPartGeometry => {
  // 1. Converte para Clipper
  const shape = convertPartToClipperShape(part);

  // 2. Aplica o Offset (Inflar)
  // jointType: 'jtMiter' mantém cantos vivos (ou use 'jtRound' para arredondados)
  // miterLimit: Limita pontas muito agudas
  const inflatedShape = shape.offset(offset, {
    jointType: "jtRound",
    endType: "etClosedPolygon",
    miterLimit: 2.0,
    arcTolerance: 0.25,
  });

  // 3. Converte de volta para Polígonos Simples
  const polygons = clipperShapeToPolygons(inflatedShape);

  if (polygons.length === 0) {
    // Fallback se algo der errado (retorna caixa básica inflada)
    const p = offset;
    return {
      outer: [
        { x: -p, y: -p },
        { x: part.width + p, y: -p },
        { x: part.width + p, y: part.height + p },
        { x: -p, y: part.height + p },
      ],
      holes: [],
      bounds: {
        minX: -p,
        maxX: part.width + p,
        minY: -p,
        maxY: part.height + p,
      },
      area: (part.width + p * 2) * (part.height + p * 2),
    };
  }

  // 4. Identifica qual é o Outer Loop (maior área) e quais são Holes
  let maxArea = -1;
  let outerIndex = 0;

  polygons.forEach((poly, idx) => {
    const area = calculatePolygonArea(poly);
    if (area > maxArea) {
      maxArea = area;
      outerIndex = idx;
    }
  });

  const outerLoop = polygons[outerIndex];
  const holes = polygons.filter((_, idx) => idx !== outerIndex);

  // 5. Calcula Bounds e Área Total
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

  // Normaliza para começar em 0,0 (opcional, mas bom para padronizar rotação depois)
  // O Worker já lida com translação, mas aqui retornamos a geometria local inflada.
  // NOTA: Não normalizamos aqui para manter coerência com o centro da peça original se necessário,
  // mas para cálculo de área e bounds, os valores absolutos importam.

  let totalArea = maxArea;
  holes.forEach((h) => (totalArea -= calculatePolygonArea(h)));

  return {
    outer: outerLoop,
    holes: holes,
    bounds: { minX, maxX, minY, maxY },
    area: totalArea,
  };
};

// ... (mantenha todo o código anterior)

// --- 7. VERIFICAÇÃO E CORREÇÃO DE GEOMETRIA ABERTA ---

// Gera uma chave única para coordenadas (para lidar com precisão de float)
const pointKey = (p: { x: number; y: number }) =>
  `${p.x.toFixed(3)},${p.y.toFixed(3)}`;

export const detectOpenEndpoints = (entities: any[]): Point[] => {
  const pointCounts = new Map<string, { count: number; pt: Point }>();

  // Função auxiliar para registrar ponto
  const addPoint = (x: number, y: number) => {
    const p = { x, y };
    const k = pointKey(p);
    const current = pointCounts.get(k);
    if (current) {
      current.count++;
    } else {
      pointCounts.set(k, { count: 1, pt: p });
    }
  };

  entities.forEach((ent) => {
    // Ignora textos, dimensões, etc. Foca no contorno de corte.
    if (ent.type === "LINE") {
      addPoint(ent.vertices[0].x, ent.vertices[0].y);
      addPoint(ent.vertices[1].x, ent.vertices[1].y);
    } else if (ent.type === "ARC") {
      const p1 = {
        x: ent.center.x + ent.radius * Math.cos(ent.startAngle),
        y: ent.center.y + ent.radius * Math.sin(ent.startAngle),
      };
      const p2 = {
        x: ent.center.x + ent.radius * Math.cos(ent.endAngle),
        y: ent.center.y + ent.radius * Math.sin(ent.endAngle),
      };
      addPoint(p1.x, p1.y);
      addPoint(p2.x, p2.y);
    } else if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
      // Se a polilinha já está marcada como fechada, não gera pontas soltas
      if (ent.shape) return;

      if (ent.vertices && ent.vertices.length > 0) {
        const first = ent.vertices[0];
        const last = ent.vertices[ent.vertices.length - 1];

        // Se o primeiro e o último ponto são iguais, é fechado geometricamente
        if (arePointsClose(first, last, 0.001)) return;

        addPoint(first.x, first.y);
        addPoint(last.x, last.y);
      }
    }
  });

  // Filtra pontos que apareceram um número ímpar de vezes (geralmente 1 = ponta solta)
  const openPoints: Point[] = [];
  pointCounts.forEach((val) => {
    if (val.count % 2 !== 0) {
      openPoints.push(val.pt);
    }
  });

  return openPoints;
};

// ... (mantenha imports e funções anteriores)

export const closeOpenPath = (entities: any[], openPoints: Point[]): any[] => {
  const newEntities = [...entities];
  const pointsToProcess = [...openPoints];

  // Tolerância para "Gap de CAD" (ex: 5mm).
  // Se a distância for maior que isso, assumimos que NÃO deve ser fechado automaticamente para não riscar a peça.
  const MAX_GAP_DISTANCE = 1.0;

  while (pointsToProcess.length >= 2) {
    const current = pointsToProcess.pop()!;
    let nearestIdx = -1;
    let minDist = Infinity;

    // Encontra o ponto mais próximo deste
    for (let i = 0; i < pointsToProcess.length; i++) {
      const other = pointsToProcess[i];
      const d = Math.sqrt(
        Math.pow(other.x - current.x, 2) + Math.pow(other.y - current.y, 2)
      );
      if (d < minDist) {
        minDist = d;
        nearestIdx = i;
      }
    }

    if (nearestIdx !== -1) {
      // Só fecha se for um gap pequeno (correção de canto)
      if (minDist <= MAX_GAP_DISTANCE) {
        const target = pointsToProcess[nearestIdx];
        newEntities.push({
          type: "LINE",
          vertices: [current, target],
          layer: "AUTOCLOSE",
        });
        // Remove o ponto usado da lista
        pointsToProcess.splice(nearestIdx, 1);
      } else {
        // Se a distância for muito grande (como na sua imagem),
        // PROVAVELMENTE a ordem dos pontos detectados está cruzada ou a peça está muito quebrada.
        // Nesse caso, preferimos NÃO fechar do que estragar a peça com um risco no meio.
        console.warn(
          "Gap muito grande detectado, ignorando fechamento automático para evitar corte transversal:",
          minDist
        );
      }
    }
  }

  return newEntities;
};

// ... (Mantenha todo o código existente acima)

// --- NOVAS FUNÇÕES PARA DETECÇÃO DE PAI/FILHO (Adicione no final do arquivo) ---

/**
 * Verifica se um ponto (x, y) está dentro de um polígono definido por um conjunto de arestas.
 * Algoritmo: Ray Casting.
 */
export const isPointInPolygon = (
  point: { x: number; y: number },
  entities: any[]
): boolean => {
  let inside = false;
  const x = point.x,
    y = point.y;

  for (const ent of entities) {
    // Considera linhas e polilinhas como barreiras
    let p1, p2;

    if (ent.type === "LINE") {
      p1 = ent.vertices[0];
      p2 = ent.vertices[1];
    } else if (
      (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") &&
      ent.vertices &&
      ent.vertices.length > 1
    ) {
      // Para polilinhas, testamos cada segmento
      for (let i = 0; i < ent.vertices.length - 1; i++) {
        const v1 = ent.vertices[i];
        const v2 = ent.vertices[i + 1];
        const intersect =
          v1.y > y !== v2.y > y &&
          x < ((v2.x - v1.x) * (y - v1.y)) / (v2.y - v1.y) + v1.x;
        if (intersect) inside = !inside;
      }
      continue; // Já processou a polilinha internamente
    } else {
      continue;
    }

    // Lógica para LINE (ou segmento único)
    const xi = p1.x,
      yi = p1.y;
    const xj = p2.x,
      yj = p2.y;

    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
};

/**
 * Verifica se o grupo 'child' está totalmente contido no grupo 'parent'.
 */
export const isGroupContained = (
  childEntities: any[],
  parentEntities: any[]
): boolean => {
  // 1. Calcula as caixas (Bounding Box)
  // Nota: O TypeScript pode reclamar se calculateBoundingBox não estiver exportada ou no escopo.
  // Certifique-se de que ela está definida neste arquivo (pelo que vi, está).
  const childBox = calculateBoundingBox(childEntities);
  const parentBox = calculateBoundingBox(parentEntities);

  // 2. Teste Rápido: A caixa do filho DEVE estar dentro da caixa do pai
  if (
    childBox.minX < parentBox.minX || // margem de erro pode ser adicionada aqui se necessário
    childBox.minY < parentBox.minY ||
    childBox.maxX > parentBox.maxX ||
    childBox.maxY > parentBox.maxY
  ) {
    return false;
  }

  // 3. Teste Preciso: Pega um ponto de amostra do filho
  // Tenta pegar o primeiro vértice de uma linha
  let samplePoint = null;
  for (const ent of childEntities) {
    if (ent.vertices && ent.vertices.length > 0) {
      samplePoint = ent.vertices[0];
      break;
    }
    if (ent.center) {
      // Caso seja círculo/arco
      samplePoint = { x: ent.center.x + (ent.radius || 0), y: ent.center.y };
      break;
    }
  }

  if (!samplePoint) return false;

  return isPointInPolygon(samplePoint, parentEntities);
};
