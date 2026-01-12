import {
  getWiseOffsetPartGeometry,
  type WisePartGeometry,
} from "../utils/wiseGeometryCore";
import type { ImportedPart } from "../components/types"; // <--- ESTA LINHA ESTAVA FALTANDO

// --- CONFIGURAÇÃO ---
const GA_CONFIG = {
  POPULATION_SIZE: 12,
  MUTATION_RATE: 0.15,
  COMPLEX_ROTATIONS: [0, 15, 30, 45, 90, 135, 180, 225, 270, 315],
};

interface Point {
  x: number;
  y: number;
}

interface NestingParams {
  parts: ImportedPart[];
  quantities: Record<string, number>;
  binWidth: number;
  binHeight: number;
  margin: number;
  gap: number;
  rotationStep: number;
  iterations: number;
}

interface PlacedPart {
  uuid: string;
  partId: string;
  x: number;
  y: number;
  rotation: number;
  binId: number;
}

interface Individual {
  placement: PlacedPart[];
  efficiency: number;
  failed: string[];
  fitness: number;
  genome: { ids: string[]; rotations: number[] };
}

// Estendemos a geometria Wise para incluir uuid e id
type PartGeometry = WisePartGeometry & {
  uuid?: string;
  id: string;
  // obbCorners já vem de WisePartGeometry, mas reforçamos se necessário
};

const toRad = (deg: number) => (deg * Math.PI) / 180;

// --- GEOMETRIA ---

const transformGeometry = (
  base: PartGeometry,
  x: number,
  y: number,
  rotation: number
): PartGeometry => {
  const angleRad = toRad(rotation);
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);

  // Função de rotação
  const rotate = (px: number, py: number) => ({
    x: px * cos - py * sin,
    y: px * sin + py * cos,
  });

  // 1. Rotaciona a geometria real (Polígono)
  const newOuter = base.outer.map((p) => rotate(p.x, p.y));
  const newHoles = base.holes.map((h) => h.map((p) => rotate(p.x, p.y)));

  // 2. Calcula a nova Caixa Vermelha (AABB) para verificação de limites
  let minX = Infinity,
    minY = Infinity;
  let maxX0 = -Infinity,
    maxY0 = -Infinity;

  for (const p of newOuter) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX0) maxX0 = p.x;
    if (p.y > maxY0) maxY0 = p.y;
  }

  const offsetX = x - minX;
  const offsetY = y - minY;

  const finalOuter = newOuter.map((p) => ({
    x: p.x + offsetX,
    y: p.y + offsetY,
  }));
  const finalHoles = newHoles.map((h) =>
    h.map((p) => ({ x: p.x + offsetX, y: p.y + offsetY }))
  );

  // 3. CALCULA A CAIXA AMARELA ROTACIONADA (OBB)
  // Pegamos o MABB calculado no geometryCore e rotacionamos ele junto com a peça
  const baseMabb = base.mabb || [];
  const obbCorners = baseMabb.map((p) => {
    const r = rotate(p.x, p.y);
    return { x: r.x + offsetX, y: r.y + offsetY };
  });

  return {
    ...base,
    outer: finalOuter,
    holes: finalHoles,
    mabb: obbCorners, // Atualiza o mabb/obbCorners com a nova posição
    bounds: {
      minX: x,
      maxX: x + (maxX0 - minX),
      minY: y,
      maxY: y + (maxY0 - minY),
    },
  };
};

// --- INTERSECÇÃO (SAT) ---
const checkOBBOverlap = (cornersA: Point[], cornersB: Point[]): boolean => {
  if (cornersA.length < 4 || cornersB.length < 4) return true;
  const polygons = [cornersA, cornersB];
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];
      const normal = { x: p2.y - p1.y, y: p1.x - p2.x };

      let minA = Infinity,
        maxA = -Infinity;
      for (const p of cornersA) {
        const proj = normal.x * p.x + normal.y * p.y;
        if (proj < minA) minA = proj;
        if (proj > maxA) maxA = proj;
      }

      let minB = Infinity,
        maxB = -Infinity;
      for (const p of cornersB) {
        const proj = normal.x * p.x + normal.y * p.y;
        if (proj < minB) minB = proj;
        if (proj > maxB) maxB = proj;
      }

      if (maxA < minB || maxB < minA) return false; // Separados!
    }
  }
  return true;
};

