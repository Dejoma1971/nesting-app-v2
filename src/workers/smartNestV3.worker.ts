// src/workers/smartNestV3.worker.ts

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
  Difference64(subj: Paths64, clip: Paths64, fillRule: number): Paths64;
  Intersect64(subj: Paths64, clip: Paths64, fillRule: number): Paths64;
  GetBounds(paths: Paths64): {
    left: number;
    right: number;
    top: number;
    bottom: number;
  };
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
  iterations: number;
  rotationStep: number;
}

interface Gene {
  partIndex: number;
  rotation: number;
}

interface Individual {
  genes: Gene[];
  fitness: number;
  placements: PlacedPart[];
  totalBins: number;
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

interface OptimizedPart {
  id: string;
  originalPoints: Point[];
  innerPoints: Point[][];
  area: number;
  rotationLocked: boolean;
}

// Estado de uma chapa individual
interface BinState {
  id: number;
  occupiedSpace: Paths64; // Geometria complexa (Clipper)
  placedRects: Rect[]; // Geometria simples (JS Rápido)
  freeHoles: Paths64[]; // Lista de furos disponíveis
  maxUsedY: number; // Altura máxima usada (Gravidade)
}

const SCALE = 1000;

// ============================================================================
// 2. ENGINE GEOMÉTRICA
// ============================================================================

class GeometryEngine {
  public clipper: ClipperInstance | null = null;

