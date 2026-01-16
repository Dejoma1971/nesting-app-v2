/* eslint-disable @typescript-eslint/no-explicit-any */
import { calculateBoundingBox } from "./geometryCore";

type Entity = any;
type Box = { minX: number; minY: number; maxX: number; maxY: number };

// --- 1. FUNÇÕES AUXILIARES DE GEOMETRIA ---

/**
 * Verifica se a caixa 'inner' está grosseiramente dentro da 'outer'.
 * (Otimização rápida antes de fazer o cálculo pesado de polígonos)
 */
const isBBoxContained = (inner: Box, outer: Box): boolean => {
  const EPSILON = 0.0001;
  return (
    inner.minX >= outer.minX - EPSILON &&
    inner.maxX <= outer.maxX + EPSILON &&
    inner.minY >= outer.minY - EPSILON &&
    inner.maxY <= outer.maxY + EPSILON
  );
};

/**
 * Verifica se um Ponto (x, y) está matematicamente dentro de uma entidade Pai (Círculo ou Polígono).
 * Usa algoritmo Ray-Casting para formas complexas (como perfis U ou L).
 */
const isPointInEntity = (
  x: number,
  y: number,
  parentEntity: Entity
): boolean => {
  // Caso 1: Pai é Círculo
  if (parentEntity.type === "CIRCLE") {
    const dx = x - parentEntity.center.x;
    const dy = y - parentEntity.center.y;
    return dx * dx + dy * dy <= parentEntity.radius * parentEntity.radius;
  }

  // Caso 2: Pai é Linha ou Polilinha (Tratamos como segmentos)
  if (parentEntity.vertices && parentEntity.vertices.length >= 2) {
    // Ray Casting: Traça uma linha horizontal de (x,y) para a direita (infinito)
    let inside = false;
    const vs = parentEntity.vertices;

    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
      const xi = vs[i].x,
        yi = vs[i].y;
      const xj = vs[j].x,
        yj = vs[j].y;

      // Verifica intersecção com o segmento da aresta
      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

      if (intersect) inside = !inside;
    }
    return inside;
  }

  return false;
};

/**
 * Verifica se o grupo 'child' está VERDADEIRAMENTE contido na geometria do 'parent'.
 * Não apenas no BBox, mas dentro da área preenchida.
 */
const isStrictlyContained = (
  childEntities: Entity[],
  parentEntities: Entity[]
): boolean => {
  // Pega um ponto de teste do filho (o centro do BBox)
  const childBox = calculateBoundingBox(childEntities);
  const testX = (childBox.minX + childBox.maxX) / 2;
  const testY = (childBox.minY + childBox.maxY) / 2;

  // O filho está contido se o ponto de teste estiver dentro de ALGUMA entidade fechada do pai
  // (Ou se o pai for um conjunto de linhas que formam um loop - simplificação: checa colisão com qualquer "massa" do pai)

  // Verifica contra todas as entidades do pai que formam área (Polilinhas ou Círculos)
  // Se o pai for composto de várias linhas soltas (ex: Exploded Rect), o RayCasting falha se não iterarmos como um todo.
  // Para robustez máxima neste caso DXF, assumimos que o pai tem ao menos uma entidade "container" (Polyline/Circle)
  // OU testamos contra todas e fazemos uma regra de "Voto" (odd/even total).

  let totalIntersections = 0;

  for (const pEnt of parentEntities) {
    // Se o pai tem um Círculo, e o ponto ta dentro, tá contido. Fim.
    if (pEnt.type === "CIRCLE") {
      if (isPointInEntity(testX, testY, pEnt)) return true;
    }

    // Se for polilinha/linha, somamos intersecções para o Ray Casting Global
    if (pEnt.vertices && pEnt.vertices.length > 1) {
      const vs = pEnt.vertices;
      for (let i = 0; i < vs.length - 1; i++) {
        const xi = vs[i].x,
          yi = vs[i].y;
        const xj = vs[i + 1].x,
          yj = vs[i + 1].y;

        const intersect =
          yi > testY !== yj > testY &&
          testX < ((xj - xi) * (testY - yi)) / (yj - yi) + xi;

        if (intersect) totalIntersections++;
      }
      // Fecha o loop se for polilinha fechada ou último ponto volta pro primeiro?
      // DXF Lines soltas não fecham sozinhas, mas o array de grupos sim.
      // Se o grupo forma um loop visual, as linhas se conectam.
      // Vamos assumir que 'entitiesTouch' já agrupou tudo.
    }
  }

  // Se a linha imaginária cruzou um número ímpar de fronteiras, o ponto está dentro.
  return totalIntersections % 2 !== 0;
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

    // Procura um pai nos itens maiores
    for (let j = i - 1; j >= 0; j--) {
      const parent = candidates[j];

      // O pai precisa ser grande o suficiente (evita linhas soltas engolindo coisas)
      if (parent.area < 0.1) continue;

      // PASSO A: OTIMIZAÇÃO (BBOX)
      // Se não estiver nem na caixa, nem perde tempo calculando geometria
      if (!isBBoxContained(child.box, parent.box)) continue;

      // PASSO B: VERIFICAÇÃO GEOMÉTRICA PRECISA [NOVO!]
      // Garante que não é apenas um aninhamento no vazio de um "U"
      if (isStrictlyContained(child.entities, parent.entities)) {
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
