// src/utils/labelUtils.ts

export type LabelType = "white" | "pink";

/**
 * Calcula a posição e rotação ideais para a etiqueta.
 * AGORA: A etiqueta Rosa segue a Branca, posicionando-se paralela e abaixo.
 */
export const calculateSmartLabel = (
  partWidth: number,
  partHeight: number,
  text: string,
  type: LabelType,
  isCircular: boolean,
  currentFontSize: number,
  margin: number = 5,
) => {
  let finalFontSize = currentFontSize;
  let smartRotation = 0;

  // Coordenadas sugeridas (0,0 = Centro Geométrico)
  let smartX: number = 0;
  let smartY: number = 0;

  // --- LÓGICA DE GEOMETRIA (Comum para ambas agora) ---
  // Define se a peça "pede" um texto vertical ou horizontal
  const isVerticalGeometry = partHeight > partWidth;

  // Se for circular, tratamos como Horizontal (0º) por padrão
  const effectiveVertical = isCircular ? false : isVerticalGeometry;

  // Distância padrão para a "linha de baixo" (Gap entre Branca e Rosa)
  // Branca (~38px) + Espaço (~5px) + Rosa (~6px) -> Centro a Centro ≈ 30px
  const LINE_OFFSET = 30;

  if (type === "pink") {
    // --- LÓGICA ROSA (GRAVAÇÃO) ---
    // Regra: Paralela à Branca e Abaixo dela.

    // 1. Rotação: Copia exatamente a lógica da etiqueta Branca
    smartRotation = effectiveVertical ? 90 : 0;

    // 2. Tamanho: Fixo (padrão de gravação)
    // Se o usuário não definiu, o padrão é 6.
    if (!currentFontSize) finalFontSize = 6;

    // 3. Posição: Deslocamento relativo ao Centro (onde a branca estaria)
    if (effectiveVertical) {
      // PEÇA VERTICAL (Texto 90º, lendo de baixo para cima)
      // "Abaixo" do texto visualmente significa à DIREITA dele.
      smartX = LINE_OFFSET;
      smartY = 0;
    } else {
      // PEÇA HORIZONTAL (Texto 0º, lendo da esq para dir)
      // "Abaixo" do texto visualmente significa DESCER no Y.
      smartX = 0;
      smartY = -LINE_OFFSET;
    }
  } else {
    // --- LÓGICA BRANCA (ID) ---
    // Regra: Centralizada e Auto-Fit

    // Auto-Fit (Calcula tamanho se necessário)
    if (!currentFontSize || currentFontSize === 38) {
      const availableLength = effectiveVertical ? partHeight : partWidth;
      const safeSpace = availableLength - margin * 2;
      const charWidthRatio = 0.7;
      const baseSize = 38;
      const estimatedTextWidth = text.length * (baseSize * charWidthRatio);

      if (estimatedTextWidth > safeSpace) {
        const ratio = safeSpace / estimatedTextWidth;
        finalFontSize = Math.floor(baseSize * ratio);
        if (finalFontSize < 12) finalFontSize = 12;
      } else {
        finalFontSize = 38;
      }
    }

    // Rotação: Acompanha o maior lado
    smartRotation = effectiveVertical ? 90 : 0;

    // Posição: Centro Exato
    smartX = 0;
    smartY = 0;
  }

  return {
    smartRotation,
    suggestedFontSize: finalFontSize,
    smartX,
    smartY,
  };
};
