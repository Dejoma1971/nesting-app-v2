/// <reference lib="webworker" />

/* eslint-disable no-var */
/* eslint-disable @typescript-eslint/no-explicit-any */

// 1. POLYFILL: Prevent Clipper alerts from crashing the worker
self.alert = function(message: any) {
    console.warn('[WiseWorker Alert]:', message);
};

importScripts('/workers/clipper.js');

declare var ClipperLib: any;

// Scale adjusted for CNC precision (0.001mm) - Safe for large coordinates
const SCALE = 1000; 

// --- GEOMETRY HELPERS ---

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

function approximateArc(
  cx: number, cy: number, r: number, 
  startAngle: number, endAngle: number, 
  segments = 24
) {
  const points = [];
  let totalAngle = endAngle - startAngle;
  if (totalAngle <= 0) totalAngle += 2 * Math.PI;
  const step = totalAngle / segments;
  
  for (let i = 0; i <= segments; i++) {
    const theta = startAngle + step * i;
    points.push({
      X: Math.round((cx + r * Math.cos(theta)) * SCALE),
      Y: Math.round((cy + r * Math.sin(theta)) * SCALE)
    });
  }
  return points;
}

// --- JACK QIAO'S CLEANING LOGIC (Adapted from svgnest.js) ---
function cleanClipperPath(paths: any[]) {
    // 1. Simplify: Resolves self-intersections and handles holes correctly (NonZero)
    // This is the most important step to prevent "stacking"
    const simple = ClipperLib.Clipper.SimplifyPolygons(paths, ClipperLib.PolyFillType.pftNonZero);
    
    if (!simple || simple.length === 0) return null;
    
    // 2. Clean: Removes vertices that are too close (Noise reduction)
    // Tolerance adjusted for our SCALE
    const clean = ClipperLib.Clipper.CleanPolygons(simple, 0.2 * SCALE / 1000);
    
    return clean;
}

function partToClipperPaths(part: any) {
  const rawPaths: any[] = [];
  const w = (part.width || 100) * SCALE;
  const h = (part.height || 100) * SCALE;
  const fallback = [[{ X: 0, Y: 0 }, { X: w, Y: 0 }, { X: w, Y: h }, { X: 0, Y: h }]];

  if (!part.entities || part.entities.length === 0) return fallback;

  part.entities.forEach((ent: any) => {
    let currentPath: { X: number; Y: number }[] = [];
    if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
      if (ent.vertices && ent.vertices.length > 1) {
        ent.vertices.forEach((v: any) => {
          currentPath.push({ X: Math.round(v.x * SCALE), Y: Math.round(v.y * SCALE) });
        });
      }
    } else if (ent.type === 'CIRCLE') {
      currentPath = approximateArc(ent.center.x, ent.center.y, ent.radius, 0, Math.PI * 2);
    } 
    
    // Ensure path has area
    if (currentPath.length > 2) rawPaths.push(currentPath);
  });

  if (rawPaths.length === 0) return fallback;

  const finalPaths = cleanClipperPath(rawPaths);
  return (finalPaths && finalPaths.length > 0) ? finalPaths : fallback;
}

function rotatePaths(paths: any[], angle: number) {
  if (angle === 0) return paths;
  const rad = toRad(angle);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return paths.map(path => path.map((p: any) => ({
    X: Math.round(p.X * cos - p.Y * sin),
    Y: Math.round(p.X * sin + p.Y * cos)
  })));
}

function translatePaths(paths: any[], dx: number, dy: number) {
  const scaledDx = Math.round(dx * SCALE);
  const scaledDy = Math.round(dy * SCALE);
  return paths.map(path => path.map((p: any) => ({ X: p.X + scaledDx, Y: p.Y + scaledDy })));
}

function getBounds(paths: any[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for(const path of paths) {
    for(const p of path) {
        if (p.X < minX) minX = p.X;
        if (p.Y < minY) minY = p.Y;
        if (p.X > maxX) maxX = p.X;
        if (p.Y > maxY) maxY = p.Y;
    }
  }
  if (minX === Infinity) return { minX:0, minY:0, maxX:0, maxY:0, width:0, height:0 };
  return {
    minX, minY, maxX, maxY,
    width: (maxX - minX) / SCALE, 
    height: (maxY - minY) / SCALE
  };
}

function offsetPaths(paths: any[], delta: number) {
  if (delta === 0) return paths;
  const co = new ClipperLib.ClipperOffset();
  const result = new ClipperLib.Paths();
  co.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon);
  co.Execute(result, delta * SCALE);
  return cleanClipperPath(result) || paths;
}

// --- OBSTACLE MANAGEMENT (UNION - THE SPEED KEY) ---

// Merges the new part into the solid mass of obstacles
function unionObstacles(currentObstacles: any[], newPartPaths: any[]) {
    if (!currentObstacles || currentObstacles.length === 0) return newPartPaths;

    const clipper = new ClipperLib.Clipper();
    try {
        clipper.AddPaths(currentObstacles, ClipperLib.PolyType.ptSubject, true);
        clipper.AddPaths(newPartPaths, ClipperLib.PolyType.ptClip, true);
        
        const solution = new ClipperLib.Paths();
        // Union creates a single solid "continent"
        clipper.Execute(
            ClipperLib.ClipType.ctUnion, 
            solution, 
            ClipperLib.PolyFillType.pftNonZero, 
            ClipperLib.PolyFillType.pftNonZero
        );
        // Clean result to keep it simple and fast
        return cleanClipperPath(solution) || solution;
    } catch (error) {
        console.warn("Clipper Union failed, using List fallback:", error);
        // If Union fails, fallback to concatenation (slower but safe)
        return currentObstacles.concat(newPartPaths); 
    }
}

