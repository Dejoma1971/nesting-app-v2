/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ImportedPart } from "../components/types";

export interface PlacedPart {
  partId: string;
  x: number;
  y: number;
  rotation: number;
  binId: number;
}

export interface NestingResult {
  placed: PlacedPart[];
  failed: string[];
  efficiency: number;
  totalBins: number;
}

// Interface interna para auxiliar a lógica
interface StrategyResult {
  placed: PlacedPart[];
  failed: string[];
  binCount: number;
  areaUsed: number;
}

const solveNesting = (
  parts: any[], // Lista de "boxes" já preparados
  binWidth: number,
  binHeight: number,
  margin: number,
  direction: "vertical" | "horizontal"
): StrategyResult => {
  const usableWidth = binWidth - margin * 2;
  const usableHeight = binHeight - margin * 2;

  // Se for preenchimento Horizontal (Linhas), ordenamos por Altura para alinhar melhor as linhas
  // Se for Vertical (Colunas), ordenamos por Altura também (Best Fit Descending)
  // Uma variação comum é ordenar por "Maior lado" primeiro. Vamos manter Altura Descrescente que é seguro.
  const sortedBoxes = [...parts].sort((a, b) => b.h - a.h);

  const placed: PlacedPart[] = [];
  const failed: string[] = [];

  let binId = 0;
  let currentX = 0;
  let currentY = 0;

  // Variáveis de controle de "Tira" (Strip)
  let currentStripSize = 0; // Se vertical: largura da coluna. Se horizontal: altura da linha.

  sortedBoxes.forEach((box) => {
    // Se a peça é maior que a chapa inteira, falha direto
    if (box.w > usableWidth || box.h > usableHeight) {
      failed.push(box.partId);
      return;
    }

    if (direction === "vertical") {
      // --- ESTRATÉGIA VERTICAL (COLUNAS) ---
      // Tenta colocar no Y (subindo)
      if (currentY + box.h > usableHeight) {
        // Acabou a altura, move para direita (X)
        currentX += currentStripSize;
        currentY = 0;
        currentStripSize = 0;
      }

      // Se moveu para direita e estourou a largura, Nova Chapa
      if (currentX + box.w > usableWidth) {
        binId++;
        currentX = 0;
        currentY = 0;
        currentStripSize = 0;
      }

      // Coloca a peça
      placed.push({
        partId: box.partId,
        x: currentX + margin,
        y: currentY + margin,
        rotation: box.rotation,
        binId: binId,
      });

      // Atualiza cursores
      currentY += box.h;
      if (box.w > currentStripSize) currentStripSize = box.w;
    } else {
      // --- ESTRATÉGIA HORIZONTAL (LINHAS) ---
      // Tenta colocar no X (lado a lado)
      if (currentX + box.w > usableWidth) {
        // Acabou a largura, desce para nova linha (Y)
        currentX = 0;
        currentY += currentStripSize;
        currentStripSize = 0;
      }

      // Se desceu e estourou a altura, Nova Chapa
      if (currentY + box.h > usableHeight) {
        binId++;
        currentX = 0;
        currentY = 0;
        currentStripSize = 0;
      }

      // Coloca a peça
      placed.push({
        partId: box.partId,
        x: currentX + margin,
        y: currentY + margin,
        rotation: box.rotation,
        binId: binId,
      });

      // Atualiza cursores
      currentX += box.w;
      if (box.h > currentStripSize) currentStripSize = box.h;
    }
  });

  // Calcula área ocupada real (apenas para critério de desempate)
  let usedArea = 0;
  placed.forEach((p) => {
    const originalBox = parts.find((b) => b.partId === p.partId);
    if (originalBox)
      usedArea +=
        originalBox.originalPart.width * originalBox.originalPart.height;
  });

  return {
    placed,
    failed,
    binCount: binId + 1,
    areaUsed: usedArea,
  };
};

export const runRectangularNesting = (
  parts: ImportedPart[],
  quantities: { [key: string]: number },
  gap: number,
  margin: number,
  binWidth: number,
  binHeight: number,
  useRotation: boolean = true
): NestingResult => {
  const numGap = Number(gap);
  const numMargin = Number(margin);
  const usableWidth = binWidth - numMargin * 2;
  const usableHeight = binHeight - numMargin * 2;

  // 1. Prepara as Caixas (Boxes) com base na quantidade
  const boxes: any[] = [];
  parts.forEach((part) => {
    const qty = quantities[part.id] || 0;
    for (let i = 0; i < qty; i++) {
      // Define dimensões iniciais
      let dims = { w: part.width, h: part.height };
      let rotation = 0;

      if (useRotation) {
        // ROTAÇÃO INTELIGENTE:
        // Se a peça não cabe "em pé" na largura disponível, mas cabe "deitada", gira.
        // Isso ajuda muito em chapas estreitas (1200mm).
        const fitsNormally =
          part.width <= usableWidth && part.height <= usableHeight;
        const fitsRotated =
          part.height <= usableWidth && part.width <= usableHeight;

        // Prioridade 1: Obrigatoriedade Física
        if (!fitsNormally && fitsRotated) {
          rotation = 90;
          dims = { w: part.height, h: part.width };
        }
        // Prioridade 2: Otimização de Encaixe
        // Se a peça for "comprida" e a chapa for "comprida" no outro sentido, tenta alinhar.
        else if (usableWidth < usableHeight && part.width > part.height) {
          // Chapa Vertical (3000 altura), Peça Horizontal -> Gira para acompanhar
          rotation = 90;
          dims = { w: part.height, h: part.width };
        }
      }

      boxes.push({
        w: dims.w + numGap,
        h: dims.h + numGap,
        partId: part.id,
        originalPart: part,
        rotation: rotation,
      });
    }
  });

  // 2. COMPETIÇÃO DE ESTRATÉGIAS
  // Roda o cálculo duas vezes: uma tentando preencher colunas, outra tentando preencher linhas.

  const resVertical = solveNesting(
    boxes,
    binWidth,
    binHeight,
    numMargin,
    "vertical"
  );
  const resHorizontal = solveNesting(
    boxes,
    binWidth,
    binHeight,
    numMargin,
    "horizontal"
  );

  // 3. Escolhe o Vencedor
  // Critério: Quem colocou mais peças? Se empate, quem usou menos chapas?

  let winner = resVertical;

  if (resHorizontal.placed.length > resVertical.placed.length) {
    winner = resHorizontal;
  } else if (resHorizontal.placed.length === resVertical.placed.length) {
    // Empate de peças: ganha quem usou MENOS chapas
    if (resHorizontal.binCount < resVertical.binCount) {
      winner = resHorizontal;
    }
  }

  // Calcula eficiência final baseada no vencedor
  const totalBinArea = winner.binCount * binWidth * binHeight;
  const efficiency = totalBinArea > 0 ? winner.areaUsed / totalBinArea : 0;

  return {
    placed: winner.placed,
    failed: winner.failed,
    efficiency,
    totalBins: winner.binCount,
  };
};
