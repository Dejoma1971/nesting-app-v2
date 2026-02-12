// src/workers/smartNestV2_5.worker.ts

/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore: Ignora erro de módulo sem tipos
import clipperWasm from "clipper2-wasm";
import type { ImportedPart } from "../components/types";

// ============================================================================
// 1. DEFINIÇÃO DE TIPOS
// ============================================================================

interface Point64 {
  delete(): void;
}
interface Path64 {
  push_back(pt: Point64): void;
  size(): number;
  get(index: number): Point64;
  delete(): void;
}
interface Paths64 {
  push_back(path: Path64): void;
  size(): number;
  get(index: number): Path64;
  delete(): void;
}

interface ClipperInstance {
  Point64: new (x: number, y: number, z: number) => Point64;
  Path64: new () => Path64;
  Paths64: new () => Paths64;
  InflatePaths64(
    paths: Paths64,
    delta: number,
    joinType: number,
    endType: number,
    miterLimit: number,
    arcTolerance: number,
  ): Paths64;
  Union64(subj: Paths64, clip: Paths64, fillRule: number): Paths64;
  Intersect64(subj: Paths64, clip: Paths64, fillRule: number): Paths64;
  AreaPaths64(paths: Paths64): number;
  JoinType: { Miter: number; Square: number; Round: number };
  EndType: {
    Polygon: number;
    Joined: number;
    Butt: number;
    Square: number;
    Round: number;
  };
  FillRule: { NonZero: number; EvenOdd: number };
}

interface NestingParams {
  parts: ImportedPart[];
  quantities: Record<string, number>;
  binWidth: number;
  binHeight: number;
  margin: number;
  gap: number;
  rotationStep: number;
}

interface PlacedPart {
  uuid: string;
  partId: string;
  x: number;
  y: number;
  rotation: number;
  binId: number;
  isInsideHole: boolean;
}

interface Point {
  x: number;
  y: number;
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

// Representação matemática exata das partes curvas
interface AnalyticalPrimitive {
  type: "ARC";
  cx: number;
  cy: number;
  r: number;
  startAngle: number;
  endAngle: number;
  sweep: number;
}

interface OptimizedPart {
  id: string;
  originalPoints: Point[];
  innerPoints: Point[][];
  area: number;
  rotationLocked: boolean;
  primitives: AnalyticalPrimitive[]; // Arcos para cálculo exato
  vertices: Point[]; // Vértices de linhas retas
}

interface BinState {
  id: number;
  occupiedSpace: Paths64;
  placedRects: Rect[];
}

const SCALE = 1000;
const TWO_PI = Math.PI * 2;
// Resolução visual para o Clipper (apenas colisão interna)
const ARC_RES = 0.1;

// ============================================================================
// 2. CLIPPER ENGINE
// ============================================================================

class GeometryEngine {
  public clipper: ClipperInstance | null = null;

  async init() {
    // @ts-ignore
    const instance = await clipperWasm({
      locateFile: (path: string) => {
        if (path.endsWith(".wasm")) return "/clipper2z.wasm";
        return path;
      },
    });
    this.clipper = instance;
  }

  createPath(points: Point[]): Paths64 {
    if (!this.clipper) throw new Error("Clipper not initialized");
    const path = new this.clipper.Path64();
    for (const p of points) {
      const pt = new this.clipper.Point64(
        Math.round(p.x * SCALE),
        Math.round(p.y * SCALE),
        0,
      );
      path.push_back(pt);
      pt.delete();
    }
    const paths = new this.clipper.Paths64();
    paths.push_back(path);
    path.delete();
    return paths;
  }

  offset(paths: Paths64, delta: number): Paths64 {
    if (!this.clipper) throw new Error("Clipper not initialized");
    return this.clipper.InflatePaths64(
      paths,
      delta * SCALE,
      this.clipper.JoinType.Miter,
      this.clipper.EndType.Polygon,
      2.0,
      0.1,
    );
  }

  union(subj: Paths64, clip: Paths64): Paths64 {
    if (!this.clipper) throw new Error("Clipper not initialized");
    return this.clipper.Union64(subj, clip, this.clipper.FillRule.NonZero);
  }

  checkCollision(subj: Paths64, clip: Paths64): boolean {
    if (!this.clipper) throw new Error("Clipper not initialized");
    const intersect = this.clipper.Intersect64(
      subj,
      clip,
      this.clipper.FillRule.NonZero,
    );
    const area = this.clipper.AreaPaths64(intersect);
    const hasCollision = Math.abs(area) > 10;
    intersect.delete();
    return hasCollision;
  }

