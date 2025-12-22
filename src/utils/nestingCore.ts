/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ImportedPart } from '../components/types';

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
}

interface StrategyResult {
    placed: PlacedPart[];
    failed: string[];
    binCount: number;
    areaUsed: number;
}

const solveNesting = (
    parts: any[], 
    binWidth: number,
    binHeight: number,
    margin: number,
    gap: number,
    direction: 'vertical' | 'horizontal'
): StrategyResult => {
    const usableWidth = binWidth - (margin * 2);
    const usableHeight = binHeight - (margin * 2);
    
    // Ordenação Inteligente para minimizar sobras
    const sortedBoxes = [...parts].sort((a, b) => {
        if (direction === 'vertical') {
            if (Math.abs(b.w - a.w) > 1) return b.w - a.w; 
            return b.h - a.h;
        } else {
            if (Math.abs(b.h - a.h) > 1) return b.h - a.h;
            return b.w - a.w;
        }
    });

    const placed: PlacedPart[] = [];
    const failed: string[] = [];
    
    let binId = 0;
    let currentX = 0;
    let currentY = 0;
    let currentStripSize = 0; 

    sortedBoxes.forEach(box => {
        if (box.w > usableWidth || box.h > usableHeight) {
            failed.push(box.partId);
            return;
        }

        if (direction === 'vertical') {
            // --- ESTRATÉGIA VERTICAL ---
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
                binId: binId
            });

            currentY += box.h + gap;
            if (box.w > currentStripSize) currentStripSize = box.w;

        } else {
            // --- ESTRATÉGIA HORIZONTAL ---
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
                binId: binId
            });

            currentX += box.w + gap;
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
    direction: 'auto' | 'vertical' | 'horizontal' = 'auto'
): NestingResult => {
    
    // --- ALTERAÇÃO AQUI: DIVIDIR GAP POR 2 ---
    // Compensa a lógica do algoritmo para entregar o visual desejado
    const numGap = Number(gap) / 2; 
    // ----------------------------------------
    
    const numMargin = Number(margin);
    const usableWidth = binWidth - (numMargin * 2);
    const usableHeight = binHeight - (numMargin * 2);

    const boxes: any[] = [];
    
    parts.forEach(part => {
        const qty = quantities[part.id] ?? part.quantity ?? 1;
        
        for (let i = 0; i < qty; i++) {
            
            let dims = { w: part.width, h: part.height };
            let rotation = 0;

            if (useRotation) {
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
                uuid: `${part.id}_copy_${i}`,
                w: dims.w,
                h: dims.h,
                partId: part.id,
                originalPart: part,
                rotation: rotation
            });
        }
    });

    let resVertical: StrategyResult | null = null;
    let resHorizontal: StrategyResult | null = null;

    if (direction === 'auto' || direction === 'vertical') {
        resVertical = solveNesting(boxes, binWidth, binHeight, numMargin, numGap, 'vertical');
    }

    if (direction === 'auto' || direction === 'horizontal') {
        resHorizontal = solveNesting(boxes, binWidth, binHeight, numMargin, numGap, 'horizontal');
    }

    let winner: StrategyResult;

    if (direction === 'vertical' && resVertical) {
        winner = resVertical;
    } else if (direction === 'horizontal' && resHorizontal) {
        winner = resHorizontal;
    } else {
        const v = resVertical!;
        const h = resHorizontal!;

        if (h.binCount < v.binCount) winner = h;
        else if (v.binCount < h.binCount) winner = v;
        else {
            if (h.areaUsed > v.areaUsed) winner = h;
            else winner = v;
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