import type { ImportedPart } from "../components/types";
import type { PlacedPart } from "./nestingCore";

const toRad = (deg: number) => (deg * Math.PI) / 180;

interface Point { x: number; y: number; }

// --- 1. CONVERTER ENTIDADES DA PEÇA EM UM POLÍGONO ---
const getTransformedPolygon = (part: ImportedPart, placed: PlacedPart): Point[] => {
    const points: Point[] = [];
    
    part.entities.forEach(ent => {
        if (ent.type === 'LINE' || ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
            if (ent.vertices) {
                ent.vertices.forEach((v: { x: number; y: number }) => points.push({ x: v.x, y: v.y }));
            }
        }
        else if (ent.type === 'CIRCLE' || ent.type === 'ARC') {
             const r = ent.radius;
             const c = ent.center;
             // Cria um quadrado envolvente simples para o círculo
             points.push({ x: c.x - r, y: c.y - r });
             points.push({ x: c.x + r, y: c.y + r });
             points.push({ x: c.x - r, y: c.y + r });
             points.push({ x: c.x + r, y: c.y - r });
        }
    });

    if (points.length === 0) {
        points.push({ x: 0, y: 0 });
        points.push({ x: part.width, y: 0 });
        points.push({ x: part.width, y: part.height });
        points.push({ x: 0, y: part.height });
    }

    // Calcula Bounding Box Local para achar o centro
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    points.forEach(p => {
        if(p.x < minX) minX = p.x; if(p.x > maxX) maxX = p.x;
        if(p.y < minY) minY = p.y; if(p.y > maxY) maxY = p.y;
    });
    const w = maxX - minX;
    const h = maxY - minY;
    const localCenterX = minX + w / 2;
    const localCenterY = minY + h / 2;

    const angleRad = toRad(placed.rotation);
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);

    const occupiedW = placed.rotation % 180 !== 0 ? h : w;
    const occupiedH = placed.rotation % 180 !== 0 ? w : h;
    
    const worldCenterX = placed.x + occupiedW / 2;
    const worldCenterY = placed.y + occupiedH / 2;

    return points.map(p => {
        const lx = p.x - localCenterX;
        const ly = p.y - localCenterY;
        const rx = lx * cos - ly * sin;
        const ry = lx * sin + ly * cos;
        return { x: rx + worldCenterX, y: ry + worldCenterY };
    });
};

const isPointInPolygon = (p: Point, polygon: Point[]) => {
    let isInside = false;
    let minX = polygon[0].x, maxX = polygon[0].x;
    let minY = polygon[0].y, maxY = polygon[0].y;
    
    for (let n = 1; n < polygon.length; n++) {
        const q = polygon[n];
        minX = Math.min(q.x, minX); maxX = Math.max(q.x, maxX);
        minY = Math.min(q.y, minY); maxY = Math.max(q.y, maxY);
    }
    if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) return false;

    let i = 0, j = polygon.length - 1;
    for (; i < polygon.length; j = i++) {
        if ( (polygon[i].y > p.y) !== (polygon[j].y > p.y) &&
             p.x < (polygon[j].x - polygon[i].x) * (p.y - polygon[i].y) / (polygon[j].y - polygon[i].y) + polygon[i].x ) {
            isInside = !isInside;
        }
    }
    return isInside;
};

const doLineSegmentsIntersect = (p1: Point, p2: Point, q1: Point, q2: Point): boolean => {
    const subtract = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
    const crossProduct = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
    const r = subtract(p2, p1);
    const s = subtract(q2, q1);
    const rxs = crossProduct(r, s);
    const qpxr = crossProduct(subtract(q1, p1), r);
    if (rxs === 0 && qpxr === 0) return false; 
    if (rxs === 0 && qpxr !== 0) return false; 
    const t = crossProduct(subtract(q1, p1), s) / rxs;
    const u = crossProduct(subtract(q1, p1), r) / rxs;
    return (t >= 0 && t <= 1 && u >= 0 && u <= 1);
};