  dispose(obj: { delete?: () => void } | null) {
    if (obj && typeof obj.delete === "function") obj.delete();
  }
}

const geo = new GeometryEngine();

// ============================================================================
// 3. MATEMÁTICA ANALÍTICA
// ============================================================================

const rotatePoint = (p: Point, cos: number, sin: number): Point => {
  return {
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  };
};

const normalize = (angle: number) => {
  let a = angle % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
};

// Verifica se um ângulo cardeal está dentro do arco
const isAngleInArc = (
  target: number,
  start: number,
  end: number,
  sweep: number,
): boolean => {
  const t = normalize(target);
  const s = normalize(start);
  const e = normalize(end);

  if (sweep > 0) {
    // CCW
    if (s <= e) return t >= s && t <= e;
    return t >= s || t <= e;
  } else {
    // CW
    if (e <= s) return t >= e && t <= s;
    return t >= e || t <= s;
  }
};

// --- FUNÇÃO CRÍTICA: CALCULA A CAIXA ENVOLVENTE EXATA ---
// --- FUNÇÃO CRÍTICA: CALCULA A CAIXA ENVOLVENTE EXATA ---
// [CORREÇÃO] Adicionado parâmetro 'visualBuffer' (padrão 0 para não quebrar chamadas antigas)
const calculateExactBounds = (
  part: OptimizedPart,
  rotDeg: number,
  visualBuffer: number = 0,
) => {
  const rad = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;

  // 1. Limites dos Vértices (Linhas Retas)
  for (const v of part.vertices) {
    const rv = rotatePoint(v, cos, sin);
    if (rv.x < minX) minX = rv.x;
    if (rv.x > maxX) maxX = rv.x;
    if (rv.y < minY) minY = rv.y;
    if (rv.y > maxY) maxY = rv.y;
  }

  // 2. Limites dos Arcos
  for (const prim of part.primitives) {
    const rc = rotatePoint({ x: prim.cx, y: prim.cy }, cos, sin);
    const rStart = prim.startAngle + rad;
    const rEnd = prim.endAngle + rad;

    const p1x = rc.x + prim.r * Math.cos(rStart);
    const p1y = rc.y + prim.r * Math.sin(rStart);
    const p2x = rc.x + prim.r * Math.cos(rEnd);
    const p2y = rc.y + prim.r * Math.sin(rEnd);

    minX = Math.min(minX, p1x, p2x);
    maxX = Math.max(maxX, p1x, p2x);
    minY = Math.min(minY, p1y, p2y);
    maxY = Math.max(maxY, p1y, p2y);

    const cardinals = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2];
    for (const ang of cardinals) {
      if (isAngleInArc(ang, rStart, rEnd, prim.sweep)) {
        const cx = rc.x + prim.r * Math.cos(ang);
        const cy = rc.y + prim.r * Math.sin(ang);
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
      }
    }
  }

  // [CORREÇÃO] Aplica o buffer visual para cobrir a espessura da linha e pontas
  if (visualBuffer > 0) {
    minX -= visualBuffer;
    maxX += visualBuffer;
    minY -= visualBuffer;
    maxY += visualBuffer;
  }

  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
};

const translatePoints = (points: Point[], dx: number, dy: number): Point[] => {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
};

const rectsIntersect = (r1: Rect, r2: Rect): boolean => {
  return !(
    r2.left > r1.right ||
    r2.right < r1.left ||
    r2.top > r1.bottom ||
    r2.bottom < r1.top
  );
};

// --- PREPARAÇÃO DE DADOS ---

const generateArcPoints = (
  cx: number,
  cy: number,
  r: number,
  start: number,
  sweep: number,
) => {
  const pts: Point[] = [];
  const n = Math.max(16, Math.ceil(Math.abs(sweep) / ARC_RES));
  for (let i = 0; i <= n; i++) {
    const a = start + (sweep * i) / n;
    pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
  }
  return pts;
};

