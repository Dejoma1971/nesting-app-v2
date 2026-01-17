/* eslint-disable @typescript-eslint/no-explicit-any */

// Tipos auxiliares
type Point = { x: number; y: number };
type InsertData = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // Em graus
};

// --- FUNÇÕES MATEMÁTICAS AUXILIARES ---

// Normaliza ângulo para 0-2PI
const normalizeAngle = (angle: number): number => {
  let a = angle % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a;
};

// Calcula pontos de um segmento de arco definido por Bulge (DXF Polyline)
// Retorna uma lista de pontos intermediários (sem incluir p1, mas incluindo p2 se necessário)
const getBulgeCurvePoints = (
  p1: Point,
  p2: Point,
  bulge: number,
  resolution: number = 16
): Point[] => {
  if (bulge === 0) return [];

  const dist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

  // Se a distância for muito pequena, ignora curva
  if (dist < 0.0001) return [];

  const radius = ((dist / 2) * (1 + bulge * bulge)) / (2 * Math.abs(bulge));

  // Cálculo do Centro do Arco usando vetores
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;

  // Vetor perpendicular à corda
  const perpX = -(p2.y - p1.y);
  const perpY = p2.x - p1.x;
  const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);

  // Distância do ponto médio até o centro
  const distMidToCenter = ((dist / 2) * (1 - bulge * bulge)) / (2 * bulge);

  const cx = midX + (perpX / perpLen) * distMidToCenter;
  const cy = midY + (perpY / perpLen) * distMidToCenter;

  const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
  const endAngle = Math.atan2(p2.y - cy, p2.x - cx);

  const points: Point[] = [];

  let totalAngle = endAngle - startAngle;
  // Ajuste de voltas completas
  if (bulge > 0 && totalAngle < 0) totalAngle += 2 * Math.PI;
  if (bulge < 0 && totalAngle > 0) totalAngle -= 2 * Math.PI;

  for (let i = 1; i <= resolution; i++) {
    const t = i / resolution;
    const a = startAngle + t * totalAngle;
    points.push({
      x: cx + radius * Math.cos(a),
      y: cy + radius * Math.sin(a),
    });
  }

  return points;
};

// Calcula um ponto em uma Elipse
const getEllipsePoint = (
  cx: number,
  cy: number,
  majorX: number,
  majorY: number,
  ratio: number,
  t: number
): Point => {
  const majorLen = Math.sqrt(majorX * majorX + majorY * majorY);
  const minorLen = majorLen * ratio;
  const rotAngle = Math.atan2(majorY, majorX);
  const xLocal = majorLen * Math.cos(t);
  const yLocal = minorLen * Math.sin(t);
  const xRotated = xLocal * Math.cos(rotAngle) - yLocal * Math.sin(rotAngle);
  const yRotated = xLocal * Math.sin(rotAngle) + yLocal * Math.cos(rotAngle);
  return { x: cx + xRotated, y: cy + yRotated };
};

// Interpolação Spline (B-Spline)
const interpolateSpline = (
  controlPoints: Point[],
  degree: number,
  knots: number[],
  segments: number
): Point[] => {
  const points: Point[] = [];
  if (!controlPoints || controlPoints.length < degree + 1)
    return controlPoints || [];
  let k = knots;
  if (!k || k.length === 0) {
    k = [];
    for (let i = 0; i < controlPoints.length + degree + 1; i++) k.push(i);
  }
  const domainStart = k[degree];
  const domainEnd = k[k.length - 1 - degree];

  for (let j = 0; j <= segments; j++) {
    const t = domainStart + (j / segments) * (domainEnd - domainStart);
    let i = degree;
    while (i < k.length - degree - 2 && t >= k[i + 1]) i++;
    const d = [...controlPoints];
    const v: Point[] = [];
    for (let idx = 0; idx <= degree; idx++) {
      v[idx] = d[i - degree + idx] || { x: 0, y: 0 };
    }
    for (let r = 1; r <= degree; r++) {
      for (let jj = degree; jj >= r; jj--) {
        const alpha =
          (t - k[i - degree + jj]) /
          (k[i + 1 + jj - r] - k[i - degree + jj] || 1);
        const x = (1 - alpha) * v[jj - 1].x + alpha * v[jj].x;
        const y = (1 - alpha) * v[jj - 1].y + alpha * v[jj].y;
        v[jj] = { x, y };
      }
    }
    points.push(v[degree]);
  }
  return points;
};

// --- FUNÇÕES DE TRANSFORMAÇÃO ---

const transformPoint = (p: Point, t: InsertData): Point => {
  // 1. Escala
  const x1 = p.x * t.scaleX;
  const y1 = p.y * t.scaleY;
  // 2. Rotação
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const x2 = x1 * cos - y1 * sin;
  const y2 = x1 * sin + y1 * cos;
  // 3. Translação
  return { x: x2 + t.x, y: y2 + t.y };
};

/**
 * Função recursiva que "explode" os blocos e converte curvas complexas
 */
