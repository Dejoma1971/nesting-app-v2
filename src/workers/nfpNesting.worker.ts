/// <reference lib="webworker" />

/* eslint-disable no-var */
/* eslint-disable @typescript-eslint/no-explicit-any */

importScripts('/workers/clipper.js');

declare var ClipperLib: any;

// Escala interna monstruosa para garantir precisão booleana perfeita (Padrão Jack Qiao)
const NFP_SCALE = 10000000; 

// --- 1. AUXILIARES DE GEOMETRIA (Mini GeometryUtil) ---

function toClipperPath(polygon: any[]) {
    return polygon.map(p => ({
        X: Math.round(p.x * NFP_SCALE),
        Y: Math.round(p.y * NFP_SCALE)
    }));
}

function fromClipperPath(path: any[]) {
    return path.map(p => ({
        x: p.X / NFP_SCALE,
        y: p.Y / NFP_SCALE
    }));
}

function getPolygonArea(polygon: any[]) {
    let area = 0;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        area += (polygon[j].x + polygon[i].x) * (polygon[j].y - polygon[i].y);
    }
    return 0.5 * area;
}

// Rotaciona um polígono (necessário para testar ângulos diferentes)
function rotatePolygon(polygon: any[], angle: number) {
    if (angle === 0) return JSON.parse(JSON.stringify(polygon));
    
    const rad = angle * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    
    return polygon.map(p => ({
        x: p.x * cos - p.y * sin,
        y: p.x * sin + p.y * cos
    }));
}

// --- 2. O CORAÇÃO DO NFP (Minkowski Difference) ---

function minkowskiDifference(A: any[], B: any[]) {
    // 1. Converte para Clipper com Alta Precisão
    const Ac = toClipperPath(A);
    const Bc = toClipperPath(B);
    
    // 2. Inverte B (Negativo) para simular o "deslizamento" ao redor de A
    // Isso é a base matemática da Diferença de Minkowski
    for (let i = 0; i < Bc.length; i++) {
        Bc[i].X *= -1;
        Bc[i].Y *= -1;
    }

    // 3. Executa a Soma de Minkowski via Clipper
    const solution = ClipperLib.Clipper.MinkowskiSum(Ac, Bc, true);
    
    // 4. Encontra o maior contorno (o NFP externo principal)
    let clipperNfp: any = null;
    let largestArea = null;

    for (let i = 0; i < solution.length; i++) {
        const poly = fromClipperPath(solution[i]);
        const area = getPolygonArea(poly);
        
        // Queremos a maior área (o contorno externo do NFP)
        if (largestArea === null || Math.abs(area) > Math.abs(largestArea)) {
            clipperNfp = poly;
            largestArea = area;
        }
    }

    if (!clipperNfp) return null;

    // 5. Ajuste de Offset
    for(let i=0; i<clipperNfp.length; i++){
        clipperNfp[i].x += B[0].x; // Restaura a posição original relativa
        clipperNfp[i].y += B[0].y;
    }

    return [clipperNfp];
}

// --- 3. NFP PARA FUROS (Part-in-Part) ---

function generateInnerNFP(_hole: any[], _part: any[]) {
    // "Usa" as variáveis para enganar o Linter estrito sem causar efeitos colaterais
    void _hole;
    void _part;

    // SIMPLIFICAÇÃO V1: Focamos no NFP Externo por enquanto.
    // Futuramente implementaremos a lógica "slide inside" aqui.
    return null; 
}

// --- 4. GESTOR DE MENSAGENS ---

const ctx: Worker = self as any;

ctx.onmessage = (event) => {
    const { type, pair } = event.data;

    if (type === 'CALCULATE_NFP') {
        try {
            const { A, B, rotationA, rotationB, inside } = pair;
            
            // Aplica rotações solicitadas
            const rotA = rotatePolygon(A, rotationA);
            const rotB = rotatePolygon(B, rotationB);

            let nfp;

            if (inside) {
                // Tentar encaixar B dentro de A (Furo)
                nfp = generateInnerNFP(rotA, rotB);
            } else {
                // Encaixar B ao redor de A (Padrão)
                nfp = minkowskiDifference(rotA, rotB);
            }

            if (nfp && nfp.length > 0) {
                ctx.postMessage({
                    type: 'NFP_RESULT',
                    key: JSON.stringify({ A_id: pair.A_id, B_id: pair.B_id, rotA: rotationA, rotB: rotationB }),
                    nfp: nfp[0] // Retorna o primeiro (maior) NFP
                });
            } else {
                ctx.postMessage({ type: 'NFP_ERROR', message: 'NFP nulo ou inválido' });
            }

        } catch (err: any) {
            ctx.postMessage({ type: 'ERROR', message: err.message });
        }
    }
};