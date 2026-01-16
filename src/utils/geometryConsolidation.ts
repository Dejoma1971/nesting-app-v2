/* eslint-disable @typescript-eslint/no-explicit-any */
import { calculateBoundingBox } from "./geometryCore";

type Entity = any;

/**
 * Verifica se a caixa 'inner' está totalmente dentro da 'outer' com uma pequena margem.
 */
const isBBoxContained = (inner: any, outer: any): boolean => {
  const EPSILON = 0.0001;
  return (
    inner.minX >= outer.minX - EPSILON &&
    inner.maxX <= outer.maxX + EPSILON &&
    inner.minY >= outer.minY - EPSILON &&
    inner.maxY <= outer.maxY + EPSILON
  );
};

export const consolidateNestedParts = (groups: Entity[][]): Entity[][] => {
  // 1. Calcula BBox e Área para cada grupo
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

  // 2. Ordena do MAIOR para o MENOR (Fundamental para pegar peças dentro de peças)
  candidates.sort((a, b) => b.area - a.area);

  // 3. Verifica quem está dentro de quem
  for (let i = 0; i < candidates.length; i++) {
    const child = candidates[i];
    if (child.isConsumed) continue;

    // Procura um pai nos itens maiores (anteriores na lista)
    for (let j = i - 1; j >= 0; j--) {
      const parent = candidates[j];

      // Se a área do pai for quase zero (ex: linha reta), ele não pode conter nada
      if (parent.area < 0.1) continue;

      if (isBBoxContained(child.box, parent.box)) {
        parent.children.push(...child.entities, ...child.children);
        child.isConsumed = true;
        break; // Achou o pai, para de procurar
      }
    }
  }

  // 4. Retorna apenas os pais com seus filhos fundidos
  const result: Entity[][] = [];
  candidates.forEach((c) => {
    if (!c.isConsumed) {
      result.push([...c.entities, ...c.children]);
    }
  });

  return result;
};