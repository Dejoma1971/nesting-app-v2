// src/utils/remnantDetector.ts (ou onde preferir no seu projeto)
import polygonClipping from "polygon-clipping";

interface Point {
  x: number;
  y: number;
}

/**
 * Subtrai as peças da chapa para encontrar o polígono irregular da sobra.
 * * @param binWidth Largura da chapa
 * @param binHeight Altura da chapa
 * @param partsOuterLoops Array contendo o `geom.outer` de cada peça posicionada
 * @returns Um MultiPolígono representando a área de sobra bruta
 */
export const getRawRemnant = (
  binWidth: number,
  binHeight: number,
  partsOuterLoops: Point[][],
) => {
  // 1. Criar o polígono da chapa inteira (fechando o loop no final)
  const platePolygon: polygonClipping.Polygon = [
    [
      [0, 0],
      [binWidth, 0],
      [binWidth, binHeight],
      [0, binHeight],
      [0, 0],
    ],
  ];

  // 2. Converter os loops das peças para o formato da biblioteca
  const partsPolygons: polygonClipping.Polygon[] = partsOuterLoops.map(
    (loop) => {
      const ring = loop.map((p) => [p.x, p.y] as [number, number]);

      // Garante que o anel está fechado (último ponto == primeiro ponto)
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        ring.push([...first]);
      }

      return [ring]; // Retorna como um Polígono sem furos
    },
  );

  // 3. Fazer a subtração booleana: Chapa - Peça 1 - Peça 2...
  let rawRemnant: polygonClipping.MultiPolygon = [platePolygon];

  for (const part of partsPolygons) {
    // A função difference aceita o que sobrou e subtrai a próxima peça
    rawRemnant = polygonClipping.difference(rawRemnant, part);
  }

  // O resultado é um array de polígonos irregulares (a sobra bruta)
  return rawRemnant;
};

// Adicione esta interface se não existir no arquivo
interface Point {
  x: number;
  y: number;
}

export interface RemnantRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  areaM2: number;
}

export const findSmartRemnants = (
  binWidth: number,
  binHeight: number,
  partsOuterLoops: Point[][],
  minAreaM2: number = 0.3,
  maxRects: number = 2,
  invertSearch: boolean = false,
  minDimension: number = 250, // Largura ou Altura mínima (mm)
  maxAspectRatio: number = 5  // Proporção máxima permitida (ex: 1:5)
): RemnantRect[] => {

  let maxX = 0;
  let maxY = 0;

  partsOuterLoops.forEach(polygon => {
    polygon.forEach(p => {
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    });
  });

  const cutX = Math.min(maxX, binWidth);
  const cutY = Math.min(maxY, binHeight);

  const finalRects: RemnantRect[] = [];

  if (cutX >= binWidth && cutY >= binHeight) {
    return finalRects;
  }

  const rectATop = { width: binWidth, height: binHeight - cutY };
  const rectARight = { width: binWidth - cutX, height: cutY };
  const areaATop = rectATop.width * rectATop.height;
  const areaARight = rectARight.width * rectARight.height;

  const rectBRight = { width: binWidth - cutX, height: binHeight };
  const rectBTop = { width: cutX, height: binHeight - cutY };
  const areaBRight = rectBRight.width * rectBRight.height;
  const areaBTop = rectBTop.width * rectBTop.height;

  let scoreA = Math.max(areaATop, areaARight);
  let scoreB = Math.max(areaBRight, areaBTop);

  if (invertSearch) {
    scoreB *= 1.5; 
  } else {
    scoreA *= 1.5; 
  }

  const createValidRect = (x: number, y: number, w: number, h: number, idSuffix: string): RemnantRect | null => {
    const areaM2 = (w * h) / 1000000;
    if (w <= 0 || h <= 0) return null;

    const currentAspectRatio = Math.max(w / h, h / w);
    
    if (areaM2 >= minAreaM2 && w >= minDimension && h >= minDimension && currentAspectRatio <= maxAspectRatio) {
        return {
            id: `retalho-${Date.now()}-${idSuffix}`,
            x, y, width: w, height: h, areaM2
        };
    }
    return null;
  };

  if (scoreA >= scoreB) {
    const top = createValidRect(0, cutY, rectATop.width, rectATop.height, 'horiz-top');
    if (top) finalRects.push(top);
    
    const right = createValidRect(cutX, 0, rectARight.width, rectARight.height, 'horiz-right');
    if (right) finalRects.push(right);
  } else {
    const right = createValidRect(cutX, 0, rectBRight.width, rectBRight.height, 'vert-right');
    if (right) finalRects.push(right);

    const top = createValidRect(0, cutY, rectBTop.width, rectBTop.height, 'vert-top');
    if (top) finalRects.push(top);
  }

  return finalRects
    .sort((a, b) => b.areaM2 - a.areaM2)
    .slice(0, maxRects);
};