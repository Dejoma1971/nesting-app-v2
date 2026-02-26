// src/utils/remnantDetector.ts (ou onde preferir no seu projeto)
import polygonClipping from 'polygon-clipping';

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
  partsOuterLoops: Point[][]
) => {
  // 1. Criar o polígono da chapa inteira (fechando o loop no final)
  const platePolygon: polygonClipping.Polygon = [[
    [0, 0],
    [binWidth, 0],
    [binWidth, binHeight],
    [0, binHeight],
    [0, 0] 
  ]];

  // 2. Converter os loops das peças para o formato da biblioteca
  const partsPolygons: polygonClipping.Polygon[] = partsOuterLoops.map(loop => {
    const ring = loop.map(p => [p.x, p.y] as [number, number]);
    
    // Garante que o anel está fechado (último ponto == primeiro ponto)
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([...first]);
    }

    return [ring]; // Retorna como um Polígono sem furos
  });

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

// Função auxiliar: Verifica se o centro de uma célula (pixel) está dentro da peça
const isPointInPolygon = (px: number, py: number, polygon: Point[]): boolean => {
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
  }
  return isInside;
};

/**
 * Encontra os maiores retalhos retangulares usando a abordagem de Matriz (Grid).
 */
export const findSmartRemnants = (
  binWidth: number,
  binHeight: number,
  partsOuterLoops: Point[][],
  minAreaM2: number = 0.3,
  maxRects: number = 2,
  resolution: number = 20
): RemnantRect[] => {
  
  const cols = Math.floor(binWidth / resolution);
  const rows = Math.floor(binHeight / resolution);

  // 1. Criar a matriz original
  const grid: number[][] = Array(rows).fill(0).map(() => Array(cols).fill(1));

  // 2. Rasterização (Carimbar as peças infladas na matriz)
  partsOuterLoops.forEach(polygon => {
    let minX = binWidth, minY = binHeight, maxX = 0, maxY = 0;
    polygon.forEach(p => {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    });

    const startCol = Math.max(0, Math.floor(minX / resolution));
    const endCol = Math.min(cols - 1, Math.floor(maxX / resolution));
    const startRow = Math.max(0, Math.floor(minY / resolution));
    const endRow = Math.min(rows - 1, Math.floor(maxY / resolution));

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (grid[r][c] === 0) continue;
        const px = c * resolution + (resolution / 2);
        const py = r * resolution + (resolution / 2);
        if (isPointInPolygon(px, py, polygon)) {
          grid[r][c] = 0;
        }
      }
    }
  });

  const finalRects: RemnantRect[] = [];

  // 3. Loop Iterativo: Acha o maior, extrai, e repete para o próximo
  for (let i = 0; i < maxRects; i++) {
    let bestRect: RemnantRect | null = null;
    let maxArea = 0;
    const heights = Array(cols).fill(0);

    // Algoritmo de Maior Retângulo (Histograma)
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        heights[c] = grid[r][c] === 1 ? heights[c] + 1 : 0;
      }

      const stack: number[] = [];
      for (let c = 0; c <= cols; c++) {
        const h = c === cols ? 0 : heights[c];
        while (stack.length > 0 && h < heights[stack[stack.length - 1]]) {
          const height = heights[stack.pop()!];
          const width = stack.length === 0 ? c : c - stack[stack.length - 1] - 1;
          
          const rectW = width * resolution;
          const rectH = height * resolution;
          const areaM2 = (rectW * rectH) / 1000000;

          if (areaM2 >= minAreaM2 && areaM2 > maxArea) {
            maxArea = areaM2;
            const rectY = (r - height + 1) * resolution;
            const rectX = (stack.length === 0 ? 0 : stack[stack.length - 1] + 1) * resolution;
            
            bestRect = {
              id: `retalho-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              x: rectX,
              y: rectY,
              width: rectW,
              height: rectH,
              areaM2
            };
          }
        }
        stack.push(c);
      }
    }

    // Se encontrou um retalho válido, salva e "fura" a matriz para a próxima busca não sobrepor
    if (bestRect) {
      finalRects.push(bestRect);
      
      const startCol = Math.max(0, Math.floor(bestRect.x / resolution));
      const endCol = Math.min(cols - 1, Math.floor((bestRect.x + bestRect.width) / resolution));
      const startRow = Math.max(0, Math.floor(bestRect.y / resolution));
      const endRow = Math.min(rows - 1, Math.floor((bestRect.y + bestRect.height) / resolution));

      for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
          grid[r][c] = 0; // Oculta a área já capturada
        }
      }
    } else {
      break; // Se não encontrou mais nada maior que 0.3m², para o loop
    }
  }

  return finalRects;
};