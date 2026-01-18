/* eslint-disable @typescript-eslint/no-explicit-any */
import { calculateBoundingBox } from "./geometryCore";

type Entity = any;
type Box = { minX: number; minY: number; maxX: number; maxY: number };
type Point = { x: number; y: number };

// --- 1. FUNÇÕES AUXILIARES DE GEOMETRIA ---

/**
 * Verifica se a caixa 'inner' está completamente dentro da 'outer' com uma margem de segurança.
 */
const isBBoxContained = (inner: Box, outer: Box): boolean => {
  const EPSILON = 0.001; // Tolerância milimétrica
  return (
    inner.minX >= outer.minX - EPSILON &&
    inner.maxX <= outer.maxX + EPSILON &&
    inner.minY >= outer.minY - EPSILON &&
    inner.maxY <= outer.maxY + EPSILON
  );
};

/**
 * Verifica a intersecção de um raio horizontal partindo de P(x,y) com o segmento A-B
 */
const rayIntersectsSegment = (p: Point, a: Point, b: Point): boolean => {
  // Verificação básica de Y (o raio horizontal deve estar na altura do segmento)
  // Usa > e <= para lidar com vértices exatos e evitar contagem dupla
  const yCheck = a.y > p.y !== b.y > p.y;

  if (!yCheck) return false;

  // Calcula a coordenada X da intersecção
  const intersectX = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;

  // O raio é para a direita, então a intersecção deve ser maior que p.x
  return p.x < intersectX;
};

/**
 * Algoritmo robusto de Ray Casting (Ponto em Conjunto de Entidades)
 * Corrige o erro de contagem dupla em linhas soltas.
 */
const isPointInsidePolygonSet = (
  x: number,
  y: number,
  parentEntities: Entity[]
): boolean => {
  const p = { x, y };
  let intersections = 0;
  let isInsideCircle = false;

  for (const ent of parentEntities) {
    // 1. CÍRCULOS (Prioridade)
    // Se o pai tem um círculo e o ponto está nele, assumimos que está dentro da peça
    // (Útil para arruelas ou peças circulares onde o contorno é um Circle DXF)
    if (ent.type === "CIRCLE") {
      const dx = x - ent.center.x;
      const dy = y - ent.center.y;
      if (dx * dx + dy * dy <= ent.radius * ent.radius) {
        isInsideCircle = true;
        // Não damos break imediato porque peças complexas podem ter furos negativos,
        // mas para nesting simples, estar dentro da massa principal é suficiente.
        // Vamos considerar TRUE se estiver na massa positiva.
      }
    }

    // 2. LINE (Trata como segmento único)
    else if (ent.type === "LINE") {
      if (rayIntersectsSegment(p, ent.vertices[0], ent.vertices[1])) {
        intersections++;
      }
    }

    // 3. POLYLINES (Trata como cadeia de segmentos)
    else if (
      (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") &&
      ent.vertices
    ) {
      const vs = ent.vertices;
      const count = vs.length;

      // Itera os segmentos da polilinha
      for (let i = 0; i < count - 1; i++) {
        if (rayIntersectsSegment(p, vs[i], vs[i + 1])) {
          intersections++;
        }
      }

      // Se for fechada, verifica o último segmento voltando ao primeiro
      if (ent.closed && count > 1) {
        if (rayIntersectsSegment(p, vs[count - 1], vs[0])) {
          intersections++;
        }
      }
    }
  }

  // Se detectou que está dentro de um Círculo geométrico do pai, retorna true.
  if (isInsideCircle) return true;

  // Caso contrário, usa a regra Par/Ímpar do Ray Casting nas linhas/polilinhas
  return intersections % 2 !== 0;
};

// --- 2. FUNÇÃO PRINCIPAL ---

export const consolidateNestedParts = (groups: Entity[][]): Entity[][] => {
  // 1. Calcula Metadados
  const candidates = groups.map((entities) => {
    const box = calculateBoundingBox(entities);
    return {
      entities,
      box,
      area: (box.maxX - box.minX) * (box.maxY - box.minY),
      isConsumed: false,
      children: [] as Entity[],
    };
  });

  // 2. Ordena do MAIOR para o MENOR
  candidates.sort((a, b) => b.area - a.area);

  // 3. Loop de Consolidação
  for (let i = 0; i < candidates.length; i++) {
    const child = candidates[i];
    if (child.isConsumed) continue;

    // Procura um pai nos itens MAIORES
    for (let j = i - 1; j >= 0; j--) {
      const parent = candidates[j];

      // Ignora ruído
      if (parent.area < 0.1) continue;

      // PASSO A: Bounding Box (Rápido)
      if (!isBBoxContained(child.box, parent.box)) continue;

      // PASSO B: Geometria Precisa (Ray Casting Corrigido)
      const testX = (child.box.minX + child.box.maxX) / 2;
      const testY = (child.box.minY + child.box.maxY) / 2;

      if (isPointInsidePolygonSet(testX, testY, parent.entities)) {
        parent.children.push(...child.entities, ...child.children);
        child.isConsumed = true;
        break;
      }
    }
  }

  // 4. Retorno Final
  const result: Entity[][] = [];
  candidates.forEach((c) => {
    if (!c.isConsumed) {
      result.push([...c.entities, ...c.children]);
    }
  });

  return result;
};
