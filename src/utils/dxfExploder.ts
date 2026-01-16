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

// --- FUNÇÕES MATEMÁTICAS AUXILIARES (SPLINE E ELIPSE) ---

// Normaliza ângulo para 0-2PI
const normalizeAngle = (angle: number): number => {
  let a = angle % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a;
};

// Calcula um ponto em uma Elipse dado o parâmetro t (em radianos)
const getEllipsePoint = (
  cx: number,
  cy: number,
  majorX: number,
  majorY: number,
  ratio: number,
  t: number
): Point => {
  // Cálculo do eixo menor baseado no vetor do eixo maior
  const majorLen = Math.sqrt(majorX * majorX + majorY * majorY);
  const minorLen = majorLen * ratio;

  // Ângulo de rotação da elipse
  const rotAngle = Math.atan2(majorY, majorX);

  // Paramétrica padrão sem rotação
  const xLocal = majorLen * Math.cos(t);
  const yLocal = minorLen * Math.sin(t);

  // Aplica rotação da elipse
  const xRotated = xLocal * Math.cos(rotAngle) - yLocal * Math.sin(rotAngle);
  const yRotated = xLocal * Math.sin(rotAngle) + yLocal * Math.cos(rotAngle);

  return {
    x: cx + xRotated,
    y: cy + yRotated,
  };
};

// Função simples para interpolação B-Spline (De Boor simplificado)
// Converte Spline em pontos discretos
const interpolateSpline = (
  controlPoints: Point[],
  degree: number,
  knots: number[],
  segments: number
): Point[] => {
  const points: Point[] = [];

  // Se não houver knots suficientes ou controle, retorna os pontos de controle (fallback simples)
  if (!controlPoints || controlPoints.length < degree + 1)
    return controlPoints || [];

  // Se knots não forem fornecidos, gera vetor de nós uniforme (comum em DXFs simples)
  let k = knots;
  if (!k || k.length === 0) {
    k = [];
    for (let i = 0; i < controlPoints.length + degree + 1; i++) k.push(i);
  }

  // Define o domínio t [start, end]
  const domainStart = k[degree];
  const domainEnd = k[k.length - 1 - degree];

  for (let j = 0; j <= segments; j++) {
    const t = domainStart + (j / segments) * (domainEnd - domainStart);

    // De Boor's Algorithm
    // Copia os pontos de controle relevantes para calcular este t
    // Otimização: para um t, apenas (degree + 1) pontos de controle influenciam
    // Para simplificar a implementação aqui, vamos usar uma versão básica iterativa
    // Nota: Implementação completa de NURBS é pesada. Esta é uma aproximação cúbica.

    // Encontra o span do knot (índice i tal que k[i] <= t < k[i+1])
    let i = degree;
    while (i < k.length - degree - 2 && t >= k[i + 1]) i++;

    const d = [...controlPoints]; // Clone
    // Algoritmo iterativo
    const v: Point[] = [];
    for (let idx = 0; idx <= degree; idx++) {
      v[idx] = d[i - degree + idx] || { x: 0, y: 0 };
    }

    for (let r = 1; r <= degree; r++) {
      for (let j = degree; j >= r; j--) {
        const alpha =
          (t - k[i - degree + j]) / (k[i + 1 + j - r] - k[i - degree + j] || 1); // Evita div por 0
        const x = (1 - alpha) * v[j - 1].x + alpha * v[j].x;
        const y = (1 - alpha) * v[j - 1].y + alpha * v[j].y;
        v[j] = { x, y };
      }
    }

    points.push(v[degree]);
  }

  return points;
};

// --- FUNÇÕES DE TRANSFORMAÇÃO ---

/**
 * Aplica a Matriz de Transformação (Escala -> Rotação -> Translação)
 */
