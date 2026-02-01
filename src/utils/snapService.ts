/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SnapPoint {
  x: number;
  y: number;
  type: 'endpoint' | 'center' | 'quadrant' | 'midpoint' | 'perpendicular';
}

/**
 * Auxiliar para rotacionar pontos dentro de blocos girados
 */
const rotatePoint = (x: number, y: number, angleDeg: number) => {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: x * Math.cos(rad) - y * Math.sin(rad),
    y: x * Math.sin(rad) + y * Math.cos(rad)
  };
};

/**
 * Extrai pontos estratégicos incluindo suporte a Blocos (INSERT)
 */
export const getSnapPoints = (entities: any[], blocks?: any): SnapPoint[] => {
  const points: SnapPoint[] = [];

  entities.forEach((ent) => {
    // TRATAMENTO DE BLOCO (Recursivo)
    if (ent.type === "INSERT" && blocks) {
      const blockDef = blocks[ent.name];
      if (blockDef?.entities) {
        const subPoints = getSnapPoints(blockDef.entities, blocks);
        const angle = ent.rotation || 0;
        const pos = ent.position || { x: 0, y: 0 };

        subPoints.forEach(p => {
          const rotated = rotatePoint(p.x, p.y, angle);
          points.push({
            x: rotated.x + pos.x,
            y: rotated.y + pos.y,
            type: p.type
          });
        });
      }
      return;
    }

    // GEOMETRIA SIMPLES
    switch (ent.type) {
      case "LINE":
        if (ent.vertices?.length >= 2) {
          const [v1, v2] = ent.vertices;
          points.push({ x: v1.x, y: v1.y, type: 'endpoint' });
          points.push({ x: v2.x, y: v2.y, type: 'endpoint' });
          points.push({ x: (v1.x + v2.x) / 2, y: (v1.y + v2.y) / 2, type: 'midpoint' });
        }
        break;

      case "LWPOLYLINE":
      case "POLYLINE":
        ent.vertices?.forEach((v: any) => points.push({ x: v.x, y: v.y, type: "endpoint" }));
        break;

      case "CIRCLE":
      case "ARC":
        if (ent.center) {
          const { x: cx, y: cy } = ent.center;
          const r = ent.radius;

          // 1. Centro (Sempre presente)
          points.push({ x: cx, y: cy, type: "center" });

          if (ent.type === "CIRCLE") {
            // 2. Quadrantes para Círculos
            points.push({ x: cx + r, y: cy, type: "quadrant" });
            points.push({ x: cx - r, y: cy, type: "quadrant" });
            points.push({ x: cx, y: cy + r, type: "quadrant" });
            points.push({ x: cx, y: cy - r, type: "quadrant" });
          } else {
            // 3. Extremidades para Arcos
            const x1 = cx + r * Math.cos(ent.startAngle);
            const y1 = cy + r * Math.sin(ent.startAngle);
            const x2 = cx + r * Math.cos(ent.endAngle);
            const y2 = cy + r * Math.sin(ent.endAngle);
            points.push({ x: x1, y: y1, type: "endpoint" });
            points.push({ x: x2, y: y2, type: "endpoint" });
            
            // Ponto médio do arco para facilitar a medição
            const start = ent.startAngle;
            let end = ent.endAngle;
            if (end < start) end += Math.PI * 2;
            const mid = (start + end) / 2;
            points.push({ x: cx + r * Math.cos(mid), y: cy + r * Math.sin(mid), type: "midpoint" });
          }
        }
        break;
    }
  });

  return points.filter((v, i, a) => a.findIndex((t) => Math.abs(t.x - v.x) < 0.001 && Math.abs(t.y - v.y) < 0.001) === i);
};

/**
 * Calcula projeção perpendicular dinâmica com suporte a blocos
 */
export const getPerpendicularSnaps = (entities: any[], refPoint: { x: number, y: number }, blocks?: any): SnapPoint[] => {
  const perpPoints: SnapPoint[] = [];

  entities.forEach(ent => {
    if (ent.type === "INSERT" && blocks) {
      const blockDef = blocks[ent.name];
      if (blockDef?.entities) {
        const angle = ent.rotation || 0;
        const pos = ent.position || { x: 0, y: 0 };
        const dx = refPoint.x - pos.x;
        const dy = refPoint.y - pos.y;
        const localRef = rotatePoint(dx, dy, -angle);

        const subPerps = getPerpendicularSnaps(blockDef.entities, localRef, blocks);
        subPerps.forEach(p => {
          const rotated = rotatePoint(p.x, p.y, angle);
          perpPoints.push({ x: rotated.x + pos.x, y: rotated.y + pos.y, type: 'perpendicular' });
        });
      }
    }

    if (ent.type === "LINE" && ent.vertices?.length >= 2) {
      const [A, B] = ent.vertices;
      const ABx = B.x - A.x;
      const ABy = B.y - A.y;
      const APx = refPoint.x - A.x;
      const APy = refPoint.y - A.y;
      const ab2 = ABx * ABx + ABy * ABy;
      if (ab2 === 0) return;
      const t = (APx * ABx + APy * ABy) / ab2;
      if (t > 0 && t < 1) {
        perpPoints.push({ x: A.x + t * ABx, y: A.y + t * ABy, type: 'perpendicular' });
      }
    }
  });

  return perpPoints;
};

/**
 * Encontra o ponto de snap mais próximo
 */
export const findNearestSnapPoint = (mouseX: number, mouseY: number, snapPoints: SnapPoint[], threshold: number): SnapPoint | null => {
  let closest: SnapPoint | null = null;
  let minDistance = threshold;

  for (const point of snapPoints) {
    const dx = mouseX - point.x;
    const dy = mouseY - point.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < minDistance) {
      minDistance = distance;
      closest = point;
    }
  }
  return closest;
};