// --- FUNÇÃO PRINCIPAL ---
// Agora aceita dimensões da mesa e margem
export const detectCollisions = (
    placedParts: PlacedPart[], 
    partsData: ImportedPart[],
    binWidth: number,
    binHeight: number,
    margin: number
): string[] => {
    
    const collidingIds: string[] = [];
    const partPolygons = new Map<string, Point[]>();

    // Pré-calcula polígonos
    placedParts.forEach(placed => {
        const data = partsData.find(p => p.id === placed.partId);
        if (data) {
            partPolygons.set(placed.uuid, getTransformedPolygon(data, placed));
        }
    });

    // --- 1. VERIFICAÇÃO DE FRONTEIRA (NOVO) ---
    // Verifica se a peça sai da área de corte (Width/Height - Margem)
    const minSafeX = margin;
    const maxSafeX = binWidth - margin;
    const minSafeY = margin;
    const maxSafeY = binHeight - margin;

    placedParts.forEach(placed => {
        const poly = partPolygons.get(placed.uuid);
        if (!poly) return;

        let isOutOfBounds = false;
        
        // Verifica cada vértice do polígono da peça
        for (const p of poly) {
            // Se o ponto for menor que a margem esquerda/inferior
            // OU maior que a margem direita/superior
            // Tolerância pequena (0.01) para erros de float
            if (p.x < minSafeX - 0.01 || p.x > maxSafeX + 0.01 || 
                p.y < minSafeY - 0.01 || p.y > maxSafeY + 0.01) {
                isOutOfBounds = true;
                break;
            }
        }

        if (isOutOfBounds) {
            if (!collidingIds.includes(placed.uuid)) collidingIds.push(placed.uuid);
        }
    });

    // --- 2. VERIFICAÇÃO PEÇA X PEÇA (EXISTENTE) ---
    for (let i = 0; i < placedParts.length; i++) {
        for (let j = i + 1; j < placedParts.length; j++) {
            const pA = placedParts[i];
            const pB = placedParts[j];
            
            // Se ambos já estão marcados como colisão (por estarem fora da mesa), não precisa testar intersecção pesada
            if (collidingIds.includes(pA.uuid) && collidingIds.includes(pB.uuid)) continue;

            const polyA = partPolygons.get(pA.uuid);
            const polyB = partPolygons.get(pB.uuid);

            if (!polyA || !polyB) continue;

            let collision = false;
            // Bounding Box Rápido
            const getBounds = (poly: Point[]) => {
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                poly.forEach(p => { if(p.x < minX) minX = p.x; if(p.x > maxX) maxX = p.x; if(p.y < minY) minY = p.y; if(p.y > maxY) maxY = p.y; });
                return { minX, maxX, minY, maxY };
            };
            const boxA = getBounds(polyA); const boxB = getBounds(polyB);

            if (boxA.maxX < boxB.minX || boxA.minX > boxB.maxX || boxA.maxY < boxB.minY || boxA.minY > boxB.maxY) {
                collision = false;
            } else {
                // SAT/Interseção
                for (let a = 0; a < polyA.length; a++) {
                    const p1 = polyA[a]; const p2 = polyA[(a + 1) % polyA.length];
                    for (let b = 0; b < polyB.length; b++) {
                        const q1 = polyB[b]; const q2 = polyB[(b + 1) % polyB.length];
                        if (doLineSegmentsIntersect(p1, p2, q1, q2)) { collision = true; break; }
                    }
                    if (collision) break;
                }
                if (!collision) {
                    if (isPointInPolygon(polyA[0], polyB) || isPointInPolygon(polyB[0], polyA)) collision = true;
                }
            }

            if (collision) {
                if (!collidingIds.includes(pA.uuid)) collidingIds.push(pA.uuid);
                if (!collidingIds.includes(pB.uuid)) collidingIds.push(pB.uuid);
            }
        }
    }

    return collidingIds;
};