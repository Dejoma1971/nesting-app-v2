/// <reference lib="webworker" />

/* eslint-disable no-var */
/* eslint-disable @typescript-eslint/no-explicit-any */

// Importa a biblioteca Clipper (deve estar em public/workers/clipper.js)
importScripts('/workers/clipper.js');

declare var ClipperLib: any;

const SCALE = 10000; // Precisão para converter Float -> Int

// --- 1. FUNÇÕES DE GEOMETRIA E CONVERSÃO ---

// Converte graus para radianos
function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}

// Discretiza um Arco/Círculo em segmentos de reta
function approximateArc(
  cx: number, cy: number, r: number, 
  startAngle: number, endAngle: number, 
  segments = 16
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

// Converte a peça bruta (DXF entities) para Polígono do Clipper
function partToClipperPath(part: any) {
  const path: { X: number; Y: number }[] = [];
  
  if (!part.entities || part.entities.length === 0) {
    // Fallback: Cria um retângulo se não tiver geometria
    const w = (part.width || 100) * SCALE;
    const h = (part.height || 100) * SCALE;
    return [
      { X: 0, Y: 0 },
      { X: w, Y: 0 },
      { X: w, Y: h },
      { X: 0, Y: h }
    ];
  }

  // Tenta extrair o maior contorno fechado (Simplificação para Nesting)
  // Varre as entidades procurando Polylines ou Círculos
  
  part.entities.forEach((ent: any) => {
    // Se já temos um caminho complexo, ignoramos furos internos por enquanto 
    // (Para nesting básico, usamos o contorno externo)
    if (path.length > 0) return; 

    if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
      if (ent.vertices && ent.vertices.length > 2) {
        ent.vertices.forEach((v: any) => {
          path.push({ X: Math.round(v.x * SCALE), Y: Math.round(v.y * SCALE) });
        });
      }
    } else if (ent.type === 'CIRCLE') {
      const circlePath = approximateArc(ent.center.x, ent.center.y, ent.radius, 0, Math.PI * 2, 32);
      circlePath.forEach(p => path.push(p));
    } else if (ent.type === 'ARC') {
        // Arcos soltos geralmente não formam peças fechadas sozinhos, 
        // mas adicionamos logica se necessário.
    }
  });

  // Se falhar em achar geometria válida, usa o Bounding Box
  if (path.length < 3) {
    const w = (part.width || 50) * SCALE;
    const h = (part.height || 50) * SCALE;
    return [
      { X: 0, Y: 0 },
      { X: w, Y: 0 },
      { X: w, Y: h },
      { X: 0, Y: h }
    ];
  }

  return path;
}

// Rotaciona o caminho
function rotatePath(path: any[], angle: number) {
  if (angle === 0) return path;
  const rad = toRad(angle);
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  
  return path.map(p => ({
    X: Math.round(p.X * cos - p.Y * sin),
    Y: Math.round(p.X * sin + p.Y * cos)
  }));
}

// Move o caminho
function translatePath(path: any[], dx: number, dy: number) {
  const scaledDx = Math.round(dx * SCALE);
  const scaledDy = Math.round(dy * SCALE);
  return path.map(p => ({ X: p.X + scaledDx, Y: p.Y + scaledDy }));
}

