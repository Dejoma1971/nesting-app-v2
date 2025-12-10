/* eslint-disable @typescript-eslint/no-explicit-any */

// Definição simplificada de fonte vetorial (Estilo Simplex/Hershey)
// Cada caractere é uma lista de linhas [x1, y1, x2, y2]
// Grid base: 10x14 (Largura x Altura)
const CHAR_MAP: Record<string, number[][]> = {
  '0': [[2,12,8,12], [8,12,10,10], [10,10,10,4], [10,4,8,2], [8,2,2,2], [2,2,0,4], [0,4,0,10], [0,10,2,12], [0,4,10,10]], // Zero cortado
  '1': [[2,10,5,12], [5,12,5,0], [2,0,8,0]],
  '2': [[0,10,2,12], [2,12,8,12], [8,12,10,10], [10,10,10,7], [10,7,0,0], [0,0,10,0]],
  '3': [[0,11,1,12], [1,12,8,12], [8,12,10,10], [10,10,10,8], [10,8,8,6], [8,6,3,6], [8,6,10,4], [10,4,10,2], [10,2,8,0], [8,0,1,0], [1,0,0,1]],
  '4': [[7,12,0,4], [0,4,10,4], [7,12,7,0]],
  '5': [[9,12,1,12], [1,12,0,7], [0,7,8,7], [8,7,10,5], [10,5,10,2], [10,2,8,0], [8,0,0,0]],
  '6': [[9,11,8,12], [8,12,2,12], [2,12,0,9], [0,9,0,3], [0,3,3,0], [3,0,8,0], [8,0,10,3], [10,3,10,5], [10,5,8,7], [8,7,0,6]],
  '7': [[0,12,10,12], [10,12,4,0]],
  '8': [[5,12,2,11], [2,11,0,9], [0,9,0,7], [0,7,2,6], [2,6,5,6], [5,6,8,6], [8,6,10,7], [10,7,10,9], [10,9,8,11], [8,11,5,12], [5,6,2,5], [2,5,0,3], [0,3,0,2], [0,2,2,0], [2,0,8,0], [8,0,10,2], [10,2,10,3], [10,3,8,5], [8,5,5,6]],
  '9': [[1,1,2,0], [2,0,8,0], [8,0,10,3], [10,3,10,9], [10,9,7,12], [7,12,2,12], [2,12,0,9], [0,9,0,7], [0,7,2,5], [2,5,10,6]],
  '-': [[1,6,9,6]],
  ' ': [] // Espaço vazio
};

// Fallback para caracteres desconhecidos
const CHAR_UNKNOWN = [[0,0,10,12], [0,12,10,0]]; // Um "X"

/**
 * Converte uma string em uma lista de entidades LINE do DXF
 * @param text O texto (apenas números e traços)
 * @param startX Posição X central
 * @param startY Posição Y central
 * @param height Altura da letra (mm)
 * @param color Cor da linha (hex ou nome)
 */
export const textToVectorLines = (
  text: string, 
  startX: number, 
  startY: number, 
  height: number,
  color: string
): any[] => {
  const lines: any[] = [];
  
  // Configuração da Fonte
  const baseHeight = 14;     // Altura no grid original
  const baseWidth = 10;      // Largura no grid original
  const charSpacing = 4;     // Espaço entre letras no grid original
  
  const scale = height / baseHeight;
  const scaledWidth = baseWidth * scale;
  const scaledSpacing = charSpacing * scale;

  // Calcula largura total para centralizar
  const totalWidth = (text.length * scaledWidth) + ((text.length - 1) * scaledSpacing);
  let currentX = startX - (totalWidth / 2); // Começa deslocado para a esquerda para centralizar
  const currentY = startY - (height / 2);   // Centraliza verticalmente

  // Itera sobre cada caractere
  for (const char of text.toUpperCase()) {
    const vectors = CHAR_MAP[char] || CHAR_UNKNOWN;

    vectors.forEach(([x1, y1, x2, y2]) => {
      lines.push({
        type: 'LINE',
        vertices: [
          { x: currentX + (x1 * scale), y: currentY + (y1 * scale) },
          { x: currentX + (x2 * scale), y: currentY + (y2 * scale) }
        ],
        color: color, // Propriedade personalizada para nosso renderizador
        isLabel: true // Flag para identificar
      });
    });

    currentX += (scaledWidth + scaledSpacing);
  }

  return lines;
};