/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PlacedPart } from "./nestingCore";
import type { ImportedPart } from "../components/types";

// --- HELPERS MATEMÁTICOS ---
const rotatePoint = (
  x: number,
  y: number,
  cx: number,
  cy: number,
  angleDeg: number
) => {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const nx = cos * (x - cx) - sin * (y - cy) + cx;
  const ny = sin * (x - cx) + cos * (y - cy) + cy;
  return { x: nx, y: ny };
};

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

// --- HANDLES ---
let handleCount = 1;
const nextHandle = () => {
  handleCount++;
  return handleCount.toString(16).toUpperCase();
};

// --- ATTRIBUTES ---
const getEntityAttributes = (ent: any) => {
  if (ent.isLabel) {
    if (ent.labelType === "pink") return { layer: "GRAVACAO", color: 6 }; // Magenta
    return { layer: "ETIQUETAS", color: 7 }; // Branco/Preto
  }
  return { layer: "CORTE", color: 3 }; // Verde Limão
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
        const r = rotatePoint(bPos.x, bPos.y, 0, 0, currentTransform.rot);
        const newTransform = {
          x: currentTransform.x + r.x * currentTransform.scale,
          y: currentTransform.y + r.y * currentTransform.scale,
          rot: currentTransform.rot + bRot,
          scale: currentTransform.scale * bScale,
        };
        flat = flat.concat(
          flattenGeometry(block.entities, blocks, newTransform)
        );
      }
    } else {
      const clone = JSON.parse(JSON.stringify(ent));
      const apply = (px: number, py: number) => {
        const r = rotatePoint(px, py, 0, 0, currentTransform.rot);
        return {
          x: currentTransform.x + r.x * currentTransform.scale,
          y: currentTransform.y + r.y * currentTransform.scale,
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
          clone.startAngle += (currentTransform.rot * Math.PI) / 180;
          clone.endAngle += (currentTransform.rot * Math.PI) / 180;
        }
      }
      flat.push(clone);
    }
  });
  return flat;
};

// --- CÁLCULO DE CENTRO ---
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
  if (minX === Infinity) return { cx: 0, cy: 0, width: 0, height: 0 };
  return {
    cx: minX + (maxX - minX) / 2,
    cy: minY + (maxY - minY) / 2,
    width: maxX - minX,
    height: maxY - minY,
  };
};

