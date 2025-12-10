/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { ImportedPart } from '../types';
import type { LabelConfig, PartLabelState } from './LabelTypes';
import { textToVectorLines } from '../../utils/vectorFont';

interface ThemeProps {
  bg: string;
  panelBg: string;
  headerBg: string;
  text: string;
  border: string;
  buttonBg: string;
  buttonBorder: string;
}

interface LabelEditorModalProps {
  part: ImportedPart;
  labelState: PartLabelState;
  onUpdate: (type: 'white' | 'pink', changes: Partial<LabelConfig>) => void;
  onClose: () => void;
  theme: ThemeProps;
}

// --- HELPER: MATEMÁTICA DE ARCOS ---
const bulgeToArc = (p1: {x: number, y: number}, p2: {x: number, y: number}, bulge: number) => {
    const chordDx = p2.x - p1.x;
    const chordDy = p2.y - p1.y;
    const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy);
    const radius = chordLen * (1 + bulge * bulge) / (4 * Math.abs(bulge));
    const cx = (p1.x + p2.x) / 2 - (chordDy * (1 - bulge * bulge)) / (4 * bulge);
    const cy = (p1.y + p2.y) / 2 + (chordDx * (1 - bulge * bulge)) / (4 * bulge);
    return { radius, cx, cy };
};

// --- CÁLCULO DE BOUNDING BOX (Determina o tamanho e centro reais) ---
const getBounds = (entities: any[], blocks: any = {}) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    const update = (x: number, y: number) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    };

    const checkArcBounds = (cx: number, cy: number, r: number, startAngle: number, endAngle: number) => {
        let start = startAngle % (2 * Math.PI); if (start < 0) start += 2 * Math.PI;
        let end = endAngle % (2 * Math.PI); if (end < 0) end += 2 * Math.PI;
        if (end < start) end += 2 * Math.PI;
        update(cx + r * Math.cos(startAngle), cy + r * Math.sin(startAngle));
        update(cx + r * Math.cos(endAngle), cy + r * Math.sin(endAngle));
        const cardinals = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2, 2 * Math.PI, 5 * Math.PI / 2];
        for (const ang of cardinals) {
            if (ang > start && ang < end) update(cx + r * Math.cos(ang), cy + r * Math.sin(ang));
        }
    };

    const traverse = (ents: any[], ox = 0, oy = 0) => {
        if(!ents) return;
        ents.forEach(ent => {
            if (ent.type === 'INSERT') {
                const block = blocks[ent.name];
                if (block && block.entities) traverse(block.entities, ox + (ent.position?.x||0), oy + (ent.position?.y||0));
                else if (ent.position) update(ox + ent.position.x, oy + ent.position.y);
            }
            else if (ent.vertices) {
                for (let i = 0; i < ent.vertices.length; i++) {
                    const v1 = ent.vertices[i];
                    update(ox + v1.x, oy + v1.y);
                    if (v1.bulge && v1.bulge !== 0) {
                        const v2 = ent.vertices[(i + 1) % ent.vertices.length];
                        if (i === ent.vertices.length - 1 && !ent.shape) continue;
                        const { cx, cy, radius } = bulgeToArc(v1, v2, v1.bulge);
                        const startAngle = Math.atan2(v1.y - cy, v1.x - cx);
                        let endAngle = Math.atan2(v2.y - cy, v2.x - cx);
                        if (v1.bulge > 0 && endAngle < startAngle) endAngle += 2 * Math.PI;
                        if (v1.bulge < 0 && endAngle > startAngle) endAngle -= 2 * Math.PI;
                        if (v1.bulge < 0) checkArcBounds(ox + cx, oy + cy, radius, endAngle, startAngle);
                        else checkArcBounds(ox + cx, oy + cy, radius, startAngle, endAngle);
                    }
                }
            } 
            else if (ent.center && ent.radius) { 
                if (ent.type === 'ARC') checkArcBounds(ox + ent.center.x, oy + ent.center.y, ent.radius, ent.startAngle, ent.endAngle);
                else { update(ox + ent.center.x - ent.radius, oy + ent.center.y - ent.radius); update(ox + ent.center.x + ent.radius, oy + ent.center.y + ent.radius); }
            }
        });
    };

    traverse(entities);
    if (minX === Infinity) return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100, cx: 50, cy: 50 };
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
};

