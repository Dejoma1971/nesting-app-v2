/* eslint-disable @typescript-eslint/no-explicit-any */
import { runRectangularNesting } from '../utils/nestingCore';

interface WorkerMessage {
    parts: any[];
    quantities: { [key: string]: number };
    gap: number;
    margin: number;
    binWidth: number;
    binHeight: number;
    iterations: number;
    strategy: 'rect' | 'true-shape';
    rotationStep: number;
    direction: 'auto' | 'vertical' | 'horizontal'; // <--- NOVO PARÂMETRO
}

self.onmessage = async (e: MessageEvent) => {
    const params = e.data as WorkerMessage;
    const { iterations, parts, direction } = params;

    console.log(`Worker: Calculando... Direção: ${direction}`);

    let bestResult: any = null;
    let bestScore = -1;

    const loops = iterations || 1;
    
    for (let i = 0; i < loops; i++) {
        const currentParts = [...parts];
        if (i > 0) currentParts.sort(() => Math.random() - 0.5);

        const result = runRectangularNesting(
            currentParts, 
            params.quantities, 
            params.gap, 
            params.margin, 
            params.binWidth, 
            params.binHeight, 
            true, // Rotação 90 graus
            direction // <--- REPASSANDO A DIREÇÃO
        );

        const score = (result.placed.length * 1000000) + result.efficiency;
        
        if (score > bestScore) {
            bestResult = result;
            bestScore = score;
        }
    }

    self.postMessage(bestResult);
};

export {};