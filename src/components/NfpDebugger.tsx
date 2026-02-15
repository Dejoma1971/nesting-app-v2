/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useEffect, useState, useRef, useMemo } from 'react';
import { partJsonToClipper } from '../utils/GeometrySanitizer';
import rawPartsData from '../mocks/peças_tela_engenharia01.json'; 

const SCALE = 1000; 

// --- AUXILIARES ---

const toWorkerFormat = (clipperPoly: any[]) => {
  return clipperPoly.map(p => ({
    x: p.X / SCALE,
    y: p.Y / SCALE
  }));
};

const workerPolyToSvg = (poly: any[]) => {
  if (!poly || poly.length === 0) return '';
  let d = `M ${poly[0].x} ${poly[0].y}`;
  for (let i = 1; i < poly.length; i++) {
    d += ` L ${poly[i].x} ${poly[i].y}`;
  }
  d += ' Z';
  return d;
};

// --- AUTO-ZOOM (Cálculo de Bounding Box) ---
const getBounds = (polygons: any[]) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasPoints = false;

  // Aceita array de polígonos OU um único polígono
  const list = Array.isArray(polygons[0]) ? polygons : [polygons];

  list.forEach((poly: any) => {
    if (!poly) return;
    poly.forEach((p: any) => {
      // Nota: p pode ser {X,Y} (Clipper) ou {x,y} (Worker). Normalizamos.
      const valX = p.x !== undefined ? p.x : p.X / SCALE;
      const valY = p.y !== undefined ? p.y : p.Y / SCALE;
      
      if (valX < minX) minX = valX;
      if (valX > maxX) maxX = valX;
      if (valY < minY) minY = valY;
      if (valY > maxY) maxY = valY;
      hasPoints = true;
    });
  });

  if (!hasPoints) return null;

  const width = maxX - minX;
  const height = maxY - minY;
  const padding = Math.max(width, height) * 0.2; // 20% de margem

  return {
    x: minX - padding,
    y: minY - padding,
    width: width + padding * 2,
    height: height + padding * 2
  };
};

