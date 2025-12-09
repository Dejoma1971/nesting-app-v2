/* eslint-disable @typescript-eslint/no-explicit-any */
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import type { ImportedPart } from "./types";
import type { PlacedPart } from "../utils/nestingCore";
import { generateDxfContent } from "../utils/dxfWriter";
import { ContextControl } from "./ContextControl";
import { InteractiveCanvas } from "./InteractiveCanvas";
import { useUndoRedo } from "../hooks/useUndoRedo";
import { getTheme } from "../styles/theme";

import NestingWorker from "../workers/nesting.worker?worker";

interface Size {
  width: number;
  height: number;
}
interface NestingBoardProps {
  parts: ImportedPart[];
  onBack?: () => void;
}

// --- RENDER ENTITY (MANTIDO) ---
const renderEntityFunction = (
  entity: any,
  index: number,
  blocks: any,
  scale = 1,
  color: string = "currentColor"
): React.ReactNode => {
  switch (entity.type) {
    case "INSERT": {
      const block = blocks[entity.name];
      if (!block || !block.entities) return null;
      return (
        <g
          key={index}
          transform={`translate(${(entity.position?.x || 0) * scale}, ${
            (entity.position?.y || 0) * scale
          }) scale(${scale})`}
        >
          {block.entities.map((s: any, i: number) =>
            renderEntityFunction(s, i, blocks, 1, color)
          )}
        </g>
      );
    }
    case "LINE":
      return <line key={index} x1={entity.vertices[0].x * scale} y1={entity.vertices[0].y * scale} x2={entity.vertices[1].x * scale} y2={entity.vertices[1].y * scale} stroke={color} strokeWidth={2 * scale} vectorEffect="non-scaling-stroke" />;
    case "LWPOLYLINE":
    case "POLYLINE": {
      if (!entity.vertices) return null;
      const d = entity.vertices.map((v: any, i: number) => `${i === 0 ? "M" : "L"} ${v.x * scale} ${v.y * scale}`).join(" ");
      return <path key={index} d={entity.shape ? d + " Z" : d} fill="none" stroke={color} strokeWidth={2 * scale} vectorEffect="non-scaling-stroke" />;
    }
    case "CIRCLE":
      return <circle key={index} cx={entity.center.x * scale} cy={entity.center.y * scale} r={entity.radius * scale} fill="none" stroke={color} strokeWidth={2 * scale} vectorEffect="non-scaling-stroke" />;
    case "ARC": {
      const { startAngle, endAngle, radius, center } = entity;
      const r = radius * scale;
      const x1 = center.x * scale + r * Math.cos(startAngle);
      const y1 = center.y * scale + r * Math.sin(startAngle);
      const x2 = center.x * scale + r * Math.cos(endAngle);
      const y2 = center.y * scale + r * Math.sin(endAngle);
      let da = endAngle - startAngle;
      if (da < 0) da += 2 * Math.PI;
      const d = `M ${x1} ${y1} A ${r} ${r} 0 ${da > Math.PI ? 1 : 0} 1 ${x2} ${y2}`;
      return <path key={index} d={d} fill="none" stroke={color} strokeWidth={2 * scale} vectorEffect="non-scaling-stroke" />;
    }
    default: return null;
  }
};

const calculateBoundingBox = (entities: any[], blocksData: any) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const update = (x: number, y: number) => {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  };
  const traverse = (ents: any[], ox = 0, oy = 0) => {
    if (!ents) return;
    ents.forEach((ent) => {
      if (ent.type === "INSERT") {
        const b = blocksData[ent.name];
        if (b && b.entities) traverse(b.entities, (ent.position?.x || 0) + ox, (ent.position?.y || 0) + oy);
        else update((ent.position?.x || 0) + ox, (ent.position?.y || 0) + oy);
      } else if (ent.vertices) {
        ent.vertices.forEach((v: any) => update(v.x + ox, v.y + oy));
      } else if (ent.center && ent.radius && ent.type === "CIRCLE") {
        update(ent.center.x + ox - ent.radius, ent.center.y + oy - ent.radius);
        update(ent.center.x + ox + ent.radius, ent.center.y + oy + ent.radius);
      } else if (ent.type === "ARC") {
        const cx = ent.center.x + ox; const cy = ent.center.y + oy; const r = ent.radius;
        const startAngle = ent.startAngle; let endAngle = ent.endAngle;
        if (endAngle < startAngle) endAngle += 2 * Math.PI;
        update(cx + r * Math.cos(startAngle), cy + r * Math.sin(startAngle));
        update(cx + r * Math.cos(endAngle), cy + r * Math.sin(endAngle));
      }
    });
  };
  traverse(entities);
  if (minX === Infinity) return { minX: 0, minY: 0, width: 0, height: 0 };
  return { minX, minY, width: maxX - minX, height: maxY - minY };
};