// --- COLISÃO DETALHADA ---
const isPointInPolygon = (p: Point, polygon: Point[]) => {
  let isInside = false;
  let i = 0,
    j = polygon.length - 1;
  for (; i < polygon.length; j = i++) {
    if (
      polygon[i].y > p.y !== polygon[j].y > p.y &&
      p.x <
        ((polygon[j].x - polygon[i].x) * (p.y - polygon[i].y)) /
          (polygon[j].y - polygon[i].y) +
          polygon[i].x
    ) {
      isInside = !isInside;
    }
  }
  return isInside;
};

const doLineSegmentsIntersect = (
  p1: Point,
  p2: Point,
  q1: Point,
  q2: Point
): boolean => {
  const subtract = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
  const crossProduct = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
  const r = subtract(p2, p1);
  const s = subtract(q2, q1);
  const rxs = crossProduct(r, s);
  if (Math.abs(rxs) < 1e-9) return false;
  const t = crossProduct(subtract(q1, p1), s) / rxs;
  const u = crossProduct(subtract(q1, p1), r) / rxs;
  return t >= 1e-9 && t <= 1 - 1e-9 && u >= 1e-9 && u <= 1 - 1e-9;
};

const checkCollision = (
  candidate: PartGeometry,
  placedList: PartGeometry[]
): boolean => {
  for (let i = placedList.length - 1; i >= 0; i--) {
    const placed = placedList[i];

    // 1. Box check (Vermelha - Rápido)
    if (
      candidate.bounds.maxX < placed.bounds.minX ||
      candidate.bounds.minX > placed.bounds.maxX ||
      candidate.bounds.maxY < placed.bounds.minY ||
      candidate.bounds.minY > placed.bounds.maxY
    )
      continue;

    // 2. OBB Check (Amarela - Rápido e Preciso)
    if (candidate.mabb && placed.mabb) {
      if (!checkOBBOverlap(candidate.mabb, placed.mabb)) continue;
    }

    // 3. True Shape (Polígono Real - Lento)
    let collision = false;
    for (const p of candidate.outer)
      if (isPointInPolygon(p, placed.outer)) {
        collision = true;
        break;
      }
    if (collision) return true;
    for (const p of placed.outer)
      if (isPointInPolygon(p, candidate.outer)) {
        collision = true;
        break;
      }
    if (collision) return true;

    const polyA = candidate.outer;
    const polyB = placed.outer;
    for (let a = 0; a < polyA.length; a++) {
      const p1 = polyA[a];
      const p2 = polyA[(a + 1) % polyA.length];
      for (let b = 0; b < polyB.length; b++) {
        const q1 = polyB[b];
        const q2 = polyB[(b + 1) % polyB.length];
        if (doLineSegmentsIntersect(p1, p2, q1, q2)) return true;
      }
    }
  }
  return false;
};

// --- POSICIONAMENTO ---
const placeParts = (
  genomeIds: string[],
  genomeRotations: number[],
  baseGeometries: Map<string, PartGeometry>,
  binWidth: number,
  binHeight: number,
  margin: number,
  inflationOffset: number
): Individual => {
  const placedParts: PlacedPart[] = [];
  const placedGeoms: PartGeometry[] = [];
  const failedParts: string[] = [];

  const step = 3.0; // Passo da grade

  for (let i = 0; i < genomeIds.length; i++) {
    const partId = genomeIds[i];
    const preferredRot = genomeRotations[i];
    const baseGeom = baseGeometries.get(partId)!;
    let placed = false;
    const activeRotations = [preferredRot, (preferredRot + 90) % 360];

    for (const r of activeRotations) {
      let bestX = Infinity,
        bestY = Infinity,
        foundSpot = false;

      for (let y = margin; y < binHeight - margin; y += step) {
        if (y > bestY) break;
        for (let x = margin; x < binWidth - margin; x += step) {
          const candidate = transformGeometry(baseGeom, x, y, r);

          if (
            candidate.bounds.maxX > binWidth - margin ||
            candidate.bounds.maxY > binHeight - margin
          )
            continue;

          if (!checkCollision(candidate, placedGeoms)) {
            bestX = x;
            bestY = y;
            foundSpot = true;
            break;
          }
        }
        if (foundSpot) break;
      }

      if (foundSpot) {
        const uuid = `${partId}_${placedParts.length}_wise`;
        const finalGeom = transformGeometry(baseGeom, bestX, bestY, r);
        finalGeom.uuid = uuid;
        placedParts.push({
          uuid,
          partId,
          x: bestX + inflationOffset,
          y: bestY + inflationOffset,
          rotation: r,
          binId: 0,
        });
        placedGeoms.push(finalGeom);
        placed = true;
        break;
      }
    }
    if (!placed) failedParts.push(partId);
  }

  // Fitness
  let maxX = 0,
    maxY = 0;
  placedGeoms.forEach((g) => {
    if (g.bounds.maxX > maxX) maxX = g.bounds.maxX;
    if (g.bounds.maxY > maxY) maxY = g.bounds.maxY;
  });
  const areaParts = placedGeoms.reduce((acc, p) => acc + p.area, 0);
  const containerArea = Math.max(maxX * maxY, 1);
  let efficiency = areaParts / containerArea;
  if (failedParts.length > 0)
    efficiency *= 1 - failedParts.length / genomeIds.length;

  return {
    placement: placedParts,
    failed: failedParts,
    efficiency: efficiency * 100,
    fitness: efficiency,
    genome: { ids: [...genomeIds], rotations: [...genomeRotations] },
  };
};

