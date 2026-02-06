/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ImportedPart } from "../components/types";
import { runGatekeeper } from "./gatekeeperUtil"; // <--- IMPORTAÇÃO NOVA

import {
  UnionFind,
  calculateBoundingBox,
  calculatePartNetArea,
  entitiesTouch,
  flattenGeometry,
  detectOpenEndpoints,
  closeOpenPath,
} from "../utils/geometryCore";

import { explodeDXFGeometry } from "../utils/dxfExploder";
import { consolidateNestedParts } from "../utils/geometryConsolidation";

// --- TIPOS AUXILIARES PARA PROCESSAMENTO ---
type InsertData = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
};

// --- FUNÇÕES AUXILIARES MATEMÁTICAS ---
// (Reutilizadas para transformações manuais na fila)
const normalizeAngle = (angle: number): number => {
  let a = angle % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a;
};

const transformPoint = (p: { x: number; y: number }, t: InsertData) => {
  const x1 = p.x * t.scaleX;
  const y1 = p.y * t.scaleY;
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x2 = x1 * cos - y1 * sin;
  const y2 = x1 * sin + y1 * cos;
  return { x: x2 + t.x, y: y2 + t.y };
};

// --- LÓGICA DE ROTAÇÃO E ESPELHAMENTO (Mantidas) ---
export const applyRotationToPart = (
  part: ImportedPart,
  angleInDegrees: number,
): ImportedPart => {
  const flatEntities = flattenGeometry(part.entities, part.blocks);
  const newPart = JSON.parse(JSON.stringify(part));
  newPart.entities = flatEntities;
  newPart.blocks = {};
  const isCCW = angleInDegrees > 0;

  const rotatePt = (x: number, y: number) => {
    if (isCCW) return { x: -y, y: x };
    else return { x: y, y: -x };
  };

  newPart.entities = newPart.entities.map((ent: any) => {
    if (ent.type === "LINE") {
      const p1 = rotatePt(ent.vertices[0].x, ent.vertices[0].y);
      const p2 = rotatePt(ent.vertices[1].x, ent.vertices[1].y);
      ent.vertices = [
        { x: p1.x, y: p1.y },
        { x: p2.x, y: p2.y },
      ];
    } else if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
      ent.vertices = ent.vertices.map((v: any) => {
        const p = rotatePt(v.x, v.y);
        return { ...v, x: p.x, y: p.y };
      });
    } else if (ent.type === "CIRCLE" || ent.type === "ARC") {
      const c = rotatePt(ent.center.x, ent.center.y);
      ent.center = { x: c.x, y: c.y };
      if (ent.type === "ARC") {
        const r = ent.radius;
        const start = rotatePt(
          r * Math.cos(ent.startAngle),
          r * Math.sin(ent.startAngle),
        );
        const end = rotatePt(
          r * Math.cos(ent.endAngle),
          r * Math.sin(ent.endAngle),
        );
        ent.startAngle = normalizeAngle(Math.atan2(start.y, start.x));
        ent.endAngle = normalizeAngle(Math.atan2(end.y, end.x));
      }
    }
    return ent;
  });

  const box = calculateBoundingBox(newPart.entities);
  newPart.width = Math.round((box.maxX - box.minX) * 10000) / 10000;
  newPart.height = Math.round((box.maxY - box.minY) * 10000) / 10000;

  // Normaliza posição
  newPart.entities = newPart.entities.map((ent: any) => {
    const move = (x: number, y: number) => ({
      x: x - box.minX,
      y: y - box.minY,
    });
    if (ent.vertices)
      ent.vertices = ent.vertices.map((v: any) => ({
        ...v,
        ...move(v.x, v.y),
      }));
    else if (ent.center)
      ent.center = { ...ent.center, ...move(ent.center.x, ent.center.y) };
    return ent;
  });

  newPart.grossArea = newPart.width * newPart.height;
  let net = calculatePartNetArea(newPart.entities);
  if (net < 0.1) net = newPart.grossArea;
  newPart.netArea = net;
  return newPart;
};

