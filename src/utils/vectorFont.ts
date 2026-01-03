/* eslint-disable @typescript-eslint/no-explicit-any */

// Definição de fonte vetorial "Single Stroke" (Estilo Simplex/Hershey)
// Otimizada para Laser/CNC (sem contornos duplos, apenas caminho da ferramenta)
// Grid base: 10x14 (Largura x Altura)
const CHAR_MAP: Record<string, number[][]> = {
  // --- NÚMEROS ---
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

  // --- LETRAS (ALFABETO MAIÚSCULO) ---
  'A': [[0,0,0,4], [0,4,5,12], [5,12,10,4], [10,4,10,0], [0,4,10,4]],
  'B': [[0,0,0,12], [0,12,7,12], [7,12,10,10], [10,10,10,7], [10,7,7,6], [7,6,0,6], [7,6,10,5], [10,5,10,2], [10,2,7,0], [7,0,0,0]],
  'C': [[10,10,8,12], [8,12,2,12], [2,12,0,10], [0,10,0,2], [0,2,2,0], [2,0,8,0], [8,0,10,2]],
  'D': [[0,0,0,12], [0,12,6,12], [6,12,10,8], [10,8,10,4], [10,4,6,0], [6,0,0,0]],
  'E': [[10,12,0,12], [0,12,0,0], [0,0,10,0], [0,6,8,6]],
  'F': [[10,12,0,12], [0,12,0,0], [0,6,8,6]],
  'G': [[10,10,8,12], [8,12,2,12], [2,12,0,10], [0,10,0,2], [0,2,2,0], [2,0,8,0], [8,0,10,2], [10,2,10,6], [10,6,6,6]],
  'H': [[0,0,0,12], [10,0,10,12], [0,6,10,6]],
  'I': [[2,12,8,12], [5,12,5,0], [2,0,8,0]],
  'J': [[2,12,8,12], [5,12,5,2], [5,2,2,0], [2,0,0,2]],
  'K': [[0,0,0,12], [10,12,0,6], [0,6,10,0]],
  'L': [[0,12,0,0], [0,0,10,0]],
  'M': [[0,0,0,12], [0,12,5,6], [5,6,10,12], [10,12,10,0]],
  'N': [[0,0,0,12], [0,12,10,0], [10,0,10,12]],
  'O': [[2,12,8,12], [8,12,10,10], [10,10,10,2], [10,2,8,0], [8,0,2,0], [2,0,0,2], [0,2,0,10], [0,10,2,12]],
  'P': [[0,0,0,12], [0,12,8,12], [8,12,10,10], [10,10,10,7], [10,7,8,6], [8,6,0,6]],
  'Q': [[2,12,8,12], [8,12,10,10], [10,10,10,2], [10,2,8,0], [8,0,2,0], [2,0,0,2], [0,2,0,10], [0,10,2,12], [6,4,10,0]],
  'R': [[0,0,0,12], [0,12,8,12], [8,12,10,10], [10,10,10,7], [10,7,8,6], [8,6,0,6], [4,6,10,0]],
  'S': [[10,10,8,12], [8,12,2,12], [2,12,0,10], [0,10,0,7], [0,7,10,5], [10,5,10,2], [10,2,8,0], [8,0,2,0], [2,0,0,2]],
  'T': [[5,0,5,12], [0,12,10,12]],
  'U': [[0,12,0,2], [0,2,2,0], [2,0,8,0], [8,0,10,2], [10,2,10,12]],
  'V': [[0,12,5,0], [5,0,10,12]],
  'W': [[0,12,2,0], [2,0,5,6], [5,6,8,0], [8,0,10,12]],
  'X': [[0,0,10,12], [0,12,10,0]],
  'Y': [[0,12,5,6], [10,12,5,6], [5,6,5,0]],
  'Z': [[0,12,10,12], [10,12,0,0], [0,0,10,0]],

  // --- SÍMBOLOS ESPECIAIS (Engenharia) ---
  '-': [[1,6,9,6]],
  '+': [[1,6,9,6], [5,2,5,10]],
  '.': [[4,0,4,2], [4,2,6,2], [6,2,6,0], [6,0,4,0]], // Quadrado pequeno simulando ponto
  ',': [[6,2,4,0], [4,0,3,0]],
  '/': [[0,0,10,12]],
  '#': [[3,0,3,12], [7,0,7,12], [0,4,10,4], [0,8,10,8]],
  ' ': [] // Espaço vazio
};

// Fallback para caracteres desconhecidos (Desenha um retângulo com X)
const CHAR_UNKNOWN = [[0,0,10,0], [10,0,10,12], [10,12,0,12], [0,12,0,0], [0,0,10,12], [0,12,10,0]];

/**
 * Converte uma string em uma lista de entidades LINE do DXF.
 * Suporta A-Z, 0-9 e símbolos comuns.
 * * @param text O texto a ser convertido
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
  if (!text) return [];

  const lines: any[] = [];
  
  // Configuração da Fonte Simplex
  const baseHeight = 14;     // Altura no grid original
  const baseWidth = 10;      // Largura no grid original
  const charSpacing = 4;     // Espaço entre letras no grid original
  
  const scale = height / baseHeight;
  const scaledWidth = baseWidth * scale;
  const scaledSpacing = charSpacing * scale;

  // Calcula largura total para centralizar o texto no ponto de inserção
  const totalWidth = (text.length * scaledWidth) + ((text.length - 1) * scaledSpacing);
  let currentX = startX - (totalWidth / 2); // Começa deslocado para a esquerda para centralizar
  const currentY = startY - (height / 2);   // Centraliza verticalmente (ponto médio Y)

  // Itera sobre cada caractere
  for (const char of text.toUpperCase()) {
    // Busca o vetor ou usa o fallback
    const vectors = CHAR_MAP[char] || CHAR_UNKNOWN;

    vectors.forEach(([x1, y1, x2, y2]) => {
      lines.push({
        type: 'LINE',
        vertices: [
          { x: currentX + (x1 * scale), y: currentY + (y1 * scale) },
          { x: currentX + (x2 * scale), y: currentY + (y2 * scale) }
        ],
        color: color, // Propriedade personalizada para nosso renderizador
        isLabel: true // Flag para identificar que é uma etiqueta (não é peça cortada)
      });
    });

    // Avança o cursor para a próxima letra
    currentX += (scaledWidth + scaledSpacing);
  }

  return lines;
};