const extractGeometry = (
  part: ImportedPart,
): {
  outer: Point[];
  holes: Point[][];
  primitives: AnalyticalPrimitive[];
  vertices: Point[];
} => {
  const loops: Point[][] = [];
  const primitives: AnalyticalPrimitive[] = [];
  const vertices: Point[] = [];

  if (part.entities) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    part.entities.forEach((ent: any) => {
      const path: Point[] = [];

      if (ent.vertices && ent.vertices.length >= 2) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ent.vertices.forEach((v: any, i: number) => {
          path.push({ x: v.x, y: v.y });
          vertices.push({ x: v.x, y: v.y }); // Guarda vértice para limite exato

          if (v.bulge && Math.abs(v.bulge) > 1e-9) {
            const nextIndex = (i + 1) % ent.vertices.length;
            const nextV = ent.vertices[nextIndex];
            if (i === ent.vertices.length - 1 && !ent.shape) return;

            const chordDx = nextV.x - v.x;
            const chordDy = nextV.y - v.y;
            const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy);
            const radius =
              (chordLen * (1 + v.bulge * v.bulge)) / (4 * Math.abs(v.bulge));
            const cx =
              (v.x + nextV.x) / 2 -
              (chordDy * (1 - v.bulge * v.bulge)) / (4 * v.bulge);
            const cy =
              (v.y + nextV.y) / 2 +
              (chordDx * (1 - v.bulge * v.bulge)) / (4 * v.bulge);

            const startAngle = Math.atan2(v.y - cy, v.x - cx);
            const sweep = 4 * Math.atan(v.bulge);

            primitives.push({
              type: "ARC",
              cx,
              cy,
              r: radius,
              startAngle,
              endAngle: startAngle + sweep,
              sweep,
            });

            path.push(...generateArcPoints(cx, cy, radius, startAngle, sweep));
          }
        });
        loops.push(path);
      } else if (ent.type === "CIRCLE") {
        primitives.push({
          type: "ARC",
          cx: ent.center.x,
          cy: ent.center.y,
          r: ent.radius,
          startAngle: 0,
          endAngle: TWO_PI,
          sweep: TWO_PI,
        });
        loops.push(
          generateArcPoints(ent.center.x, ent.center.y, ent.radius, 0, TWO_PI),
        );
      } else if (ent.type === "ARC") {
        let sweep = ent.endAngle - ent.startAngle;
        if (sweep <= 0) sweep += TWO_PI;
        primitives.push({
          type: "ARC",
          cx: ent.center.x,
          cy: ent.center.y,
          r: ent.radius,
          startAngle: ent.startAngle,
          endAngle: ent.startAngle + sweep,
          sweep,
        });
        const pts = generateArcPoints(
          ent.center.x,
          ent.center.y,
          ent.radius,
          ent.startAngle,
          sweep,
        );
        pts.push(ent.center); // Fecha visualmente para área
        loops.push(pts);
      }
    });
  }

  if (loops.length === 0) {
    const rectPts = [
      { x: 0, y: 0 },
      { x: part.width, y: 0 },
      { x: part.width, y: part.height },
      { x: 0, y: part.height },
    ];
    return { outer: rectPts, holes: [], primitives: [], vertices: rectPts };
  }

  const getArea = (pts: Point[]) => {
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      area += pts[i].x * pts[j].y;
      area -= pts[j].x * pts[i].y;
    }
    return Math.abs(area / 2);
  };
  loops.sort((a, b) => getArea(b) - getArea(a));

  return {
    outer: loops[0],
    holes: loops.slice(1),
    primitives,
    vertices,
  };
};

const prepareParts = (rawParts: ImportedPart[]): OptimizedPart[] => {
  return rawParts.map((p) => {
    const data = extractGeometry(p);

    let area = 0;
    const outer = data.outer;
    for (let i = 0; i < outer.length; i++) {
      const j = (i + 1) % outer.length;
      area += outer[i].x * outer[j].y;
      area -= outer[j].x * outer[i].y;
    }
    area = Math.abs(area / 2);

    return {
      id: p.id,
      originalPoints: data.outer,
      innerPoints: data.holes,
      area: area || p.width * p.height,
      rotationLocked: !!p.isRotationLocked,
      primitives: data.primitives,
      vertices: data.vertices,
    };
  });
};

// ============================================================================
// 4. LÓGICA DE NESTING V4 (ANCORAGEM ABSOLUTA)
// ============================================================================

