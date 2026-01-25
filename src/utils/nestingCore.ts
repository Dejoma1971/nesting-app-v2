/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ImportedPart } from "../components/types";
export type { ImportedPart };

export interface PlacedPart {
  uuid: string;
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
  density: number;
}

interface StrategyResult {
  placed: PlacedPart[];
  failed: string[];
  binCount: number;
  areaUsed: number;
  globalBoundingBoxArea: number; // <--- CORREÇÃO: Área ocupada em TODAS as chapas
}

// --- HELPER: Calcula Bounding Box de UMA Chapa ---
const calculateBinBoundingBox = (placedInBin: PlacedPart[], parts: any[]) => {
  if (placedInBin.length === 0) return 0;
  let maxX = 0;
  let maxY = 0;

  placedInBin.forEach((p) => {
    const part = parts.find((b) => b.partId === p.partId);
    if (part) {
      const isRotated = Math.abs(p.rotation) % 180 !== 0;
      const effW = isRotated ? part.h : part.w;
      const effH = isRotated ? part.w : part.h;

      const right = p.x + effW;
      const bottom = p.y + effH;
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    }
  });

  return maxX * maxY;
};

// --- HELPER: Calcula Densidade Global (Soma dos Boxes de todas as chapas) ---
const calculateGlobalBoundingBox = (
  placed: PlacedPart[],
  parts: any[],
  totalBins: number
) => {
  let totalOccupiedArea = 0;

  for (let i = 0; i < totalBins; i++) {
    const binParts = placed.filter((p) => p.binId === i);
    totalOccupiedArea += calculateBinBoundingBox(binParts, parts);
  }

  return totalOccupiedArea;
};

// --- ALGORITMO DE PREENCHIMENTO (Strip Packing) ---
const solveNesting = (
  boxes: any[],
  binWidth: number,
  binHeight: number,
  margin: number,
  gap: number,
  direction: "vertical" | "horizontal"
): StrategyResult => {
  const usableWidth = binWidth - margin * 2;
  const usableHeight = binHeight - margin * 2;

  const sortedBoxes = [...boxes].sort((a, b) => {
    if (direction === "vertical") {
      if (Math.abs(b.w - a.w) > 0.1) return b.w - a.w;
      return b.h - a.h;
    } else {
      if (Math.abs(b.h - a.h) > 0.1) return b.h - a.h;
      return b.w - a.w;
    }
  });

  const placed: PlacedPart[] = [];
  const failed: string[] = [];

  let binId = 0;
  let currentX = 0;
  let currentY = 0;
  let currentStripSize = 0;

  sortedBoxes.forEach((box) => {
    if (box.w > usableWidth || box.h > usableHeight) {
      failed.push(box.partId);
      return;
    }

    if (direction === "vertical") {
      // Colunas
      if (currentY + box.h > usableHeight) {
        currentX += currentStripSize + gap;
        currentY = 0;
        currentStripSize = 0;
      }
      if (currentX + box.w > usableWidth) {
        binId++;
        currentX = 0;
        currentY = 0;
        currentStripSize = 0;
      }
      placed.push({
        uuid: box.uuid,
        partId: box.partId,
        x: currentX + margin,
        y: currentY + margin,
        rotation: box.rotation,
        binId: binId,
      });
      currentY += box.h + gap;
      if (box.w > currentStripSize) currentStripSize = box.w;
    } else {
      // Linhas
      if (currentX + box.w > usableWidth) {
        currentX = 0;
        currentY += currentStripSize + gap;
        currentStripSize = 0;
      }
      if (currentY + box.h > usableHeight) {
        binId++;
        currentX = 0;
        currentY = 0;
        currentStripSize = 0;
      }
      placed.push({
        uuid: box.uuid,
        partId: box.partId,
        x: currentX + margin,
        y: currentY + margin,
        rotation: box.rotation,
        binId: binId,
      });
      currentX += box.w + gap;
      if (box.h > currentStripSize) currentStripSize = box.h;
    }
  });

  // Métricas
  let areaUsed = 0;
  placed.forEach((p) => {
    const originalBox = boxes.find((b) => b.uuid === p.uuid);
    if (originalBox) areaUsed += originalBox.w * originalBox.h;
  });

  const binCount = binId + 1;
  // CORREÇÃO: Calcula o box ocupado somando todas as chapas
  const globalBoundingBoxArea = calculateGlobalBoundingBox(
    placed,
    boxes,
    binCount
  );

  return {
    placed,
    failed,
    binCount,
    areaUsed,
    globalBoundingBoxArea,
  };
};

