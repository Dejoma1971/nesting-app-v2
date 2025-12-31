// src/utils/guillotineCollision.ts

import type { PlacedPart } from './nestingCore';
import type { ImportedPart } from '../components/types';

interface Rect {
    x: number;
    y: number;
    w: number;
    h: number;
}

// Helper para pegar as dimensões reais considerando rotação de 90 graus (padrão guilhotina)
const getRect = (placed: PlacedPart, part: ImportedPart): Rect => {
    // Na guilhotina, a rotação é sempre 0 ou 90 (não existem ângulos quebrados como 45)
    // Mas para garantir, usamos a lógica de inversão de eixos simples
    const isRotated = Math.abs(placed.rotation) % 180 !== 0;
    
    return {
        x: placed.x,
        y: placed.y,
        w: isRotated ? part.height : part.width,
        h: isRotated ? part.width : part.height
    };
};

// Verifica se dois retângulos se sobrepõem
const doRectsOverlap = (r1: Rect, r2: Rect): boolean => {
    return !(
        r2.x >= r1.x + r1.w ||  // r2 está totalmente à direita de r1
        r2.x + r2.w <= r1.x ||  // r2 está totalmente à esquerda de r1
        r2.y >= r1.y + r1.h ||  // r2 está totalmente abaixo de r1
        r2.y + r2.h <= r1.y     // r2 está totalmente acima de r1
    );
};

export const checkGuillotineCollisions = (
    placedParts: PlacedPart[],
    allParts: ImportedPart[],
    binWidth: number,
    binHeight: number
): string[] => {
    const collisions: Set<string> = new Set();
    const rectsCache = new Map<string, Rect>();

    // 1. Pré-calcula os retângulos para performance
    placedParts.forEach(p => {
        const original = allParts.find(op => op.id === p.partId);
        if (original) {
            rectsCache.set(p.uuid, getRect(p, original));
        }
    });

    // 2. Loop de verificação
    for (let i = 0; i < placedParts.length; i++) {
        const p1 = placedParts[i];
        const r1 = rectsCache.get(p1.uuid);
        if (!r1) continue;

        // Verifica se saiu da chapa (Colisão com borda)
        // Nota: Guilhotina não usa margem, então limites são 0 e binSize
        if (r1.x < -0.01 || r1.y < -0.01 || 
            (r1.x + r1.w) > binWidth + 0.01 || 
            (r1.y + r1.h) > binHeight + 0.01) {
            collisions.add(p1.uuid);
        }

        // Verifica colisão com outras peças
        for (let j = i + 1; j < placedParts.length; j++) {
            const p2 = placedParts[j];
            const r2 = rectsCache.get(p2.uuid);

            if (r2 && doRectsOverlap(r1, r2)) {
                collisions.add(p1.uuid);
                collisions.add(p2.uuid);
            }
        }
    }

    return Array.from(collisions);
};