/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo } from 'react';
import { partJsonToClipper } from '../utils/GeometrySanitizer';

// Importe o JSON correto
import rawPartsData from '../mocks/peças_tela_engenharia01.json'; 

const SCALE = 1000; 

// --- 1. FUNÇÕES AUXILIARES DE VISUALIZAÇÃO ---

// Calcula a caixa envolvente (Bounding Box) para o Auto-Zoom
const getBounds = (polygons: any[]) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let hasPoints = false;

  polygons.forEach(poly => {
    poly.forEach((p: any) => {
      // Nota: Como o SVG tem Y invertido, e vamos usar scale(1, -1),
      // tratamos as coordenadas como se estivessem no plano cartesiano normal.
      const x = p.X / SCALE;
      const y = p.Y / SCALE;
      
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      hasPoints = true;
    });
  });

  if (!hasPoints) return null;

  const width = maxX - minX;
  const height = maxY - minY;
  const padding = Math.max(width, height) * 0.1; // 10% de margem

  return {
    x: minX - padding,
    y: minY - padding,
    width: width + padding * 2,
    height: height + padding * 2,
    // Centro para debug
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2
  };
};

// Gera o caminho SVG (String "M x y L x y...")
const clipperToSvgPath = (polygons: any[]) => {
  return polygons.map(poly => {
    if (!poly || poly.length === 0) return '';
    
    let d = `M ${poly[0].X / SCALE} ${poly[0].Y / SCALE}`;
    for (let i = 1; i < poly.length; i++) {
      d += ` L ${poly[i].X / SCALE} ${poly[i].Y / SCALE}`;
    }
    d += ' Z'; // Fecha o caminho
    return d;
  }).join(' ');
};

export const ShadowDebugger: React.FC = () => {
  
  // Processamento único (useMemo)
  const shadows = useMemo(() => {
    return (rawPartsData as any[]).map(part => {
      try {
        const clipperPolygons = partJsonToClipper(part);
        
        // Se vazio, marcamos como erro mas RETORNAMOS o objeto para exibir no grid
        if (!clipperPolygons || clipperPolygons.length === 0) {
          return {
            originalName: part.name,
            status: 'ERROR',
            message: 'Geometria vazia ou inválida (Gatekeeper bloqueou?)',
            vertexCount: 0
          };
        }

        const bounds = getBounds(clipperPolygons);
        
        return {
          originalName: part.name,
          status: 'OK',
          svgPath: clipperToSvgPath(clipperPolygons),
          bounds: bounds,
          // Contamos vértices totais para análise
          vertexCount: clipperPolygons.reduce((acc: number, p: any[]) => acc + p.length, 0)
        };

      } catch (err: any) {
        return {
          originalName: part.name,
          status: 'CRASH',
          message: err.message || 'Erro desconhecido no processamento',
          vertexCount: 0
        };
      }
    });
  }, []);

  return (
    <div style={{ padding: 20, background: '#111', minHeight: '100vh', color: '#ccc', fontFamily: 'monospace' }}>
      <h2 style={{ color: '#fff', borderBottom: '1px solid #333', paddingBottom: 10 }}>
        🕵️ Shadow Inspector 2.0
      </h2>
      <p>
        Total de Peças no JSON: <strong>{rawPartsData.length}</strong> | 
        Processadas com Sucesso: <strong style={{ color: '#4caf50' }}>{shadows.filter(s => s.status === 'OK').length}</strong>
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20, marginTop: 20 }}>
        
        {shadows.map((item: any, idx: number) => {
          
          // RENDERIZAÇÃO DE ERRO
          if (item.status !== 'OK') {
            return (
              <div key={idx} style={{ border: '1px solid #d32f2f', background: '#2c0b0e', padding: 15, borderRadius: 8 }}>
                <h4 style={{ color: '#ff8a80', margin: '0 0 10px 0' }}>#{idx + 1} {item.originalName}</h4>
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                  <span style={{ fontSize: 40 }}>⚠️</span>
                  <p style={{ textAlign: 'center', color: '#ffcdd2' }}>{item.message}</p>
                </div>
              </div>
            );
          }

          // RENDERIZAÇÃO DE SUCESSO
          // O ViewBox mágico que foca na peça onde quer que ela esteja
          // Nota: Como usamos scale(1,-1), o Y é invertido.
          // Para visualizar corretamente, precisamos inverter o Y do ViewBox também ou usar um truque de grupo.
          // Truque: O ViewBox vê o espaço do SVG. O Group inverte o sistema.
          // Se a peça está em Y=100 a Y=200. Com scale(1,-1) ela vai desenhar em Y=-100 a Y=-200.
          // Então o ViewBox precisa olhar para Y=-200 até Y=-100.
          
          const b = item.bounds;
          // Ajuste de ViewBox para coordenadas invertidas
          const viewBoxStr = `${b.x} ${-b.y - b.height} ${b.width} ${b.height}`;

          return (
            <div key={idx} style={{ border: '1px solid #333', background: '#1e1e1e', padding: 10, borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <h4 style={{ margin: 0, fontSize: 12, color: '#fff', maxWidth: '70%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.originalName}
                </h4>
                <span style={{ fontSize: 10, background: '#333', padding: '2px 6px', borderRadius: 4 }}>
                  {item.vertexCount} pts
                </span>
              </div>
              
              <div style={{ border: '1px solid #444', height: 300, background: '#000' }}>
                <svg width="100%" height="100%" viewBox={viewBoxStr} preserveAspectRatio="xMidYMid meet">
                  <defs>
                    <pattern id={`grid-${idx}`} width={b.width/10} height={b.width/10} patternUnits="userSpaceOnUse">
                      <path d={`M ${b.width/10} 0 L 0 0 0 ${b.width/10}`} fill="none" stroke="#222" strokeWidth={b.width/200}/>
                    </pattern>
                  </defs>
                  
                  {/* Grid de Fundo (opcional, ajustado à escala da peça) */}
                  <rect x={b.x} y={-b.y - b.height} width={b.width} height={b.height} fill={`url(#grid-${idx})`} />

                  {/* A Peça */}
                  <g transform="scale(1, -1)"> 
                     <path 
                       d={item.svgPath} 
                       fill="rgba(76, 175, 80, 0.2)" // Verde translúcido para Sólido
                       stroke="#4caf50"             // Verde Sólido para Contorno
                       strokeWidth={b.width / 150}  // Espessura relativa ao tamanho da peça
                       vectorEffect="non-scaling-stroke"
                     />
                  </g>
                </svg>
              </div>
              
              <div style={{ marginTop: 5, fontSize: 10, color: '#666', display: 'flex', gap: 10 }}>
                <span>W: {Math.round(b.width - b.width*0.2)}mm</span>
                <span>H: {Math.round(b.height - b.height*0.2)}mm</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};