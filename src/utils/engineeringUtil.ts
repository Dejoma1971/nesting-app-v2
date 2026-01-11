/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ImportedPart } from "../components/types";
import { UnionFind, calculateBoundingBox, calculatePartNetArea, entitiesTouch, flattenGeometry, isContained, rotatePoint, detectOpenEndpoints } from "../utils/geometryCore";

// --- LÓGICA DE ROTAÇÃO ---
export const applyRotationToPart = (
  part: ImportedPart,
  angle: number
): ImportedPart => {
  const flatEntities = flattenGeometry(part.entities, part.blocks);
  const transform = { x: 0, y: 0, rotation: angle, scale: 1 };

  const rotatedEntities = flatEntities.map((ent: any) => {
    const applyTrans = (x: number, y: number) =>
      rotatePoint(x, y, transform.rotation);

    if (ent.type === "LINE") {
      const p1 = applyTrans(ent.vertices[0].x, ent.vertices[0].y);
      const p2 = applyTrans(ent.vertices[1].x, ent.vertices[1].y);
      ent.vertices = [
        { x: p1.x, y: p1.y },
        { x: p2.x, y: p2.y },
      ];
    } else if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
      ent.vertices = ent.vertices.map((v: any) => {
        const p = applyTrans(v.x, v.y);
        return { ...v, x: p.x, y: p.y };
      });
    } else if (ent.type === "CIRCLE" || ent.type === "ARC") {
      const c = applyTrans(ent.center.x, ent.center.y);
      ent.center = { x: c.x, y: c.y };
      if (ent.type === "ARC") {
        ent.startAngle += (angle * Math.PI) / 180;
        ent.endAngle += (angle * Math.PI) / 180;
      }
    }
    return ent;
  });

  const box = calculateBoundingBox(rotatedEntities);
  const minX = box.minX;
  const minY = box.minY;

  const newPart = JSON.parse(JSON.stringify(part));
  newPart.width = box.maxX - box.minX;
  newPart.height = box.maxY - box.minY;
  newPart.blocks = {};

  newPart.entities = rotatedEntities.map((ent: any) => {
    const move = (x: number, y: number) => ({ x: x - minX, y: y - minY });
    if (ent.vertices)
      ent.vertices = ent.vertices.map((v: any) => {
        const p = move(v.x, v.y);
        return { ...v, x: p.x, y: p.y };
      });
    else if (ent.center) {
      const c = move(ent.center.x, ent.center.y);
      ent.center = { x: c.x, y: c.y };
    }
    return ent;
  });

  newPart.grossArea = newPart.width * newPart.height;
  let net = calculatePartNetArea(newPart.entities);
  if (net < 0.1) net = newPart.grossArea;
  newPart.netArea = net;

  return newPart;
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

  const candidateParts = Array.from(clusters.values()).map((ents) => ({
    entities: ents,
    box: calculateBoundingBox(ents),
    children: [] as any[],
    isHole: false,
  }));
  candidateParts.sort((a, b) => b.box.area - a.box.area);

  const finalParts: ImportedPart[] = [];
  for (let i = 0; i < candidateParts.length; i++) {
    const parent = candidateParts[i];
    if (parent.isHole) continue;

    const width = parent.box.maxX - parent.box.minX;
    const height = parent.box.maxY - parent.box.minY;

    if (width < 2 && height < 2) continue;

    for (let j = i + 1; j < candidateParts.length; j++) {
      const child = candidateParts[j];
      if (!child.isHole && isContained(child.box, parent.box)) {
        parent.entities = parent.entities.concat(child.entities);
        child.isHole = true;
      }
    }

    const finalBox = calculateBoundingBox(parent.entities);
    const finalW = finalBox.maxX - finalBox.minX;
    const finalH = finalBox.maxY - finalBox.minY;

    const normalizedEntities = parent.entities.map((ent: any) => {
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

    // ---> NOVO: Verifica se a peça está aberta <---
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
  }
  return finalParts;
};