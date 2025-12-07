/* eslint-disable @typescript-eslint/no-explicit-any */
import ClipperShape from '@doodle3d/clipper-js'; 
import type { ImportedPart } from '../components/types';

// Fator de escala para precisão (Clipper trabalha com inteiros)
const SCALE = 1000; 
const ARC_TOLERANCE = 0.5; 

interface Point { X: number; Y: number; }

// --- 1. FUNÇÕES AUXILIARES ---

// Transforma um Círculo/Arco em uma lista de pontos (Polígono)
const discretizeArc = (
    cx: number, cy: number, r: number, 
    startAngle: number, endAngle: number, 
    isCircle: boolean = false
): Point[] => {
    const points: Point[] = [];
    
    // Garante sentido anti-horário positivo
    let sweep = endAngle - startAngle;
    if (sweep < 0) sweep += 2 * Math.PI;
    if (isCircle) sweep = 2 * Math.PI;

    // Calcula passos baseado na qualidade desejada
    const segments = Math.ceil(Math.abs(sweep) / (2 * Math.acos(1 - ARC_TOLERANCE / r)));
    const numSegments = Math.max(segments, 12); // Mínimo 12 segmentos para não ficar quadrado

    const step = sweep / numSegments;

    for (let i = 0; i <= numSegments; i++) {
        // Se for círculo completo, evita duplicar o último ponto
        if (isCircle && i === numSegments) break;

        const theta = startAngle + (step * i);
        points.push({
            X: Math.round((cx + r * Math.cos(theta)) * SCALE),
            Y: Math.round((cy + r * Math.sin(theta)) * SCALE)
        });
    }

    return points;
};

// --- 2. CONVERSÃO ENTIDADE -> PATH DO CLIPPER ---

const entityToPath = (ent: any): Point[] => {
    const path: Point[] = [];

    if (ent.type === 'LINE') {
        ent.vertices.forEach((v: any) => {
            path.push({ X: Math.round(v.x * SCALE), Y: Math.round(v.y * SCALE) });
        });
    }
    else if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
        if (ent.vertices) {
            ent.vertices.forEach((v: any) => {
                path.push({ X: Math.round(v.x * SCALE), Y: Math.round(v.y * SCALE) });
            });
        }
    }
    else if (ent.type === 'CIRCLE') {
        return discretizeArc(ent.center.x, ent.center.y, ent.radius, 0, 0, true);
    }
    else if (ent.type === 'ARC') {
        return discretizeArc(ent.center.x, ent.center.y, ent.radius, ent.startAngle, ent.endAngle);
    }

    return path;
};

// --- 3. FUNÇÃO PRINCIPAL: UNIFICAR E SIMPLIFICAR GEOMETRIA ---

export const convertPartToClipperShape = (part: ImportedPart): ClipperShape => {
    // 1. Coleta todos os caminhos (paths) das entidades
    const allPaths: Point[][] = [];

    part.entities.forEach(ent => {
        const path = entityToPath(ent);
        if (path.length > 0) {
            allPaths.push(path);
        }
    });

    // 2. Cria o Shape com todos os caminhos de uma vez
    // Passamos 'false' (open) inicialmente pois o DXF pode ser uma sopa de linhas.
    // O simplify vai tentar fechar e unir o que for possível.
    const shape = new ClipperShape(allPaths, false);

    // 3. Simplifica e Une (Union)
    // 'NonZero' é a regra de preenchimento padrão que lida bem com furos
    const simplified = shape.simplify('NonZero');

    return simplified;
};

// Função para converter DE VOLTA do Clipper para coordenadas de tela
export const clipperShapeToPolygons = (shape: ClipperShape): { x: number, y: number }[][] => {
    // O ClipperShape pode não ter a propriedade paths pública diretamente tipada em algumas versões,
    // mas ela existe na estrutura interna ou via método. 
    // Se der erro de tipo aqui, usaremos 'any'.
    if (!shape) return [];
    
    // Acessando paths de forma segura (dependendo da versão da lib pode ser .paths ou .toPaths())
    const paths = (shape as any).paths || []; 
    
    return paths.map((path: any[]) => {
        return path.map(pt => ({
            x: pt.X / SCALE,
            y: pt.Y / SCALE
        }));
    });
};