  async init() {
    // @ts-ignore
    const instance = await clipperWasm({
      locateFile: (path: string) => {
        if (path.endsWith(".wasm")) {
          return "/clipper2z.wasm";
        }
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
      0.0,
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
    const hasCollision = Math.abs(area) > 1000;
    intersect.delete();
    return hasCollision;
  }

  isInside(subj: Paths64, container: Paths64): boolean {
    if (!this.clipper) throw new Error("Clipper not initialized");
    const diff = this.clipper.Difference64(
      subj,
      container,
      this.clipper.FillRule.NonZero,
    );
    const area = this.clipper.AreaPaths64(diff);
    diff.delete();
    return Math.abs(area) < 1000;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dispose(obj: any) {
    if (obj && typeof obj.delete === "function") obj.delete();
  }
}

const geo = new GeometryEngine();

// ============================================================================
// 3. FUNÇÕES AUXILIARES
// ============================================================================

const rotatePoints = (points: Point[], angleDeg: number): Point[] => {
  if (angleDeg === 0) return points;
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return points.map((p) => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  }));
};

const translatePoints = (points: Point[], dx: number, dy: number): Point[] => {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
};

const getBounds = (points: Point[]) => {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
};

const rectsIntersect = (r1: Rect, r2: Rect): boolean => {
  return !(
    r2.left > r1.right ||
    r2.right < r1.left ||
    r2.top > r1.bottom ||
    r2.bottom < r1.top
  );
};

const extractGeometry = (
  part: ImportedPart,
): { outer: Point[]; holes: Point[][] } => {
  const loops: Point[][] = [];
  if (part.entities) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    part.entities.forEach((ent: any) => {
      const path: Point[] = [];
      if (ent.vertices && ent.vertices.length > 2) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ent.vertices.forEach((v: any) => path.push({ x: v.x, y: v.y }));
        loops.push(path);
      }
    });
  }
  if (loops.length === 0) {
    return {
      outer: [
        { x: 0, y: 0 },
        { x: part.width, y: 0 },
        { x: part.width, y: part.height },
        { x: 0, y: part.height },
      ],
      holes: [],
    };
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
  const outer = loops[0];
  const holes = loops.slice(1);
  return { outer, holes };
};

const prepareParts = (rawParts: ImportedPart[]): OptimizedPart[] => {
  return rawParts.map((p) => {
    const { outer, holes } = extractGeometry(p);
    let area = 0;
    for (let i = 0; i < outer.length; i++) {
      const j = (i + 1) % outer.length;
      area += outer[i].x * outer[j].y;
      area -= outer[j].x * outer[i].y;
    }
    area = Math.abs(area / 2);
    return {
      id: p.id,
      originalPoints: outer,
      innerPoints: holes,
      area: area || p.width * p.height,
      rotationLocked: !!p.isRotationLocked,
    };
  });
};

// ============================================================================
// 4. AVALIAÇÃO (FITNESS) - ENGINE HÍBRIDA
// ============================================================================

const evaluateFitness = (
  individual: Individual,
  preparedParts: OptimizedPart[],
  binW: number,
  binH: number,
  margin: number,
  gap: number,
) => {
  if (!geo.clipper) return;

  const safeBinPoints = [
    { x: margin, y: margin },
    { x: binW - margin, y: margin },
    { x: binW - margin, y: binH - margin },
    { x: margin, y: binH - margin },
  ];
  // Local variable: safeBinPath (CORRIGIDO: Escopo local garantido)
  const safeBinPath = geo.createPath(safeBinPoints);

  // Lista de Chapas (Multi-Bin)
  const bins: BinState[] = [];
  const createBin = (id: number): BinState => ({
    id,
    occupiedSpace: new geo.clipper!.Paths64(),
    placedRects: [],
    freeHoles: [],
    maxUsedY: 0,
  });
  bins.push(createBin(0));

  const placements: PlacedPart[] = [];
  let totalPartsArea = 0;

  // Passo de 12mm: Bom equilíbrio entre velocidade e precisão
  const STEP = 12;

  for (const gene of individual.genes) {
    const part = preparedParts[gene.partIndex];

    // Rotação
    const rotatedPoints = rotatePoints(part.originalPoints, gene.rotation);
    const bounds = getBounds(rotatedPoints);
    const localPoints = translatePoints(
      rotatedPoints,
      -bounds.minX,
      -bounds.minY,
    );

    // Furos rotacionados
    const partHolesRotated = part.innerPoints.map((holePts) => {
      const rotHole = rotatePoints(holePts, gene.rotation);
      return translatePoints(rotHole, -bounds.minX, -bounds.minY);
    });

    let placed = false;
    let bestX = 0,
      bestY = 0;
    let targetBinIdx = 0;
    let insideHole = false;

    // Tenta em cada chapa (Loop Multi-Chapa)
    for (let b = 0; b < bins.length + 1 && b < 50; b++) {
      if (!bins[b]) bins.push(createBin(b));
      const bin = bins[b];

      // --- 1. TENTA EM FUROS (Hole Nesting Ativo) ---
      if (bin.freeHoles.length > 0) {
        for (const holePath of bin.freeHoles) {
          const hBounds = geo.clipper.GetBounds(holePath);
          const hW = (hBounds.right - hBounds.left) / SCALE;
          const hH = (hBounds.bottom - hBounds.top) / SCALE;

          if (bounds.width > hW || bounds.height > hH) continue;

          const holeMinX = hBounds.left / SCALE;
          const holeMinY = hBounds.top / SCALE;

          // Varredura no Furo
          for (
            let hy = holeMinY;
            hy <= holeMinY + hH - bounds.height;
            hy += STEP
          ) {
            for (
              let hx = holeMinX;
              hx <= holeMinX + hW - bounds.width;
              hx += STEP
            ) {
              const candPath = geo.createPath(
                translatePoints(localPoints, hx, hy),
              );
              const candGap = geo.offset(candPath, gap / 2);

              // Regra: Deve estar DENTRO do furo E NÃO colidir
              if (geo.isInside(candGap, holePath)) {
                if (!geo.checkCollision(candGap, bin.occupiedSpace)) {
                  placed = true;
                  bestX = hx;
                  bestY = hy;
                  insideHole = true;
                  targetBinIdx = b;

                  const newOccupied = geo.union(bin.occupiedSpace, candGap);
                  geo.dispose(bin.occupiedSpace);
                  bin.occupiedSpace = newOccupied;

                  geo.dispose(candPath);
                  geo.dispose(candGap);
                  break;
                }
              }
              geo.dispose(candPath);
              geo.dispose(candGap);
            }
            if (placed) break;
          }
          if (placed) break;
        }
      }

      if (placed) break;

      // --- 2. TENTA NA CHAPA (Grid Scan Híbrido) ---
      const maxX = binW - margin - bounds.width;
      const maxY = binH - margin - bounds.height;

      for (let y = margin; y <= maxY; y += STEP) {
        for (let x = margin; x <= maxX; x += STEP) {
          // A. Filtro Rápido (Retângulos JS)
          const candidateRect: Rect = {
            left: x - gap / 2,
            right: x + bounds.width + gap / 2,
            top: y - gap / 2,
            bottom: y + bounds.height + gap / 2,
          };

          let rectCollision = false;
          for (const r of bin.placedRects) {
            if (rectsIntersect(candidateRect, r)) {
              rectCollision = true;
              break;
            }
          }

          // B. Verificação Precisa (Clipper WASM) - SÓ SE RETÂNGULOS TOCAREM
          let confirmedCollision = false;
          if (rectCollision) {
            const candidatePath = geo.createPath(
              translatePoints(localPoints, x, y),
            );
            const candidateWithGap = geo.offset(candidatePath, gap / 2);
            if (geo.checkCollision(candidateWithGap, bin.occupiedSpace)) {
              confirmedCollision = true;
            }
            geo.dispose(candidatePath);
            geo.dispose(candidateWithGap);
          }

          if (!confirmedCollision) {
            // SUCESSO!
            placed = true;
            bestX = x;
            bestY = y;
            targetBinIdx = b;
            insideHole = false;

            const finalPath = geo.createPath(
              translatePoints(localPoints, x, y),
            );
            const finalWithGap = geo.offset(finalPath, gap / 2);
            const newOccupied = geo.union(bin.occupiedSpace, finalWithGap);

            geo.dispose(bin.occupiedSpace);
            bin.occupiedSpace = newOccupied;

            geo.dispose(finalPath);
            geo.dispose(finalWithGap);

            // Adiciona retângulo para o filtro rápido
            bin.placedRects.push(candidateRect);

            const thisPartTop = y + bounds.height;
            if (thisPartTop > bin.maxUsedY) bin.maxUsedY = thisPartTop;

            // Registra furos da nova peça como livres
            if (partHolesRotated.length > 0) {
              partHolesRotated.forEach((hPts) => {
                const realHolePts = translatePoints(hPts, x, y);
                const holePath = geo.createPath(realHolePts);
                const usableHole = geo.offset(holePath, -(gap / 2));
                bin.freeHoles.push(usableHole);
                geo.dispose(holePath);
              });
            }

            break; // Loop X
          }
        }
        if (placed) break; // Loop Y
      }
      if (placed) break; // Loop Chapas
    }

    if (placed) {
      placements.push({
        uuid: `${part.id}-${placements.length}`,
        partId: part.id,
        x: bestX,
        y: bestY,
        rotation: gene.rotation,
        binId: targetBinIdx,
        isInsideHole: insideHole,
      });
      const holeBonus = insideHole ? 5.0 : 1.0;
      totalPartsArea += part.area * holeBonus;
    }
  }

  // CLEANUP TOTAL
  geo.dispose(safeBinPath); // <--- Correção do erro: Dispose local
  bins.forEach((b) => {
    geo.dispose(b.occupiedSpace);
    b.freeHoles.forEach((h) => geo.dispose(h));
  });

  individual.placements = placements;
  individual.totalBins = bins.length;

  // Fitness com gravidade e penalidade de chapas
  const binPenalty = (individual.totalBins - 1) * 10000000;
  const lastBinHeightPenalty = bins[bins.length - 1]?.maxUsedY || 0;

  individual.fitness =
    totalPartsArea * 1000 - binPenalty - lastBinHeightPenalty;
};

// --- GA HELPERS ---

const tournamentSelect = (pop: Individual[]): Individual => {
  const k = 3;
  let best = pop[Math.floor(Math.random() * pop.length)];
  for (let i = 0; i < k; i++) {
    const candidate = pop[Math.floor(Math.random() * pop.length)];
    if (candidate.fitness > best.fitness) best = candidate;
  }
  return {
    genes: [...best.genes],
    fitness: 0,
    placements: [],
    totalBins: 0,
  };
};

const crossover = (parent1: Individual, parent2: Individual): Individual => {
  const len = parent1.genes.length;
  if (len === 0) return { genes: [], fitness: 0, placements: [], totalBins: 0 };
  const childGenes: Gene[] = parent1.genes.map((g, i) => {
    if (Math.random() > 0.5) {
      return { partIndex: g.partIndex, rotation: parent2.genes[i].rotation };
    }
    return { ...g };
  });
  return { genes: childGenes, fitness: 0, placements: [], totalBins: 0 };
};

const mutate = (
  ind: Individual,
  mutationRate: number,
  rotationStep: number,
) => {
  ind.genes.forEach((g) => {
    if (Math.random() < mutationRate) {
      g.rotation =
        Math.floor(Math.random() * (360 / rotationStep)) * rotationStep;
    }
  });
  if (Math.random() < mutationRate) {
    const i = Math.floor(Math.random() * ind.genes.length);
    const j = Math.floor(Math.random() * ind.genes.length);
    [ind.genes[i], ind.genes[j]] = [ind.genes[j], ind.genes[i]];
  }
};

// ============================================================================
// 6. LOOP PRINCIPAL
// ============================================================================

self.onmessage = async (e: MessageEvent<NestingParams>) => {
  const {
    parts,
    quantities,
    binWidth,
    binHeight,
    margin,
    gap,
    iterations,
    rotationStep,
  } = e.data;

  await geo.init();

  const optimizedParts = prepareParts(parts);

  const geneMap: number[] = [];
  optimizedParts.forEach((op, idx) => {
    const qty = quantities[op.id] || 0;
    for (let i = 0; i < qty; i++) geneMap.push(idx);
  });

  geneMap.sort(
    (idxA, idxB) => optimizedParts[idxB].area - optimizedParts[idxA].area,
  );

  const POP_SIZE = 10;
  const SAFE_ITERATIONS = Math.min(iterations, 20); // Limite seguro

  let population: Individual[] = [];

  const seedGenes = geneMap.map((idx) => ({ partIndex: idx, rotation: 0 }));
  population.push({
    genes: seedGenes,
    fitness: 0,
    placements: [],
    totalBins: 0,
  });

  for (let i = 1; i < POP_SIZE; i++) {
    const shuffled = [...geneMap].sort(() => Math.random() - 0.5);
    const genes: Gene[] = shuffled.map((idx) => ({
      partIndex: idx,
      rotation: Math.floor(Math.random() * (360 / rotationStep)) * rotationStep,
    }));
    population.push({ genes, fitness: 0, placements: [], totalBins: 0 });
  }

  let bestGlobal = population[0];

  for (let gen = 0; gen < SAFE_ITERATIONS; gen++) {
    // @ts-ignore
    self.postMessage({
      type: "progress",
      percent: Math.round((gen / SAFE_ITERATIONS) * 100),
    });

    population.forEach((ind) =>
      evaluateFitness(ind, optimizedParts, binWidth, binHeight, margin, gap),
    );
    population.sort((a, b) => b.fitness - a.fitness);

    if (population[0].fitness > bestGlobal.fitness) {
      bestGlobal = JSON.parse(JSON.stringify(population[0]));
    }

    const newPop: Individual[] = [];
    newPop.push(population[0]);
    newPop.push(population[1]);

    while (newPop.length < POP_SIZE) {
      const p1 = tournamentSelect(population);
      const p2 = tournamentSelect(population);
      const child = crossover(p1, p2);
      mutate(child, 0.1, rotationStep);
      newPop.push(child);
    }

    population = newPop;
  }

  evaluateFitness(bestGlobal, optimizedParts, binWidth, binHeight, margin, gap);

  self.postMessage({
    placed: bestGlobal.placements,
    efficiency: 0,
    totalBins: bestGlobal.totalBins,
    failed: [],
  });
};

export {};
