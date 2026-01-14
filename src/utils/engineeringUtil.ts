/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ImportedPart } from "../components/types";
import {
  UnionFind,
  calculateBoundingBox,
  calculatePartNetArea,
  entitiesTouch,
  detectOpenEndpoints,
  isGroupContained,
} from "../utils/geometryCore";

// --- LÓGICA DE ROTAÇÃO ---
// --- EM src/utils/engineeringUtil.ts ---

// Função auxiliar para garantir que o ângulo do arco fique sempre limpo (0 a 360)
const normalizeAngle = (angle: number): number => {
  let a = angle % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a;
};

// Arredondamento de segurança (4 casas decimais) para limpar sujeira do DXF
const roundCoord = (val: number) => Math.round(val * 10000) / 10000;

export const applyRotationToPart = (
  part: ImportedPart,
  angleInDegrees: number // Espera receber 90 ou -90
): ImportedPart => {
  // Clona a peça
  const newPart = JSON.parse(JSON.stringify(part));

  // Normaliza o ângulo de entrada (apenas para garantir o sentido)
  // Se for positivo (ex: 90) é Anti-Horário (CCW). Se negativo, Horário (CW).
  const isCCW = angleInDegrees > 0;

  // Define a função de transformação EXATA baseada em troca de eixos
  // Isso evita uso de Math.sin/cos e impede deformação.
  const transformPoint = (x: number, y: number) => {
    if (isCCW) {
      // 90 graus Anti-Horário: (x, y) -> (-y, x)
      return { x: -y, y: x };
    } else {
      // 90 graus Horário: (x, y) -> (y, -x)
      return { x: y, y: -x };
    }
  };

  // Variação angular para Arcos (90 graus em Radianos = PI/2)
  const angleDelta = isCCW ? Math.PI / 2 : -Math.PI / 2;

  // Aplica a transformação em todas as entidades
  newPart.entities = newPart.entities.map((ent: any) => {
    // 1. Linhas
    if (ent.type === "LINE") {
      const p1 = transformPoint(ent.vertices[0].x, ent.vertices[0].y);
      const p2 = transformPoint(ent.vertices[1].x, ent.vertices[1].y);
      ent.vertices = [
        { x: roundCoord(p1.x), y: roundCoord(p1.y) },
        { x: roundCoord(p2.x), y: roundCoord(p2.y) },
      ];
    }
    // 2. Polilinhas (LWPOLYLINE / POLYLINE)
    else if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
      ent.vertices = ent.vertices.map((v: any) => {
        const p = transformPoint(v.x, v.y);
        // Mantém o 'bulge' se existir, pois rotação ortogonal não muda a curvatura relativa
        return { ...v, x: roundCoord(p.x), y: roundCoord(p.y) };
      });
    }
    // 3. Círculos e Arcos
    else if (ent.type === "CIRCLE" || ent.type === "ARC") {
      const c = transformPoint(ent.center.x, ent.center.y);
      ent.center = { x: roundCoord(c.x), y: roundCoord(c.y) };

      // Se for Arco, precisa atualizar os ângulos inicial e final
      if (ent.type === "ARC") {
        ent.startAngle = normalizeAngle(ent.startAngle + angleDelta);
        ent.endAngle = normalizeAngle(ent.endAngle + angleDelta);
      }
    }
    return ent;
  });

  // --- RE-NORMALIZAÇÃO DE POSIÇÃO ---
  // A rotação pode jogar a peça para coordenadas negativas (ex: -500, 200).
  // Precisamos calcular a nova caixa e trazer de volta para perto da origem (0,0).

  const box = calculateBoundingBox(newPart.entities);
  const minX = box.minX;
  const minY = box.minY;

  newPart.width = roundCoord(box.maxX - box.minX);
  newPart.height = roundCoord(box.maxY - box.minY);
  newPart.blocks = {}; // Remove estrutura de blocos para simplificar visualização

  // Move todas as entidades para encostar na origem (0,0)
  newPart.entities = newPart.entities.map((ent: any) => {
    const move = (x: number, y: number) => ({
      x: roundCoord(x - minX),
      y: roundCoord(y - minY),
    });

    if (ent.vertices) {
      ent.vertices = ent.vertices.map((v: any) => {
        const p = move(v.x, v.y);
        return { ...v, x: p.x, y: p.y };
      });
    } else if (ent.center) {
      const c = move(ent.center.x, ent.center.y);
      ent.center = { x: c.x, y: c.y };
    }
    return ent;
  });

  // Recalcula áreas
  newPart.grossArea = newPart.width * newPart.height;
  let net = calculatePartNetArea(newPart.entities);
  if (net < 0.1) net = newPart.grossArea;
  newPart.netArea = net;

  return newPart;
};

