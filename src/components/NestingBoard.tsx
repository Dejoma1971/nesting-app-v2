/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useEffect, useRef } from 'react';
import type { ImportedPart } from './types';
import type { PlacedPart } from '../utils/nestingCore';
import { generateDxfContent } from '../utils/dxfWriter';

import NestingWorker from '../workers/nesting.worker?worker';

interface Size { width: number; height: number; }
interface NestingBoardProps { parts: ImportedPart[]; }

export const NestingBoard: React.FC<NestingBoardProps> = ({ parts }) => {
  const [binSize, setBinSize] = useState<Size>({ width: 1200, height: 3000 });
  const [gap, setGap] = useState(10);
  const [margin, setMargin] = useState(10);
  
  // CORREÇÃO PROBLEMA 2: Inicialização Lazy do estado
  // Calcula as quantidades iniciais APENAS UMA VEZ na montagem, evitando setState no useEffect
  const [quantities, setQuantities] = useState<{ [key: string]: number }>(() => {
      const initialQ: { [key: string]: number } = {};
      parts.forEach(p => { initialQ[p.id] = 1; });
      return initialQ;
  });

  const [activeTab, setActiveTab] = useState<'grid' | 'list'>('grid');
  const [showDebug, setShowDebug] = useState(true);

  // Estados de Resultado
  const [nestingResult, setNestingResult] = useState<PlacedPart[]>([]);
  const [isComputing, setIsComputing] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  const [totalBins, setTotalBins] = useState(1);
  const [currentBinIndex, setCurrentBinIndex] = useState(0);

  // Estados de Zoom/Pan
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const workerRef = useRef<Worker | null>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);

  // Effect para atualizar quantidades se NOVAS peças chegarem depois (Merge)
  useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuantities((prev) => {
          const newQ = { ...prev };
          let changed = false;
          parts.forEach(p => { 
              if (newQ[p.id] === undefined) { 
                  newQ[p.id] = 1; 
                  changed = true; 
              } 
          });
          return changed ? newQ : prev;
      });
  }, [parts]); 

  // --- LÓGICA DE ZOOM E PAN ---
  const resetZoom = () => setTransform({ x: 0, y: 0, k: 1 });

  const handleWheel = (e: React.WheelEvent) => {
      e.preventDefault();
      const scaleFactor = 1.1;
      const direction = e.deltaY > 0 ? 1 / scaleFactor : scaleFactor;
      const newScale = Math.max(0.1, Math.min(transform.k * direction, 20));

      if (svgContainerRef.current) {
        const rect = svgContainerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const newX = mouseX - (mouseX - transform.x) * (newScale / transform.k);
        const newY = mouseY - (mouseY - transform.y) * (newScale / transform.k);
        setTransform({ x: newX, y: newY, k: newScale });
      }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      if (e.button === 0 || e.button === 1) {
          setIsDragging(true);
          setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
      }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (isDragging) {
          setTransform(prev => ({ ...prev, x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }));
      }
  };

  const handleMouseUp = () => setIsDragging(false);
  const handleMouseLeave = () => setIsDragging(false);

  // --- MANIPULADORES DE ESTADO ---
  const handleWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      setBinSize(prev => ({ ...prev, width: val }));
  };

  const handleHeightChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      setBinSize(prev => ({ ...prev, height: val }));
  };

  const swapDimensions = () => {
      setBinSize(prev => ({ width: prev.height, height: prev.width }));
  };

  const handleCalculate = () => {
      if (parts.length === 0) return;
      setIsComputing(true);
      setNestingResult([]); 
      setCurrentBinIndex(0); 
      setTotalBins(1);
      resetZoom();

      if (workerRef.current) workerRef.current.terminate();
      workerRef.current = new NestingWorker();

      workerRef.current.onmessage = (e) => {
          const result = e.data;
          setNestingResult(result.placed);
          setFailedCount(result.failed.length);
          setTotalBins(result.totalBins || 1);
          setIsComputing(false);
          
          if (result.placed.length === 0) alert("Nenhuma peça coube!");
          else if (result.failed.length > 0) console.warn("Algumas peças não couberam.");
      };

      workerRef.current.postMessage({
          parts: JSON.parse(JSON.stringify(parts)),
          quantities,
          gap,
          margin,
          binWidth: binSize.width,
          binHeight: binSize.height,
          iterations: 50
      });
  };

  const handleDownload = () => {
    if (nestingResult.length === 0) return;
    const currentBinParts = nestingResult.filter(p => p.binId === currentBinIndex);
    const dxfString = generateDxfContent(currentBinParts, parts);
    const blob = new Blob([dxfString], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nesting_chapa_${currentBinIndex + 1}.dxf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const updateQty = (id: string, val: number) => setQuantities(prev => ({ ...prev, [id]: val }));
  const formatArea = (mm2: number) => mm2 > 100000 ? (mm2/1000000).toFixed(3)+" m²" : mm2.toFixed(0)+" mm²";
  const getPartById = (id: string) => parts.find(p => p.id === id);

  // --- VIEWBOX & HELPERS ---
  const binViewBox = useMemo(() => {
      const paddingX = binSize.width * 0.05;
      const paddingY = binSize.height * 0.05;
      return `${-paddingX} ${-paddingY} ${binSize.width + paddingX * 2} ${binSize.height + paddingY * 2}`;
  }, [binSize]);

  const cncTransform = `translate(0, ${binSize.height}) scale(1, -1)`;

  const getRawBoundingBox = (entities: any[], blocksData: any) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    const update = (x: number, y: number) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    };

    const traverse = (ents: any[], ox = 0, oy = 0) => {
        if(!ents) return;
        ents.forEach(ent => {
            if (ent.type === 'INSERT') {
                const b = blocksData[ent.name];
                if (b && b.entities) traverse(b.entities, (ent.position?.x||0)+ox, (ent.position?.y||0)+oy);
                else { update((ent.position?.x||0)+ox, (ent.position?.y||0)+oy); }
            } 
            else if (ent.vertices) {
                ent.vertices.forEach((v:any)=>{ update(v.x+ox, v.y+oy); });
            } 
            else if (ent.center && ent.radius && ent.type === 'CIRCLE') {
                update(ent.center.x+ox - ent.radius, ent.center.y+oy - ent.radius);
                update(ent.center.x+ox + ent.radius, ent.center.y+oy + ent.radius);
            }
            else if (ent.type === 'ARC') {
                const cx = ent.center.x + ox;
                const cy = ent.center.y + oy;
                const r = ent.radius;
                const startAngle = ent.startAngle;
                let endAngle = ent.endAngle;

                if (endAngle < startAngle) endAngle += 2 * Math.PI;

                update(cx + r * Math.cos(startAngle), cy + r * Math.sin(startAngle));
                update(cx + r * Math.cos(endAngle), cy + r * Math.sin(endAngle));

                const startK = Math.ceil(startAngle / (Math.PI / 2));
                const endK = Math.floor(endAngle / (Math.PI / 2));

                for (let k = startK; k <= endK; k++) {
                    const angle = k * (Math.PI / 2);
                    update(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
                }
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

  const renderEntity = (entity: any, index: number, blocks: any, scale = 1, color: string = "currentColor"): React.ReactNode => {
    switch (entity.type) {
      case 'INSERT': {
        const block = blocks[entity.name];
        if (!block || !block.entities) return null;
        return <g key={index} transform={`translate(${(entity.position?.x||0)*scale}, ${(entity.position?.y||0)*scale}) scale(${scale})`}>{block.entities.map((s:any, i:number)=>renderEntity(s, i, blocks, 1, color))}</g>;
      }
      case 'LINE': return <line key={index} x1={entity.vertices[0].x*scale} y1={entity.vertices[0].y*scale} x2={entity.vertices[1].x*scale} y2={entity.vertices[1].y*scale} stroke={color} strokeWidth={2*scale} vectorEffect="non-scaling-stroke" />;
      case 'LWPOLYLINE': case 'POLYLINE': { if (!entity.vertices) return null; const d = entity.vertices.map((v:any, i:number)=>`${i===0?'M':'L'} ${v.x*scale} ${v.y*scale}`).join(' '); return <path key={index} d={entity.shape?d+" Z":d} fill="none" stroke={color} strokeWidth={2*scale} vectorEffect="non-scaling-stroke" />; }
      case 'CIRCLE': return <circle key={index} cx={entity.center.x*scale} cy={entity.center.y*scale} r={entity.radius*scale} fill="none" stroke={color} strokeWidth={2*scale} vectorEffect="non-scaling-stroke" />;
      case 'ARC': {
          const startAngle = entity.startAngle;
          const endAngle = entity.endAngle;
          const r = entity.radius * scale;
          const x1 = (entity.center.x * scale) + r * Math.cos(startAngle);
          const y1 = (entity.center.y * scale) + r * Math.sin(startAngle);
          const x2 = (entity.center.x * scale) + r * Math.cos(endAngle);
          const y2 = (entity.center.y * scale) + r * Math.sin(endAngle);
          let da = endAngle - startAngle;
          if (da < 0) da += 2 * Math.PI;
          const largeArc = da > Math.PI ? 1 : 0;
          const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
          return <path key={index} d={d} fill="none" stroke={color} strokeWidth={2*scale} vectorEffect="non-scaling-stroke" />;
      }
      default: return null;
    }
  };

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
      padding: '10px 15px', cursor: 'pointer', background: 'transparent', outline: 'none', border: 'none',
      borderBottom: isActive ? '2px solid #28a745' : '2px solid transparent', color: isActive ? 'inherit' : 'rgba(128,128,128,0.7)', fontWeight: isActive ? 'bold' : 'normal', fontSize: '13px'
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      {/* --- TOPO --- */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid #444', display: 'flex', gap: '20px', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.03)', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>📐 Chapa:</div>
        
        <div style={{display:'flex', alignItems:'center', background:'rgba(0,0,0,0.05)', padding:'5px', borderRadius:'4px', gap:'10px'}}>
            <div style={{display:'flex', alignItems:'center'}}>
                <label style={{marginRight:5, fontSize:13}}>L (X):</label>
                <input type="number" value={binSize.width} onChange={handleWidthChange} style={{padding:5, width:60, border:'1px solid #555', background:'rgba(0,0,0,0.1)', color:'inherit'}} />
            </div>
            <div style={{display:'flex', alignItems:'center'}}>
                <label style={{marginRight:5, fontSize:13}}>A (Y):</label>
                <input type="number" value={binSize.height} onChange={handleHeightChange} style={{padding:5, width:60, border:'1px solid #555', background:'rgba(0,0,0,0.1)', color:'inherit'}} />
            </div>
            <button onClick={swapDimensions} title="Inverter X / Y" style={{cursor:'pointer', border:'none', background:'transparent', fontSize:'16px', padding:'0 5px'}}>🔄</button>
        </div>

        <div style={{display:'flex', alignItems:'center', borderLeft:'1px solid #555', paddingLeft:'15px'}}><label style={{marginRight:5, fontSize:13}}>Gap:</label><input type="number" value={gap} onChange={e=>setGap(Number(e.target.value))} style={{padding:5, width:50, border:'1px solid #555', background:'rgba(0,0,0,0.1)', color:'inherit'}} /></div>
        <div style={{display:'flex', alignItems:'center'}}><label style={{marginRight:5, fontSize:13}}>Margem:</label><input type="number" value={margin} onChange={e=>setMargin(Number(e.target.value))} style={{padding:5, width:50, border:'1px solid #555', background:'rgba(0,0,0,0.1)', color:'inherit'}} /></div>
        
        {/* NAVEGAÇÃO DE CHAPAS */}
        {totalBins > 1 && (
            <div style={{ display:'flex', alignItems:'center', borderLeft:'1px solid #555', paddingLeft:'15px', gap: '8px' }}>
                <span style={{ fontSize: '13px', opacity: 0.7 }}>Chapa:</span>
                <button onClick={() => setCurrentBinIndex(Math.max(0, currentBinIndex - 1))} disabled={currentBinIndex === 0} style={{ cursor: 'pointer', border: '1px solid #777', background: 'transparent', borderRadius: '4px', padding: '2px 8px', opacity: currentBinIndex === 0 ? 0.3 : 1 }}>◀</button>
                <span style={{ fontWeight: 'bold', fontSize: '13px' }}>{currentBinIndex + 1} / {totalBins}</span>
                <button onClick={() => setCurrentBinIndex(Math.min(totalBins - 1, currentBinIndex + 1))} disabled={currentBinIndex === totalBins - 1} style={{ cursor: 'pointer', border: '1px solid #777', background: 'transparent', borderRadius: '4px', padding: '2px 8px', opacity: currentBinIndex === totalBins - 1 ? 0.3 : 1 }}>▶</button>
            </div>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
            <button 
                style={{ background: isComputing ? '#666' : '#28a745', color: 'white', border: 'none', padding: '8px 20px', cursor: isComputing ? 'wait' : 'pointer', borderRadius: '4px', fontWeight: 'bold' }} 
                onClick={handleCalculate} disabled={isComputing}
            >
                {isComputing ? '⏳...' : '▶ Calcular'}
            </button>
            <button 
                onClick={handleDownload}
                disabled={nestingResult.length === 0}
                style={{ background: '#007bff', color: 'white', border: 'none', padding: '8px 20px', cursor: nestingResult.length === 0 ? 'not-allowed' : 'pointer', borderRadius: '4px', opacity: nestingResult.length === 0 ? 0.5 : 1 }}
            >
                💾 DXF
            </button>
        </div>
        <label style={{marginLeft: '10px', fontSize: '12px', display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect:'none'}}><input type="checkbox" checked={showDebug} onChange={e => setShowDebug(e.target.checked)} style={{marginRight: '5px'}}/>Ver Box</label>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* --- ÁREA DA CHAPA COM ZOOM --- */}
        <div 
            ref={svgContainerRef}
            style={{ 
                flex: 2, 
                position: 'relative', 
                background: 'transparent',
                display: 'flex', 
                flexDirection: 'column',
                cursor: isDragging ? 'grabbing' : 'grab',
                overflow: 'hidden' 
            }}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
        >
            
            {/* CONTROLES FLUTUANTES DE ZOOM */}
            <div style={{ position: 'absolute', right: 20, top: 20, display: 'flex', flexDirection: 'column', gap: '5px', zIndex: 10 }}>
                <button onClick={() => setTransform(t => ({...t, k: t.k * 1.2}))} style={{width:30, height:30, cursor:'pointer', background:'rgba(255,255,255,0.9)', border:'1px solid #777', color: '#000', borderRadius:'4px', fontWeight:'bold'}} title="Zoom In">+</button>
                <button onClick={() => setTransform(t => ({...t, k: t.k / 1.2}))} style={{width:30, height:30, cursor:'pointer', background:'rgba(255,255,255,0.9)', border:'1px solid #777', color: '#000', borderRadius:'4px', fontWeight:'bold'}} title="Zoom Out">-</button>
                <button onClick={resetZoom} style={{width:30, height:30, cursor:'pointer', background:'rgba(255,255,255,0.9)', border:'1px solid #777', color: '#000', borderRadius:'4px', fontSize:'12px'}} title="Resetar Vista">Fit</button>
            </div>

            <div style={{flex:1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px', overflow: 'hidden' }}>
                <svg 
                    viewBox={binViewBox} 
                    preserveAspectRatio="xMidYMid meet" 
                    style={{ width: '100%', height: '100%', maxHeight: '100%', maxWidth: '100%' }}
                >
                    <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
                        <g transform={cncTransform}>
                            <rect x="0" y="0" width={binSize.width} height={binSize.height} fill={showDebug ? "rgba(255,152,0,0.05)" : "none"} stroke="#ff9800" strokeWidth="4" vectorEffect="non-scaling-stroke" />
                            {showDebug && <rect x={margin} y={margin} width={binSize.width - margin*2} height={binSize.height - margin*2} fill="none" stroke="#999" strokeDasharray="5" strokeWidth="1" vectorEffect="non-scaling-stroke" />}

                            {nestingResult
                                .filter(p => p.binId === currentBinIndex) 
                                .map((placed, i) => {
                                const part = getPartById(placed.partId);
                                if (!part) return null;
                                const rawBox = getRawBoundingBox(part.entities, part.blocks); 
                                
                                const centerX = rawBox.minX + rawBox.width / 2;
                                const centerY = rawBox.minY + rawBox.height / 2;
                                
                                const occupiedW = placed.rotation === 90 ? part.height : part.width;
                                const occupiedH = placed.rotation === 90 ? part.width : part.height;

                                const centerMove = `translate(${-centerX}, ${-centerY})`;
                                const rotation = `rotate(${placed.rotation})`;
                                const finalMove = `translate(${placed.x + occupiedW/2}, ${placed.y + occupiedH/2})`;

                                return (
                                    <g key={i}>
                                        {showDebug && (
                                            <rect x={placed.x} y={placed.y} width={occupiedW} height={occupiedH} fill="none" stroke="red" strokeWidth="1" vectorEffect="non-scaling-stroke" opacity="0.8"/>
                                        )}
                                        <g transform={`${finalMove} ${rotation} ${centerMove}`}>
                                            {part.entities.map((ent, j) => renderEntity(ent, j, part.blocks, 1, "#007bff"))}
                                        </g>
                                    </g>
                                );
                            })}
                        </g>
                    </g>
                </svg>
            </div>
            
            <div style={{ padding: '10px 20px', display: 'flex', gap: '20px', borderTop: '1px solid #555', background: 'transparent' }}>
                <span style={{opacity: 0.6, fontSize: '12px'}}>{nestingResult.length > 0 ? `Total de Peças: ${nestingResult.length}` : `Área: ${binSize.width}x${binSize.height}mm`}</span>
                {failedCount > 0 && <span style={{ color: '#dc3545', fontWeight: 'bold', fontSize: '12px', background: 'rgba(255,0,0,0.1)', padding: '2px 8px', borderRadius: '4px' }}>⚠️ {failedCount} PEÇAS NÃO COUBERAM</span>}
            </div>
        </div>
        
        {/* --- PAINEL LATERAL --- */}
        <div style={{ width: '450px', borderLeft: '1px solid #444', display: 'flex', flexDirection: 'column', backgroundColor: 'inherit' }}>
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