export const NfpDebugger: React.FC = () => {
  const [status, setStatus] = useState('Iniciando...');
  const [nfpResultPoints, setNfpResultPoints] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Dados brutos (pontos) para poder calcular o zoom
  const [pointsA, setPointsA] = useState<any[] | null>(null);
  const [pointsB, setPointsB] = useState<any[] | null>(null);
  
  // Strings SVG para desenho
  const [pathA, setPathA] = useState<string>('');
  const [pathB, setPathB] = useState<string>('');

  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    workerRef.current = new Worker(new URL('../workers/nfpNesting.worker.ts', import.meta.url));

    workerRef.current.onmessage = (e) => {
      const { type, nfp, message } = e.data;
      
      if (type === 'NFP_RESULT') {
        setStatus('Sucesso! NFP Calculado.');
        setNfpResultPoints(nfp); // Salva os pontos brutos
      } else if (type === 'NFP_ERROR' || type === 'ERROR') {
        setStatus('Erro no cálculo.');
        setError(message);
      }
    };

    const runTest = () => {
      try {
        const parts = rawPartsData as any[];
        
        // PEÇAS CRÍTICAS PARA TESTE
        // Vamos tentar achar pelo ID ou Nome, se não pega os primeiros
        const rawA = parts.find(p => p.name.includes("A$C8285")) || parts[0];
        const rawB = parts.find(p => p.name.includes("A$C30901")) || parts[1];

        if (!rawA || !rawB) {
          setError("Não encontrei as peças no JSON.");
          return;
        }

        const polyA_Clipper = partJsonToClipper(rawA);
        const polyB_Clipper = partJsonToClipper(rawB);

        if (!polyA_Clipper[0] || !polyB_Clipper[0]) {
             setError("Erro ao sanitizar peças (polígono vazio).");
             return;
        }

        // Converte para formato Worker (Float)
        const pA = toWorkerFormat(polyA_Clipper[0]);
        const pB = toWorkerFormat(polyB_Clipper[0]);

        setPointsA(pA);
        setPointsB(pB);
        setPathA(workerPolyToSvg(pA));
        setPathB(workerPolyToSvg(pB));

        setStatus(`Calculando NFP de: ${rawA.name.substring(0,15)}... + ${rawB.name.substring(0,15)}...`);

        workerRef.current?.postMessage({
          type: 'CALCULATE_NFP',
          pair: {
            A: pA,
            B: pB,
            A_id: rawA.id,
            B_id: rawB.id,
            rotationA: 0,
            rotationB: 0,
            inside: false
          }
        });

      } catch (err: any) {
        setError(err.message);
      }
    };

    setTimeout(runTest, 500);
    return () => workerRef.current?.terminate();
  }, []);

  // --- CÁLCULO DINÂMICO DO VIEWBOX (O Segredo do Auto-Zoom) ---
  
  const viewBoxInput = useMemo(() => {
      if (!pointsA) return "0 0 100 100";
      // Queremos ver A e B juntos na entrada
      const bounds = getBounds(pointsB ? [pointsA, pointsB] : [pointsA]);
      if (!bounds) return "0 0 100 100";
      // Ajuste para Y invertido (scale 1, -1)
      return `${bounds.x} ${-bounds.y - bounds.height} ${bounds.width} ${bounds.height}`;
  }, [pointsA, pointsB]);

  const viewBoxOutput = useMemo(() => {
      if (!nfpResultPoints) return viewBoxInput; // Se não tem resultado, usa o zoom da entrada
      // O NFP é geralmente muito maior que as peças, precisamos focar nele + Peça A (referência)
      const bounds = getBounds([nfpResultPoints, pointsA]);
      if (!bounds) return "0 0 100 100";
      return `${bounds.x} ${-bounds.y - bounds.height} ${bounds.width} ${bounds.height}`;
  }, [nfpResultPoints, pointsA, viewBoxInput]);

  return (
    <div style={{ padding: 20, background: '#111', color: '#ccc', minHeight: '100vh', fontFamily: 'monospace' }}>
      <h2 style={{ borderBottom: '1px solid #333', paddingBottom: 10, color: '#fff' }}>
        🧪 Laboratório NFP (Minkowski Test)
      </h2>
      
      <div style={{ marginBottom: 20, padding: 15, background: error ? '#420000' : '#002200', border: error ? '1px solid #f00' : '1px solid #0f0', borderRadius: 5 }}>
        <strong style={{ color: error ? '#ff8080' : '#80ff80', fontSize: '1.2em' }}>
            {status}
        </strong>
        {error && <div style={{ color: '#ffaaaa', marginTop: 5 }}>{error}</div>}
      </div>

      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        
        {/* Painel Esquerdo: Entradas */}
        <div style={{ flex: 1, minWidth: 300 }}>
          <h3 style={{ color: '#fff' }}>Entrada: Peça A (Verde) + Peça B (Azul)</h3>
          <div style={{ border: '1px solid #444', height: 400, background: '#000', borderRadius: 8, overflow: 'hidden' }}>
            <svg width="100%" height="100%" viewBox={viewBoxInput} preserveAspectRatio="xMidYMid meet">
                <defs>
                    <pattern id="grid1" width="10" height="10" patternUnits="userSpaceOnUse">
                        <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#222" strokeWidth="0.5"/>
                    </pattern>
                </defs>
                <rect x="-50000" y="-50000" width="100000" height="100000" fill="url(#grid1)" />
                
                <g transform="scale(1, -1)">
                    {pathA && <path d={pathA} fill="rgba(0, 255, 0, 0.3)" stroke="#00ff00" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
                    {/* Movemos B para o lado apenas para visualização inicial */}
                    {pathB && <g transform="translate(10, 10)"> 
                        <path d={pathB} fill="rgba(0, 100, 255, 0.3)" stroke="#0088ff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                    </g>}
                </g>
            </svg>
          </div>
        </div>

        {/* Painel Direito: Resultado */}
        <div style={{ flex: 1, minWidth: 300 }}>
          <h3 style={{ color: '#fff' }}>Resultado: NFP (Vermelho)</h3>
          <div style={{ border: '1px solid #444', height: 400, background: '#000', borderRadius: 8, overflow: 'hidden' }}>
            <svg width="100%" height="100%" viewBox={viewBoxOutput} preserveAspectRatio="xMidYMid meet">
                <defs>
                    <pattern id="grid2" width="10" height="10" patternUnits="userSpaceOnUse">
                        <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#222" strokeWidth="0.5"/>
                    </pattern>
                </defs>
                <rect x="-50000" y="-50000" width="100000" height="100000" fill="url(#grid2)" />

                <g transform="scale(1, -1)">
                   {/* O NFP (Zona de Contato) */}
                   {nfpResultPoints && <path d={workerPolyToSvg(nfpResultPoints)} fill="rgba(255, 0, 0, 0.2)" stroke="#ff0000" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
                   
                   {/* Referência: Peça A Fixa no centro */}
                   {pathA && <path d={pathA} fill="rgba(0, 255, 0, 0.5)" stroke="none" />}
                </g>
            </svg>
          </div>
          <p style={{ fontSize: '0.8em', color: '#888', marginTop: 5 }}>
            * A área vermelha representa todas as posições onde o centro da Peça B colidiria com a Peça A.
            <br/>Se a Peça B "caminhar" sobre a linha vermelha, ela estará encostando perfeitamente na Peça A.
          </p>
        </div>

      </div>
    </div>
  );
};