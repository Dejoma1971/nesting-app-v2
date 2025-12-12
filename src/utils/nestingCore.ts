/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ImportedPart } from '../components/types';

// --- INTERFACE ATUALIZADA ---
export interface PlacedPart {
    uuid: string;   // <--- NOVO: Identificador único da instância (ex: "id_original_0")
    partId: string; // ID da peça original (para buscar geometria)
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
    direction: 'vertical' | 'horizontal'
): StrategyResult => {
    const usableWidth = binWidth - (margin * 2);
    const usableHeight = binHeight - (margin * 2);
    
    // Ordenação por Altura (Best Fit Decreasing Height)
    const sortedBoxes = [...parts].sort((a, b) => b.h - a.h);

    const placed: PlacedPart[] = [];
    const failed: string[] = [];
    
    let binId = 0;
    let currentX = 0;
    let currentY = 0;
    let currentStripSize = 0; 

    sortedBoxes.forEach(box => {
        // Verifica se cabe na chapa (sem rotação adicional, pois box já vem dimensionado)
        if (box.w > usableWidth || box.h > usableHeight) {
            failed.push(box.partId);
            return;
        }

        if (direction === 'vertical') {
            // ESTRATÉGIA VERTICAL
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
                uuid: box.uuid, // <--- Repassa o ID único
                partId: box.partId,
                x: currentX + margin,
                y: currentY + margin,
                rotation: box.rotation,
                binId: binId
            });

            currentY += box.h;
            if (box.w > currentStripSize) currentStripSize = box.w;

        } else {
            // ESTRATÉGIA HORIZONTAL
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
                uuid: box.uuid, // <--- Repassa o ID único
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
        const originalBox = parts.find(b => b.partId === p.partId); // Busca pela ref original
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
    
    const numGap = Number(gap);
    const numMargin = Number(margin);
    const usableWidth = binWidth - (numMargin * 2);
    const usableHeight = binHeight - (numMargin * 2);

    // 1. Preparação das Caixas (Explosão das Quantidades)
    const boxes: any[] = [];
    
    parts.forEach(part => {
        // Prioridade: 1. Quantidade definida no Nesting > 2. Quantidade padrão da peça > 3. Mínimo 1
        const qty = quantities[part.id] ?? part.quantity ?? 1;
        
        for (let i = 0; i < qty; i++) {
            
            let dims = { w: part.width, h: part.height };
            let rotation = 0;

            if (useRotation) {
                const fitsNormally = part.width <= usableWidth && part.height <= usableHeight;
                const fitsRotated = part.height <= usableWidth && part.width <= usableHeight;

                // Rotaciona se não couber normal, ou se for melhor para a proporção da chapa
                if (!fitsNormally && fitsRotated) {
                    rotation = 90;
                    dims = { w: part.height, h: part.width };
                }
                else if (usableWidth < usableHeight && part.width > part.height) {
                    // Se a chapa é vertical e a peça é horizontal -> vira
                    rotation = 90;
                    dims = { w: part.height, h: part.width };
                }
            }

            boxes.push({
                uuid: `${part.id}_copy_${i}`, // <--- CRIAÇÃO DO ID ÚNICO
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

    if (direction === 'auto' || direction === 'vertical') {
        resVertical = solveNesting(boxes, binWidth, binHeight, numMargin, 'vertical');
    }

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
        const v = resVertical!;
        const h = resHorizontal!;

        // Critério: Quem coloca mais peças -> Quem usa menos chapas -> Quem gasta menos Y
        if (h.placed.length > v.placed.length) {
            winner = h;
        } else if (v.placed.length > h.placed.length) {
            winner = v;
        } else {
            // Empate na quantidade de peças, vence quem usar menos chapas
            if (h.binCount < v.binCount) winner = h;
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