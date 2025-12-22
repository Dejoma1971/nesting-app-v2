/* eslint-disable @typescript-eslint/no-explicit-any */
import ClipperShape from '@doodle3d/clipper-js'; 
import type { ImportedPart } from '../components/types';

// --- CONSTANTES E TIPOS ---
const SCALE = 1000; // Fator de escala para precisão do Clipper
const ARC_TOLERANCE = 0.5; 

export interface Point { x: number; y: number; } // Padronizei para minúsculo para bater com o resto do projeto
interface EntityBox { minX: number; minY: number; maxX: number; maxY: number; area: number; }

// --- 1. ESTRUTURAS DE DADOS (UnionFind) ---
export class UnionFind {
    parent: number[];
    constructor(size: number) {
        this.parent = Array.from({ length: size }, (_, i) => i);
    }
    find(i: number): number {
        if (this.parent[i] === i) return i;
        this.parent[i] = this.find(this.parent[i]);
        return this.parent[i];
    }
    union(i: number, j: number) {
        const rootI = this.find(i);
        const rootJ = this.find(j);
        if (rootI !== rootJ) this.parent[rootI] = rootJ;
    }
}

// --- 2. MATEMÁTICA BÁSICA (Rotação, Bulge, Distância) ---

export const rotatePoint = (x: number, y: number, angleDeg: number): Point => {
    const rad = (angleDeg * Math.PI) / 180;
    return { 
        x: (x * Math.cos(rad)) - (y * Math.sin(rad)), 
        y: (x * Math.sin(rad)) + (y * Math.cos(rad)) 
    };
};

export const bulgeToArc = (p1: {x: number, y: number}, p2: {x: number, y: number}, bulge: number) => {
    const chordDx = p2.x - p1.x;
    const chordDy = p2.y - p1.y;
    const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy);
    const radius = (chordLen * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
    const cx = (p1.x + p2.x) / 2 - (chordDy * (1 - bulge * bulge)) / (4 * bulge);
    const cy = (p1.y + p2.y) / 2 + (chordDx * (1 - bulge * bulge)) / (4 * bulge);
    return { radius, cx, cy };
};

export const arePointsClose = (p1: Point, p2: Point, tolerance: number = 1.0) => {
    return Math.abs(p1.x - p2.x) < tolerance && Math.abs(p1.y - p2.y) < tolerance;
};

// --- 3. GEOMETRIA DE ENTIDADES (Conexões, Áreas) ---

export const getConnectionPoints = (ent: any): Point[] => {
    if (ent.type === 'LINE') return ent.vertices;
    if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') return ent.vertices;
    if (ent.type === 'ARC') {
        const r = ent.radius;
        const cx = ent.center.x;
        const cy = ent.center.y;
        const p1 = { x: cx + r * Math.cos(ent.startAngle), y: cy + r * Math.sin(ent.startAngle) };
        const p2 = { x: cx + r * Math.cos(ent.endAngle), y: cy + r * Math.sin(ent.endAngle) };
        return [p1, p2];
    }
    return [];
};

export const entitiesTouch = (ent1: any, ent2: any) => {
    const pts1 = getConnectionPoints(ent1);
    const pts2 = getConnectionPoints(ent2);
    for (const p1 of pts1) {
        for (const p2 of pts2) {
            if (arePointsClose(p1, p2)) return true;
        }
    }
    return false;
};

export const calculatePolygonArea = (vertices: Point[]) => {
    let area = 0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += vertices[i].x * vertices[j].y;
        area -= vertices[j].x * vertices[i].y;
    }
    return Math.abs(area) / 2;
};

export const calculatePartNetArea = (entities: any[]): number => {
    let netArea = 0;
    entities.forEach(ent => {
        if (ent.type === 'CIRCLE') {
            netArea += Math.PI * (ent.radius * ent.radius);
        }
        else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.shape) {
            netArea += calculatePolygonArea(ent.vertices);
        }
    });
    return netArea;
};

// --- 4. CÁLCULO DE BOUNDING BOX (Caixa Delimitadora) ---