self.onmessage = async (e: MessageEvent<NestingParams>) => {
  const { parts, quantities, binWidth, binHeight, margin, gap, rotationStep } =
    e.data;

  await geo.init();

  const optimizedParts = prepareParts(parts);
  const taskList: { partIndex: number; uniqueId: string }[] = [];

  optimizedParts.forEach((op, idx) => {
    const qty = quantities[op.id] || 0;
    for (let i = 0; i < qty; i++) {
      taskList.push({ partIndex: idx, uniqueId: `${op.id}_${i}` });
    }
  });

  taskList.sort(
    (a, b) =>
      optimizedParts[b.partIndex].area - optimizedParts[a.partIndex].area,
  );

  const bins: BinState[] = [];
  const createBin = (id: number): BinState => ({
    id,
    occupiedSpace: new geo.clipper!.Paths64(),
    placedRects: [],
  });
  bins.push(createBin(0));

  const placements: PlacedPart[] = [];
  const STEP = 5;

  for (const task of taskList) {
    const part = optimizedParts[task.partIndex];

    let allowedRotations: number[] = [];
    if (part.rotationLocked) {
      allowedRotations = [0, 180];
    } else {
      for (let r = 0; r < 360; r += rotationStep) allowedRotations.push(r);
    }

    let placed = false;

    for (let b = 0; b < bins.length + 1 && b < 50; b++) {
      if (!bins[b]) bins.push(createBin(b));
      const bin = bins[b];

      for (const rot of allowedRotations) {
        // 1. CÁLCULO ANALÍTICO (A Verdade Matemática)
        const exactBounds = calculateExactBounds(part, rot, 2.0);

        // 2. Rotaciona o polígono para o Clipper
        const rad = (rot * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const rotatedPoints = part.originalPoints.map((p) => ({
          x: p.x * cos - p.y * sin,
          y: p.x * sin + p.y * cos,
        }));

        // 3. ANCORAGEM (Pulo do Gato)
        // Em vez de confiar na posição do polígono, usamos o exactBounds.
        // Queremos que a peça comece na coordenada 'x'.
        // Isso significa que 'exactBounds.minX' deve ser transladado para 'x'.
        // O deslocamento necessário é: offset = x - exactBounds.minX

        const partWidth = exactBounds.width;
        const partHeight = exactBounds.height;

        // Limites do Loop baseados nas dimensões REAIS (não poligonais)
        const maxX = binWidth - margin - partWidth;
        const maxY = binHeight - margin - partHeight;

        for (let y = margin; y <= maxY; y += STEP) {
          for (let x = margin; x <= maxX; x += STEP) {
            // 4. Verificação Rápida (Rect)
            // O Rect é construído usando as dimensões REAIS.
            // Ele é garantidamente grande o suficiente para conter a barriga do arco.
            const candidateRect: Rect = {
              left: x - gap / 2,
              right: x + partWidth + gap / 2,
              top: y - gap / 2,
              bottom: y + partHeight + gap / 2,
            };

            let rectCollision = false;
            for (const r of bin.placedRects) {
              if (rectsIntersect(candidateRect, r)) {
                rectCollision = true;
                break;
              }
            }

            let confirmedCollision = false;
            if (rectCollision) {
              // 5. Colisão Fina (Clipper)
              // Precisamos alinhar o Polígono com a Caixa Analítica.
              // Movemos o polígono para que sua posição coincida com a caixa que estamos testando.
              // Offset = (Posição Desejada) - (Posição Atual Relativa a 0,0)
              const offsetX = x - exactBounds.minX;
              const offsetY = y - exactBounds.minY;

              const testPoints = translatePoints(
                rotatedPoints,
                offsetX,
                offsetY,
              );
              const tPath = geo.createPath(testPoints);
              const tInflated = geo.offset(tPath, gap / 2);

              if (geo.checkCollision(tInflated, bin.occupiedSpace)) {
                confirmedCollision = true;
              }
              geo.dispose(tPath);
              geo.dispose(tInflated);
            }

            if (!confirmedCollision) {
              // SUCESSO!
              // A margem foi garantida pelo loop (x começa em margin)
              // e pelo cálculo de maxX (usa partWidth exato).
              // Não precisamos de verificação extra de margem aqui.

              placed = true;

              // Calcula a posição final para salvar
              const offsetX = x - exactBounds.minX;
              const offsetY = y - exactBounds.minY;

              const finalPoints = translatePoints(
                rotatedPoints,
                offsetX,
                offsetY,
              );
              const finalPath = geo.createPath(finalPoints);
              const finalInflated = geo.offset(finalPath, gap / 2);
              const newOcc = geo.union(bin.occupiedSpace, finalInflated);

              geo.dispose(bin.occupiedSpace);
              bin.occupiedSpace = newOcc;
              geo.dispose(finalPath);
              geo.dispose(finalInflated);

              bin.placedRects.push(candidateRect);

              placements.push({
                uuid: task.uniqueId,
                partId: part.id,
                x: offsetX, // Posição para renderização (Clipper)
                y: offsetY,
                rotation: rot,
                binId: bin.id,
                isInsideHole: false,
              });
              break;
            }
          }
          if (placed) break;
        }
        if (placed) break;
      }
      if (placed) break;
    }

    // @ts-ignore
    self.postMessage({
      type: "progress",
      percent: Math.round((placements.length / taskList.length) * 100),
    });
  }

  bins.forEach((b) => {
    geo.dispose(b.occupiedSpace);
  });

  self.postMessage({
    placed: placements,
    efficiency: 0,
    totalBins: bins.length,
    failed: [],
  });
};

export {};
