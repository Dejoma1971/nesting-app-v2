/* eslint-disable @typescript-eslint/no-explicit-any */
import { runRectangularNesting } from '../utils/nestingCore';

// Escuta mensagens vindas da Interface Principal
self.onmessage = (e: MessageEvent) => {
    const { parts, quantities, gap, margin, binWidth, binHeight, iterations } = e.data;

    console.log('Worker: Iniciando cálculo...');

    // SIMULAÇÃO DE ALGORITMO GENÉTICO (Monte Carlo Simplificado)
    // Vamos rodar o nesting várias vezes tentando ordens diferentes
    // e retornar o melhor resultado encontrado.

    let bestResult: any = null;
    let bestEfficiency = -1;

    // Se iterations for 1, roda só uma vez (modo rápido).
    // Se for maior, embaralha as peças para tentar achar encaixes melhores.
    const loops = iterations || 1;

    for (let i = 0; i < loops; i++) {
        
        // Clona e embaralha a ordem das peças (exceto no primeiro loop)
        const currentParts = [...parts];
        if (i > 0) {
            currentParts.sort(() => Math.random() - 0.5);
        }

        const result = runRectangularNesting(
            currentParts, 
            quantities, 
            gap, 
            margin, 
            binWidth, 
            binHeight, 
            true // Ativa Rotação
        );

        // O melhor resultado é aquele que coloca mais peças (menos falhas)
        // e tem maior eficiência de ocupação.
        const score = (result.placed.length * 1000) + result.efficiency;
        const bestScore = bestResult ? (bestResult.placed.length * 1000) + bestResult.efficiency : -1;

        if (score > bestScore) {
            bestResult = result;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            bestEfficiency = score;
        }
    }

    // Devolve o melhor resultado para a tela
    self.postMessage(bestResult);
};

export {};