export const explodeDXFGeometry = (
  entities: any[],
  blocksRecord: Record<string, any>
): any[] => {
  const result: any[] = [];

  for (const ent of entities) {
    // --- CASO 1: BLOCOS (INSERT) ---
    if (ent.type === "INSERT") {
      const blockName = ent.name || ent.block;
      const blockData = blocksRecord[blockName];

      if (!blockData || !blockData.entities) continue;

      const transform: InsertData = {
        x: ent.x || ent.position?.x || 0,
        y: ent.y || ent.position?.y || 0,
        scaleX: ent.xScale || ent.scale?.x || 1,
        scaleY: ent.yScale || ent.scale?.y || 1,
        rotation: ent.rotation || 0,
      };

      if (ent.yScale === undefined && ent.scale?.y === undefined) {
        transform.scaleY = transform.scaleX;
      }

      // CORREÇÃO DE BASE POINT
      const basePoint = {
        x: blockData.position?.x || blockData.origin?.x || 0,
        y: blockData.position?.y || blockData.origin?.y || 0,
        z: blockData.position?.z || blockData.origin?.z || 0,
      };

      const transformedChildren: any[] = [];

      for (const child of blockData.entities) {
        // Clona e aplica o offset negativo do Base Point IMEDIATAMENTE
        const clone = JSON.parse(JSON.stringify(child));

        // Aplica correção de offset em primitivas
        if (clone.type === "LINE") {
          clone.vertices[0].x -= basePoint.x;
          clone.vertices[0].y -= basePoint.y;
          clone.vertices[1].x -= basePoint.x;
          clone.vertices[1].y -= basePoint.y;
        } else if (clone.type === "LWPOLYLINE" || clone.type === "POLYLINE") {
          clone.vertices.forEach((v: any) => {
            v.x -= basePoint.x;
            v.y -= basePoint.y;
          });
        } else if (
          clone.type === "CIRCLE" ||
          clone.type === "ARC" ||
          clone.type === "ELLIPSE"
        ) {
          clone.center.x -= basePoint.x;
          clone.center.y -= basePoint.y;
        } else if (clone.type === "INSERT") {
          // Se for bloco aninhado, ajusta sua posição de inserção
          if (clone.x !== undefined) clone.x -= basePoint.x;
          if (clone.y !== undefined) clone.y -= basePoint.y;
          if (clone.position) {
            clone.position.x -= basePoint.x;
            clone.position.y -= basePoint.y;
          }
        } else if (clone.type === "SPLINE") {
          if (clone.controlPoints) {
            clone.controlPoints.forEach((cp: any) => {
              cp.x -= basePoint.x;
              cp.y -= basePoint.y;
            });
          }
          if (clone.fitPoints) {
            clone.fitPoints.forEach((fp: any) => {
              fp.x -= basePoint.x;
              fp.y -= basePoint.y;
            });
          }
        }

        // Processa geometria (aplica matriz e converte arcos distorcidos)
        const processed = processEntityGeometry(clone, transform);
        transformedChildren.push(processed);
      }

      // Recursão para blocos aninhados
      result.push(...explodeDXFGeometry(transformedChildren, blocksRecord));
    }
    // --- CASO 2: ENTIDADES SOLTAS ---
    else {
      const identity: InsertData = {
        x: 0,
        y: 0,
        scaleX: 1,
        scaleY: 1,
        rotation: 0,
      };
      const processed = processEntityGeometry(ent, identity);
      result.push(processed);
    }
  }

  return result;
};

