/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect } from "react";
import { calculateBoundingBox } from "../utils/geometryCore";

interface PartViewerModalProps {
  part: any;
  openPoints: any[];
  theme: any;
  onClose: () => void;
  onRotate: (direction: "cw" | "ccw") => void;
  onMirror: (id: string) => void;
  onToggleLock: (id: string) => void;
  onFixGeometry: () => void;
}

// --- FUNÇÃO DE RENDERIZAÇÃO LOCAL (Isolada para performance) ---
const renderEntityLocal = (entity: any, index: number, blocks?: any): React.ReactNode => {
  switch (entity.type) {
    case "INSERT": {
      if (!blocks || !blocks[entity.name]) return null;
      const block = blocks[entity.name];
      const bPos = entity.position || { x: 0, y: 0 };
      const bScale = entity.scale?.x || 1;
      const bRot = entity.rotation || 0;
      return (
        <g key={index} transform={`translate(${bPos.x}, ${bPos.y}) rotate(${bRot}) scale(${bScale})`}>
          {block.entities.map((child: any, i: number) => renderEntityLocal(child, i, blocks))}
        </g>
      );
    }
    case "LINE":
      return <line key={index} x1={entity.vertices[0].x} y1={entity.vertices[0].y} x2={entity.vertices[1].x} y2={entity.vertices[1].y} stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />;
    case "LWPOLYLINE":
    case "POLYLINE": {
      if (!entity.vertices) return null;
      const d = entity.vertices.map((v: any, i: number) => `${i === 0 ? "M" : "L"} ${v.x} ${v.y}`).join(" ");
      return <path key={index} d={entity.shape ? d + " Z" : d} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />;
    }
    case "CIRCLE":
      return <circle key={index} cx={entity.center.x} cy={entity.center.y} r={entity.radius} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />;
    case "ARC": {
      const { startAngle, endAngle, radius, center } = entity;
      const x1 = center.x + radius * Math.cos(startAngle);
      const y1 = center.y + radius * Math.sin(startAngle);
      const x2 = center.x + radius * Math.cos(endAngle);
      const y2 = center.y + radius * Math.sin(endAngle);
      let da = endAngle - startAngle;
      if (da < 0) da += 2 * Math.PI;
      const largeArc = da > Math.PI ? 1 : 0;
      const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
      return <path key={index} d={d} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />;
    }
    default: return null;
  }
};

