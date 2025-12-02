/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { ImportedPart } from './types';
import type { PlacedPart } from '../utils/nestingCore';

// Importação especial do Vite para Web Workers
import NestingWorker from '../workers/nesting.worker?worker';

interface Size { width: number; height: number; }
interface NestingBoardProps { parts: ImportedPart[]; }

export const NestingBoard: React.FC<NestingBoardProps> = ({ parts }) => {
  const [binSize, setBinSize] = useState<Size>({ width: 3000, height: 1200 });
  const [gap, setGap] = useState(10);
  const [margin, setMargin] = useState(10);
  const [quantities, setQuantities] = useState<{ [key: string]: number }>({});
  const [activeTab, setActiveTab] = useState<'grid' | 'list'>('grid');
  const [showDebug, setShowDebug] = useState(true);

  // Estados de Processamento
  const [nestingResult, setNestingResult] = useState<PlacedPart[]>([]);
  const [isComputing, setIsComputing] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  
  // Referência para o Worker (para podermos cancelar se precisar)
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuantities((prev) => {
          const newQ = { ...prev };
          let changed = false;
          parts.forEach(p => { if (newQ[p.id] === undefined) { newQ[p.id] = 1; changed = true; } });
          return changed ? newQ : prev;
      });
  }, [parts]); 

  const handleCalculate = () => {
      if (parts.length === 0) return;
      
      setIsComputing(true);
      setNestingResult([]); // Limpa tela anterior

      // 1. Inicializa ou Reinicia o Worker
      if (workerRef.current) workerRef.current.terminate();
      workerRef.current = new NestingWorker();

      // 2. Define o que acontece quando o Worker terminar
      workerRef.current.onmessage = (e) => {
          const result = e.data;
          setNestingResult(result.placed);
          setFailedCount(result.failed.length);
          setIsComputing(false);
          
          if (result.placed.length === 0) alert("Nenhuma peça coube!");
          else if (result.failed.length > 0) console.warn("Algumas peças não couberam.");
      };

      // 3. Envia os dados para o Worker começar
      workerRef.current.postMessage({
          parts: JSON.parse(JSON.stringify(parts)), // Clone limpo dos dados
          quantities,
          gap,
          margin,
          binWidth: binSize.width,
          binHeight: binSize.height,
          iterations: 50 // Tenta 50 combinações diferentes (Genético Lite)
      });
  };

  const updateQty = (id: string, val: number) => setQuantities(prev => ({ ...prev, [id]: val }));
  const formatArea = (mm2: number) => mm2 > 100000 ? (mm2/1000000).toFixed(3)+" m²" : mm2.toFixed(0)+" mm²";
  const getPartById = (id: string) => parts.find(p => p.id === id);

  // --- FUNÇÕES DE AJUDA VISUAL (Inalteradas) ---
  const getRawBoundingBox = (entities: any[], blocksData: any) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const traverse = (ents: any[], ox = 0, oy = 0) => {
        if(!ents) return;
        ents.forEach(ent => {
            if (ent.type === 'INSERT') {
                const b = blocksData[ent.name];
                if (b && b.entities) traverse(b.entities, (ent.position?.x||0)+ox, (ent.position?.y||0)+oy);
                else { const x=(ent.position?.x||0)+ox, y=(ent.position?.y||0)+oy; if(x<minX)minX=x; if(x>maxX)maxX=x; if(y<minY)minY=y; if(y>maxY)maxY=y; }
            } else if (ent.vertices) {
                ent.vertices.forEach((v:any)=>{ const x=v.x+ox, y=v.y+oy; if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y; });
            } else if (ent.center && ent.radius) {
                const cx=ent.center.x+ox, cy=ent.center.y+oy;
                if(cx-ent.radius<minX)minX=cx-ent.radius; if(cy-ent.radius<minY)minY=cy-ent.radius;
                if(cx+ent.radius>maxX)maxX=cx+ent.radius; if(cy+ent.radius>maxY)maxY=cy+ent.radius;
            }
        });
    };
    traverse(entities);
    if (minX === Infinity) return { minX: 0, minY: 0, width: 0, height: 0 };
    return { minX, minY, width: maxX - minX, height: maxY - minY };
  };

  const getThumbnailViewBox = (entities: any[], blocks: any) => {
      const box = getRawBoundingBox(entities, blocks);
      const p = Math.max(box.width, box.height) * 0.1; 
      return `${box.minX - p} ${box.minY - p} ${box.width + p * 2} ${box.height + p * 2}`;
  };

  const renderEntity = (entity: any, index: number, blocks: any, offsetX = 0, offsetY = 0, scale = 1, color: string = "currentColor"): React.ReactNode => {
    switch (entity.type) {
      case 'INSERT': {
        const block = blocks[entity.name];
        if (!block || !block.entities) return null;
        return <g key={index} transform={`translate(${(entity.position?.x||0+offsetX)*scale}, ${(entity.position?.y||0+offsetY)*scale}) scale(${scale})`}>{block.entities.map((s:any, i:number)=>renderEntity(s, i, blocks, 0, 0, 1, color))}</g>;
      }
      case 'LINE': return <line key={index} x1={(entity.vertices[0].x+offsetX)*scale} y1={(entity.vertices[0].y+offsetY)*scale} x2={(entity.vertices[1].x+offsetX)*scale} y2={(entity.vertices[1].y+offsetY)*scale} stroke={color} strokeWidth={2*scale} vectorEffect="non-scaling-stroke" />;
      case 'LWPOLYLINE': case 'POLYLINE': { if (!entity.vertices) return null; const d = entity.vertices.map((v:any, i:number)=>`${i===0?'M':'L'} ${(v.x+offsetX)*scale} ${(v.y+offsetY)*scale}`).join(' '); return <path key={index} d={entity.shape?d+" Z":d} fill="none" stroke={color} strokeWidth={2*scale} vectorEffect="non-scaling-stroke" />; }
      case 'CIRCLE': return <circle key={index} cx={(entity.center.x+offsetX)*scale} cy={(entity.center.y+offsetY)*scale} r={entity.radius*scale} fill="none" stroke={color} strokeWidth={2*scale} vectorEffect="non-scaling-stroke" />;
      default: return null;
    }
  };

  const binViewBox = useMemo(() => {
      const mx = binSize.width * 0.05, my = binSize.height * 0.05;
      return `${-mx} ${-my} ${binSize.width + mx * 2} ${binSize.height + my * 2}`;
  }, [binSize]);

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
      padding: '10px 15px', cursor: 'pointer', background: 'transparent', outline: 'none', border: 'none',
      borderBottom: isActive ? '2px solid #28a745' : '2px solid transparent', color: isActive ? 'inherit' : 'rgba(128,128,128,0.7)', fontWeight: isActive ? 'bold' : 'normal', fontSize: '13px'
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* TOPO */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #444', display: 'flex', gap: '20px', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.03)', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>📐 Chapa:</div>
        <div style={{display:'flex', alignItems:'center'}}><label style={{marginRight:5, fontSize:13}}>L:</label><input type="number" value={binSize.width} onChange={e=>setBinSize({...binSize, width:Number(e.target.value)})} style={{padding:5, width:70, border:'1px solid #555', background:'rgba(0,0,0,0.1)', color:'inherit'}} /></div>
        <div style={{display:'flex', alignItems:'center'}}><label style={{marginRight:5, fontSize:13}}>A:</label><input type="number" value={binSize.height} onChange={e=>setBinSize({...binSize, height:Number(e.target.value)})} style={{padding:5, width:70, border:'1px solid #555', background:'rgba(0,0,0,0.1)', color:'inherit'}} /></div>
        <div style={{display:'flex', alignItems:'center', borderLeft:'1px solid #555', paddingLeft:'15px'}}><label style={{marginRight:5, fontSize:13}}>Gap:</label><input type="number" value={gap} onChange={e=>setGap(Number(e.target.value))} style={{padding:5, width:50, border:'1px solid #555', background:'rgba(0,0,0,0.1)', color:'inherit'}} /></div>
        <div style={{display:'flex', alignItems:'center'}}><label style={{marginRight:5, fontSize:13}}>Margem:</label><input type="number" value={margin} onChange={e=>setMargin(Number(e.target.value))} style={{padding:5, width:50, border:'1px solid #555', background:'rgba(0,0,0,0.1)', color:'inherit'}} /></div>
        
        <button 
            style={{ marginLeft: 'auto', background: isComputing ? '#666' : '#28a745', color: 'white', border: 'none', padding: '8px 20px', cursor: isComputing ? 'wait' : 'pointer', borderRadius: '4px', fontWeight: 'bold' }} 
            onClick={handleCalculate} disabled={isComputing}
        >
            {isComputing ? '⏳ Calculando...' : '▶ Calcular'}
        </button>
        <label style={{marginLeft: '10px', fontSize: '12px', display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect:'none'}}><input type="checkbox" checked={showDebug} onChange={e => setShowDebug(e.target.checked)} style={{marginRight: '5px'}}/>Ver Box</label>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* ESQUERDA: CHAPA */}
        <div style={{ flex: 2, position: 'relative', background: 'rgba(0,0,0,0.02)' }}>
            <svg viewBox={binViewBox} style={{ width: '100%', height: '100%' }} transform="scale(1, -1)" preserveAspectRatio="xMidYMid meet">
                <rect x="0" y="0" width={binSize.width} height={binSize.height} fill="none" stroke="#ff9800" strokeWidth="4" vectorEffect="non-scaling-stroke" />
                {showDebug && <rect x={margin} y={margin} width={binSize.width - margin*2} height={binSize.height - margin*2} fill="none" stroke="#999" strokeDasharray="5" strokeWidth="1" vectorEffect="non-scaling-stroke" />}

                {nestingResult.map((placed, i) => {
                    const part = getPartById(placed.partId);
                    if (!part) return null;
                    const rawBox = getRawBoundingBox(part.entities, part.blocks); 
                    
                    // Cálculo do centro de rotação (gira em torno do centro da peça)
                    const centerX = rawBox.minX + rawBox.width / 2;
                    const centerY = rawBox.minY + rawBox.height / 2;
                    
                    // Ajuste de posição: Movemos para 0,0 (subtraindo centro), rotacionamos, e movemos para posição final (x,y + meio da caixa ocupada)
                    // Simplificação Visual: Transladar para o X/Y calculado e aplicar rotação no grupo
                    
                    // Se estiver rotacionado, a caixa de ocupação inverte (W vira H)
                    const occupiedW = placed.rotation === 90 ? part.height : part.width;
                    const occupiedH = placed.rotation === 90 ? part.width : part.height;

                    // O 'placed.x' é o canto inferior esquerdo da caixa ocupada no Nesting.
                    // O desenho original tem coordenadas 'rawBox.minX, rawBox.minY'.
                    // Precisamos alinhar o desenho dentro da caixa ocupada.
                    
                    // 1. Move a peça para que seu centro fique em 0,0
                    const centerMove = `translate(${-centerX}, ${-centerY})`;
                    // 2. Aplica a rotação
                    const rotation = `rotate(${placed.rotation})`;
                    // 3. Move para a posição final (placed.x + metade da largura ocupada)
                    const finalMove = `translate(${placed.x + occupiedW/2}, ${placed.y + occupiedH/2})`;

                    return (
                        <g key={i}>
                            {showDebug && (
                                <rect x={placed.x} y={placed.y} width={occupiedW} height={occupiedH} fill="none" stroke="red" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.8"/>
                            )}
                            <g transform={`${finalMove} ${rotation} ${centerMove}`}>
                                {part.entities.map((ent, j) => renderEntity(ent, j, part.blocks, 0, 0, 1, "#007bff"))}
                            </g>
                        </g>
                    );
                })}
            </svg>
            <div style={{ position: 'absolute', bottom: 20, left: 20, display: 'flex', gap: '20px' }}>
                <span style={{opacity: 0.6, fontSize: '12px'}}>{nestingResult.length > 0 ? `Peças: ${nestingResult.length}` : `Área: ${binSize.width}x${binSize.height}mm`}</span>
                {failedCount > 0 && <span style={{ color: '#dc3545', fontWeight: 'bold', fontSize: '12px', background: 'rgba(255,0,0,0.1)', padding: '2px 8px', borderRadius: '4px' }}>⚠️ {failedCount} PEÇAS NÃO COUBERAM</span>}
            </div>
        </div>
        {/* DIREITA: PAINEL (Mantido) */}
        <div style={{ width: '450px', borderLeft: '1px solid #444', display: 'flex', flexDirection: 'column', backgroundColor: 'inherit' }}>
            {/* ... Conteúdo do painel lateral igual ao anterior ... */}
            {/* Vou omitir o código do painel direito aqui para não ficar gigante, pois ele não mudou. 
                Pode manter o código da resposta anterior para esta parte. */}
             <div style={{ display: 'flex', borderBottom: '1px solid #444', background: 'rgba(0,0,0,0.05)' }}>
                <button style={tabStyle(activeTab === 'grid')} onClick={() => setActiveTab('grid')}>🔳 Banco de Peças</button>
                <button style={tabStyle(activeTab === 'list')} onClick={() => setActiveTab('list')}>📄 Lista Técnica</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: activeTab === 'grid' ? '15px' : '0' }}>
                {activeTab === 'grid' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '15px', alignContent: 'start' }}>
                        {parts.map((part) => (
                            <div key={part.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div style={{ width: '100%', aspectRatio: '1/1', background: 'rgba(127,127,127,0.1)', borderRadius: '8px', marginBottom: '8px', padding: '10px', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg viewBox={getThumbnailViewBox(part.entities, part.blocks)} style={{ width: '100%', height: '100%', overflow: 'visible' }} transform="scale(1, -1)" preserveAspectRatio="xMidYMid meet">
                                        {part.entities.map((ent, i) => renderEntity(ent, i, part.blocks))}
                                    </svg>
                                </div>
                                <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                                    <span title={part.name} style={{ fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70px' }}>{part.name}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.1)', borderRadius: '4px' }}>
                                       <span style={{padding:'0 4px', fontSize:10, opacity:0.7}}>Qtd:</span>
                                       <input type="number" min="1" value={quantities[part.id] || 1} onChange={e => updateQty(part.id, Number(e.target.value))} style={{ width: 35, border: 'none', background: 'transparent', textAlign: 'center', color: 'inherit', fontWeight: 'bold', padding: '4px 0' }} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {activeTab === 'list' && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', borderSpacing: 0 }}>
                        <thead style={{ position: 'sticky', top: 0, background: 'inherit', zIndex: 1 }}>
                            <tr>
                                <th style={{padding: '10px', textAlign: 'left', borderBottom: '1px solid #555', fontSize: '12px', opacity: 0.7}}>#</th>
                                <th style={{padding: '10px', textAlign: 'left', borderBottom: '1px solid #555', fontSize: '12px', opacity: 0.7}}>Peça</th>
                                <th style={{padding: '10px', textAlign: 'left', borderBottom: '1px solid #555', fontSize: '12px', opacity: 0.7}}>Dimensões</th>
                                <th style={{padding: '10px', textAlign: 'left', borderBottom: '1px solid #555', fontSize: '12px', opacity: 0.7}}>Área</th>
                                <th style={{padding: '10px', textAlign: 'left', borderBottom: '1px solid #555', fontSize: '12px', opacity: 0.7}}>Qtd.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {parts.map((part, index) => (
                                <tr key={part.id} style={{ borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
                                    <td style={{padding: '8px 10px', fontSize: '13px'}}>{index + 1}</td>
                                    <td style={{padding: '8px 10px', fontSize: '13px', fontWeight:'bold'}} title={part.name}>{part.name.length>10?part.name.substring(0,10)+'...':part.name}</td>
                                    <td style={{padding: '8px 10px', fontSize: '13px'}}>{part.width.toFixed(0)}x{part.height.toFixed(0)}</td>
                                    <td style={{padding: '8px 10px', fontSize: '13px'}}>
                                        <div style={{fontSize:11, opacity:0.8}}>B: {formatArea(part.grossArea)}</div>
                                        <div style={{fontSize:11, color:'#28a745'}}>L: {formatArea(part.netArea)}</div>
                                    </td>
                                    <td style={{padding: '8px 10px', fontSize: '13px'}}>
                                        <input type="number" min="1" value={quantities[part.id] || 1} onChange={e => updateQty(part.id, Number(e.target.value))} style={{width: 40, padding: '5px', borderRadius: '4px', border: '1px solid #555', background: 'rgba(0,0,0,0.2)', color: 'inherit', textAlign: 'center'}} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};




// /* eslint-disable @typescript-eslint/no-explicit-any */
// import React, { useState, useMemo, useEffect } from "react";
// import type { ImportedPart } from "./types";

// interface Size {
//   width: number;
//   height: number;
// }
// interface NestingBoardProps {
//   parts: ImportedPart[];
// }

// export const NestingBoard: React.FC<NestingBoardProps> = ({ parts }) => {
//   const [binSize, setBinSize] = useState<Size>({ width: 3000, height: 1200 });
//   const [gap, setGap] = useState(5);
//   const [quantities, setQuantities] = useState<{ [key: string]: number }>({});

//   // ESTADO PARA ALTERNAR AS ABAS (Grid vs Lista)
//   const [activeTab, setActiveTab] = useState<"grid" | "list">("grid");

//   useEffect(() => {
//     // eslint-disable-next-line react-hooks/set-state-in-effect
//     setQuantities((prev) => {
//       const newQ = { ...prev };
//       let changed = false;
//       parts.forEach((p) => {
//         if (newQ[p.id] === undefined) {
//           newQ[p.id] = 1;
//           changed = true;
//         }
//       });
//       return changed ? newQ : prev;
//     });
//   }, [parts]);

//   // Helpers Matemáticos e de Formatação
//   const updateQty = (id: string, val: number) =>
//     setQuantities((prev) => ({ ...prev, [id]: val }));

//   const formatArea = (mm2: number) => {
//     if (mm2 > 100000) return (mm2 / 1000000).toFixed(3) + " m²";
//     return mm2.toFixed(0) + " mm²";
//   };

//   const getEntitiesBox = (entities: any[], blocksData: any) => {
//     let minX = Infinity,
//       minY = Infinity,
//       maxX = -Infinity,
//       maxY = -Infinity;
//     const traverse = (ents: any[], ox = 0, oy = 0) => {
//       if (!ents) return;
//       ents.forEach((ent) => {
//         if (ent.type === "INSERT") {
//           const b = blocksData[ent.name];
//           if (b && b.entities)
//             traverse(
//               b.entities,
//               (ent.position?.x || 0) + ox,
//               (ent.position?.y || 0) + oy
//             );
//           else {
//             const x = (ent.position?.x || 0) + ox,
//               y = (ent.position?.y || 0) + oy;
//             if (x < minX) minX = x;
//             if (x > maxX) maxX = x;
//             if (y < minY) minY = y;
//             if (y > maxY) maxY = y;
//           }
//         } else if (ent.vertices) {
//           ent.vertices.forEach((v: any) => {
//             const x = v.x + ox,
//               y = v.y + oy;
//             if (x < minX) minX = x;
//             if (y < minY) minY = y;
//             if (x > maxX) maxX = x;
//             if (y > maxY) maxY = y;
//           });
//         } else if (ent.center && ent.radius) {
//           const cx = ent.center.x + ox,
//             cy = ent.center.y + oy;
//           if (cx - ent.radius < minX) minX = cx - ent.radius;
//           if (cy - ent.radius < minY) minY = cy - ent.radius;
//           if (cx + ent.radius > maxX) maxX = cx + ent.radius;
//           if (cy + ent.radius > maxY) maxY = cy + ent.radius;
//         }
//       });
//     };
//     traverse(entities);
//     if (minX === Infinity) return "0 0 100 100";
//     const w = maxX - minX,
//       h = maxY - minY,
//       p = Math.max(w, h) * 0.1;
//     return `${minX - p} ${minY - p} ${w + p * 2} ${h + p * 2}`;
//   };

//   const renderEntity = (
//     entity: any,
//     index: number,
//     blocks: any,
//     offsetX = 0,
//     offsetY = 0,
//     scale = 1
//   ): React.ReactNode => {
//     switch (entity.type) {
//       case "INSERT": {
//         const block = blocks[entity.name];
//         if (!block || !block.entities) return null;
//         return (
//           <g
//             key={index}
//             transform={`translate(${
//               (entity.position?.x || 0 + offsetX) * scale
//             }, ${(entity.position?.y || 0 + offsetY) * scale}) scale(${scale})`}
//           >
//             {block.entities.map((s: any, i: number) =>
//               renderEntity(s, i, blocks)
//             )}
//           </g>
//         );
//       }
//       case "LINE":
//         return (
//           <line
//             key={index}
//             x1={(entity.vertices[0].x + offsetX) * scale}
//             y1={(entity.vertices[0].y + offsetY) * scale}
//             x2={(entity.vertices[1].x + offsetX) * scale}
//             y2={(entity.vertices[1].y + offsetY) * scale}
//             stroke="currentColor"
//             strokeWidth={2 * scale}
//             vectorEffect="non-scaling-stroke"
//           />
//         );
//       case "LWPOLYLINE":
//       case "POLYLINE": {
//         if (!entity.vertices) return null;
//         const d = entity.vertices
//           .map(
//             (v: any, i: number) =>
//               `${i === 0 ? "M" : "L"} ${(v.x + offsetX) * scale} ${
//                 (v.y + offsetY) * scale
//               }`
//           )
//           .join(" ");
//         // CORREÇÃO DA COR AZUL: fill="none"
//         return (
//           <path
//             key={index}
//             d={entity.shape ? d + " Z" : d}
//             fill="none"
//             stroke="currentColor"
//             strokeWidth={2 * scale}
//             vectorEffect="non-scaling-stroke"
//           />
//         );
//       }
//       case "CIRCLE":
//         // CORREÇÃO DA COR AZUL: fill="none"
//         return (
//           <circle
//             key={index}
//             cx={(entity.center.x + offsetX) * scale}
//             cy={(entity.center.y + offsetY) * scale}
//             r={entity.radius * scale}
//             fill="none"
//             stroke="currentColor"
//             strokeWidth={2 * scale}
//             vectorEffect="non-scaling-stroke"
//           />
//         );
//       default:
//         return null;
//     }
//   };

//   const binViewBox = useMemo(() => {
//     const mx = binSize.width * 0.05,
//       my = binSize.height * 0.05;
//     return `${-mx} ${-my} ${binSize.width + mx * 2} ${binSize.height + my * 2}`;
//   }, [binSize]);

//   // Estilos de Aba (Tab)
//   const tabStyle = (isActive: boolean): React.CSSProperties => ({
//     padding: "10px 15px",
//     cursor: "pointer",
//     borderBottom: isActive ? "2px solid #28a745" : "2px solid transparent",
//     color: isActive ? "inherit" : "rgba(128,128,128,0.7)",
//     fontWeight: isActive ? "bold" : "normal",
//     fontSize: "13px",
//     background: "transparent",
//     border: "none", // Remove bordas laterais/topo padrão
//     borderBottomWidth: "2px", // Garante que a borda inferior apareça
//     borderBottomStyle: "solid",
//     borderBottomColor: isActive ? "#28a745" : "transparent",
//     outline: "none",
//   });

//   return (
//     <div
//       style={{
//         display: "flex",
//         flexDirection: "column",
//         height: "100%",
//         width: "100%",
//       }}
//     >
//       {/* TOPO */}
//       <div
//         style={{
//           padding: "10px 20px",
//           borderBottom: "1px solid #444",
//           display: "flex",
//           gap: "20px",
//           alignItems: "center",
//           backgroundColor: "rgba(0,0,0,0.03)",
//         }}
//       >
//         <div style={{ fontWeight: "bold", fontSize: "14px" }}>📐 Chapa:</div>
//         <div style={{ display: "flex", alignItems: "center" }}>
//           <label style={{ marginRight: 5, fontSize: 13 }}>L:</label>
//           <input
//             type="number"
//             value={binSize.width}
//             onChange={(e) => setBinSize({ ...binSize, width: +e.target.value })}
//             style={{
//               padding: 5,
//               width: 70,
//               border: "1px solid #555",
//               background: "rgba(0,0,0,0.1)",
//               color: "inherit",
//             }}
//           />
//         </div>
//         <div style={{ display: "flex", alignItems: "center" }}>
//           <label style={{ marginRight: 5, fontSize: 13 }}>A:</label>
//           <input
//             type="number"
//             value={binSize.height}
//             onChange={(e) =>
//               setBinSize({ ...binSize, height: +e.target.value })
//             }
//             style={{
//               padding: 5,
//               width: 70,
//               border: "1px solid #555",
//               background: "rgba(0,0,0,0.1)",
//               color: "inherit",
//             }}
//           />
//         </div>
//         <div style={{ display: "flex", alignItems: "center" }}>
//           <label style={{ marginRight: 5, fontSize: 13 }}>Gap:</label>
//           <input
//             type="number"
//             value={gap}
//             onChange={(e) => setGap(+e.target.value)}
//             style={{
//               padding: 5,
//               width: 50,
//               border: "1px solid #555",
//               background: "rgba(0,0,0,0.1)",
//               color: "inherit",
//             }}
//           />
//         </div>
//         <button
//           style={{
//             marginLeft: "auto",
//             background: "#28a745",
//             color: "white",
//             border: "none",
//             padding: "8px 20px",
//             cursor: "pointer",
//             borderRadius: "4px",
//             fontWeight: "bold",
//           }}
//           onClick={() => alert(`Calculando...`)}
//         >
//           ▶ Calcular
//         </button>
//       </div>

//       <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
//         {/* ESQUERDA: CHAPA */}
//         <div
//           style={{
//             flex: 2,
//             position: "relative",
//             background: "rgba(0,0,0,0.02)",
//           }}
//         >
//           <svg
//             viewBox={binViewBox}
//             style={{ width: "100%", height: "100%" }}
//             transform="scale(1, -1)"
//             preserveAspectRatio="xMidYMid meet"
//           >
//             <rect
//               x="0"
//               y="0"
//               width={binSize.width}
//               height={binSize.height}
//               fill="none"
//               stroke="#ff9800"
//               strokeWidth="4"
//               vectorEffect="non-scaling-stroke"
//             />
//           </svg>
//           <div
//             style={{
//               position: "absolute",
//               bottom: 20,
//               left: 20,
//               opacity: 0.6,
//               fontSize: "12px",
//             }}
//           >
//             Área: {binSize.width}x{binSize.height}mm
//           </div>
//         </div>

//         {/* DIREITA: PAINEL COM ABAS */}
//         <div
//           style={{
//             width: "450px",
//             borderLeft: "1px solid #444",
//             display: "flex",
//             flexDirection: "column",
//             backgroundColor: "inherit",
//           }}
//         >
//           {/* CABEÇALHO DAS ABAS */}
//           <div
//             style={{
//               display: "flex",
//               borderBottom: "1px solid #444",
//               background: "rgba(0,0,0,0.05)",
//             }}
//           >
//             <button
//               style={tabStyle(activeTab === "grid")}
//               onClick={() => setActiveTab("grid")}
//             >
//               🔳 Banco de Peças
//             </button>
//             <button
//               style={tabStyle(activeTab === "list")}
//               onClick={() => setActiveTab("list")}
//             >
//               📄 Lista Técnica
//             </button>
//           </div>

//           <div
//             style={{
//               flex: 1,
//               overflowY: "auto",
//               padding: activeTab === "grid" ? "15px" : "0",
//             }}
//           >
//             {/* --- VISUALIZAÇÃO 1: GRADE (ICONES) --- */}
//             {activeTab === "grid" && (
//               <div
//                 style={{
//                   display: "grid",
//                   gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
//                   gap: "15px",
//                   alignContent: "start",
//                 }}
//               >
//                 {parts.map((part) => (
//                   <div
//                     key={part.id}
//                     style={{
//                       display: "flex",
//                       flexDirection: "column",
//                       alignItems: "center",
//                     }}
//                   >
//                     <div
//                       style={{
//                         width: "100%",
//                         aspectRatio: "1/1",
//                         background: "rgba(127,127,127,0.1)",
//                         borderRadius: "8px",
//                         marginBottom: "8px",
//                         padding: "10px",
//                         boxSizing: "border-box",
//                         display: "flex",
//                         alignItems: "center",
//                         justifyContent: "center",
//                       }}
//                     >
//                       <svg
//                         viewBox={getEntitiesBox(part.entities, part.blocks)}
//                         style={{
//                           width: "100%",
//                           height: "100%",
//                           overflow: "visible",
//                         }}
//                         transform="scale(1, -1)"
//                         preserveAspectRatio="xMidYMid meet"
//                       >
//                         {part.entities.map((ent, i) =>
//                           renderEntity(ent, i, part.blocks)
//                         )}
//                       </svg>
//                     </div>
//                     <div
//                       style={{
//                         width: "100%",
//                         display: "flex",
//                         justifyContent: "space-between",
//                         alignItems: "center",
//                         fontSize: "12px",
//                       }}
//                     >
//                       <span
//                         title={part.name}
//                         style={{
//                           fontWeight: "bold",
//                           overflow: "hidden",
//                           textOverflow: "ellipsis",
//                           whiteSpace: "nowrap",
//                           maxWidth: "70px",
//                         }}
//                       >
//                         {part.name}
//                       </span>
//                       <div
//                         style={{
//                           display: "flex",
//                           alignItems: "center",
//                           background: "rgba(0,0,0,0.1)",
//                           borderRadius: "4px",
//                         }}
//                       >
//                         <span
//                           style={{
//                             padding: "0 4px",
//                             fontSize: 10,
//                             opacity: 0.7,
//                           }}
//                         >
//                           Qtd:
//                         </span>
//                         <input
//                           type="number"
//                           min="1"
//                           value={quantities[part.id] || 1}
//                           onChange={(e) => updateQty(part.id, +e.target.value)}
//                           style={{
//                             width: 35,
//                             border: "none",
//                             background: "transparent",
//                             textAlign: "center",
//                             color: "inherit",
//                             fontWeight: "bold",
//                             padding: "4px 0",
//                           }}
//                         />
//                       </div>
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             )}

//             {/* --- VISUALIZAÇÃO 2: TABELA (LISTA) --- */}
//             {activeTab === "list" && (
//               <table
//                 style={{
//                   width: "100%",
//                   borderCollapse: "collapse",
//                   borderSpacing: 0,
//                 }}
//               >
//                 <thead
//                   style={{
//                     position: "sticky",
//                     top: 0,
//                     background: "inherit",
//                     zIndex: 1,
//                   }}
//                 >
//                   <tr>
//                     <th
//                       style={{
//                         padding: "10px",
//                         textAlign: "left",
//                         borderBottom: "1px solid #555",
//                         fontSize: "12px",
//                         opacity: 0.7,
//                       }}
//                     >
//                       #
//                     </th>
//                     <th
//                       style={{
//                         padding: "10px",
//                         textAlign: "left",
//                         borderBottom: "1px solid #555",
//                         fontSize: "12px",
//                         opacity: 0.7,
//                       }}
//                     >
//                       Peça
//                     </th>
//                     <th
//                       style={{
//                         padding: "10px",
//                         textAlign: "left",
//                         borderBottom: "1px solid #555",
//                         fontSize: "12px",
//                         opacity: 0.7,
//                       }}
//                     >
//                       Dimensões
//                     </th>
//                     <th
//                       style={{
//                         padding: "10px",
//                         textAlign: "left",
//                         borderBottom: "1px solid #555",
//                         fontSize: "12px",
//                         opacity: 0.7,
//                       }}
//                     >
//                       Área
//                     </th>
//                     <th
//                       style={{
//                         padding: "10px",
//                         textAlign: "left",
//                         borderBottom: "1px solid #555",
//                         fontSize: "12px",
//                         opacity: 0.7,
//                       }}
//                     >
//                       Qtd.
//                     </th>
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {parts.map((part, index) => (
//                     <tr
//                       key={part.id}
//                       style={{
//                         borderBottom: "1px solid rgba(128,128,128,0.1)",
//                       }}
//                     >
//                       <td style={{ padding: "8px 10px", fontSize: "13px" }}>
//                         {index + 1}
//                       </td>
//                       <td
//                         style={{
//                           padding: "8px 10px",
//                           fontSize: "13px",
//                           fontWeight: "bold",
//                         }}
//                         title={part.name}
//                       >
//                         {part.name.length > 10
//                           ? part.name.substring(0, 10) + "..."
//                           : part.name}
//                       </td>
//                       <td style={{ padding: "8px 10px", fontSize: "13px" }}>
//                         {part.width.toFixed(0)}x{part.height.toFixed(0)}
//                       </td>
//                       <td style={{ padding: "8px 10px", fontSize: "13px" }}>
//                         <div style={{ fontSize: 11, opacity: 0.8 }}>
//                           B: {formatArea(part.grossArea)}
//                         </div>
//                         <div style={{ fontSize: 11, color: "#28a745" }}>
//                           L: {formatArea(part.netArea)}
//                         </div>
//                       </td>
//                       <td style={{ padding: "8px 10px", fontSize: "13px" }}>
//                         <input
//                           type="number"
//                           min="1"
//                           value={quantities[part.id] || 1}
//                           onChange={(e) => updateQty(part.id, +e.target.value)}
//                           style={{
//                             width: 40,
//                             padding: "5px",
//                             borderRadius: "4px",
//                             border: "1px solid #555",
//                             background: "rgba(0,0,0,0.2)",
//                             color: "inherit",
//                             textAlign: "center",
//                           }}
//                         />
//                       </td>
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//             )}
//           </div>
//           <div
//             style={{
//               padding: "10px",
//               borderTop: "1px solid #444",
//               fontSize: "12px",
//               display: "flex",
//               justifyContent: "space-between",
//               opacity: 0.8,
//             }}
//           >
//             <span>Total Itens: {parts.length}</span>
//           </div>
//         </div>
//       </div>
//     </div>
//   );
// };