export const calculateBoundingBox = (entities: any[], blocks: any = {}): EntityBox & { width: number, height: number, cx: number, cy: number } => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    const update = (x: number, y: number) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    };

    const checkArcBounds = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
        let start = startAngle % (2 * Math.PI); if (start < 0) start += 2 * Math.PI;
        let end = endAngle % (2 * Math.PI); if (end < 0) end += 2 * Math.PI;
        if (end < start) end += 2 * Math.PI;
        update(cx + r * Math.cos(startAngle), cy + r * Math.sin(startAngle));
        update(cx + r * Math.cos(endAngle), cy + r * Math.sin(endAngle));
        const cardinals = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2, 2 * Math.PI, 5 * Math.PI / 2];
        for (const ang of cardinals) { if (ang > start && ang < end) update(cx + r * Math.cos(ang), cy + r * Math.sin(ang)); }
    };

    const traverse = (ents: any[], ox = 0, oy = 0) => {
        if (!ents) return;
        ents.forEach(ent => {
            if (ent.type === 'INSERT') {
                 const block = blocks[ent.name];
                 if (block && block.entities) {
                     // Recursividade para blocos
                     traverse(block.entities, ox + (ent.position?.x || 0), oy + (ent.position?.y || 0));
                 } else {
                     update(ox + (ent.position?.x || 0), oy + (ent.position?.y || 0));
                 }
            }
            else if (ent.vertices) {
                ent.vertices.forEach((v: any, i: number) => {
                    update(v.x + ox, v.y + oy);
                    // Lógica de Bulge (Arcos em Polilinhas)
                    if (v.bulge && v.bulge !== 0) {
                        const v2 = ent.vertices[(i + 1) % ent.vertices.length];
                        if (i === ent.vertices.length - 1 && !ent.shape) return;
                        const { cx, cy, radius } = bulgeToArc(v, v2, v.bulge);
                         const startAngle = Math.atan2(v.y - cy, v.x - cx);
                        let endAngle = Math.atan2(v2.y - cy, v2.x - cx);
                        if (v.bulge > 0 && endAngle < startAngle) endAngle += 2 * Math.PI;
                        if (v.bulge < 0 && endAngle > startAngle) endAngle -= 2 * Math.PI;
                        
                        if (v.bulge < 0) checkArcBounds(cx + ox, cy + oy, radius, endAngle, startAngle);
                        else checkArcBounds(cx + ox, cy + oy, radius, startAngle, endAngle);
                    }
                });
            }
            else if (ent.type === 'CIRCLE') {
                update(ent.center.x + ox - ent.radius, ent.center.y + oy - ent.radius);
                update(ent.center.x + ox + ent.radius, ent.center.y + oy + ent.radius);
            }
            else if (ent.type === 'ARC') {
                checkArcBounds(ent.center.x + ox, ent.center.y + oy, ent.radius, ent.startAngle, ent.endAngle);
            }
        });
    };

    traverse(entities);

    if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0, area: 0, width: 0, height: 0, cx: 0, cy: 0 };
    return { 
        minX, minY, maxX, maxY, 
        area: (maxX - minX) * (maxY - minY),
        width: maxX - minX,
        height: maxY - minY,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2
    };
};

export const isContained = (inner: EntityBox, outer: EntityBox) => {
    const eps = 0.5; 
    return (inner.minX >= outer.minX - eps && inner.maxX <= outer.maxX + eps && inner.minY >= outer.minY - eps && inner.maxY <= outer.maxY + eps);
};

// --- 5. MANIPULAÇÃO DE GEOMETRIA (Flatten, Rotate Part) ---