// Pega os limites (Bounding Box)
function getBounds(path: any[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for(let i=0; i<path.length; i++) {
    const p = path[i];
    if (p.X < minX) minX = p.X;
    if (p.Y < minY) minY = p.Y;
    if (p.X > maxX) maxX = p.X;
    if (p.Y > maxY) maxY = p.Y;
  }
  return {
    minX: minX / SCALE,
    minY: minY / SCALE,
    maxX: maxX / SCALE,
    maxY: maxY / SCALE,
    width: (maxX - minX) / SCALE,
    height: (maxY - minY) / SCALE
  };
}

// Infla o polígono (Gap)
function offsetPath(path: any[], delta: number) {
  if (delta === 0) return [path];
  const co = new ClipperLib.ClipperOffset();
  const result = new ClipperLib.Paths();
  // JoinType: 0=Square, 1=Round, 2=Miter
  co.AddPath(path, ClipperLib.JoinType.jtSquare, ClipperLib.EndType.etClosedPolygon);
  co.Execute(result, delta * SCALE);
  return result; // Retorna array de caminhos
}

// Verifica colisão
function checkCollision(candidatePath: any[], obstacles: any[]) {
  if (obstacles.length === 0) return false;
  
  const clipper = new ClipperLib.Clipper();
  clipper.AddPath(candidatePath, ClipperLib.PolyType.ptSubject, true);
  clipper.AddPaths(obstacles, ClipperLib.PolyType.ptClip, true);
  
  const solution = new ClipperLib.Paths();
  // Interseção
  clipper.Execute(ClipperLib.ClipType.ctIntersection, solution);
  
  return solution.length > 0;
}

// --- 2. LÓGICA PRINCIPAL (WORKER) ---

const ctx: Worker = self as any;

ctx.onmessage = (event) => {
  const msg = event.data;
  
  // Tratamento para diferentes formatos de mensagem
  let data = msg;
  if (msg.type === 'START_NESTING') {
      data = msg; // Usa o payload direto
  }

  if (data.parts) {
    try {
      console.log('👷 WiseWorker Iniciado. Config:', { 
        gap: data.gap, 
        margin: data.margin, 
        bin: `${data.binWidth}x${data.binHeight}`
      });
      runNesting(data);
    } catch (err: any) {
      console.error(err);
      ctx.postMessage({ type: 'ERROR', message: err.message });
    }
  }
};

function runNesting(data: any) {
  const { parts, quantities, binWidth, binHeight } = data;
  // Garante números válidos para gap e margin
  const gap = Number(data.gap) || 0;
  const margin = Number(data.margin) || 0;
  const step = 5; // Resolução do Scanline (mm). Aumente para mais velocidade.

  // 1. Expande as peças baseado na quantidade
  // CORREÇÃO: Usar 'const' pois a referência do array não muda (apenas o conteúdo via push)
  const partsQueue: any[] = [];
  
  parts.forEach((p: any) => {
    const qty = quantities[p.id] || 1;
    // Converte geometria UMA VEZ
    const rawPath = partToClipperPath(p);
    // Garante orientação
    if (!ClipperLib.Clipper.Orientation(rawPath)) ClipperLib.Clipper.ReversePath(rawPath);
    // Limpa
    const cleanPath = ClipperLib.Clipper.CleanPolygon(rawPath, 1.1);
    
    // Calcula área para ordenação
    const bounds = getBounds(cleanPath);
    const area = bounds.width * bounds.height;

    for (let i = 0; i < qty; i++) {
      partsQueue.push({
        ...p,
        uuid: Math.random().toString(36).substr(2, 9), // ID único para a mesa
        path: cleanPath,
        area: area
      });
    }
  });

  // 2. Ordena por Área (Decrescente) - Estratégia First Fit Decreasing
  partsQueue.sort((a, b) => b.area - a.area);

  const placedParts: any[] = [];
  const obstacles: any[] = []; // Polígonos já colocados (inflados com gap)
  const failedParts: any[] = [];

  // CORREÇÃO: Usar 'const' pois o valor primitivo não é reatribuído
  const total = partsQueue.length;
  let processed = 0;

  // 3. Loop de Posicionamento
  for (const part of partsQueue) {
    let placed = false;
    // Rotações a testar (0 e 90 graus)
    const rotations = [0, 90];

    for (const rot of rotations) {
      if (placed) break;

      // Rotaciona
      let rotatedPath = rotatePath(part.path, rot);
      // Normaliza para 0,0 (remove coordenadas originais do DXF)
      const bounds = getBounds(rotatedPath);
      rotatedPath = translatePath(rotatedPath, -bounds.minX, -bounds.minY);

      // --- APLICAÇÃO DA MARGEM ---
      // Define os limites onde a peça pode começar (Top-Left da peça)
      const startX = margin;
      const startY = margin;
      const limitX = binWidth - margin - bounds.width;
      const limitY = binHeight - margin - bounds.height;

      // Se a peça for maior que a área útil (considerando margem), falha
      if (limitX < startX || limitY < startY) continue;

      // Scanline: Varre Y depois X (Bottom-Left strategy)
      for (let y = startY; y <= limitY; y += step) {
        if (placed) break;
        for (let x = startX; x <= limitX; x += step) {
          
          // Posiciona candidata
          const candidate = translatePath(rotatedPath, x, y);

          // Verifica colisão com obstáculos (que já incluem o GAP)
          if (!checkCollision(candidate, obstacles)) {
            
            // SUCESSO!
            placedParts.push({
              partId: part.id,
              uuid: part.uuid,
              x: x,
              y: y,
              rotation: rot,
              binId: 0
            });

            // Adiciona aos obstáculos INFLANDO COM O GAP
            // Assim, a próxima peça baterá na "borda invisível" do gap
            const inflated = offsetPath(candidate, gap);
            
            // CORREÇÃO: Tipagem explicita (p: any) para evitar erro no TypeScript
            inflated.forEach((p: any) => obstacles.push(p));

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
    // Reporta progresso a cada 5 peças para não travar mensagens
    if (processed % 5 === 0) {
      ctx.postMessage({
        type: 'PROGRESS',
        progress: Math.round((processed / total) * 100),
        message: `Analisando peça ${processed}/${total}`
      });
    }
  }

  // 4. Finaliza
  ctx.postMessage({
    type: 'COMPLETED',
    result: {
      placed: placedParts,
      failed: failedParts,
      totalBins: 1
    }
  });
}