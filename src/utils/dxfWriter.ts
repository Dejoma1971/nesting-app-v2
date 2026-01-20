/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PlacedPart } from "./nestingCore";
import type { ImportedPart } from "../components/types";
import type { CropLine } from "../hooks/useSheetManager";

// ==================================================================================
// --- CONFIGURAÇÃO DE LAYERS (ESTRATÉGIA DE ORDEM SEQUENCIAL) ---
// ==================================================================================
// O CypCut importa sequencialmente: 1º Layer encontrado -> Layer 1 (Verde).
// Portanto, DEVEMOS definir o CORTE primeiro.
const LAYER_CONFIG = {
  // 1º: CORTE -> Vai para Layer 1 (Verde)
  CORTE: { id: "1", color: 3 }, // Cor 3 (Green)

  // 2º: GRAVAÇÃO -> Vai para Layer 2 (Rosa/Magenta)
  GRAVACAO: { id: "2", color: 6 }, // Cor 6 (Magenta)

  // 3º: CHAPA/ETIQUETAS -> Vai para Layer 3 (Amarelo) ou Fundo
  // Nomeamos "0" (Padrão DXF), mas por ser o 3º na fila, o CypCut deve jogar para o Layer 3.
  // Isso é seguro: não corta a chapa como se fosse peça.
  CHAPA: { id: "0", color: 7 }, // Cor 7 (White)
  ETIQUETAS: { id: "0", color: 7 },

  // RETALHO -> Mantemos junto com CORTE (Layer 1)
  RETALHO: { id: "1", color: 3 },
};

// Ordem explícita de escrita das tabelas para garantir a sequência no arquivo
const LAYER_ORDER = ["CORTE", "GRAVACAO", "CHAPA"];

// --- HELPERS ---
const rotatePointBasic = (x: number, y: number, angleRad: number) => {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
};

const getEntityLayer = (ent: any) => {
  if (ent.isLabel) {
    if (ent.labelType === "pink") return LAYER_CONFIG.GRAVACAO.id;
    return LAYER_CONFIG.ETIQUETAS.id;
  }
  return LAYER_CONFIG.CORTE.id;
};

