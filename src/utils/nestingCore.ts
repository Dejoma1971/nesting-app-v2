/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ImportedPart } from '../components/types';

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
    direction: 'vertical' | 'horizontal'
): StrategyResult => {
    const usableWidth = binWidth - (margin * 2);
    const usableHeight = binHeight - (margin * 2);
    
    // Ordenação por Altura Descrescente (Padrão Best Fit)
    const sortedBoxes = [...parts].sort((a, b) => b.h - a.h);

    const placed: PlacedPart[] = [];
    const failed: string[] = [];
    
    let binId = 0;
    let currentX = 0;
    let currentY = 0;
    
    // Variável de controle da "Tira" (Strip)
    let currentStripSize = 0; 

    sortedBoxes.forEach(box => {
        if (box.w > usableWidth || box.h > usableHeight) {
            failed.push(box.partId);
            return;
        }

        if (direction === 'vertical') {
            // --- ESTRATÉGIA VERTICAL (Preenche Y, depois avança X) ---
            if (currentY + box.h > usableHeight) {
                currentX += currentStripSize;
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
                partId: box.partId,
                x: currentX + margin,
                y: currentY + margin,
                rotation: box.rotation,
                binId: binId
            });

            currentY += box.h;
            if (box.w > currentStripSize) currentStripSize = box.w;

        } else {
            // --- ESTRATÉGIA HORIZONTAL (Preenche X, depois avança Y) ---
            if (currentX + box.w > usableWidth) {
                currentX = 0;
                currentY += currentStripSize;
                currentStripSize = 0;
            }

            if (currentY + box.h > usableHeight) {
                binId++;
                currentX = 0;
                currentY = 0;
                currentStripSize = 0;
            }

            placed.push({
                partId: box.partId,
                x: currentX + margin,
                y: currentY + margin,
                rotation: box.rotation,
                binId: binId
            });

            currentX += box.w;
            if (box.h > currentStripSize) currentStripSize = box.h;
        }
    });

    let usedArea = 0;
    placed.forEach(p => {
        const originalBox = parts.find(b => b.partId === p.partId);
        if (originalBox) usedArea += (originalBox.originalPart.width * originalBox.originalPart.height);
    });

    return {
        placed,
        failed,
        binCount: binId + 1,
        areaUsed: usedArea
    };
};

export const runRectangularNesting = (
    parts: ImportedPart[], 
    quantities: { [key: string]: number },
    gap: number,
    margin: number,
    binWidth: number,
    binHeight: number,
    useRotation: boolean = true,
    direction: 'auto' | 'vertical' | 'horizontal' = 'auto' // <--- NOVO PARÂMETRO
): NestingResult => {
    
    const numGap = Number(gap);
    const numMargin = Number(margin);
    const usableWidth = binWidth - (numMargin * 2);
    const usableHeight = binHeight - (numMargin * 2);

    // 1. Preparação das Caixas
    const boxes: any[] = [];
    parts.forEach(part => {
        const qty = quantities[part.id] || 0;
        for (let i = 0; i < qty; i++) {
            
            let dims = { w: part.width, h: part.height };
            let rotation = 0;

            if (useRotation) {
                // Rotação Inteligente (Mantida)
                const fitsNormally = part.width <= usableWidth && part.height <= usableHeight;
                const fitsRotated = part.height <= usableWidth && part.width <= usableHeight;

                if (!fitsNormally && fitsRotated) {
                    rotation = 90;
                    dims = { w: part.height, h: part.width };
                }
                else if (usableWidth < usableHeight && part.width > part.height) {
                    rotation = 90;
                    dims = { w: part.height, h: part.width };
                }
            }

            boxes.push({
                w: dims.w + numGap,  
                h: dims.h + numGap, 
                partId: part.id,
                originalPart: part,
                rotation: rotation
            });
        }
    });

    // 2. Execução Baseada na Direção Escolhida
    let resVertical: StrategyResult | null = null;
    let resHorizontal: StrategyResult | null = null;

    // Se for Auto ou Vertical, calcula Vertical
    if (direction === 'auto' || direction === 'vertical') {
        resVertical = solveNesting(boxes, binWidth, binHeight, numMargin, 'vertical');
    }

    // Se for Auto ou Horizontal, calcula Horizontal
    if (direction === 'auto' || direction === 'horizontal') {
        resHorizontal = solveNesting(boxes, binWidth, binHeight, numMargin, 'horizontal');
    }

    // 3. Escolha do Vencedor
    let winner: StrategyResult;

    if (direction === 'vertical' && resVertical) {
        winner = resVertical;
    } else if (direction === 'horizontal' && resHorizontal) {
        winner = resHorizontal;
    } else {
        // MODO AUTO: Competição (Quem colocou mais peças? Quem usou menos chapas?)
        // (Garantimos que resVertical e resHorizontal existem aqui pois direction é auto)
        const v = resVertical!;
        const h = resHorizontal!;

        if (h.placed.length > v.placed.length) {
            winner = h;
        } else if (h.placed.length === v.placed.length) {
            if (h.binCount < v.binCount) winner = h;
            else winner = v;
        } else {
            winner = v;
        }
    }

    const totalBinArea = winner.binCount * binWidth * binHeight;
    const efficiency = totalBinArea > 0 ? winner.areaUsed / totalBinArea : 0;

    return {
        placed: winner.placed,
        failed: winner.failed,
        efficiency,
        totalBins: winner.binCount
    };
};