function checkCollision(candidatePaths: any[], obstaclesUnion: any[]) {
  if (!obstaclesUnion || obstaclesUnion.length === 0) return false;

  const clipper = new ClipperLib.Clipper();
  try {
      clipper.AddPaths(candidatePaths, ClipperLib.PolyType.ptSubject, true);
      clipper.AddPaths(obstaclesUnion, ClipperLib.PolyType.ptClip, true);
      
      const solution = new ClipperLib.Paths();
      clipper.Execute(
        ClipperLib.ClipType.ctIntersection, 
        solution,
        ClipperLib.PolyFillType.pftNonZero,
        ClipperLib.PolyFillType.pftNonZero
      );
      
      return solution.length > 0;
  } catch {
      return true; // Fail safe
  }
}

function yieldToMain() {
    return new Promise(resolve => setTimeout(resolve, 0));
}

// --- WORKER MAIN ---

const ctx: Worker = self as any;

ctx.onmessage = async (event) => {
  const msg = event.data;
  if (msg.type === 'START_NESTING') {
      try {
        console.log(`🦁 WiseWorker V8 (SVGNest Logic): Starting...`);
        await runNesting(msg);
      } catch (err: any) {
        console.error("Critical Worker Error:", err);
        ctx.postMessage({ type: 'ERROR', message: err.message });
      }
  }
};

async function runNesting(data: any) {
  const { parts, quantities, binWidth, binHeight } = data;
  const gap = Number(data.gap) || 0;
  const margin = Number(data.margin) || 0;
  
  const COARSE_STEP = 5; 
  const FINE_STEP = 1;   

  const partsQueue: any[] = [];
  
  parts.forEach((p: any) => {
    const qty = quantities[p.id] || 1;
    const complexPaths = partToClipperPaths(p);
    const bounds = getBounds(complexPaths);
    const area = bounds.width * bounds.height; 

    for (let i = 0; i < qty; i++) {
      partsQueue.push({
        ...p,
        uuid: Math.random().toString(36).substr(2, 9),
        paths: complexPaths,
        area: area,
        priority: area 
      });
    }
  });

  partsQueue.sort((a, b) => b.priority - a.priority);

  const placedParts: any[] = [];
  // Restored UNION strategy to fix the "Channel Closed" crash
  let obstaclesUnion: any[] = []; 
  const failedParts: any[] = [];
  
  const total = partsQueue.length;
  let processed = 0;
  let lastYieldTime = performance.now();

  for (const part of partsQueue) {
    let placed = false;
    const rotations = [0, 90]; 

    if (performance.now() - lastYieldTime > 50) {
        await yieldToMain();
        lastYieldTime = performance.now();
    }

    for (const rot of rotations) {
      if (placed) break;

      let rotatedPaths = rotatePaths(part.paths, rot);
      const bounds = getBounds(rotatedPaths); 
      rotatedPaths = translatePaths(rotatedPaths, -bounds.minX, -bounds.minY);
      
      const partW = (bounds.maxX - bounds.minX) / SCALE;
      const partH = (bounds.maxY - bounds.minY) / SCALE;

      const startX = margin;
      const startY = margin;
      const limitX = binWidth - margin - partW;
      const limitY = binHeight - margin - partH;

      if (limitX < startX || limitY < startY) continue; 

      // SVGNest Logic: Offset CANDIDATE for checking (Gap)
      const candidateForCheck = (gap > 0) 
          ? offsetPaths(rotatedPaths, gap) 
          : rotatedPaths;

      // Scanline
      for (let y = startY; y <= limitY; y += COARSE_STEP) {
        if (placed) break;
        
        if (performance.now() - lastYieldTime > 50) {
            await yieldToMain();
            lastYieldTime = performance.now();
        }

        for (let x = startX; x <= limitX; x += COARSE_STEP) {
          
          const coarseCandidate = translatePaths(candidateForCheck, x, y);
          
          if (!checkCollision(coarseCandidate, obstaclesUnion)) {
            
            // Local Refinement
            let bestX = x;
            let bestY = y;
            
            const searchRange = COARSE_STEP; 
            for(let fy = 0; fy < searchRange; fy += FINE_STEP) {
                const testY = Math.max(startY, y - fy);
                const fineCandY = translatePaths(candidateForCheck, x, testY);
                if (!checkCollision(fineCandY, obstaclesUnion)) {
                    bestY = testY;
                } else { break; }
            }

            for(let fx = 0; fx < searchRange; fx += FINE_STEP) {
                const testX = Math.max(startX, x - fx);
                const fineCandX = translatePaths(candidateForCheck, testX, bestY);
                if (!checkCollision(fineCandX, obstaclesUnion)) {
                    bestX = testX;
                } else { break; }
            }
            
            placedParts.push({
              partId: part.id,
              uuid: part.uuid,
              x: bestX,
              y: bestY,
              rotation: rot,
              binId: 0
            });

            // Update Union with the new part
            const realShape = translatePaths(rotatedPaths, bestX, bestY);
            
            if (obstaclesUnion.length === 0) {
                obstaclesUnion = realShape;
            } else {
                obstaclesUnion = unionObstacles(obstaclesUnion, realShape);
            }

            placed = true;
            break;
          }
        }
      }
    }

    if (!placed) {
      failedParts.push(part.id);
    }

    processed++;
    ctx.postMessage({
        type: 'PROGRESS',
        progress: Math.round((processed / total) * 100),
        message: `Nesting: ${processed}/${total}`
    });
  }

  ctx.postMessage({
    type: 'COMPLETED',
    result: {
      placed: placedParts,
      failed: failedParts,
      totalBins: 1
    }
  });
}