// --- FLATTEN GEOMETRY ---
const flattenGeometry = (
  entities: any[],
  blocks: any = {},
  currentTransform = { x: 0, y: 0, rot: 0, scale: 1 }
) => {
  let flat: any[] = [];
  entities.forEach((ent) => {
    if (ent.type === "INSERT") {
      const block = blocks[ent.name];
      if (block && block.entities) {
        const bPos = ent.position || { x: 0, y: 0 };
        const bRot = ent.rotation || 0;
        const bScale = ent.scale?.x || 1;

        const rad = (currentTransform.rot * Math.PI) / 180;
        const rx = Math.cos(rad) * bPos.x - Math.sin(rad) * bPos.y;
        const ry = Math.sin(rad) * bPos.x + Math.cos(rad) * bPos.y;

        const newTransform = {
          x: currentTransform.x + rx * currentTransform.scale,
          y: currentTransform.y + ry * currentTransform.scale,
          rot: currentTransform.rot + bRot,
          scale: currentTransform.scale * bScale,
        };
        flat = flat.concat(
          flattenGeometry(block.entities, blocks, newTransform)
        );
      }
    } else {
      const clone = JSON.parse(JSON.stringify(ent));
      const rad = (currentTransform.rot * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      const apply = (px: number, py: number) => {
        const rx = cos * px - sin * py;
        const ry = sin * px + cos * py;
        return {
          x: currentTransform.x + rx * currentTransform.scale,
          y: currentTransform.y + ry * currentTransform.scale,
        };
      };

      if (clone.vertices) {
        clone.vertices = clone.vertices.map((v: any) => {
          const p = apply(v.x, v.y);
          return { ...v, x: p.x, y: p.y };
        });
      } else if (clone.center) {
        const p = apply(clone.center.x, clone.center.y);
        clone.center = { x: p.x, y: p.y };
        if (clone.radius) clone.radius *= currentTransform.scale;
        if (clone.type === "ARC") {
          clone.startAngle += rad;
          clone.endAngle += rad;
        }
      }
      flat.push(clone);
    }
  });
  return flat;
};

// --- CÁLCULO DE CENTRO ---
const bulgeToArc = (
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

const calculateTrueCenter = (entities: any[]) => {
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
  entities.forEach((ent) => {
    if (ent.type === "LINE") {
      ent.vertices.forEach((v: any) => update(v.x, v.y));
    } else if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
      for (let i = 0; i < ent.vertices.length; i++) {
        const v1 = ent.vertices[i];
        update(v1.x, v1.y);
        if (v1.bulge && v1.bulge !== 0) {
          const v2 = ent.vertices[(i + 1) % ent.vertices.length];
          if (i === ent.vertices.length - 1 && !ent.shape) continue;
          const { cx, cy, radius } = bulgeToArc(v1, v2, v1.bulge);
          const startAngle = Math.atan2(v1.y - cy, v1.x - cx);
          let endAngle = Math.atan2(v2.y - cy, v2.x - cx);
          if (v1.bulge > 0 && endAngle < startAngle) endAngle += 2 * Math.PI;
          if (v1.bulge < 0 && endAngle > startAngle) endAngle -= 2 * Math.PI;
          if (v1.bulge < 0)
            checkArcBounds(cx, cy, radius, endAngle, startAngle);
          else checkArcBounds(cx, cy, radius, startAngle, endAngle);
        }
      }
    } else if (ent.center && ent.radius) {
      if (ent.type === "ARC")
        checkArcBounds(
          ent.center.x,
          ent.center.y,
          ent.radius,
          ent.startAngle,
          ent.endAngle
        );
      else {
        update(ent.center.x - ent.radius, ent.center.y - ent.radius);
        update(ent.center.x + ent.radius, ent.center.y + ent.radius);
      }
    }
  });
  if (minX === Infinity)
    return { minX: 0, minY: 0, cx: 0, cy: 0, width: 0, height: 0 };
  return {
    minX,
    minY,
    cx: minX + (maxX - minX) / 2,
    cy: minY + (maxY - minY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
};

// ==================================================================================
// --- WRITER COMPATÍVEL COM R12 (AC1009) ---
// ==================================================================================
const writeEntitiesToDxf = (entities: any[], dx = 0, dy = 0): string => {
  let output = "";
  entities.forEach((ent) => {
    const layer = getEntityLayer(ent);
    const common = `8\n${layer}\n`;

    if (ent.type === "LINE") {
      output += `0\nLINE\n${common}`;
      output += `10\n${(ent.vertices[0].x + dx).toFixed(4)}\n20\n${(
        ent.vertices[0].y + dy
      ).toFixed(4)}\n30\n0.0\n`;
      output += `11\n${(ent.vertices[1].x + dx).toFixed(4)}\n21\n${(
        ent.vertices[1].y + dy
      ).toFixed(4)}\n31\n0.0\n`;
    } else if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
      const isClosed = ent.shape || ent.closed ? 1 : 0;
      output += `0\nPOLYLINE\n${common}`;
      output += `66\n1\n10\n0.0\n20\n0.0\n30\n0.0\n70\n${isClosed}\n`;
      ent.vertices.forEach((v: any) => {
        output += `0\nVERTEX\n${common}`;
        output += `10\n${(v.x + dx).toFixed(4)}\n20\n${(v.y + dy).toFixed(
          4
        )}\n30\n0.0\n`;
        if (v.bulge) output += `42\n${v.bulge}\n`;
      });
      output += `0\nSEQEND\n`;
    } else if (ent.type === "CIRCLE") {
      output += `0\nCIRCLE\n${common}`;
      output += `10\n${(ent.center.x + dx).toFixed(4)}\n20\n${(
        ent.center.y + dy
      ).toFixed(4)}\n30\n0.0\n`;
      output += `40\n${ent.radius.toFixed(4)}\n`;
    } else if (ent.type === "ARC") {
      const startDeg = (ent.startAngle * 180) / Math.PI;
      const endDeg = (ent.endAngle * 180) / Math.PI;
      output += `0\nARC\n${common}`;
      output += `10\n${(ent.center.x + dx).toFixed(4)}\n20\n${(
        ent.center.y + dy
      ).toFixed(4)}\n30\n0.0\n`;
      output += `40\n${ent.radius.toFixed(4)}\n`;
      output += `50\n${startDeg.toFixed(4)}\n51\n${endDeg.toFixed(4)}\n`;
    }
  });
  return output;
};

// ==================================================================================
// --- GERAÇÃO FINAL DO DXF (R12) ---
// ==================================================================================
export const generateDxfContent = (
  placedParts: PlacedPart[],
  allParts: ImportedPart[],
  binSize?: { width: number; height: number },
  cropLines: CropLine[] = []
): string => {
  let dxf = "";

  const rawW = binSize?.width || 1200;
  const rawH = binSize?.height || 3000;
  const shouldRotate = rawW > rawH;
  const W = shouldRotate ? rawH : rawW;
  const H = shouldRotate ? rawW : rawH;

  // 1. HEADER (AC1009)
  dxf += "0\nSECTION\n2\nHEADER\n";
  dxf += "9\n$ACADVER\n1\nAC1009\n";
  dxf += "9\n$INSUNITS\n70\n4\n";
  dxf += `9\n$EXTMAX\n10\n${W.toFixed(4)}\n20\n${H.toFixed(4)}\n30\n0.0\n`;
  dxf += "9\n$EXTMIN\n10\n0.0\n20\n0.0\n30\n0.0\n";
  dxf += "0\nENDSEC\n";

  // 2. TABLES
  dxf += "0\nSECTION\n2\nTABLES\n";

  // LTYPE Table
  dxf += "0\nTABLE\n2\nLTYPE\n70\n1\n";
  dxf +=
    "0\nLTYPE\n2\nCONTINUOUS\n70\n64\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n";
  dxf += "0\nENDTAB\n";

  // LAYER Table
  dxf += "0\nTABLE\n2\nLAYER\n70\n5\n";

  // ITERAÇÃO FORÇADA NA ORDEM: CORTE -> GRAVACAO -> CHAPA
  LAYER_ORDER.forEach((key) => {
    // Correção: Fazemos o cast de 'key' para dizer ao TS que ela é uma chave válida de LAYER_CONFIG
    const cfg = LAYER_CONFIG[key as keyof typeof LAYER_CONFIG];
    if (cfg) {
      dxf += `0\nLAYER\n2\n${cfg.id}\n70\n0\n62\n${cfg.color}\n6\nCONTINUOUS\n`;
    }
  });
  dxf += "0\nENDTAB\n";

  // STYLE Table
  dxf += "0\nTABLE\n2\nSTYLE\n70\n0\n0\nENDTAB\n";
  dxf += "0\nENDSEC\n";

  // 3. BLOCKS SECTION
  dxf += "0\nSECTION\n2\nBLOCKS\n";

  // A. Bloco MESA
  const mesaBlockName = "MESA_CONTORNO";
  const layerChapa = LAYER_CONFIG.CHAPA.id;

  dxf += `0\nBLOCK\n8\n${layerChapa}\n2\n${mesaBlockName}\n70\n0\n10\n0.0\n20\n0.0\n30\n0.0\n3\n${mesaBlockName}\n`;
  dxf += `0\nLINE\n8\n${layerChapa}\n10\n0.0\n20\n0.0\n30\n0.0\n11\n${W.toFixed(
    4
  )}\n21\n0.0\n31\n0.0\n`;
  dxf += `0\nLINE\n8\n${layerChapa}\n10\n${W.toFixed(
    4
  )}\n20\n0.0\n30\n0.0\n11\n${W.toFixed(4)}\n21\n${H.toFixed(4)}\n31\n0.0\n`;
  dxf += `0\nLINE\n8\n${layerChapa}\n10\n${W.toFixed(4)}\n20\n${H.toFixed(
    4
  )}\n30\n0.0\n11\n0.0\n21\n${H.toFixed(4)}\n31\n0.0\n`;
  dxf += `0\nLINE\n8\n${layerChapa}\n10\n0.0\n20\n${H.toFixed(
    4
  )}\n30\n0.0\n11\n0.0\n21\n0.0\n31\n0.0\n`;
  dxf += "0\nENDBLK\n";

  // B. Blocos das PEÇAS
  const usedPartIds = Array.from(new Set(placedParts.map((p) => p.partId)));
  const blockOffsets: { [partId: string]: { cx: number; cy: number } } = {};

  usedPartIds.forEach((partId) => {
    const originalPart = allParts.find((p) => p.id === partId);
    if (!originalPart) return;

    const blockName = `PART_${partId.substring(0, 8).toUpperCase()}`;
    const flatEntities = flattenGeometry(
      originalPart.entities,
      originalPart.blocks
    );
    const cutEntities = flatEntities.filter((e) => !e.isLabel);
    const centerData = calculateTrueCenter(cutEntities);
    blockOffsets[partId] = { cx: centerData.cx, cy: centerData.cy };

    dxf += `0\nBLOCK\n8\n0\n2\n${blockName}\n70\n0\n10\n0.0\n20\n0.0\n30\n0.0\n3\n${blockName}\n`;
    dxf += writeEntitiesToDxf(cutEntities, -centerData.cx, -centerData.cy);
    dxf += "0\nENDBLK\n";
  });
  dxf += "0\nENDSEC\n";

  // 4. ENTITIES SECTION
  dxf += "0\nSECTION\n2\nENTITIES\n";

  // A. Insert Mesa
  dxf += `0\nINSERT\n8\n${layerChapa}\n2\n${mesaBlockName}\n10\n0.0\n20\n0.0\n30\n0.0\n`;

  // B. Peças (Inserts)
  const layerCorte = LAYER_CONFIG.CORTE.id;

  placedParts.forEach((placed) => {
    const originalPart = allParts.find((p) => p.id === placed.partId);
    if (!originalPart) return;

    const blockName = `PART_${placed.partId.substring(0, 8).toUpperCase()}`;
    const offset = blockOffsets[placed.partId];
    if (!offset) return;

    const flatAll = flattenGeometry(originalPart.entities, originalPart.blocks);
    const flatLabels = flatAll.filter((e) => e.isLabel);
    const flatCut = flatAll.filter((e) => !e.isLabel);
    const dims = calculateTrueCenter(flatCut);

    // --- CORREÇÃO AQUI ---
    // Precisamos de Math.PI para converter a rotação da peça
    const radForDim = (placed.rotation * Math.PI) / 180;
    
    // Substituir a lógica simplificada pelo cálculo trigonométrico
    const occupiedW = dims.width * Math.abs(Math.cos(radForDim)) + dims.height * Math.abs(Math.sin(radForDim));
    const occupiedH = dims.width * Math.abs(Math.sin(radForDim)) + dims.height * Math.abs(Math.cos(radForDim));

    // Agora o centro calculado baterá com o offset que aplicamos no visual
    const centerX = placed.x + occupiedW / 2;
    const centerY = placed.y + occupiedH / 2;

    let insertX = centerX;
    let insertY = centerY;
    let insertRotation = placed.rotation;

    if (shouldRotate) {
      insertX = centerY;
      insertY = centerX;
      insertRotation = placed.rotation - 90;
    }

    dxf += `0\nINSERT\n8\n${layerCorte}\n2\n${blockName}\n`;
    dxf += `10\n${insertX.toFixed(4)}\n20\n${insertY.toFixed(4)}\n30\n0.0\n`;
    dxf += `41\n1.0\n42\n1.0\n43\n1.0\n`;
    dxf += `50\n${insertRotation.toFixed(4)}\n`;

    const rad = (insertRotation * Math.PI) / 180;
    flatLabels.forEach((lbl) => {
      const transformPoint = (px: number, py: number) => {
        const relX = px - offset.cx;
        const relY = py - offset.cy;
        const rot = rotatePointBasic(relX, relY, rad);
        return { x: rot.x + insertX, y: rot.y + insertY };
      };
      let tempEnt;
      if (lbl.type === "LINE") {
        const p1 = transformPoint(lbl.vertices[0].x, lbl.vertices[0].y);
        const p2 = transformPoint(lbl.vertices[1].x, lbl.vertices[1].y);
        tempEnt = {
          ...lbl,
          vertices: [
            { x: p1.x, y: p1.y },
            { x: p2.x, y: p2.y },
          ],
        };
        dxf += writeEntitiesToDxf([tempEnt]);
      }
    });
  });

  // C. Retalhos
  const layerRetalho = LAYER_CONFIG.RETALHO.id;
  cropLines.forEach((line) => {
    let x1, y1, x2, y2;
    if (line.type === "vertical") {
      x1 = line.position;
      y1 = 0;
      x2 = line.position;
      y2 = rawH;
    } else {
      x1 = 0;
      y1 = line.position;
      x2 = rawW;
      y2 = line.position;
    }
    if (shouldRotate) {
      const t = x1;
      x1 = y1;
      y1 = t;
      const t2 = x2;
      x2 = y2;
      y2 = t2;
    }
    dxf += `0\nLINE\n8\n${layerRetalho}\n10\n${x1.toFixed(4)}\n20\n${y1.toFixed(
      4
    )}\n30\n0.0\n11\n${x2.toFixed(4)}\n21\n${y2.toFixed(4)}\n31\n0.0\n`;
  });

  dxf += "0\nENDSEC\n0\nEOF\n";
  return dxf;
};