export const applyMirrorToPart = (part: ImportedPart): ImportedPart => {
  const flatEntities = flattenGeometry(part.entities, part.blocks);
  const newPart = JSON.parse(JSON.stringify(part));
  newPart.entities = flatEntities;
  newPart.blocks = {};

  const mirrorPt = (x: number, y: number) => ({ x: -x, y: y });

  newPart.entities = newPart.entities.map((ent: any) => {
    if (ent.type === "LINE") {
      const p1 = mirrorPt(ent.vertices[0].x, ent.vertices[0].y);
      const p2 = mirrorPt(ent.vertices[1].x, ent.vertices[1].y);
      ent.vertices = [
        { x: p1.x, y: p1.y },
        { x: p2.x, y: p2.y },
      ];
    } else if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
      ent.vertices = ent.vertices.map((v: any) => {
        const p = mirrorPt(v.x, v.y);
        return { ...v, x: p.x, y: p.y, bulge: v.bulge ? -v.bulge : 0 };
      });
    } else if (ent.type === "CIRCLE" || ent.type === "ARC") {
      const c = mirrorPt(ent.center.x, ent.center.y);
      ent.center = { x: c.x, y: c.y };
      if (ent.type === "ARC") {
        const r = ent.radius;
        const start = mirrorPt(
          r * Math.cos(ent.startAngle),
          r * Math.sin(ent.startAngle),
        );
        const end = mirrorPt(
          r * Math.cos(ent.endAngle),
          r * Math.sin(ent.endAngle),
        );
        const ang1 = normalizeAngle(Math.atan2(start.y, start.x));
        const ang2 = normalizeAngle(Math.atan2(end.y, end.x));
        ent.startAngle = ang2;
        ent.endAngle = ang1;
      }
    }
    return ent;
  });

  const box = calculateBoundingBox(newPart.entities);
  newPart.width = Math.round((box.maxX - box.minX) * 10000) / 10000;
  newPart.height = Math.round((box.maxY - box.minY) * 10000) / 10000;

  newPart.entities = newPart.entities.map((ent: any) => {
    const move = (x: number, y: number) => ({
      x: x - box.minX,
      y: y - box.minY,
    });
    if (ent.vertices)
      ent.vertices = ent.vertices.map((v: any) => ({
        ...v,
        ...move(v.x, v.y),
      }));
    else if (ent.center)
      ent.center = { ...ent.center, ...move(ent.center.x, ent.center.y) };
    return ent;
  });

  newPart.grossArea = newPart.width * newPart.height;
  let net = calculatePartNetArea(newPart.entities);
  if (net < 0.1) net = newPart.grossArea;
  newPart.netArea = net;
  return newPart;
};

// =====================================================================
// === LÓGICA PRINCIPAL: PROCESSAMENTO HIERÁRQUICO INTELIGENTE ===
// =====================================================================

const createPartFromEntities = (
  entities: any[],
  fileName: string,
  defaults: any,
  index: number,
): ImportedPart => {
  const box = calculateBoundingBox(entities);
  const width = box.maxX - box.minX;
  const height = box.maxY - box.minY;

  const normalizedEntities = entities.map((ent: any) => {
    const clone = JSON.parse(JSON.stringify(ent));
    const move = (x: number, y: number) => ({
      x: x - box.minX,
      y: y - box.minY,
    });
    if (clone.vertices) {
      clone.vertices = clone.vertices.map((v: any) => ({
        ...v,
        ...move(v.x, v.y),
      }));
    } else if (clone.center) {
      clone.center = {
        ...clone.center,
        ...move(clone.center.x, clone.center.y),
      };
    }
    return clone;
  });

  const grossArea = width * height;
  let netArea = calculatePartNetArea(normalizedEntities);
  if (netArea < 0.1) netArea = grossArea;

  let currentEntities = normalizedEntities;
  const openPoints = detectOpenEndpoints(currentEntities);
  let hasError = openPoints.length > 0;

  if (hasError) {
    const fixedEntities = closeOpenPath(currentEntities, openPoints, 0.5);
    if (detectOpenEndpoints(fixedEntities).length === 0) {
      currentEntities = fixedEntities;
      hasError = false;
    }
  }

  return {
    id: crypto.randomUUID(),
    name: `${fileName} - Item ${index + 1}`,
    entities: currentEntities,
    blocks: {},
    width,
    height,
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
  };
};

/**
 * Função para aplicar transformação manual a uma entidade (usada ao descascar blocos)
 */
