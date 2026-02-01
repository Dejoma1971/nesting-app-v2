/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Interface para os pontos de snap
 */
export interface SnapPoint {
  x: number;
  y: number;
  // ⬇️ --- [ALTERAÇÃO] Adicione 'quadrant' e 'midpoint' --- ⬇️
  type: 'endpoint' | 'center' | 'quadrant' | 'midpoint' | 'perpendicular';
  // ⬆️ --------------------------------------------------- ⬆️
}

/**
 * Extrai pontos estratégicos (vértices e centros) de um array de entidades
 * para serem usados como alvos magnéticos.
 */
export const getSnapPoints = (entities: any[]): SnapPoint[] => {
  const points: SnapPoint[] = [];

  entities.forEach((ent) => {
    switch (ent.type) {
      case "LINE":
        if (ent.vertices) {
          const v1 = ent.vertices[0];
          const v2 = ent.vertices[1];
          
          // Pontas (Já existia)
          points.push({ x: v1.x, y: v1.y, type: 'endpoint' });
          points.push({ x: v2.x, y: v2.y, type: 'endpoint' });

          // ⬇️ --- [NOVO] Ponto Médio da Linha --- ⬇️
          points.push({
            x: (v1.x + v2.x) / 2,
            y: (v1.y + v2.y) / 2,
            type: 'midpoint'
          });
          // ⬆️ ----------------------------------- ⬆️
        }
        break;

      case "LWPOLYLINE":
      case "POLYLINE":
        if (ent.vertices) {
          ent.vertices.forEach((v: any) => {
            points.push({ x: v.x, y: v.y, type: "endpoint" });
          });
        }
        break;

      case "CIRCLE":
      case "ARC":
        if (ent.center) {
          // Mantém o Centro
          points.push({ x: ent.center.x, y: ent.center.y, type: "center" });

          const r = ent.radius;
          const c = ent.center;

          // ⬇️ --- [NOVO] Se for Círculo: Adiciona os 4 Quadrantes --- ⬇️
          if (ent.type === "CIRCLE") {
            points.push({ x: c.x + r, y: c.y, type: "quadrant" }); // 0° (Direita)
            points.push({ x: c.x, y: c.y + r, type: "quadrant" }); // 90° (Cima)
            points.push({ x: c.x - r, y: c.y, type: "quadrant" }); // 180° (Esquerda)
            points.push({ x: c.x, y: c.y - r, type: "quadrant" }); // 270° (Baixo)
          }
          // ⬆️ ------------------------------------------------------- ⬆️
        }

        // Lógica específica para ARCOS
        if (ent.type === "ARC") {
          const r = ent.radius;
          const c = ent.center;
          const start = ent.startAngle;
          let end = ent.endAngle;

          // Pontas do arco (Já existia)
          const x1 = c.x + r * Math.cos(start);
          const y1 = c.y + r * Math.sin(start);
          const x2 = c.x + r * Math.cos(end);
          const y2 = c.y + r * Math.sin(end);
          points.push({ x: x1, y: y1, type: "endpoint" });
          points.push({ x: x2, y: y2, type: "endpoint" });

          // ⬇️ --- [NOVO] Ponto Médio do Arco (O "Pico") --- ⬇️
          // Ajuste para arcos que cruzam o zero (ex: 350° a 10°)
          if (end < start) {
            end += Math.PI * 2;
          }
          const midAngle = (start + end) / 2;

          points.push({
            x: c.x + r * Math.cos(midAngle),
            y: c.y + r * Math.sin(midAngle),
            type: "midpoint",
          });
          // ⬆️ --------------------------------------------- ⬆️
        }
        break;
    }
  });

  // Remove duplicatas exatas para otimizar a busca futura
  return points.filter(
    (v, i, a) => a.findIndex((t) => t.x === v.x && t.y === v.y) === i,
  );
};

// ⬇️ --- [NOVA FUNÇÃO] Calcula projeção perpendicular dinâmica --- ⬇️
export const getPerpendicularSnaps = (
  entities: any[], 
  refPoint: { x: number, y: number }
): SnapPoint[] => {
  const perpPoints: SnapPoint[] = [];

  entities.forEach(ent => {
    // Focaremos em LINHAS (Para polilinhas seria necessário iterar segmentos)
    if (ent.type === "LINE" && ent.vertices) {
      const v1 = ent.vertices[0];
      const v2 = ent.vertices[1];

      // Cálculo vetorial da projeção
      const A = v1;
      const B = v2;
      const P = refPoint;

      const ABx = B.x - A.x;
      const ABy = B.y - A.y;
      const APx = P.x - A.x;
      const APy = P.y - A.y;

      // Fator de projeção (t)
      // t = (AP . AB) / (AB . AB)
      const ab2 = ABx * ABx + ABy * ABy;
      if (ab2 === 0) return; // Linha de comprimento zero
      const t = (APx * ABx + APy * ABy) / ab2;

      // Se 0 <= t <= 1, a projeção cai DENTRO do segmento de linha
      if (t > 0 && t < 1) {
        perpPoints.push({
          x: A.x + t * ABx,
          y: A.y + t * ABy,
          type: 'perpendicular'
        });
      }
    }
  });

  return perpPoints;
};
// ⬆️ ----------------------------------------------------------- ⬆️

/**
 * Encontra o ponto de snap mais próximo da posição atual do mouse
 */
export const findNearestSnapPoint = (
  mouseX: number,
  mouseY: number,
  snapPoints: SnapPoint[],
  threshold: number,
): SnapPoint | null => {
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