// --- COMPONENTE PRINCIPAL ---
export const NestingBoard: React.FC<NestingBoardProps> = ({ parts, onBack }) => {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const theme = getTheme(isDarkMode);

  const [binSize, setBinSize] = useState<Size>({ width: 1200, height: 3000 });
  const [gap, setGap] = useState(10);
  const [margin, setMargin] = useState(10);
  const [strategy, setStrategy] = useState<"rect" | "true-shape">("rect");
  const [direction, setDirection] = useState<"auto" | "vertical" | "horizontal">("auto");
  const [iterations] = useState(50);
  const [rotationStep, setRotationStep] = useState(90);

  const [quantities, setQuantities] = useState<{ [key: string]: number }>(() => {
    const initialQ: { [key: string]: number } = {};
    parts.forEach((p) => { initialQ[p.id] = 1; });
    return initialQ;
  });

  const [activeTab, setActiveTab] = useState<"grid" | "list">("grid");
  const [showDebug, setShowDebug] = useState(true);

  // Undo/Redo Hook
  const [nestingResult, setNestingResult, undo, redo, resetNestingResult, canUndo, canRedo] = useUndoRedo<PlacedPart[]>([]);

  const [isComputing, setIsComputing] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  const [totalBins, setTotalBins] = useState(1);
  const [currentBinIndex, setCurrentBinIndex] = useState(0);
  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; } | null>(null);

  const workerRef = useRef<Worker | null>(null);

  // --- EFEITOS E HANDLERS ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuantities((prev) => {
      const currentIds = new Set(Object.keys(prev));
      const missingParts = parts.filter((p) => !currentIds.has(p.id));
      if (missingParts.length > 0) {
        const newQ = { ...prev };
        missingParts.forEach((p) => { newQ[p.id] = 1; });
        return newQ;
      }
      return prev;
    });
  }, [parts]);

  const handleContextRotate = useCallback((angle: number) => {
    if (selectedPartIds.length === 0) return;
    setNestingResult((prev) => prev.map((p) => selectedPartIds.includes(p.partId) ? { ...p, rotation: (p.rotation + angle) % 360 } : p));
  }, [selectedPartIds, setNestingResult]);

  const handleContextMove = useCallback((dx: number, dy: number) => {
    if (selectedPartIds.length === 0) return;
    setNestingResult((prev) => prev.map((p) => selectedPartIds.includes(p.partId) ? { ...p, x: p.x + dx, y: p.y - dy } : p));
  }, [selectedPartIds, setNestingResult]);

  const handlePartsMove = useCallback((moves: { partId: string; dx: number; dy: number }[]) => {
      if (moves.length === 0) return;
      setNestingResult((prev) => {
        const moveMap = new Map(moves.map(m => [m.partId, m]));
        return prev.map((p) => {
          const move = moveMap.get(p.partId);
          return move ? { ...p, x: p.x + move.dx, y: p.y + move.dy } : p;
        });
      });
  }, [setNestingResult]);

  const handlePartSelect = useCallback((ids: string[], append: boolean) => {
      setSelectedPartIds(prev => append ? [...new Set([...prev, ...ids])] : ids);
  }, []);

  const handlePartContextMenu = useCallback((e: React.MouseEvent, partId: string) => {
      e.preventDefault(); e.stopPropagation();
      if (!selectedPartIds.includes(partId)) setSelectedPartIds([partId]);
      setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
    }, [selectedPartIds]);

  const handleCalculate = useCallback(() => {
    if (parts.length === 0) return;
    setIsComputing(true);
    resetNestingResult([]); setCurrentBinIndex(0); setTotalBins(1); setSelectedPartIds([]);
    if (workerRef.current) workerRef.current.terminate();
    workerRef.current = new NestingWorker();
    workerRef.current.onmessage = (e) => {
      const result = e.data;
      resetNestingResult(result.placed);
      setFailedCount(result.failed.length);
      setTotalBins(result.totalBins || 1);
      setIsComputing(false);
      if (result.placed.length === 0) alert("Nenhuma peça coube!");
    };
    workerRef.current.postMessage({ parts: JSON.parse(JSON.stringify(parts)), quantities, gap, margin, binWidth: binSize.width, binHeight: binSize.height, strategy, iterations, rotationStep, direction });
  }, [parts, quantities, gap, margin, binSize, strategy, iterations, rotationStep, direction, resetNestingResult]);

  const handleClearTable = useCallback(() => {
      if (window.confirm("Deseja limpar todos os arranjos da mesa?")) {
          resetNestingResult([]);
          setFailedCount(0);
          setTotalBins(1);
          setCurrentBinIndex(0);
      }
  }, [resetNestingResult]);

  const handleDownload = useCallback(() => {
    if (nestingResult.length === 0) return;
    const currentBinParts = nestingResult.filter((p) => p.binId === currentBinIndex);
    const dxfString = generateDxfContent(currentBinParts, parts);
    const blob = new Blob([dxfString], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `nesting_chapa_${currentBinIndex + 1}.dxf`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [nestingResult, currentBinIndex, parts]);

  const updateQty = useCallback((id: string, val: number) => setQuantities((prev) => ({ ...prev, [id]: val })), []);
  const formatArea = useCallback((mm2: number) => mm2 > 100000 ? (mm2 / 1000000).toFixed(3) + " m²" : mm2.toFixed(0) + " mm²", []);
  const currentPlacedParts = useMemo(() => nestingResult.filter(p => p.binId === currentBinIndex), [nestingResult, currentBinIndex]);
  const getThumbnailViewBox = useCallback((part: ImportedPart) => {
      const box = calculateBoundingBox(part.entities, part.blocks);
      const p = Math.max(box.width, box.height) * 0.1;
      return `${box.minX - p} ${box.minY - p} ${box.width + p * 2} ${box.height + p * 2}`;
  }, []);

  // --- ESTILOS DINÂMICOS ---
  const containerStyle: React.CSSProperties = { display: "flex", flexDirection: "column", height: "100%", width: "100%", background: theme.bg, color: theme.text };
  const topBarStyle: React.CSSProperties = { padding: "10px 20px", borderBottom: `1px solid ${theme.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: theme.headerBg };
  const toolbarStyle: React.CSSProperties = { padding: "10px 20px", borderBottom: `1px solid ${theme.border}`, display: "flex", gap: "15px", alignItems: "center", backgroundColor: theme.panelBg, flexWrap: "wrap" };
  const inputStyle: React.CSSProperties = { padding: 5, borderRadius: 4, border: `1px solid ${theme.border}`, background: theme.inputBg, color: theme.text };
  const btnStyle = (active: boolean): React.CSSProperties => ({ padding: "4px 8px", border: "none", borderRadius: "3px", cursor: "pointer", background: active ? "#007bff" : "transparent", color: active ? "#fff" : theme.text, fontSize: "16px" });
  const tabStyle = (active: boolean): React.CSSProperties => ({ padding: "10px 15px", cursor: "pointer", background: "transparent", outline: "none", border: "none", borderBottom: active ? "2px solid #28a745" : "2px solid transparent", color: active ? theme.text : theme.label, fontWeight: active ? "bold" : "normal", fontSize: "13px" });

  return (
    <div style={containerStyle}>
      {contextMenu && contextMenu.visible && selectedPartIds.length > 0 && <ContextControl x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} onMove={handleContextMove} onRotate={handleContextRotate} />}

      {/* 1. FAIXA SUPERIOR */}
      <div style={topBarStyle}>
          <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
            {onBack && (
                <button onClick={onBack} title="Voltar" style={{background: 'transparent', border: 'none', color: theme.text, cursor: 'pointer', fontSize: '24px', display: 'flex', alignItems: 'center', padding: 0}}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                </button>
            )}
            <h2 style={{margin: 0, fontSize: '18px', color: '#007bff', whiteSpace: 'nowrap'}}>Planejamento de Corte</h2>
          </div>

          <div style={{ marginLeft: 'auto', paddingRight: '10px' }}>
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)} 
                title="Alternar Tema"
                style={{
                    background: 'transparent', 
                    border: `1px solid ${theme.border}`, 
                    color: theme.text, 
                    padding: '6px 12px', 
                    borderRadius: '20px', 
                    cursor: 'pointer',
                    fontSize: '16px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >
                 {isDarkMode ? '☀️' : '🌙'}
              </button>
          </div>
      </div>

      {/* 2. BARRA DE FERRAMENTAS */}
      <div style={toolbarStyle}>
        
        <div style={{ display: "flex", alignItems: "center", borderRight: `1px solid ${theme.border}`, paddingRight: "15px" }}>
          <span style={{ fontSize: "12px", marginRight: "5px", fontWeight: "bold" }}>Motor:</span>
          <select value={strategy} onChange={(e) => setStrategy(e.target.value as any)} style={inputStyle}>
            <option value="rect">🔳 Retangular</option>
            <option value="true-shape">🧩 True Shape</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", borderRight: `1px solid ${theme.border}`, paddingRight: "15px" }}>
          <span style={{ fontSize: "12px", marginRight: "5px", fontWeight: "bold" }}>Dir:</span>
          <div style={{ display: "flex", gap: "2px", background: theme.inputBg, borderRadius: "4px", padding: "2px" }}>
            <button title="Auto" onClick={() => setDirection("auto")} style={btnStyle(direction === 'auto')}>Auto</button>
            <button title="Vertical" onClick={() => setDirection("vertical")} style={btnStyle(direction === 'vertical')}>⬇️</button>
            <button title="Horizontal" onClick={() => setDirection("horizontal")} style={btnStyle(direction === 'horizontal')}>➡️</button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", background: theme.hoverRow, padding: "5px", borderRadius: "4px", gap: "5px" }}>
            <label style={{ fontSize: 12 }}>L:</label><input type="number" value={binSize.width} onChange={e => setBinSize(p => ({...p, width: Number(e.target.value)}))} style={{...inputStyle, width: 50}} />
            <label style={{ fontSize: 12 }}>A:</label><input type="number" value={binSize.height} onChange={e => setBinSize(p => ({...p, height: Number(e.target.value)}))} style={{...inputStyle, width: 50}} />
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label style={{ fontSize: 12 }}>Gap:</label><input type="number" value={gap} onChange={e => setGap(Number(e.target.value))} style={{...inputStyle, width: 40}} />
            <label style={{ fontSize: 12 }}>Margem:</label><input type="number" value={margin} onChange={e => setMargin(Number(e.target.value))} style={{...inputStyle, width: 40}} />
        </div>
        
        {strategy === 'true-shape' && (
            <div style={{ display: "flex", alignItems: "center" }}>
                <label style={{ fontSize: 12, marginRight: 5 }}>Rot:</label>
                <select value={rotationStep} onChange={e => setRotationStep(Number(e.target.value))} style={inputStyle}>
                    <option value="90">90°</option><option value="45">45°</option><option value="10">10°</option>
                </select>
            </div>
        )}

        <label style={{ fontSize: "12px", display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none" }}>
          <input 
            type="checkbox" 
            checked={showDebug} 
            onChange={(e) => setShowDebug(e.target.checked)} 
            style={{ marginRight: "5px" }} 
          />
          Ver Box
        </label>

        <div style={{ marginLeft: "auto", display: "flex", gap: "10px", alignItems: "center" }}>
          <button style={{ background: isComputing ? "#666" : "#28a745", color: "white", border: "none", padding: "8px 20px", cursor: isComputing ? "wait" : "pointer", borderRadius: "4px", fontWeight: "bold" }} onClick={handleCalculate} disabled={isComputing}>{isComputing ? "..." : "▶ Calcular"}</button>
          
          <button onClick={handleDownload} disabled={nestingResult.length === 0} style={{ background: "#007bff", color: "white", border: "none", padding: "8px 20px", cursor: nestingResult.length === 0 ? "not-allowed" : "pointer", borderRadius: "4px", opacity: nestingResult.length === 0 ? 0.5 : 1 }}>💾 DXF</button>
          
          <button 
            onClick={handleClearTable} 
            title="Limpar Mesa"
            style={{
                background: 'transparent', 
                color: '#dc3545', 
                border: `1px solid #dc3545`, 
                padding: '8px 12px', 
                borderRadius: '4px', 
                cursor: 'pointer',
                fontWeight: 'bold', fontSize: '13px'
            }}
          >
            🗑️
          </button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div style={{ flex: 2, position: "relative", background: theme.canvasBg, display: "flex", flexDirection: "column", overflow: "hidden" }} onMouseDown={() => setContextMenu(null)}>
          
          {/* BOTÕES DE UNDO/REDO (CENTRO) */}
          <div style={{ position: "absolute", bottom: 20, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 10, zIndex: 20 }}>
            <button onClick={undo} disabled={!canUndo} style={{ padding: "8px 15px", borderRadius: "20px", border: `1px solid ${theme.buttonBorder}`, background: theme.buttonBg, color: canUndo ? theme.buttonText : "#888", cursor: canUndo ? "pointer" : "default", boxShadow: "0 2px 5px rgba(0,0,0,0.2)", fontWeight: "bold", fontSize: "12px" }}>↩ Desfazer</button>
            <button onClick={redo} disabled={!canRedo} style={{ padding: "8px 15px", borderRadius: "20px", border: `1px solid ${theme.buttonBorder}`, background: theme.buttonBg, color: canRedo ? theme.buttonText : "#888", cursor: canRedo ? "pointer" : "default", boxShadow: "0 2px 5px rgba(0,0,0,0.2)", fontWeight: "bold", fontSize: "12px" }}>↪ Refazer</button>
          </div>

          {/* CONTROLE DE NAVEGAÇÃO DE CHAPAS (AGORA BOTTOM-RIGHT, ESTILIZADO) */}
          {totalBins > 1 && (
            <div style={{ 
                position: "absolute", 
                bottom: 20, 
                right: 20, // <--- POSICIONAMENTO BOTTOM-RIGHT
                zIndex: 20, 
                display: "flex", 
                alignItems: "center", 
                gap: "10px", 
                background: theme.buttonBg, // MESMO ESTILO DO UNDO
                padding: "5px 15px", 
                borderRadius: "20px", 
                border: `1px solid ${theme.buttonBorder}`,
                boxShadow: "0 2px 5px rgba(0,0,0,0.2)", 
                color: theme.buttonText 
            }}>
              <button onClick={() => setCurrentBinIndex(Math.max(0, currentBinIndex - 1))} disabled={currentBinIndex === 0} style={{ cursor: "pointer", border: "none", background: "transparent", fontWeight: "bold", color: theme.buttonText, opacity: currentBinIndex===0?0.3:1 }}>◀</button>
              <span style={{ fontWeight: "bold", fontSize: "13px" }}>Chapa {currentBinIndex + 1} de {totalBins}</span>
              <button onClick={() => setCurrentBinIndex(Math.min(totalBins - 1, currentBinIndex + 1))} disabled={currentBinIndex === totalBins - 1} style={{ cursor: "pointer", border: "none", background: "transparent", fontWeight: "bold", color: theme.buttonText, opacity: currentBinIndex===totalBins-1?0.3:1 }}>▶</button>
            </div>
          )}

          <InteractiveCanvas 
             parts={parts} placedParts={currentPlacedParts}
             binWidth={binSize.width} binHeight={binSize.height} margin={margin}
             showDebug={showDebug} strategy={strategy} theme={theme}
             selectedPartIds={selectedPartIds} onPartsMove={handlePartsMove} onPartSelect={handlePartSelect} onContextMenu={handlePartContextMenu}
          />

          <div style={{ padding: "10px 20px", display: "flex", gap: "20px", borderTop: `1px solid ${theme.border}`, background: theme.panelBg, zIndex: 5, color: theme.text }}>
            <span style={{ opacity: 0.6, fontSize: "12px" }}>{nestingResult.length > 0 ? `Total: ${nestingResult.length} Peças` : `Área: ${binSize.width}x${binSize.height}mm`}</span>
            {failedCount > 0 && <span style={{ color: "#dc3545", fontWeight: "bold", fontSize: "12px", background: "rgba(255,0,0,0.1)", padding: "2px 8px", borderRadius: "4px" }}>⚠️ {failedCount} NÃO COUBERAM</span>}
          </div>
        </div>

        <div style={{ width: "450px", borderLeft: `1px solid ${theme.border}`, display: "flex", flexDirection: "column", backgroundColor: theme.panelBg, zIndex: 5, color: theme.text }}>
          <div style={{ display: "flex", borderBottom: `1px solid ${theme.border}`, background: theme.headerBg }}>
            <button style={tabStyle(activeTab === "grid")} onClick={() => setActiveTab("grid")}>🔳 Banco de Peças</button>
            <button style={tabStyle(activeTab === "list")} onClick={() => setActiveTab("list")}>📄 Lista Técnica</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: activeTab === "grid" ? "15px" : "0" }}>
            {activeTab === "grid" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "15px", alignContent: "start" }}>
                {parts.map((part) => (
                  <div key={part.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ width: "100%", aspectRatio: "1/1", background: theme.cardBg, border: `1px solid ${theme.border}`, borderRadius: "8px", marginBottom: "8px", padding: "10px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg viewBox={getThumbnailViewBox(part)} style={{ width: "100%", height: "100%", overflow: "visible", color: theme.text }} transform="scale(1, -1)" preserveAspectRatio="xMidYMid meet">
                        {part.entities.map((ent, i) => renderEntityFunction(ent, i, part.blocks, 1, theme.text))}
                      </svg>
                    </div>
                    <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
                      <span title={part.name} style={{ fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70px" }}>{part.name}</span>
                      <div style={{ display: "flex", alignItems: "center", background: theme.hoverRow, borderRadius: "4px" }}>
                        <span style={{ padding: "0 4px", fontSize: 10, opacity: 0.7 }}>Qtd:</span>
                        <input type="number" min="1" value={quantities[part.id] || 1} onChange={(e) => updateQty(part.id, Number(e.target.value))} style={{ width: 35, border: "none", background: "transparent", textAlign: "center", color: theme.text, fontWeight: "bold", padding: "4px 0" }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {activeTab === "list" && (
              <table style={{ width: "100%", borderCollapse: "collapse", borderSpacing: 0 }}>
                <thead style={{ position: "sticky", top: 0, background: theme.panelBg, zIndex: 1 }}>
                  <tr>
                    <th style={{ padding: "10px", textAlign: "left", fontSize: "12px", opacity: 0.7, borderBottom: `1px solid ${theme.border}` }}>#</th>
                    <th style={{ padding: "10px", textAlign: "left", fontSize: "12px", opacity: 0.7, borderBottom: `1px solid ${theme.border}` }}>Peça</th>
                    <th style={{ padding: "10px", textAlign: "left", fontSize: "12px", opacity: 0.7, borderBottom: `1px solid ${theme.border}` }}>Dimensões</th>
                    <th style={{ padding: "10px", textAlign: "left", fontSize: "12px", opacity: 0.7, borderBottom: `1px solid ${theme.border}` }}>Área</th>
                    <th style={{ padding: "10px", textAlign: "left", fontSize: "12px", opacity: 0.7, borderBottom: `1px solid ${theme.border}` }}>Qtd.</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part, index) => (
                    <tr key={part.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: "8px 10px", fontSize: "13px" }}>{index + 1}</td>
                      <td style={{ padding: "8px 10px", fontSize: "13px", fontWeight: "bold" }}>{part.name}</td>
                      <td style={{ padding: "8px 10px", fontSize: "13px" }}>{part.width.toFixed(0)}x{part.height.toFixed(0)}</td>
                      <td style={{ padding: "8px 10px", fontSize: "13px" }}>{formatArea(part.grossArea)}</td>
                      <td style={{ padding: "8px 10px", fontSize: "13px" }}>
                        <input type="number" min="1" value={quantities[part.id] || 1} onChange={(e) => updateQty(part.id, Number(e.target.value))} style={{ width: 40, textAlign: "center", background: theme.inputBg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: 4 }} />
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