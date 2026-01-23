// src/utils/labelUtils.ts

export type LabelType = "white" | "pink";

/**
 * Calcula a posição e rotação ideais para a etiqueta.
 * Para etiquetas ROSA, busca a extremidade interna.
 * Para etiquetas BRANCA, busca o centro e auto-fit.
 */
export const calculateSmartLabel = (
  partWidth: number,
  partHeight: number,
  text: string,
  type: LabelType,
  isCircular: boolean,
  currentFontSize: number, 
  margin: number = 5
) => {
  let finalFontSize = currentFontSize;
  let smartRotation = 0;
  
  // Coordenadas sugeridas (0,0 = Centro Geométrico)
  let smartX: number = 0;
  let smartY: number = 0;

  if (type === "pink") {
    // --- LÓGICA ROSA (GRAVAÇÃO) ---
    // Objetivo: Posicionar na extremidade (canto inferior esquerdo), mas DENTRO da peça.
    
    // 1. Estimativa do comprimento do texto para centralizar o bloco corretamente
    // Uma fonte vetorial média tem largura ~0.6x da altura por caractere
    const charWidthRatio = 0.6; 
    const textLength = text.length * finalFontSize * charWidthRatio;
    
    const halfLength = textLength / 2;    // Metade do comprimento
    const halfHeight = finalFontSize / 2; // Metade da altura
    
    const edgeMargin = 1; // 1mm de respiro da borda

    if (isCircular) {
      // PEÇA CIRCULAR: Fundo (Sul)
      smartRotation = 0;
      const radius = Math.min(partWidth, partHeight) / 2;
      smartX = 0;
      // Y = Borda Inferior (-Raio) + Margem + Metade da Altura do texto
      smartY = -radius + edgeMargin + halfHeight;
    } else {
      // PEÇA RETANGULAR / POLÍGONO
      const isVertical = partHeight > partWidth;
      const leftEdge = -(partWidth / 2);
      const bottomEdge = -(partHeight / 2);

      if (isVertical) {
        // VERTICAL (Alta): Texto na Horizontal (0º) no fundo
        smartRotation = 0;
        
        // X: Encosta na Esquerda (Borda + Margem + Metade do Texto)
        smartX = leftEdge + edgeMargin + halfLength;
        
        // Y: Encosta no Fundo (Borda + Margem + Metade da Altura)
        smartY = bottomEdge + edgeMargin + halfHeight;
      } else {
        // HORIZONTAL (Larga): Texto na Vertical (90º) na esquerda
        smartRotation = 90;
        
        // X: Encosta na Esquerda (Borda + Margem + Metade da Altura)
        // (Nota: Como gira 90º, a "altura" visual é a largura da fonte)
        smartX = leftEdge + edgeMargin + halfHeight;
        
        // Y: Encosta no Fundo (Borda + Margem + Metade do Texto)
        smartY = bottomEdge + edgeMargin + halfLength;
      }
    }

  } else {
    // --- LÓGICA BRANCA (IDENTIFICAÇÃO) ---
    // Mantém no centro com ajuste automático de tamanho
    
    // Se o tamanho for inválido ou padrãozão, tenta calcular o Auto-Fit
    if (!currentFontSize || currentFontSize === 38) {
        const isVertical = partHeight > partWidth;
        const availableLength = isVertical ? partHeight : partWidth;
        const safeSpace = availableLength - (margin * 2);
        const charWidthRatio = 0.7;
        const baseSize = 38;
        const estimatedTextWidth = text.length * (baseSize * charWidthRatio);

        if (estimatedTextWidth > safeSpace) {
            const ratio = safeSpace / estimatedTextWidth;
            finalFontSize = Math.floor(baseSize * ratio);
            if (finalFontSize < 12) finalFontSize = 12; // Mínimo legível
        } else {
            finalFontSize = 38;
        }
    }

    // Acompanha o maior lado
    smartRotation = (partHeight > partWidth) ? 90 : 0;
    
    // Centralizado
    smartX = 0;
    smartY = 0;
  }

  return {
    smartRotation,
    suggestedFontSize: finalFontSize,
    smartX,
    smartY
  };
};