// --- FUNÇÃO CENTRAL DE PROCESSAMENTO GEOMÉTRICO ---
const processEntityGeometry = (ent: any, t: InsertData): any => {
  const clone = JSON.parse(JSON.stringify(ent));

  // Detecção de Escala Não-Uniforme (Distorção)
  const isNonUniform =
    Math.abs(Math.abs(t.scaleX) - Math.abs(t.scaleY)) > 0.001;
  const isMirrored = t.scaleX * t.scaleY < 0;

  // 1. LINHAS
  if (clone.type === "LINE") {
    const p1 = transformPoint(
      { x: clone.vertices[0].x, y: clone.vertices[0].y },
      t
    );
    const p2 = transformPoint(
      { x: clone.vertices[1].x, y: clone.vertices[1].y },
      t
    );
    clone.vertices = [
      { x: p1.x, y: p1.y },
      { x: p2.x, y: p2.y },
    ];
  }

  // 2. POLILINHAS
  else if (clone.type === "LWPOLYLINE" || clone.type === "POLYLINE") {
    // CASO ESPECIAL: Escala não-uniforme quebra a matemática do "bulge"
    if (
      isNonUniform &&
      clone.vertices.some((v: any) => v.bulge && v.bulge !== 0)
    ) {
      const newVerts: Point[] = []; // Alterado para const

      for (let i = 0; i < clone.vertices.length; i++) {
        const curr = clone.vertices[i];
        const next = clone.vertices[(i + 1) % clone.vertices.length];

        newVerts.push({ x: curr.x, y: curr.y });

        if (curr.bulge && (clone.closed || i < clone.vertices.length - 1)) {
          const curvePoints = getBulgeCurvePoints(
            { x: curr.x, y: curr.y },
            { x: next.x, y: next.y },
            curr.bulge
          );
          newVerts.push(...curvePoints);
        }
      }

      const transformedVerts = newVerts.map((v) => transformPoint(v, t));

      return {
        type: "LWPOLYLINE",
        vertices: transformedVerts,
        closed: clone.closed || false,
      };
    }

    // CASO PADRÃO
    else {
      clone.vertices = clone.vertices.map((v: any) => {
        const p = transformPoint({ x: v.x, y: v.y }, t);
        const newBulge = isMirrored && v.bulge ? -v.bulge : v.bulge;
        return { ...v, x: p.x, y: p.y, bulge: newBulge };
      });
    }
  }

  // 3. CÍRCULOS
  else if (clone.type === "CIRCLE") {
    if (isNonUniform) {
      const segments = 64;
      const verts: Point[] = [];
      for (let i = 0; i < segments; i++) {
        const ang = (i / segments) * 2 * Math.PI;
        const px = clone.center.x + clone.radius * Math.cos(ang);
        const py = clone.center.y + clone.radius * Math.sin(ang);
        verts.push(transformPoint({ x: px, y: py }, t));
      }
      return {
        type: "LWPOLYLINE",
        vertices: verts,
        closed: true,
      };
    }

    const c = transformPoint({ x: clone.center.x, y: clone.center.y }, t);
    clone.center = { x: c.x, y: c.y };
    clone.radius *= Math.abs(t.scaleX);
  }

  // 4. ARCOS
  else if (clone.type === "ARC") {
    if (isNonUniform) {
      const segments = 32;
      const start = clone.startAngle; // Alterado para const
      let end = clone.endAngle;
      if (end < start) end += 2 * Math.PI;

      const verts: Point[] = [];
      const total = end - start;

      for (let i = 0; i <= segments; i++) {
        const ang = start + (i / segments) * total;
        const px = clone.center.x + clone.radius * Math.cos(ang);
        const py = clone.center.y + clone.radius * Math.sin(ang);
        verts.push(transformPoint({ x: px, y: py }, t));
      }
      return {
        type: "LWPOLYLINE",
        vertices: verts,
        closed: false,
      };
    }

    const c = transformPoint({ x: clone.center.x, y: clone.center.y }, t);
    clone.center = { x: c.x, y: c.y };
    const r = clone.radius;
    clone.radius *= Math.abs(t.scaleX);

    const startX = r * Math.cos(clone.startAngle);
    const startY = r * Math.sin(clone.startAngle);
    const endX = r * Math.cos(clone.endAngle);
    const endY = r * Math.sin(clone.endAngle);

    const vStart = transformPoint(
      { x: startX, y: startY },
      { ...t, x: 0, y: 0 }
    );
    const vEnd = transformPoint({ x: endX, y: endY }, { ...t, x: 0, y: 0 });

    const ang1 = normalizeAngle(Math.atan2(vStart.y, vStart.x));
    const ang2 = normalizeAngle(Math.atan2(vEnd.y, vEnd.x));

    if (isMirrored) {
      clone.startAngle = ang2;
      clone.endAngle = ang1;
    } else {
      clone.startAngle = ang1;
      clone.endAngle = ang2;
    }
  }

  // 5. SPLINE -> LWPOLYLINE
  else if (clone.type === "SPLINE") {
    let points: Point[] = [];
    if (clone.fitPoints && clone.fitPoints.length > 0) {
      points = clone.fitPoints.map((fp: any) => ({ x: fp.x, y: fp.y }));
    } else {
      const segments = (clone.controlPoints.length || 2) * 20;
      points = interpolateSpline(
        clone.controlPoints,
        clone.degreeOfSplineCurve || 3,
        clone.knotValues,
        segments
      );
    }
    const transformedVerts = points.map((p) => transformPoint(p, t));
    return {
      type: "LWPOLYLINE",
      vertices: transformedVerts,
      closed: clone.closed || false,
    };
  }

  // 6. ELIPSE -> LWPOLYLINE
  else if (clone.type === "ELLIPSE") {
    const segments = 64;
    const startAngle = clone.startAngle || 0;
    let endAngle = clone.endAngle;
    if (endAngle === undefined) endAngle = 2 * Math.PI;
    if (endAngle < startAngle) endAngle += 2 * Math.PI;

    const verts: any[] = [];
    const totalAngle = endAngle - startAngle;

    for (let i = 0; i <= segments; i++) {
      const tParam = startAngle + (i / segments) * totalAngle;
      const pLocal = getEllipsePoint(
        clone.center.x,
        clone.center.y,
        clone.majorAxisEndPoint.x,
        clone.majorAxisEndPoint.y,
        clone.axisRatio,
        tParam
      );
      const pGlobal = transformPoint(pLocal, t);
      verts.push({ x: pGlobal.x, y: pGlobal.y });
    }

    return {
      type: "LWPOLYLINE",
      vertices: verts,
      closed: Math.abs(totalAngle - 2 * Math.PI) < 0.01,
    };
  }

  return clone;
};