// --- GERAÇÃO FINAL DO DXF ---
export const generateDxfContent = (
  placedParts: PlacedPart[],
  allParts: ImportedPart[],
  binSize?: { width: number; height: number }
): string => {
  handleCount = 1;
  let dxf = "";

  // 1. DETECTAR SE PRECISA ROTACIONAR A MESA (FORCE VERTICAL)
  // Se a largura for maior que a altura (ex: 3000x1200), rotacionamos tudo 90 graus.
  const rawW = binSize?.width || 1200;
  const rawH = binSize?.height || 3000;

  const shouldRotate = rawW > rawH; // Se estiver "deitada", vamos levantar

  const W = shouldRotate ? rawH : rawW; // Agora W é o menor (1200)
  const H = shouldRotate ? rawW : rawH; // Agora H é o maior (3000)

  // 2. HEADER
  dxf += "0\nSECTION\n2\nHEADER\n";
  dxf += "9\n$ACADVER\n1\nAC1015\n";
  dxf += "9\n$INSUNITS\n70\n4\n";
  dxf += "9\n$EXTMIN\n10\n0.0\n20\n0.0\n30\n0.0\n";
  dxf += `9\n$EXTMAX\n10\n${W.toFixed(4)}\n20\n${H.toFixed(4)}\n30\n0.0\n`;
  dxf += "0\nENDSEC\n";

  // 3. TABLES
  dxf += "0\nSECTION\n2\nTABLES\n";
  dxf += "0\nTABLE\n2\nLAYER\n";
  const layers = [
    { name: "0", color: 7 },
    { name: "CORTE", color: 3 }, // Verde Limão
    { name: "GRAVACAO", color: 6 }, // Magenta
    { name: "ETIQUETAS", color: 7 }, // Branco/Preto
    { name: "CHAPA", color: 7 }, // Branco/Preto (MESA)
  ];
  layers.forEach((l) => {
    dxf += `0\nLAYER\n5\n${nextHandle()}\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\n${
      l.name
    }\n70\n0\n62\n${l.color}\n6\nCONTINUOUS\n`;
  });
  dxf += "0\nENDTAB\n0\nENDSEC\n";

  // 4. ENTITIES
  dxf += "0\nSECTION\n2\nENTITIES\n";

  // --- DESENHO DA MESA (VERTICALIZADA SE NECESSÁRIO) ---
  if (W > 0 && H > 0) {
    const writeLine = (x1: number, y1: number, x2: number, y2: number) => {
      dxf += "0\nLINE\n";
      dxf += `5\n${nextHandle()}\n100\nAcDbEntity\n8\nCHAPA\n62\n7\n100\nAcDbLine\n`;
      dxf += `10\n${x1.toFixed(4)}\n20\n${y1.toFixed(4)}\n30\n0.0\n`;
      dxf += `11\n${x2.toFixed(4)}\n21\n${y2.toFixed(4)}\n31\n0.0\n`;
    };
    writeLine(0, 0, W, 0);
    writeLine(W, 0, W, H);
    writeLine(W, H, 0, H);
    writeLine(0, H, 0, 0);
  }

  // --- DESENHO DAS PEÇAS ---
  placedParts.forEach((placed) => {
    const originalPart = allParts.find((p) => p.id === placed.partId);
    if (!originalPart) return;

    const flatEntities = flattenGeometry(
      originalPart.entities,
      originalPart.blocks
    );
    const cutEntities = flatEntities.filter((e) => !e.isLabel);
    const center = calculateTrueCenter(
      cutEntities.length > 0 ? cutEntities : flatEntities
    );

    const originalCenterX = center.cx;
    const originalCenterY = center.cy;
    const occupiedW =
      placed.rotation % 180 !== 0 ? center.height : center.width;
    const occupiedH =
      placed.rotation % 180 !== 0 ? center.width : center.height;

    // Coordenadas Originais na Mesa Horizontal (Se estiver deitada)
    const rawX = placed.x + occupiedW / 2;
    const rawY = placed.y + occupiedH / 2;

    // APLICAR ROTAÇÃO DE 90 GRAUS NO ARRANJO SE A MESA FOI GIRADA
    // Se shouldRotate (era 3000x1200 e virou 1200x3000):
    // O novo X é o antigo Y.
    // O novo Y é o antigo X (invertido ou ajustado).
    // Para simplificar: giramos 90 graus no sentido anti-horário em torno da origem (0,0) e depois transladamos para caber.
    // Mas o mais simples é: X_novo = Y_antigo, Y_novo = X_antigo. (Espelhamento/Troca de eixos).
    // Para manter a posição relativa correta:
    // X_final = rawY
    // Y_final = rawX
    // E precisamos adicionar 90 graus na rotação da peça.

    let finalCenterX = rawX;
    let finalCenterY = rawY;
    let finalRotation = placed.rotation;

    if (shouldRotate) {
      finalCenterX = rawY; // Troca eixo
      finalCenterY = rawX; // Troca eixo
      finalRotation = placed.rotation - 90; // Gira a peça para acompanhar
    }

    flatEntities.forEach((ent) => {
      const { layer, color } = getEntityAttributes(ent);
      const common = `5\n${nextHandle()}\n100\nAcDbEntity\n8\n${layer}\n62\n${color}\n`;

      const transform = (x: number, y: number) => {
        const r = rotatePoint(
          x,
          y,
          originalCenterX,
          originalCenterY,
          finalRotation
        );
        const dx = finalCenterX - originalCenterX;
        const dy = finalCenterY - originalCenterY;
        return { x: r.x + dx, y: r.y + dy };
      };

      if (ent.type === "LINE") {
        const p1 = transform(ent.vertices[0].x, ent.vertices[0].y);
        const p2 = transform(ent.vertices[1].x, ent.vertices[1].y);
        dxf += `0\nLINE\n${common}100\nAcDbLine\n10\n${p1.x.toFixed(
          4
        )}\n20\n${p1.y.toFixed(4)}\n30\n0.0\n11\n${p2.x.toFixed(
          4
        )}\n21\n${p2.y.toFixed(4)}\n31\n0.0\n`;
      } else if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
        dxf += `0\nLWPOLYLINE\n${common}100\nAcDbPolyline\n90\n${
          ent.vertices.length
        }\n70\n${ent.shape ? 1 : 0}\n`;
        ent.vertices.forEach((v: any) => {
          const p = transform(v.x, v.y);
          dxf += `10\n${p.x.toFixed(4)}\n20\n${p.y.toFixed(4)}\n`;
          if (v.bulge) dxf += `42\n${v.bulge}\n`;
        });
      } else if (ent.type === "CIRCLE") {
        const c = transform(ent.center.x, ent.center.y);
        dxf += `0\nCIRCLE\n${common}100\nAcDbCircle\n10\n${c.x.toFixed(
          4
        )}\n20\n${c.y.toFixed(4)}\n30\n0.0\n40\n${ent.radius.toFixed(4)}\n`;
      } else if (ent.type === "ARC") {
        const c = transform(ent.center.x, ent.center.y);
        const startDeg = (ent.startAngle * 180) / Math.PI + finalRotation;
        const endDeg = (ent.endAngle * 180) / Math.PI + finalRotation;
        dxf += `0\nARC\n${common}100\nAcDbCircle\n10\n${c.x.toFixed(
          4
        )}\n20\n${c.y.toFixed(4)}\n30\n0.0\n40\n${ent.radius.toFixed(
          4
        )}\n100\nAcDbArc\n50\n${startDeg.toFixed(4)}\n51\n${endDeg.toFixed(
          4
        )}\n`;
      }
    });
  });

  dxf += "0\nENDSEC\n0\nEOF\n";
  return dxf;
};