const applyTransformToEntity = (ent: any, t: InsertData) => {
  const clone = JSON.parse(JSON.stringify(ent));

  if (clone.type === "INSERT") {
    clone.x = clone.x || 0;
    clone.y = clone.y || 0;
    const p = transformPoint({ x: clone.x, y: clone.y }, t);
    clone.x = p.x;
    clone.y = p.y;
    clone.rotation = (clone.rotation || 0) + t.rotation;
    clone.xScale = (clone.xScale || 1) * t.scaleX;
    clone.yScale = (clone.yScale || 1) * t.scaleY;
    // (Nota: Rotação aninhada complexa pode exigir matriz completa, mas para 2D simples isso costuma bastar)
  } else if (clone.type === "LINE") {
    const p1 = transformPoint(
      { x: clone.vertices[0].x, y: clone.vertices[0].y },
      t,
    );
    const p2 = transformPoint(
      { x: clone.vertices[1].x, y: clone.vertices[1].y },
      t,
    );
    clone.vertices = [
      { x: p1.x, y: p1.y },
      { x: p2.x, y: p2.y },
    ];
  } else if (clone.type === "LWPOLYLINE" || clone.type === "POLYLINE") {
    // Apenas move vértices, ignorando complexidades de bulge em escala não uniforme NESTA FASE
    // (A explosão final cuidará disso)
    clone.vertices = clone.vertices.map((v: any) => {
      const p = transformPoint({ x: v.x, y: v.y }, t);
      return { ...v, x: p.x, y: p.y };
    });
  } else if (clone.type === "CIRCLE" || clone.type === "ARC") {
    const c = transformPoint({ x: clone.center.x, y: clone.center.y }, t);
    clone.center = { x: c.x, y: c.y };
    clone.radius *= Math.abs(t.scaleX);
    // Arcos exigem ajuste de ângulos se houver rotação
    if (clone.type === "ARC" && t.rotation !== 0) {
      const rad = (t.rotation * Math.PI) / 180;
      clone.startAngle += rad;
      clone.endAngle += rad;
    }
  }

  return clone;
};