const transformPoint = (p: Point, t: InsertData): Point => {
  // 1. Escala (Resolve o espelhamento X=-1)
  const x1 = p.x * t.scaleX;
  const y1 = p.y * t.scaleY;

  // 2. Rotação
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  const x2 = x1 * cos - y1 * sin;
  const y2 = x1 * sin + y1 * cos;

  // 3. Translação
  return {
    x: x2 + t.x,
    y: y2 + t.y,
  };
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

      // Achata os resultados (pois applyTransformation pode retornar array se converter Spline)
      // Mas aqui vamos simplificar: chamamos explode de novo nos filhos já transformados
      // A função applyTransformationToEntity abaixo retorna 1 entidade alterada OU precisamos lidar com conversão de tipo.
      // Estratégia melhor: Explodir recursivamente e tratar as geometrias resultantes.

      // Pequeno ajuste: vamos usar uma função auxiliar para aplicar a matriz
      // em vez de repetir a lógica dentro do map.
      const transformedChildren: any[] = [];

      for (const child of blockData.entities) {
        // Clona
        const clone = JSON.parse(JSON.stringify(child));
        // Transforma e converte (pode virar LWPOLYLINE se for Spline)
        const processed = processEntityGeometry(clone, transform);
        transformedChildren.push(processed);
      }

      result.push(...explodeDXFGeometry(transformedChildren, blocksRecord));
    }
    // --- CASO 2: ENTIDADES SOLTAS (GEOMETRIA PURA) ---
    else {
      // Se não é insert, aplicamos transformação identidade (apenas para processar Splines/Elipses soltas)
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
// Aplica transformação E converte curvas complexas (Spline/Ellipse) em Polilinhas
const processEntityGeometry = (ent: any, t: InsertData): any => {
  const clone = JSON.parse(JSON.stringify(ent));

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
    const isMirrored = t.scaleX * t.scaleY < 0;
    clone.vertices = clone.vertices.map((v: any) => {
      const p = transformPoint({ x: v.x, y: v.y }, t);
      const newBulge = isMirrored && v.bulge ? -v.bulge : v.bulge;
      return { ...v, x: p.x, y: p.y, bulge: newBulge };
    });
  }

  // 3. CÍRCULOS
  else if (clone.type === "CIRCLE") {
    const c = transformPoint({ x: clone.center.x, y: clone.center.y }, t);
    clone.center = { x: c.x, y: c.y };
    clone.radius *= Math.abs(t.scaleX);
  }

  // 4. ARCOS
  else if (clone.type === "ARC") {
    const c = transformPoint({ x: clone.center.x, y: clone.center.y }, t);
    clone.center = { x: c.x, y: c.y };
    const r = clone.radius;
    clone.radius *= Math.abs(t.scaleX);

    const startX = r * Math.cos(clone.startAngle);
    const startY = r * Math.sin(clone.startAngle);
    const endX = r * Math.cos(clone.endAngle);
    const endY = r * Math.sin(clone.endAngle);

    // Vetores relativos transformados (sem translação)
    const vStart = transformPoint(
      { x: startX, y: startY },
      { ...t, x: 0, y: 0 }
    );
    const vEnd = transformPoint({ x: endX, y: endY }, { ...t, x: 0, y: 0 });

    const ang1 = normalizeAngle(Math.atan2(vStart.y, vStart.x));
    const ang2 = normalizeAngle(Math.atan2(vEnd.y, vEnd.x));
    const isMirrored = t.scaleX * t.scaleY < 0;

    if (isMirrored) {
      clone.startAngle = ang2;
      clone.endAngle = ang1;
    } else {
      clone.startAngle = ang1;
      clone.endAngle = ang2;
    }
  }

  // 5. SPLINE (NOVO!) -> Converte para LWPOLYLINE
  else if (clone.type === "SPLINE") {
    // Se tiver fitPoints, usamos eles (aproximação linear simples)
    // Se não, calculamos B-Spline usando controlPoints
    let points: Point[] = [];

    if (clone.fitPoints && clone.fitPoints.length > 0) {
      // Caminho simples: conecta os fit points
      points = clone.fitPoints.map((fp: any) => ({ x: fp.x, y: fp.y }));
    } else {
      // Caminho Matemático: Interpola B-Spline
      // Resolução: 20 segmentos por ponto de controle (suave o suficiente para corte)
      const segments = (clone.controlPoints.length || 2) * 20;
      points = interpolateSpline(
        clone.controlPoints,
        clone.degreeOfSplineCurve || 3,
        clone.knotValues,
        segments
      );
    }

    // Aplica a transformação da matriz em TODOS os pontos gerados
    const transformedVerts = points.map((p) => {
      const tp = transformPoint(p, t);
      return { x: tp.x, y: tp.y };
    });

    // Retorna como uma Polilinha para o sistema entender
    return {
      type: "LWPOLYLINE",
      vertices: transformedVerts,
      closed: clone.closed || false,
    };
  }

  // 6. ELIPSE (NOVO!) -> Converte para LWPOLYLINE
  else if (clone.type === "ELLIPSE") {
    const segments = 64; // Resolução da elipse
    const startAngle = clone.startAngle || 0;
    let endAngle = clone.endAngle;
    if (endAngle === undefined) endAngle = 2 * Math.PI; // Elipse completa

    // Garante sentido correto
    if (endAngle < startAngle) endAngle += 2 * Math.PI;

    const verts: any[] = [];
    const totalAngle = endAngle - startAngle;

    for (let i = 0; i <= segments; i++) {
      const tParam = startAngle + (i / segments) * totalAngle;

      // Calcula ponto na geometria local
      const pLocal = getEllipsePoint(
        clone.center.x,
        clone.center.y,
        clone.majorAxisEndPoint.x,
        clone.majorAxisEndPoint.y,
        clone.axisRatio,
        tParam
      );

      // Aplica a transformação global (Espelhamento/Rotação do bloco)
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
