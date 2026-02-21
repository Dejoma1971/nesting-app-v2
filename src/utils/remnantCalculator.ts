// src/utils/remnantCalculator.ts

export interface RemnantRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  area: number;
  type: 'primary' | 'secondary'; // Útil para pintar com tons de verde diferentes
}

/**
 * Calcula até 2 retalhos retangulares otimizados a partir das coordenadas de corte (X, Y).
 * Segue a regra de negócio: "A maior área contínua vence e determina quem apara quem".
 */
export function calculateOptimalRemnants(
  binWidth: number,
  binHeight: number,
  cutX: number,
  cutY: number
): RemnantRect[] {
  // Garante que o corte não saia da chapa fisicamente
  const safeX = Math.max(0, Math.min(cutX, binWidth));
  const safeY = Math.max(0, Math.min(cutY, binHeight));

  const remnants: RemnantRect[] = [];

  // Cenário 1: Nenhuma sobra (Chapa foi inteira consumida ou cortes nas bordas máximas)
  if (safeX >= binWidth && safeY >= binHeight) {
    return remnants;
  }

  // Cenário 2: Apenas um corte horizontal (Gera 1 retalho na parte superior)
  if (safeX >= binWidth || safeX === 0) {
    if (safeY < binHeight && safeY > 0) {
      remnants.push({
        id: 'retalho-topo-unico',
        x: 0,
        y: safeY,
        width: binWidth,
        height: binHeight - safeY,
        area: binWidth * (binHeight - safeY),
        type: 'primary',
      });
    }
    return remnants;
  }

  // Cenário 3: Apenas um corte vertical (Gera 1 retalho na lateral direita)
  if (safeY >= binHeight || safeY === 0) {
    if (safeX < binWidth && safeX > 0) {
      remnants.push({
        id: 'retalho-lateral-unico',
        x: safeX,
        y: 0,
        width: binWidth - safeX,
        height: binHeight,
        area: (binWidth - safeX) * binHeight,
        type: 'primary',
      });
    }
    return remnants;
  }

  // Cenário 4: Cruzamento (Corte em "L") - A Matemática do Máximo de 2 Retalhos
  
  // Hipótese A: A linha Horizontal vence (vai de ponta a ponta na chapa)
  const areaATop = binWidth * (binHeight - safeY); // Retalho grandão no topo
  const areaARight = (binWidth - safeX) * safeY;   // Retalho menor na lateral
  const maxAreaA = Math.max(areaATop, areaARight);

  // Hipótese B: A linha Vertical vence (vai de ponta a ponta na chapa)
  const areaBRight = (binWidth - safeX) * binHeight; // Retalho grandão na lateral
  const areaBTop = safeX * (binHeight - safeY);      // Retalho menor no topo
  const maxAreaB = Math.max(areaBRight, areaBTop);

  // Decisão: Qual hipótese gerou a maior peça única contínua?
  if (maxAreaA >= maxAreaB) {
    // ESTRATÉGIA A VENCE (Horizontal atravessa a chapa)
    if (areaATop > 0) {
      remnants.push({
        id: 'retalho-primario-horizontal',
        x: 0, y: safeY,
        width: binWidth, height: binHeight - safeY,
        area: areaATop, type: 'primary',
      });
    }
    if (areaARight > 0) {
      remnants.push({
        id: 'retalho-secundario-lateral',
        x: safeX, y: 0,
        width: binWidth - safeX, height: safeY,
        area: areaARight, type: 'secondary',
      });
    }
  } else {
    // ESTRATÉGIA B VENCE (Vertical atravessa a chapa)
    if (areaBRight > 0) {
      remnants.push({
        id: 'retalho-primario-vertical',
        x: safeX, y: 0,
        width: binWidth - safeX, height: binHeight,
        area: areaBRight, type: 'primary',
      });
    }
    if (areaBTop > 0) {
      remnants.push({
        id: 'retalho-secundario-topo',
        x: 0, y: safeY,
        width: safeX, height: binHeight - safeY,
        area: areaBTop, type: 'secondary',
      });
    }
  }

  // Retorna o array sempre ordenado pela maior área primeiro
  return remnants.sort((a, b) => b.area - a.area);
}

/**
 * Função utilitária para extrair os eixos de corte principais caso o usuário
 * tenha inserido várias linhas de corte (ex: escadas em U).
 * Ela encontra as fronteiras que formam o limite das peças inseridas.
 */
export function resolveCropLines(
  binWidth: number,
  binHeight: number,
  cropLines: { type: 'horizontal' | 'vertical'; position: number }[]
): { cutX: number; cutY: number } {
  const hLines = cropLines.filter(l => l.type === 'horizontal').map(l => l.position);
  const vLines = cropLines.filter(l => l.type === 'vertical').map(l => l.position);

  // Assumimos que a área das peças (Área Efetiva) está do ponto (0,0) até as linhas mais extremas
  const cutY = hLines.length > 0 ? Math.max(...hLines) : binHeight;
  const cutX = vLines.length > 0 ? Math.max(...vLines) : binWidth;

  return { cutX, cutY };
}