export const flattenGeometry = (entities: any[], blocks: any, transform = { x: 0, y: 0, rotation: 0, scale: 1 }): any[] => {
    let flatEntities: any[] = [];
    if (!entities) return [];
    entities.forEach(ent => {
        if (ent.type === 'INSERT') {
            const block = blocks[ent.name];
            if (block && block.entities) {
                const newScale = transform.scale * (ent.scale?.x || 1);
                const newRotation = transform.rotation + (ent.rotation || 0);
                const rPos = rotatePoint(ent.position.x, ent.position.y, transform.rotation);
                const newX = transform.x + (rPos.x * transform.scale);
                const newY = transform.y + (rPos.y * transform.scale);
                flatEntities = flatEntities.concat(flattenGeometry(block.entities, blocks, { x: newX, y: newY, rotation: newRotation, scale: newScale }));
            }
        } else {
            const clone = JSON.parse(JSON.stringify(ent));
            const applyTrans = (x: number, y: number) => {
                const rx = x * transform.scale; 
                const ry = y * transform.scale;
                const r = rotatePoint(rx, ry, transform.rotation);
                return { x: r.x + transform.x, y: r.y + transform.y };
            };
            if (clone.type === 'LINE') {
                const p1 = applyTrans(clone.vertices[0].x, clone.vertices[0].y);
                const p2 = applyTrans(clone.vertices[1].x, clone.vertices[1].y);
                clone.vertices = [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
                flatEntities.push(clone);
            } else if (clone.type === 'LWPOLYLINE' || clone.type === 'POLYLINE') {
                if (clone.vertices) clone.vertices = clone.vertices.map((v: any) => { const p = applyTrans(v.x, v.y); return { ...v, x: p.x, y: p.y }; });
                flatEntities.push(clone);
            } else if (clone.type === 'CIRCLE' || clone.type === 'ARC') {
                const c = applyTrans(clone.center.x, clone.center.y);
                clone.center = { x: c.x, y: c.y };
                clone.radius *= transform.scale;
                if (clone.type === 'ARC') {
                    clone.startAngle += (transform.rotation * Math.PI / 180);
                    clone.endAngle += (transform.rotation * Math.PI / 180);
                }
                flatEntities.push(clone);
            }
        }
    });
    return flatEntities;
};

// --- 6. INTEGRAÇÃO COM CLIPPER (MANTIDO E MELHORADO) ---

// Transforma um Círculo/Arco em uma lista de pontos (Polígono)
const discretizeArc = (
    cx: number, cy: number, r: number, 
    startAngle: number, endAngle: number, 
    isCircle: boolean = false
): {X: number, Y: number}[] => {
    const points: {X: number, Y: number}[] = [];
    
    // Garante sentido anti-horário positivo
    let sweep = endAngle - startAngle;
    if (sweep < 0) sweep += 2 * Math.PI;
    if (isCircle) sweep = 2 * Math.PI;

    // Calcula passos baseado na qualidade desejada
    const segments = Math.ceil(Math.abs(sweep) / (2 * Math.acos(1 - ARC_TOLERANCE / r)));
    const numSegments = Math.max(segments, 24); // Mínimo 12 segmentos

    const step = sweep / numSegments;

    for (let i = 0; i <= numSegments; i++) {
        if (isCircle && i === numSegments) break;
        const theta = startAngle + (step * i);
        points.push({
            X: Math.round((cx + r * Math.cos(theta)) * SCALE),
            Y: Math.round((cy + r * Math.sin(theta)) * SCALE)
        });
    }
    return points;
};

const entityToPath = (ent: any): {X: number, Y: number}[] => {
    const path: {X: number, Y: number}[] = [];
    if (ent.type === 'LINE') {
        ent.vertices.forEach((v: any) => { path.push({ X: Math.round(v.x * SCALE), Y: Math.round(v.y * SCALE) }); });
    }
    else if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
        if (ent.vertices) {
            ent.vertices.forEach((v: any) => {
                // Lógica simples para vértices. Para suportar Bulge no Clipper, teríamos que discretizar aqui também.
                // Por enquanto mantendo simples como estava, mas idealmente usaria discretizeArc se tiver bulge.
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

export const convertPartToClipperShape = (part: ImportedPart): ClipperShape => {
    const allPaths: {X: number, Y: number}[][] = [];
    // Nota: Se a peça tiver blocos, idealmente deveríamos usar flattenGeometry antes!
    // Mas para manter compatibilidade, vamos varrer entities direto.
    part.entities.forEach(ent => {
        const path = entityToPath(ent);
        if (path.length > 0) allPaths.push(path);
    });
    const shape = new ClipperShape(allPaths, false);
    const simplified = shape.simplify('NonZero');
    return simplified;
};

export const clipperShapeToPolygons = (shape: ClipperShape): { x: number, y: number }[][] => {
    if (!shape) return [];
    const paths = (shape as any).paths || []; 
    return paths.map((path: any[]) => {
        return path.map(pt => ({
            x: pt.X / SCALE,
            y: pt.Y / SCALE
        }));
    });
};