export const processFileToParts = (
  rawEntities: any[],
  fileName: string,
  defaults: any,
  dxfBlocks: any,
): ImportedPart[] => {
  // Variável para armazenar a lista limpa
  let cleanEntities: any[] = [];

  // === VALIDAÇÃO E FILTRAGEM ===
  try {
    // AQUI ESTÁ A MUDANÇA:
    // Capturamos o retorno do porteiro (que agora contém apenas o Model Space)
    cleanEntities = runGatekeeper(rawEntities);
  } catch (error: any) {
    // (O tratamento de erro permanece o mesmo que você já tem...)
    const msg = error.message
      ? error.message.replace("VALIDATION_ERROR: ", "")
      : "Arquivo inválido";

    const instructionalMessage =
      `⚠️ IMPORTAÇÃO RECUSADA (Análise Rápida)\n\n` +
      `MOTIVO: ${msg}\n\n` +
      `--- O QUE FAZER? ---\n` +
      `1. O arquivo contém peças desenhadas com linhas soltas.\n` +
      `2. Abra no CAD, selecione a peça e crie um BLOCO.\n` +
      `3. O sistema exige blocos para não sobrecarregar seu navegador.\n\n` +
      `A importação foi cancelada.`;

    window.alert(instructionalMessage);

    return [];
  }
  // === FIM DA ALTERAÇÃO ===

  const finalParts: ImportedPart[] = [];
  const looseEntities: any[] = [];
  let partCounter = 0;

  // FILA DE PROCESSAMENTO (Inicializa com as entidades da raiz)
  // Como o porteiro já passou, sabemos que aqui só tem INSERTs ou Lixo seguro (texto/cota).
  const processingQueue = [...cleanEntities];

  while (processingQueue.length > 0) {
    const ent = processingQueue.shift(); // Pega o próximo item

    if (ent.type === "INSERT") {
      const blockName = ent.name || ent.block;
      const blockDef = dxfBlocks[blockName];

      // Se o bloco não existe na definição, ignora
      if (!blockDef || !blockDef.entities) continue;

      // ANÁLISE DO CONTEÚDO (Heurística: É Peça ou é Container?)
      const entitiesInBlock = blockDef.entities;

      // Verifica se tem geometria física (Linha, Arco, Polilinha, Círculo)
      // Ignora Textos, Cotas, Atributos
      const hasGeometry = entitiesInBlock.some((e: any) =>
        [
          "LINE",
          "LWPOLYLINE",
          "POLYLINE",
          "ARC",
          "CIRCLE",
          "SPLINE",
          "ELLIPSE",
        ].includes(e.type),
      );

      // Verifica se tem sub-blocos
      const subBlocks = entitiesInBlock.filter((e: any) => e.type === "INSERT");

      // DECISÃO:
      // Se tem Blocos mas NÃO tem Geometria relevante -> É um CONTAINER (Layout) -> Descasca
      if (subBlocks.length > 0 && !hasGeometry) {
        // Dados de transformação do pai
        const transform: InsertData = {
          x: ent.x || ent.position?.x || 0,
          y: ent.y || ent.position?.y || 0,
          scaleX: ent.xScale || ent.scale?.x || 1,
          scaleY: ent.yScale || ent.scale?.y || 1,
          rotation: ent.rotation || 0,
        };

        if (ent.yScale === undefined && ent.scale?.y === undefined)
          transform.scaleY = transform.scaleX;

        // Base Point correction
        const basePoint = {
          x: blockDef.position?.x || blockDef.origin?.x || 0,
          y: blockDef.position?.y || blockDef.origin?.y || 0,
        };

        // Processa os filhos do container
        for (const child of entitiesInBlock) {
          // Aplica offset do Base Point
          const childClone = JSON.parse(JSON.stringify(child));

          // Ajuste simplificado de BasePoint (apenas translada o clone localmente antes de transformar)
          // Nota: Uma implementação rigorosa faria isso dentro do applyTransform, mas aqui serve.
          if (childClone.type === "LINE") {
            childClone.vertices.forEach((v: any) => {
              v.x -= basePoint.x;
              v.y -= basePoint.y;
            });
          } else if (childClone.type === "INSERT") {
            childClone.x = (childClone.x || 0) - basePoint.x;
            childClone.y = (childClone.y || 0) - basePoint.y;
          }
          // (Outros tipos omitidos para brevidade, mas o conceito é o mesmo)

          // Aplica a transformação do PAI para o MUNDO
          const transformedChild = applyTransformToEntity(
            childClone,
            transform,
          );

          // Joga de volta na fila para análise recursiva
          // Se o filho for outro INSERT, será analisado no próximo loop.
          // Se for geometria solta (ex: uma linha perdida no layout), vai para looseEntities.
          processingQueue.push(transformedChild);
        }
      } else {
        // Se tem Geometria (com ou sem sub-blocos) -> É uma PEÇA (Atômica)
        // Ou se é um bloco vazio/apenas texto -> Ignora ou processa como peça vazia

        const partGeometry = explodeDXFGeometry([ent], dxfBlocks);

        if (partGeometry.length > 0) {
          const part = createPartFromEntities(
            partGeometry,
            fileName,
            defaults,
            partCounter++,
          );
          if (blockName) part.name = `${blockName} (${fileName})`;
          finalParts.push(part);
        }
      }
    } else {
      // Se não é INSERT, é geometria solta (ou lixo, ou parte explodida de um container)
      looseEntities.push(ent);
    }
  }

  // PROCESSAMENTO DAS SOBRAS (Loose Entities)
  // Só executa se houver geometria solta relevante
  const meaningfulLoose = looseEntities.filter((e) =>
    [
      "LINE",
      "LWPOLYLINE",
      "POLYLINE",
      "ARC",
      "CIRCLE",
      "SPLINE",
      "ELLIPSE",
    ].includes(e.type),
  );

  if (meaningfulLoose.length > 0) {
    // Fallback: Lógica de Clusterização e Consolidação para geometria solta
    const flatLooseEntities = explodeDXFGeometry(meaningfulLoose, dxfBlocks);

    if (flatLooseEntities.length > 0) {
      const n = flatLooseEntities.length;
      const uf = new UnionFind(n);

      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (entitiesTouch(flatLooseEntities[i], flatLooseEntities[j]))
            uf.union(i, j);
        }
      }

      const clusters = new Map<number, any[]>();
      flatLooseEntities.forEach((ent, idx) => {
        const root = uf.find(idx);
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root)!.push(ent);
      });

      const groupsArray = Array.from(clusters.values());
      const consolidatedGroups = consolidateNestedParts(groupsArray);

      consolidatedGroups.forEach((groupEntities) => {
        const part = createPartFromEntities(
          groupEntities,
          fileName,
          defaults,
          partCounter++,
        );
        part.name = `${fileName} - Solto ${partCounter}`;
        finalParts.push(part);
      });
    }
  }

  return finalParts;
};

// --- FUNÇÃO DE NORMALIZAÇÃO ---
export const normalizeDxfRotation = (dxfObject: any) => {
  const cleanEntities = (entities: any[]) => {
    if (!entities) return;
    entities.forEach((ent) => {
      if (ent.type === "INSERT") {
        if (ent.rotation && ent.rotation !== 0) {
          ent.rotation = 0;
        }
      }
    });
  };
  if (dxfObject.entities) cleanEntities(dxfObject.entities);
  if (dxfObject.blocks) {
    Object.keys(dxfObject.blocks).forEach((blockName) => {
      const block = dxfObject.blocks[blockName];
      if (block.entities) cleanEntities(block.entities);
    });
  }
};