// --- GENÉTICA ---
const generateRandomIndividual = (
  allIds: string[]
): { ids: string[]; rotations: number[] } => {
  const ids = [...allIds];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  const rotations = ids.map(
    () =>
      GA_CONFIG.COMPLEX_ROTATIONS[
        Math.floor(Math.random() * GA_CONFIG.COMPLEX_ROTATIONS.length)
      ]
  );
  return { ids, rotations };
};

const crossover = (parentA: { ids: string[]; rotations: number[] }) => {
  const childIds = [...parentA.ids];
  const childRots = [...parentA.rotations];
  if (Math.random() < 0.5) {
    const i = Math.floor(Math.random() * childIds.length),
      j = Math.floor(Math.random() * childIds.length);
    [childIds[i], childIds[j]] = [childIds[j], childIds[i]];
  }
  if (Math.random() < 0.5) {
    const i = Math.floor(Math.random() * childRots.length);
    childRots[i] =
      GA_CONFIG.COMPLEX_ROTATIONS[
        Math.floor(Math.random() * GA_CONFIG.COMPLEX_ROTATIONS.length)
      ];
  }
  return { ids: childIds, rotations: childRots };
};

// --- MAIN LOOP ---
self.onmessage = async (e: MessageEvent<NestingParams>) => {
  const { parts, quantities, binWidth, binHeight, margin, gap } = e.data;
  const baseGeometries = new Map<string, PartGeometry>();
  const allPartIds: string[] = [];
  const inflationOffset = gap / 2;

  parts.forEach((p) => {
    // AQUI USAMOS A NOVA FUNÇÃO DO WISE
    const geom = getWiseOffsetPartGeometry(p, inflationOffset);
    baseGeometries.set(p.id, { ...geom, uuid: p.id, id: p.id });
    const qty = quantities[p.id] || 0;
    for (let i = 0; i < qty; i++) allPartIds.push(p.id);
  });

  let population: Individual[] = [];

  // Baseline (Area Sort)
  const greedyIds = [...allPartIds].sort(
    (a, b) => baseGeometries.get(b)!.area - baseGeometries.get(a)!.area
  );
  const greedyInd = placeParts(
    greedyIds,
    greedyIds.map(() => 0),
    baseGeometries,
    binWidth,
    binHeight,
    margin,
    inflationOffset
  );
  population.push(greedyInd);

  self.postMessage({
    placed: greedyInd.placement,
    failed: greedyInd.failed,
    efficiency: greedyInd.efficiency,
    totalBins: 1,
    status: "Otimizando...",
  });

  // População Inicial
  for (let i = 1; i < GA_CONFIG.POPULATION_SIZE; i++) {
    const dna = generateRandomIndividual(allPartIds);
    population.push(
      placeParts(
        dna.ids,
        dna.rotations,
        baseGeometries,
        binWidth,
        binHeight,
        margin,
        inflationOffset
      )
    );
  }

  let generation = 0;
  while (generation < 2000) {
    population.sort((a, b) => b.fitness - a.fitness);
    const best = population[0];
    if (generation % 3 === 0)
      self.postMessage({
        placed: best.placement,
        failed: best.failed,
        efficiency: best.efficiency,
        totalBins: 1,
        status: `Gen ${generation} | Efic: ${best.efficiency.toFixed(1)}%`,
      });

    const nextGen: Individual[] = [population[0], population[1]];
    while (nextGen.length < GA_CONFIG.POPULATION_SIZE) {
      const parent =
        population[Math.floor(Math.random() * (population.length / 2))];
      const childDNA = crossover(parent.genome);
      nextGen.push(
        placeParts(
          childDNA.ids,
          childDNA.rotations,
          baseGeometries,
          binWidth,
          binHeight,
          margin,
          inflationOffset
        )
      );
    }
    population = nextGen;
    generation++;
    await new Promise((r) => setTimeout(r, 5));
  }
};

export {};
