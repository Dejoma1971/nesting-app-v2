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
}

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
    const usableWidth = binWidth - (numMargin * 2);
    const usableHeight = binHeight - (numMargin * 2);

    const boxes: any[] = [];
    
    parts.forEach(part => {
        const qty = quantities[part.id] || 0;
        for (let i = 0; i < qty; i++) {
            
            let rotation = 0;
            // Aqui definimos as dimensões iniciais
            let dims = { w: part.width, h: part.height };

            if (useRotation) {
                // LÓGICA DE ROTAÇÃO SIMPLIFICADA (Sem função externa)
                // Se a peça for mais alta que a chapa (1200mm) e couber deitada, gira 90°.
                if (part.height > usableHeight && part.width <= usableHeight) {
                     rotation = 90;
                     // Inverte largura com altura manualmente aqui
                     dims = { w: part.height, h: part.width };
                } 
            }

            boxes.push({
                w: dims.w + numGap,  
                h: dims.h + numGap, 
                partId: part.id,
                originalPart: part,
                area: part.grossArea,
                rotation: rotation
            });
        }
    });

    // Ordenar por ALTURA (do maior para o menor)
    boxes.sort((a, b) => b.h - a.h);

    const placed: PlacedPart[] = [];
    const failed: string[] = [];

    let currentX = 0;
    let currentY = 0;
    let currentColumnWidth = 0;

    boxes.forEach(box => {
        // Verifica altura
        if (currentY + box.h > usableHeight) {
            currentX += currentColumnWidth;
            currentY = 0;
            currentColumnWidth = 0;
        }

        // Verifica largura
        if (currentX + box.w > usableWidth) {
            failed.push(box.partId);
        } else {
            placed.push({
                partId: box.partId,
                x: currentX + numMargin,
                y: currentY + numMargin,
                rotation: box.rotation,
                binId: 0
            });

            currentY += box.h;
            if (box.w > currentColumnWidth) currentColumnWidth = box.w;
        }
    });

    // Calcula eficiência
    let usedArea = 0;
    boxes.forEach(b => { 
        if (!failed.includes(b.partId)) usedArea += (b.w * b.h);
    });
    
    return {
        placed,
        failed,
        efficiency: usedArea / (binWidth * binHeight)
    };
};