// --- OTIMIZADOR DE ROTAÇÃO ---
const prepareOptimizedBoxes = (
  parts: ImportedPart[],
  quantities: { [key: string]: number },
  containerSize: number,
  optimizeFor: "width" | "height"
) => {
  const boxes: any[] = [];

  parts.forEach((part) => {
    const qty = quantities[part.id] ?? part.quantity ?? 1;

    const dimNormal = optimizeFor === "width" ? part.width : part.height;
    const dimRotated = optimizeFor === "width" ? part.height : part.width;

    const fitNormal = Math.floor(containerSize / dimNormal);
    const fitRotated = Math.floor(containerSize / dimRotated);

    let finalW = part.width;
    let finalH = part.height;
    let rotation = 0;

    // --- ALTERAÇÃO AQUI: RESPEITAR O CADEADO ---
    // A lógica original era: if (fitRotated > fitNormal)
    // A nova lógica é: Só entra no if se NÃO estiver travada

    if (!part.isRotationLocked && fitRotated > fitNormal) {
      finalW = part.height;
      finalH = part.width;
      rotation = 90;
    }
    // -------------------------------------------

    if (fitRotated > fitNormal) {
      finalW = part.height;
      finalH = part.width;
      rotation = 90;
    }

    for (let i = 0; i < qty; i++) {
      boxes.push({
        uuid: `${part.id}_copy_${i}`,
        w: finalW,
        h: finalH,
        partId: part.id,
        originalPart: part,
        rotation: rotation,
      });
    }
  });

  return boxes;
};

// --- FUNÇÃO PRINCIPAL ---
export const runGuillotineNesting = (
  parts: ImportedPart[],
  quantities: { [key: string]: number },
  binWidth: number,
  binHeight: number,
  direction: "vertical" | "horizontal" | "auto"
): NestingResult => {
  const gap = 0;
  const numMargin = 0;
  const usableWidth = binWidth; // Sem margem
  const usableHeight = binHeight; // Sem margem

  // 1. Simulações
  const boxesVertical = prepareOptimizedBoxes(
    parts,
    quantities,
    usableHeight,
    "height"
  );
  const resVertical = solveNesting(
    boxesVertical,
    binWidth,
    binHeight,
    numMargin,
    gap,
    "vertical"
  );

  const boxesHorizontal = prepareOptimizedBoxes(
    parts,
    quantities,
    usableWidth,
    "width"
  );
  const resHorizontal = solveNesting(
    boxesHorizontal,
    binWidth,
    binHeight,
    numMargin,
    gap,
    "horizontal"
  );

  // 2. Competição
  let winner: StrategyResult;
  let winningMode = "";

  if (direction === "vertical") {
    winner = resVertical;
  } else if (direction === "horizontal") {
    winner = resHorizontal;
  } else {
    // AUTO

    // Critério 1: Quantidade de Peças (Entrega da Produção)
    if (resHorizontal.placed.length > resVertical.placed.length) {
      winner = resHorizontal;
      winningMode = "Horizontal (Mais Peças)";
    } else if (resVertical.placed.length > resHorizontal.placed.length) {
      winner = resVertical;
      winningMode = "Vertical (Mais Peças)";
    } else {
      // Critério 2: Menor Número de Chapas (Custo)
      if (resHorizontal.binCount < resVertical.binCount) {
        winner = resHorizontal;
        winningMode = "Horizontal (Menos Chapas)";
      } else if (resVertical.binCount < resHorizontal.binCount) {
        winner = resVertical;
        winningMode = "Vertical (Menos Chapas)";
      } else {
        // Critério 3: Densidade / Compactação (Sobra Útil)
        // Usamos globalBoundingBoxArea: quanto MENOR a área ocupada do box, MAIOR a sobra livre.
        // Portanto, densidade = areaUsed / globalBox. Quanto MAIOR a densidade, melhor.

        const densityH =
          resHorizontal.areaUsed / (resHorizontal.globalBoundingBoxArea || 1);
        const densityV =
          resVertical.areaUsed / (resVertical.globalBoundingBoxArea || 1);

        if (densityH >= densityV) {
          winner = resHorizontal;
          winningMode = "Horizontal (Melhor Sobra)";
        } else {
          winner = resVertical;
          winningMode = "Vertical (Melhor Sobra)";
        }
      }
    }
    console.log(`🏆 Vencedor Auto: ${winningMode}`);
  }

  const totalBinArea = winner.binCount * binWidth * binHeight;
  const efficiency = totalBinArea > 0 ? winner.areaUsed / totalBinArea : 0;
  const density =
    winner.globalBoundingBoxArea > 0
      ? winner.areaUsed / winner.globalBoundingBoxArea
      : 0;

  return {
    placed: winner.placed,
    failed: winner.failed,
    efficiency,
    totalBins: winner.binCount,
    density,
  };
};
