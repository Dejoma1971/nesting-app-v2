/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PlacedPart } from "./nestingCore";
import type { ImportedPart } from "../components/types";

// Função auxiliar para rotacionar um ponto (x, y) em torno de um centro (cx, cy)
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

// Removi o 'binHeight' que não estava sendo usado
export const generateDxfContent = (
  placedParts: PlacedPart[],
  allParts: ImportedPart[]
): string => {
  let dxf = "";

  // Cabeçalho básico DXF
  dxf += "0\nSECTION\n2\nHEADER\n0\nENDSEC\n";
  dxf += "0\nSECTION\n2\nENTITIES\n";

  placedParts.forEach((placed) => {
    const originalPart = allParts.find((p) => p.id === placed.partId);
    if (!originalPart) return;

    // 1. Calcular o centro original da peça para ser o pivô da rotação
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    const checkBounds = (ents: any[], ox = 0, oy = 0) => {
      ents.forEach((ent) => {
        if (ent.vertices) {
          ent.vertices.forEach((v: any) => {
            const x = v.x + ox;
            const y = v.y + oy;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          });
        } else if (ent.center && ent.radius) {
          const cx = ent.center.x + ox;
          const cy = ent.center.y + oy;
          if (cx - ent.radius < minX) minX = cx - ent.radius;
          if (cx + ent.radius > maxX) maxX = cx + ent.radius;
          if (cy - ent.radius < minY) minY = cy - ent.radius;
          if (cy + ent.radius > maxY) maxY = cy + ent.radius;
        }
      });
    };
    checkBounds(originalPart.entities);

    const originalCenterX = minX + originalPart.width / 2;
    const originalCenterY = minY + originalPart.height / 2;

    // Dimensões ocupadas (se rotacionou 90, inverte W e H)
    const occupiedW =
      placed.rotation === 90 ? originalPart.height : originalPart.width;
    const occupiedH =
      placed.rotation === 90 ? originalPart.width : originalPart.height;

    // O centro final deve ser:
    const finalCenterX = placed.x + occupiedW / 2;
    const finalCenterY = placed.y + occupiedH / 2;

    const processEntities = (entities: any[], offsetX = 0, offsetY = 0) => {
      entities.forEach((ent) => {
        // Tratamento para LINHAS
        if (ent.type === "LINE") {
          const p1 = {
            x: ent.vertices[0].x + offsetX,
            y: ent.vertices[0].y + offsetY,
          };
          const p2 = {
            x: ent.vertices[1].x + offsetX,
            y: ent.vertices[1].y + offsetY,
          };

          // CORREÇÃO 1: Usei 'const' ao invés de 'let'
          const r1 = rotatePoint(
            p1.x,
            p1.y,
            originalCenterX,
            originalCenterY,
            placed.rotation
          );
          const r2 = rotatePoint(
            p2.x,
            p2.y,
            originalCenterX,
            originalCenterY,
            placed.rotation
          );

          const dx = finalCenterX - originalCenterX;
          const dy = finalCenterY - originalCenterY;

          dxf += "0\nLINE\n8\nCORTE\n";
          // CORREÇÃO 2 (A mais importante):
          // Antes estava (r1.y + dx), agora corrigi para (r1.y + dy)
          dxf += `10\n${(r1.x + dx).toFixed(4)}\n20\n${(r1.y + dy).toFixed(
            4
          )}\n`;
          dxf += `11\n${(r2.x + dx).toFixed(4)}\n21\n${(r2.y + dy).toFixed(
            4
          )}\n`;
        }

        // Tratamento para POLILINHAS
        else if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
          dxf += "0\nLWPOLYLINE\n8\nCORTE\n";
          dxf += `90\n${ent.vertices.length}\n`;
          dxf += `70\n${ent.shape ? 1 : 0}\n`;

          const dx = finalCenterX - originalCenterX;
          const dy = finalCenterY - originalCenterY;

          ent.vertices.forEach((v: any) => {
            const vx = v.x + offsetX;
            const vy = v.y + offsetY;
            const rv = rotatePoint(
              vx,
              vy,
              originalCenterX,
              originalCenterY,
              placed.rotation
            );

            dxf += `10\n${(rv.x + dx).toFixed(4)}\n`;
            dxf += `20\n${(rv.y + dy).toFixed(4)}\n`;
          });
        }

        // Tratamento para CÍRCULOS
        else if (ent.type === "CIRCLE") {
          const cx = ent.center.x + offsetX;
          const cy = ent.center.y + offsetY;
          const rc = rotatePoint(
            cx,
            cy,
            originalCenterX,
            originalCenterY,
            placed.rotation
          );

          const dx = finalCenterX - originalCenterX;
          const dy = finalCenterY - originalCenterY;

          dxf += "0\nCIRCLE\n8\nCORTE\n";
          dxf += `10\n${(rc.x + dx).toFixed(4)}\n`;
          dxf += `20\n${(rc.y + dy).toFixed(4)}\n`;
          dxf += `40\n${ent.radius.toFixed(4)}\n`;
        }
      });
    };

    processEntities(originalPart.entities);
  });

  dxf += "0\nENDSEC\n0\nEOF\n";
  return dxf;
};