export const PartViewerModalOptimized: React.FC<PartViewerModalProps> = ({
  part,
  openPoints,
  theme,
  onClose,
  onRotate,
  onMirror,
  onToggleLock,
  onFixGeometry,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef({ startX: 0, startY: 0, initialViewBox: { x: 0, y: 0 } });
  const [isPanning, setIsPanning] = useState(false);

  // Helper para calcular o ViewBox inicial
  const calcBox = (p: any) => {
    const box = calculateBoundingBox(p.entities, p.blocks);
    const w = box.maxX - box.minX || 100;
    const h = box.maxY - box.minY || 100;
    const pad = Math.max(w, h) * 0.2;
    return { x: box.minX - pad, y: box.minY - pad, w: w + pad * 2, h: h + pad * 2 };
  };

  // Estado Inicial
  const [viewBox, setViewBox] = useState(() => calcBox(part));

  // --- CORREÇÃO AQUI: Trocamos useRef por useState para o Derived State ---
  const [prevPartId, setPrevPartId] = useState(part.id);
  const [prevGeomString, setPrevGeomString] = useState(JSON.stringify(part.entities));

  const currentGeomString = JSON.stringify(part.entities);

  // Se o ID mudou OU a geometria mudou, reseta o zoom (ViewBox)
  if (part.id !== prevPartId || currentGeomString !== prevGeomString) {
     setPrevPartId(part.id);
     setPrevGeomString(currentGeomString);
     setViewBox(calcBox(part));
  }
  // -----------------------------------------------------------------------

  // --- ZOOM ---
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation(); e.preventDefault();
    const factor = e.deltaY > 0 ? 1.1 : 0.9;
    
    const rect = svgRef.current!.getBoundingClientRect();
    const ratioX = (e.clientX - rect.left) / rect.width;
    const ratioY = (e.clientY - rect.top) / rect.height;
    
    setViewBox(old => ({
      x: old.x - (old.w * factor - old.w) * ratioX,
      y: old.y - (old.h * factor - old.h) * ratioY,
      w: old.w * factor,
      h: old.h * factor
    }));
  };

  // --- PAN (ARRASTAR LISO) ---
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanning || !svgRef.current) return;
      
      const ctm = svgRef.current.getScreenCTM();
      if (!ctm) return;
      
      const dx = (e.clientX - dragRef.current.startX) / ctm.a;
      const dy = (e.clientY - dragRef.current.startY) / Math.abs(ctm.d);

      setViewBox(prev => ({
        ...prev,
        x: dragRef.current.initialViewBox.x - dx,
        y: dragRef.current.initialViewBox.y + dy
      }));
    };
    
    const handleMouseUp = () => setIsPanning(false);

    if (isPanning) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isPanning]);

  const handleCenter = () => setViewBox(calcBox(part));

  return (
    <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: theme.modalOverlay || "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center" }}>
      <div style={{ background: theme.modalBg, width: "80%", height: "80%", borderRadius: "8px", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 0 20px rgba(0,0,0,0.5)", border: `1px solid ${theme.border}` }}>
        
        {/* Header */}
        <div style={{ padding: "15px", borderBottom: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, color: theme.text }}>Visualização e Ajuste</h3>
          <button onClick={onClose} style={{ background: "transparent", border: "none", color: theme.text, fontSize: "20px", cursor: "pointer" }}>✕</button>
        </div>

        {/* Alerta de Pontos Abertos */}
        {openPoints.length > 0 && (
          <div style={{ background: "#fff3cd", color: "#856404", padding: "10px 15px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #ffeeba" }}>
             <div style={{display:'flex', alignItems:'center', gap:10}}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d9534f" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path><line x1="11" y1="13" x2="13" y2="11" stroke="#fff" strokeWidth="3" /></svg>
                <div style={{display:'flex', flexDirection:'column'}}><span style={{fontWeight:'bold', fontSize:13}}>Atenção: Perímetro Aberto</span><span style={{fontSize:11}}>Detectadas {openPoints.length} pontas soltas.</span></div>
             </div>
             <button onClick={onFixGeometry} style={{ background: "#d9534f", border: "none", color: "white", padding: "5px 10px", borderRadius: "4px", fontWeight: "bold", cursor: "pointer" }}>Fechar Peça</button>
          </div>
        )}

        {/* Área SVG */}
        <div style={{ flex: 1, background: theme.inputBg, position: "relative", overflow: "hidden" }} 
             onMouseDown={(e) => { e.preventDefault(); setIsPanning(true); dragRef.current = { startX: e.clientX, startY: e.clientY, initialViewBox: { ...viewBox } }; }}>
          <svg 
            ref={svgRef}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`} 
            style={{ width: "100%", height: "100%", cursor: isPanning ? "grabbing" : "grab" }}
            transform="scale(1, -1)" 
            preserveAspectRatio="xMidYMid meet"
            onWheel={handleWheel}
          >
            {/* Grid */}
            <defs><pattern id="gridModal" width="100" height="100" patternUnits="userSpaceOnUse"><path d="M 100 0 L 0 0 0 100" fill="none" stroke={theme.text} strokeOpacity="0.1" strokeWidth="1"/></pattern></defs>
            <rect x={viewBox.x - 50000} y={viewBox.y - 50000} width={100000} height={100000} fill="url(#gridModal)" />
            
            {part.entities.map((ent: any, i: number) => renderEntityLocal(ent, i, part.blocks))}
            
            {openPoints.map((p:any, idx:number) => (
              <circle key={idx} cx={p.x} cy={p.y} r={Math.max(part.width/40, 3)} fill="#d9534f" stroke="white" strokeWidth={1} vectorEffect="non-scaling-stroke">
                <animate attributeName="r" values="3;6;3" dur="1.5s" repeatCount="indefinite" />
              </circle>
            ))}
          </svg>
          <div style={{ position: 'absolute', bottom: 10, left: 10, fontSize: '11px', opacity: 0.6, color: theme.text, pointerEvents: 'none' }}>Scroll p/ Zoom • Arraste p/ Mover</div>
        </div>

        {/* Rodapé */}
        <div style={{ padding: "20px", borderTop: `1px solid ${theme.border}`, display: "flex", justifyContent: "center", gap: "10px", background: theme.modalBg }}>
           <button onClick={handleCenter} title="Centralizar" style={{ padding: "8px", background: theme.inputBg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: "4px", cursor: "pointer", display:'flex', alignItems:'center' }}>
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M22 12h-4M6 12H2M12 6V2M12 22v-4"/><circle cx="12" cy="12" r="2"/></svg>
           </button>
           
           <button onClick={() => onToggleLock(part.id)} style={{ padding: "8px", background: part.isRotationLocked ? "#dc3545" : "transparent", color: part.isRotationLocked ? "#fff" : theme.text, border: `1px solid ${part.isRotationLocked ? "#dc3545" : theme.border}`, borderRadius: "4px", cursor: "pointer", display:'flex', alignItems:'center' }}>
              {part.isRotationLocked ? 
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> : 
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></svg>}
           </button>

           <button onClick={() => !part.isRotationLocked && onRotate("ccw")} disabled={part.isRotationLocked} style={{ padding: "10px 20px", background: theme.inputBg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: "4px", cursor: part.isRotationLocked ? "not-allowed" : "pointer", opacity: part.isRotationLocked ? 0.5 : 1 }}>↺ Girar Anti</button>
           <button onClick={() => !part.isRotationLocked && onRotate("cw")} disabled={part.isRotationLocked} style={{ padding: "10px 20px", background: theme.inputBg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: "4px", cursor: part.isRotationLocked ? "not-allowed" : "pointer", opacity: part.isRotationLocked ? 0.5 : 1 }}>↻ Girar Hor.</button>
           
           <button onClick={() => onMirror(part.id)} style={{ padding: "6px 12px", borderRadius: "4px", border: `1px solid ${theme.border}`, background: theme.buttonBg || "#f0f0f0", color: theme.text, cursor: "pointer", display:'flex', alignItems:'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight:5}}><path d="M7.5 12h9" /><path d="M16.5 7.5L21 12l-4.5 4.5" /><path d="M7.5 7.5L3 12l4.5 4.5" /><line x1="12" y1="4" x2="12" y2="20" strokeDasharray="2 2" /></svg>
            Espelhar
           </button>
           
           <button onClick={onClose} style={{ padding: "10px 20px", background: "#007bff", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", marginLeft: "20px" }}>Concluir</button>
        </div>
      </div>
    </div>
  );
};