// --- EM src/utils/engineeringUtil.ts ---

export const applyMirrorToPart = (part: ImportedPart): ImportedPart => {
  // 1. Clona a peça para não alterar o estado original diretamente
  const newPart = JSON.parse(JSON.stringify(part));

  // 2. Espelha as entidades (Inverte o X)
  newPart.entities = newPart.entities.map((ent: any) => {
    // Espelhar vértices (Lines, Polylines)
    if (ent.vertices) {
      ent.vertices = ent.vertices.map((v: any) => ({
        ...v,
        x: -v.x, // Inverte o X
        y: v.y,
        bulge: v.bulge ? -v.bulge : 0, // Inverte a curva (Bulge) se existir
      }));
      // Inverte a ordem dos vértices para manter a integridade (CW/CCW)
      ent.vertices.reverse();
    }

    // Espelhar Arcos e Círculos
    if (ent.center) {
      ent.center.x = -ent.center.x; // Inverte centro

      if (ent.type === "ARC") {
        // O espelhamento horizontal muda o sentido do ângulo.
        // Novo Start = 180 - Antigo End
        // Novo End = 180 - Antigo Start
        const oldStart = ent.startAngle;
        const oldEnd = ent.endAngle;

        // Função auxiliar para normalizar ângulos (0-360 ou radianos, dependendo do seu sistema)
        // Assumindo radianos aqui pois DXF usa radianos, mas se seu visualizador usa graus, ajuste para 180.
        // O seu código anterior usava Math.PI (radianos).

        ent.startAngle = Math.PI - oldEnd;
        ent.endAngle = Math.PI - oldStart;
      }
    }

    return ent;
  });

  // 3. Recalcula a Bounding Box para normalizar a posição (trazer para 0,0)
  const box = calculateBoundingBox(newPart.entities);
  const minX = box.minX;
  const minY = box.minY;

  // 4. Normaliza (Move para a origem)
  newPart.entities = newPart.entities.map((ent: any) => {
    const move = (x: number, y: number) => ({ x: x - minX, y: y - minY });

    if (ent.vertices) {
      ent.vertices = ent.vertices.map((v: any) => {
        const p = move(v.x, v.y);
        return { ...v, x: p.x, y: p.y };
      });
    } else if (ent.center) {
      const c = move(ent.center.x, ent.center.y);
      ent.center = { x: c.x, y: c.y };
    }
    return ent;
  });

  // 5. Atualiza dimensões
  newPart.width = box.maxX - box.minX;
  newPart.height = box.maxY - box.minY;

  return newPart;
};

