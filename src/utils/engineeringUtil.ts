/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ImportedPart } from "../components/types";

import {
  UnionFind,
  calculateBoundingBox,
  calculatePartNetArea,
  entitiesTouch,
  flattenGeometry,
  detectOpenEndpoints,
  isGroupContained,
  closeOpenPath,
} from "../utils/geometryCore";

// --- LÓGICA DE ROTAÇÃO ---
// --- EM src/utils/engineeringUtil.ts ---

// --- FUNÇÕES AUXILIARES DE ROTAÇÃO ---
const normalizeAngle = (angle: number): number => {
  let a = angle % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a;
};

// --- LÓGICA DE ROTAÇÃO CORRIGIDA (SEM ARREDONDAMENTO DESTRUTIVO) ---
export const applyRotationToPart = (
  part: ImportedPart,
  angleInDegrees: number
): ImportedPart => {
  // 1. ACHATAMENTO: Garante que blocos sejam explodidos antes de girar (Evita peça sumir)
  const flatEntities = flattenGeometry(part.entities, part.blocks);

  // Clona a peça
  const newPart = JSON.parse(JSON.stringify(part));
  newPart.entities = flatEntities;
  newPart.blocks = {};

  const isCCW = angleInDegrees > 0;

  // Função de transformação de coordenadas (Troca de Eixos PURA)
  // REMOVIDO O ARREDONDAMENTO para manter a conectividade perfeita das linhas
  const transformPoint = (x: number, y: number) => {
    if (isCCW) {
      // 90 graus Anti-Horário: (x, y) -> (-y, x)
      return { x: -y, y: x };
    } else {
      // 90 graus Horário: (x, y) -> (y, -x)
      return { x: y, y: -x };
    }
  };

  // Aplica a transformação em todas as entidades
  newPart.entities = newPart.entities.map((ent: any) => {
    // 1. LINHAS
    if (ent.type === "LINE") {
      const p1 = transformPoint(ent.vertices[0].x, ent.vertices[0].y);
      const p2 = transformPoint(ent.vertices[1].x, ent.vertices[1].y);
      ent.vertices = [
        { x: p1.x, y: p1.y },
        { x: p2.x, y: p2.y },
      ];
    }
    // 2. POLILINHAS (Mantém o Bulge intacto, rotaciona vértices)
    else if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
      ent.vertices = ent.vertices.map((v: any) => {
        const p = transformPoint(v.x, v.y);
        return { ...v, x: p.x, y: p.y };
      });
    }
    // 3. CÍRCULOS
    else if (ent.type === "CIRCLE") {
      const c = transformPoint(ent.center.x, ent.center.y);
      ent.center = { x: c.x, y: c.y };
    }
    // 4. ARCOS (Lógica Recalculada)
    else if (ent.type === "ARC") {
      // Rotaciona o centro
      const c = transformPoint(ent.center.x, ent.center.y);
      ent.center = { x: c.x, y: c.y };

      // Calcula os vetores originais (do centro até o início/fim)
      const r = ent.radius;
      const startX = r * Math.cos(ent.startAngle);
      const startY = r * Math.sin(ent.startAngle);
      const endX = r * Math.cos(ent.endAngle);
      const endY = r * Math.sin(ent.endAngle);

      // Rotaciona esses vetores usando a MESMA lógica da peça
      const newStartVec = transformPoint(startX, startY);
      const newEndVec = transformPoint(endX, endY);

      // Recalcula os ângulos
      ent.startAngle = normalizeAngle(Math.atan2(newStartVec.y, newStartVec.x));
      ent.endAngle = normalizeAngle(Math.atan2(newEndVec.y, newEndVec.x));
    }

    return ent;
  });

  // --- RE-NORMALIZAÇÃO DE POSIÇÃO (Bounding Box) ---
  const box = calculateBoundingBox(newPart.entities);
  const minX = box.minX;
  const minY = box.minY;

  // Mantemos um leve arredondamento AQUI apenas na largura total para UI,
  // mas não nas coordenadas internas de geometria.
  newPart.width = Math.round((box.maxX - box.minX) * 10000) / 10000;
  newPart.height = Math.round((box.maxY - box.minY) * 10000) / 10000;

  // Move tudo para (0,0) mantendo a precisão relativa
  newPart.entities = newPart.entities.map((ent: any) => {
    const move = (x: number, y: number) => ({
      x: x - minX,
      y: y - minY,
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

// --- LÓGICA DE ESPELHAMENTO CORRIGIDA ---
export const applyMirrorToPart = (part: ImportedPart): ImportedPart => {
  // 1. ACHATAMENTO: Garante que blocos sejam explodidos (previne sumiço)
  const flatEntities = flattenGeometry(part.entities, part.blocks);

  // Clona a peça
  const newPart = JSON.parse(JSON.stringify(part));
  newPart.entities = flatEntities;
  newPart.blocks = {};

  // Função de Transformação: ESPELHO HORIZONTAL (X vira -X)
  // IMPORTANTE: NÃO usamos roundCoord aqui para manter conexão perfeita
  const transformPoint = (x: number, y: number) => {
    return { x: -x, y: y };
  };

  newPart.entities = newPart.entities.map((ent: any) => {
    // 1. LINHAS
    if (ent.type === "LINE") {
      const p1 = transformPoint(ent.vertices[0].x, ent.vertices[0].y);
      const p2 = transformPoint(ent.vertices[1].x, ent.vertices[1].y);
      ent.vertices = [
        { x: p1.x, y: p1.y },
        { x: p2.x, y: p2.y },
      ];
    }
    // 2. POLILINHAS
    else if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
      ent.vertices = ent.vertices.map((v: any) => {
        const p = transformPoint(v.x, v.y);
        // IMPORTANTE: Ao espelhar, a curva inverte o sentido.
        // Precisamos inverter o sinal do 'bulge' para manter a forma correta.
        const newBulge = v.bulge ? -v.bulge : 0;
        return { ...v, x: p.x, y: p.y, bulge: newBulge };
      });
    }
    // 3. CÍRCULOS
    else if (ent.type === "CIRCLE") {
      const c = transformPoint(ent.center.x, ent.center.y);
      ent.center = { x: c.x, y: c.y };
    }
    // 4. ARCOS (A parte mais delicada)
    else if (ent.type === "ARC") {
      const c = transformPoint(ent.center.x, ent.center.y);
      ent.center = { x: c.x, y: c.y };

      // Calcula onde os pontos de início e fim ESTAVAM
      const r = ent.radius;
      const startX = r * Math.cos(ent.startAngle);
      const startY = r * Math.sin(ent.startAngle);
      const endX = r * Math.cos(ent.endAngle);
      const endY = r * Math.sin(ent.endAngle);

      // Espelha esses vetores
      const newStartVec = transformPoint(startX, startY);
      const newEndVec = transformPoint(endX, endY);

      // Recalcula os ângulos novos
      // ATENÇÃO: Ao espelhar, o sentido do arco muda (Horário <-> Anti-Horário).
      // Como DXF é sempre Anti-Horário, o que era "Inicio" vira "Fim" visualmente.
      // Precisamos trocar startAngle com endAngle.
      const ang1 = normalizeAngle(Math.atan2(newStartVec.y, newStartVec.x));
      const ang2 = normalizeAngle(Math.atan2(newEndVec.y, newEndVec.x));

      ent.startAngle = ang2; // Troca
      ent.endAngle = ang1; // Troca
    }

    return ent;
  });

  // --- RE-NORMALIZAÇÃO DE POSIÇÃO ---
  const box = calculateBoundingBox(newPart.entities);
  const minX = box.minX;
  const minY = box.minY;

  // Arredondamento APENAS nas dimensões finais para UI
  newPart.width = Math.round((box.maxX - box.minX) * 10000) / 10000;
  newPart.height = Math.round((box.maxY - box.minY) * 10000) / 10000;

  // Move para a origem (0,0) mantendo precisão
  newPart.entities = newPart.entities.map((ent: any) => {
    const move = (x: number, y: number) => ({
      x: x - minX,
      y: y - minY,
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

    // --- LÓGICA DE AUTOCORREÇÃO INTELIGENTE ---

    // 1. Detecta falhas iniciais
    let currentEntities = normalizedEntities;
    const openPoints = detectOpenEndpoints(currentEntities); // <--- MUDANÇA: de 'let' para 'const'
    let hasError = openPoints.length > 0;

    // 2. Se houver erro, tenta corrigir gaps pequenos (<= 0.5mm)
    if (hasError) {
      // Tenta fechar usando tolerância restrita de 0.5mm
      const fixedEntities = closeOpenPath(currentEntities, openPoints, 0.5);

      // Verifica se a correção resolveu TUDO
      const remainingOpenPoints = detectOpenEndpoints(fixedEntities);

      if (remainingOpenPoints.length === 0) {
        // SUCESSO: O gap era pequeno e foi fechado.
        // Assumimos a geometria corrigida e removemos o alerta.
        currentEntities = fixedEntities;
        hasError = false;
      }
      // Se ainda sobrar pontos (gap > 0.5), mantemos hasError = true
      // e usamos a geometria original (ou a parcialmente fechada, se preferir).
      // Aqui mantemos a original para o usuário ver onde está o problema grande.
    }

    finalParts.push({
      id: crypto.randomUUID(),
      name: `${fileName} - Item ${finalParts.length + 1}`,
      entities: currentEntities, // <--- USA A GEOMETRIA (POSSIVELMENTE CORRIGIDA)
      blocks: {},
      width: finalW,
      height: finalH,
      grossArea,
      netArea, // Nota: A área líquida muda minimamente, não precisa recalcular para gaps de 0.5mm
      quantity: 1,
      pedido: defaults.pedido,
      op: defaults.op,
      material: defaults.material,
      espessura: defaults.espessura,
      autor: defaults.autor,
      dataCadastro: new Date().toISOString(),
      hasOpenGeometry: hasError, // <--- SÓ FICA TRUE SE O GAP FOR MAIOR QUE 0.5mm
    });
  });

  return finalParts;
};
// --- FUNÇÃO DE NORMALIZAÇÃO DE ROTAÇÃO (FILTRO DE SEGURANÇA) ---
export const normalizeDxfRotation = (dxfObject: any) => {
  // Função interna para varrer uma lista de entidades
  const cleanEntities = (entities: any[]) => {
    if (!entities) return;

    entities.forEach((ent) => {
      // Se encontrar um BLOCO (INSERT)
      if (ent.type === "INSERT") {
        // Se ele tiver rotação (Código 50 do DXF), forçamos para 0
        if (ent.rotation && ent.rotation !== 0) {
          // console.log(`Normalizando rotação de bloco: ${ent.name} (Era ${ent.rotation}°)`);
          ent.rotation = 0;
        }
      }
    });
  };

  // 1. Limpa as entidades principais do desenho (Model Space)
  if (dxfObject.entities) {
    cleanEntities(dxfObject.entities);
  }

  // 2. Limpa definições internas de blocos (caso haja blocos dentro de blocos)
  if (dxfObject.blocks) {
    Object.keys(dxfObject.blocks).forEach((blockName) => {
      const block = dxfObject.blocks[blockName];
      if (block.entities) {
        cleanEntities(block.entities);
      }
    });
  }
};