export const LabelEditorModal: React.FC<LabelEditorModalProps> = ({
  part, labelState, onUpdate, onClose, theme
}) => {
  const [activeTab, setActiveTab] = useState<'white' | 'pink'>('white');
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, initialOffsetX: 0, initialOffsetY: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const bounds = useMemo(() => getBounds(part.entities, part.blocks), [part]);
  
  // --- ESTRATÉGIA DE CÂMERA INTELIGENTE ---
  // O ViewBox é fixo em torno do zero: (-w/2, -h/2, w, h)
  // O conteúdo dentro do SVG será transladado para que o centro da peça fique no zero.
  const viewBox = useMemo(() => {
    const margin = Math.max(bounds.width, bounds.height) * 0.25; // 25% de margem
    const width = bounds.width + margin * 2;
    const height = bounds.height + margin * 2;
    // Centraliza o ViewBox no (0,0)
    return `${-width / 2} ${-height / 2} ${width} ${height}`;
  }, [bounds]);

  const handleMouseDown = (e: React.MouseEvent, type: 'white' | 'pink') => {
    if (type !== activeTab) setActiveTab(type);
    e.preventDefault(); e.stopPropagation();
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, initialOffsetX: labelState[type].offsetX, initialOffsetY: labelState[type].offsetY };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !svgRef.current) return;
      const CTM = svgRef.current.getScreenCTM();
      if (!CTM) return;

      const scale = 1 / Math.abs(CTM.a);
      const deltaPixelX = e.clientX - dragRef.current.startX;
      const deltaPixelY = e.clientY - dragRef.current.startY;

      const dx = deltaPixelX * scale;
      // Inverte Y para compensar scale(1, -1)
      const dy = -(deltaPixelY * scale); 

      onUpdate(activeTab, {
        offsetX: dragRef.current.initialOffsetX + dx,
        offsetY: dragRef.current.initialOffsetY + dy
      });
    };
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) { window.addEventListener('mousemove', handleMouseMove); window.addEventListener('mouseup', handleMouseUp); }
    return () => { window.removeEventListener('mousemove', handleMouseMove); window.removeEventListener('mouseup', handleMouseUp); };
  }, [isDragging, activeTab, onUpdate]);

  const renderEntityRecursive = (ent: any, idx: number, blocks: any): React.ReactNode => {
      const stroke = theme.text;
      const opacity = 0.5;
      
      if (ent.type === 'INSERT') {
          const block = blocks[ent.name];
          if (!block) return null;
          return (
              <g key={idx} transform={`translate(${ent.position?.x||0}, ${ent.position?.y||0}) rotate(${ent.rotation||0}) scale(${ent.scale?.x||1})`}>
                  {block.entities.map((child:any, i:number) => renderEntityRecursive(child, i, blocks))}
              </g>
          );
      }
      if (ent.vertices) { 
          let d = `M ${ent.vertices[0].x} ${ent.vertices[0].y}`;
          for (let i=0; i<ent.vertices.length; i++) {
              const v1 = ent.vertices[i];
              const v2 = ent.vertices[(i+1)%ent.vertices.length];
              if (i === ent.vertices.length -1 && !ent.shape) break;
              if (v1.bulge) {
                  const {radius} = bulgeToArc(v1, v2, v1.bulge);
                  const la = Math.abs(v1.bulge)>1 ? 1 : 0;
                  const sw = v1.bulge>0 ? 1 : 0;
                  d += ` A ${radius} ${radius} 0 ${la} ${sw} ${v2.x} ${v2.y}`;
              } else { d += ` L ${v2.x} ${v2.y}`; }
          }
          if (ent.shape) d += " Z";
          return <path key={idx} d={d} stroke={stroke} strokeWidth="2" fill="none" opacity={opacity} vectorEffect="non-scaling-stroke" />;
      }
      if (ent.center && ent.radius) {
          if (ent.type === 'ARC') {
               const startX = ent.center.x + ent.radius * Math.cos(ent.startAngle);
               const startY = ent.center.y + ent.radius * Math.sin(ent.startAngle);
               const endX = ent.center.x + ent.radius * Math.cos(ent.endAngle);
               const endY = ent.center.y + ent.radius * Math.sin(ent.endAngle);
               let diff = ent.endAngle - ent.startAngle; if(diff<0) diff += Math.PI*2;
               const large = diff > Math.PI ? 1 : 0;
               const d = `M ${startX} ${startY} A ${ent.radius} ${ent.radius} 0 ${large} 1 ${endX} ${endY}`;
               return <path key={idx} d={d} stroke={stroke} strokeWidth="2" fill="none" opacity={opacity} vectorEffect="non-scaling-stroke" />;
          }
          return <circle key={idx} cx={ent.center.x} cy={ent.center.y} r={ent.radius} stroke={stroke} strokeWidth="2" fill="none" opacity={opacity} vectorEffect="non-scaling-stroke" />;
      }
      return null;
  };

  const renderVectorLabel = (type: 'white' | 'pink') => {
    const config = labelState[type];
    if (!config.active || !config.text) return null;
    const color = type === 'white' ? '#FFFFFF' : '#FF00FF';
    const displayColor = (type === 'white' && theme.bg === '#ffffff') ? '#333' : color; 

    // O texto é desenhado relativo ao centro da peça (0,0 neste contexto transformado)
    // Então só aplicamos o Offset configurado pelo usuário.
    const posX = config.offsetX;
    const posY = config.offsetY;

    const lines = textToVectorLines(config.text, 0, 0, config.fontSize, displayColor);

    return (
      <g transform={`translate(${posX}, ${posY}) rotate(${config.rotation})`} style={{ cursor: 'move' }} onMouseDown={(e) => handleMouseDown(e, type)}>
        <rect x={-config.text.length * config.fontSize * 0.3} y={-config.fontSize/2} width={config.text.length * config.fontSize * 0.6} height={config.fontSize} fill="transparent" stroke={activeTab === type ? "#007bff" : "transparent"} strokeDasharray="4" vectorEffect="non-scaling-stroke"/>
        {lines.map((line: any, i: number) => (<line key={i} x1={line.vertices[0].x} y1={line.vertices[0].y} x2={line.vertices[1].x} y2={line.vertices[1].y} stroke={displayColor} strokeWidth={2} vectorEffect="non-scaling-stroke" />))}
      </g>
    );
  };

  const renderControls = () => {
    const config = labelState[activeTab];
    const update = (changes: Partial<LabelConfig>) => onUpdate(activeTab, changes);
    const btnStyle: React.CSSProperties = { padding: '5px 10px', flex: 1, cursor: 'pointer', background: theme.buttonBg, border: `1px solid ${theme.buttonBorder}`, color: theme.text, borderRadius: 4 };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            <div><label style={{display:'block', fontSize:12, marginBottom:5}}>Conteúdo:</label><input type="text" value={config.text} onChange={(e) => update({ text: e.target.value })} style={{ width: '100%', padding: 8, background: theme.panelBg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius:4 }} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
                <div style={{flex:1}}><label style={{display:'block', fontSize:12, marginBottom:5}}>Tamanho:</label><input type="number" value={config.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} style={{ width: '100%', padding: 8, background: theme.panelBg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius:4 }} /></div>
                <div style={{flex:1}}><label style={{display:'block', fontSize:12, marginBottom:5}}>Rotação:</label><button onClick={() => update({ rotation: (config.rotation + 90) % 360 })} style={{...btnStyle, width: '100%', height: 34, marginTop: 1}}>🔄 {config.rotation}°</button></div>
            </div>
            <div><label style={{display:'block', fontSize:12, marginBottom:5, textAlign:'center'}}>Posição Fina:</label><div style={{ display: 'grid', gridTemplateColumns: '40px 40px 40px', gap: 5, justifyContent: 'center' }}><div></div><button style={btnStyle} onClick={() => update({ offsetY: config.offsetY + 1 })}>▲</button><div></div><button style={btnStyle} onClick={() => update({ offsetX: config.offsetX - 1 })}>◄</button><div>✥</div><button style={btnStyle} onClick={() => update({ offsetX: config.offsetX + 1 })}>►</button><div></div><button style={btnStyle} onClick={() => update({ offsetY: config.offsetY - 1 })}>▼</button><div></div></div></div>
            <div style={{borderTop: `1px solid ${theme.border}`, margin: '10px 0'}}></div>
            <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', background: theme.headerBg, padding: 10, borderRadius: 4 }}><input type="checkbox" checked={config.active} onChange={() => update({ active: !config.active })} style={{marginRight: 10}} /><span style={{fontWeight:'bold'}}>Habilitar {activeTab === 'white' ? 'ID' : 'Gravação'}</span></label>
        </div>
    );
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '90%', height: '85%', maxWidth:'1000px', backgroundColor: theme.bg, color: theme.text, borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.5)', display: 'flex', overflow: 'hidden', border: `1px solid ${theme.border}` }}>
            <div style={{ flex: 2, background: '#1e1e1e', position: 'relative', overflow: 'hidden' }}>
                <svg ref={svgRef} viewBox={viewBox} style={{width: '100%', height: '100%'}} preserveAspectRatio="xMidYMid meet">
                    <defs><pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/></pattern></defs>
                    <rect x={-50000} y={-50000} width={100000} height={100000} fill="url(#grid)" />
                    
                    {/* AQUI ESTÁ O SEGREDO DO "FIT": Normalizamos a peça para 0,0 */}
                    <g transform={`scale(1, -1) translate(${-bounds.cx}, ${-bounds.cy})`}> 
                        {part.entities.map((ent: any, i: number) => renderEntityRecursive(ent, i, part.blocks))}
                        {/* Agora o texto se baseia no centro da peça, não em coordenadas absolutas */}
                        <g transform={`translate(${bounds.cx}, ${bounds.cy})`}>
                            {renderVectorLabel('white')}
                            {renderVectorLabel('pink')}
                        </g>
                    </g>
                </svg>
                <div style={{position:'absolute', bottom: 10, left: 10, color: '#fff', fontSize: 12, opacity: 0.5}}>Dica: Arraste o texto para mover</div>
            </div>
            <div style={{ flex: 1, minWidth: '300px', borderLeft: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '15px', borderBottom: `1px solid ${theme.border}`, background: theme.headerBg }}><h3 style={{ margin: 0, fontSize: 16 }}>Editor</h3><div style={{fontSize: 12, opacity: 0.7, marginTop: 5}}>{part.name}</div></div>
                <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}` }}><button onClick={() => setActiveTab('white')} style={{ flex: 1, padding: 10, cursor: 'pointer', border: 'none', background: activeTab === 'white' ? theme.panelBg : 'transparent', color: activeTab === 'white' ? theme.text : '#888', fontWeight: 'bold', borderBottom: activeTab === 'white' ? '2px solid white' : 'none' }}>⚪ ID</button><button onClick={() => setActiveTab('pink')} style={{ flex: 1, padding: 10, cursor: 'pointer', border: 'none', background: activeTab === 'pink' ? theme.panelBg : 'transparent', color: activeTab === 'pink' ? '#FF00FF' : '#888', fontWeight: 'bold', borderBottom: activeTab === 'pink' ? '2px solid #FF00FF' : 'none' }}>🌸 Gravação</button></div>
                <div style={{ padding: 20, flex: 1, overflowY: 'auto', background: theme.panelBg }}>{renderControls()}</div>
                <div style={{ padding: 15, borderTop: `1px solid ${theme.border}`, textAlign: 'right', background: theme.headerBg }}><button onClick={onClose} style={{padding: '10px 25px', background: '#28a745', color:'white', border:'none', borderRadius:4, cursor:'pointer', fontWeight:'bold', fontSize:14}}>Concluir</button></div>
            </div>
        </div>
    </div>
  );
};