// --- Função Auxiliar para Agrupar Furos ---
const mergeHolesIntoParts = (groups: any[][]): any[][] => {
  // Prepara os dados calculando BBox e Área para cada grupo
  const candidateParts = groups.map((group) => {
    const box = calculateBoundingBox(group);
    const area = (box.maxX - box.minX) * (box.maxY - box.minY);
    return {
      entities: group,
      box,
      area,
      isHole: false,
      children: [] as any[],
    };
  });

  // Ordena do MAIOR para o MENOR (Fundamental para a lógica funcionar)
  candidateParts.sort((a, b) => b.area - a.area);

  // Verifica quem está dentro de quem
  for (let i = 0; i < candidateParts.length; i++) {
    const potentialHole = candidateParts[i];

    // Procura um pai apenas entre os itens maiores (índices anteriores)
    // Itera de trás para frente para achar o menor pai possível (o pai imediato)
    for (let j = i - 1; j >= 0; j--) {
      const potentialParent = candidateParts[j];

      // Se já é um furo, ignoramos (simplificação) ou se a caixa não contém
      if (potentialHole.isHole) continue;

      if (isGroupContained(potentialHole.entities, potentialParent.entities)) {
        // Confirmado: É um furo deste pai
        potentialParent.children.push(...potentialHole.entities);
        potentialHole.isHole = true;
        break; // Pare de procurar, já achou o dono
      }
    }
  }

  // Retorna apenas os pais, agora "recheados" com os furos
  const finalGroups: any[][] = [];
  candidateParts.forEach((part) => {
    if (!part.isHole) {
      // Combina as entidades do contorno externo com as dos furos
      finalGroups.push([...part.entities, ...part.children]);
    }
  });

  return finalGroups;
};

// --- LÓGICA DE PARSING DE ARQUIVO ---
export const processFileToParts = (
  flatEntities: any[],
  fileName: string,
  defaults: any
): ImportedPart[] => {
  const n = flatEntities.length;
  const uf = new UnionFind(n);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (entitiesTouch(flatEntities[i], flatEntities[j])) uf.union(i, j);
    }
  }
  const clusters = new Map<number, any[]>();
  flatEntities.forEach((ent, idx) => {
    const root = uf.find(idx);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(ent);
  });

  // 1. Extrai os grupos do Map para um Array
  const groupsArray = Array.from(clusters.values());

  // 2. PROCESSA A HIERARQUIA (Usa a nova função)
  const consolidatedGroups = mergeHolesIntoParts(groupsArray);

  const finalParts: ImportedPart[] = [];

  // 3. Itera sobre os grupos já consolidados (sem loop aninhado aqui)
  consolidatedGroups.forEach((groupEntities) => {
    const finalBox = calculateBoundingBox(groupEntities);
    const finalW = finalBox.maxX - finalBox.minX;
    const finalH = finalBox.maxY - finalBox.minY;

    // Normaliza as coordenadas (Move para 0,0)
    const normalizedEntities = groupEntities.map((ent: any) => {
      const clone = JSON.parse(JSON.stringify(ent));
      const move = (x: number, y: number) => ({
        x: x - finalBox.minX,
        y: y - finalBox.minY,
      });
      if (clone.vertices)
        clone.vertices = clone.vertices.map((v: any) => {
          const p = move(v.x, v.y);
          return { ...v, x: p.x, y: p.y };
        });
      else if (clone.center) {
        const c = move(clone.center.x, clone.center.y);
        clone.center = { x: c.x, y: c.y };
      }
      return clone;
    });

    const grossArea = finalW * finalH;
    let netArea = calculatePartNetArea(normalizedEntities);
    if (netArea < 0.1) netArea = grossArea;

    // Verifica geometria aberta
    const openPoints = detectOpenEndpoints(normalizedEntities);
    const hasError = openPoints.length > 0;

    finalParts.push({
      id: crypto.randomUUID(),
      name: `${fileName} - Item ${finalParts.length + 1}`,
      entities: normalizedEntities,
      blocks: {},
      width: finalW,
      height: finalH,
      grossArea,
      netArea,
      quantity: 1,
      pedido: defaults.pedido,
      op: defaults.op,
      material: defaults.material,
      espessura: defaults.espessura,
      autor: defaults.autor,
      dataCadastro: new Date().toISOString(),
      hasOpenGeometry: hasError,
    });
  });

  return finalParts;
};
