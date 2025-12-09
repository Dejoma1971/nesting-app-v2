/* eslint-disable @typescript-eslint/no-explicit-any */
import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  forwardRef,
} from "react";
import type { ImportedPart } from "./types";
import type { PlacedPart } from "../utils/nestingCore";
import type { AppTheme } from "../styles/theme"; // <--- 1. Importando o tipo do Tema

// --- TIPAGEM ---
interface InteractiveCanvasProps {
  parts: ImportedPart[];
  placedParts: PlacedPart[];
  binWidth: number;
  binHeight: number;
  margin: number;
  showDebug: boolean;
  strategy: "rect" | "true-shape";
  selectedPartIds: string[];
  
  // 2. CORREÇÃO: Adicionada a propriedade theme na interface
  theme: AppTheme; 

  onPartsMove: (moves: { partId: string; dx: number; dy: number }[]) => void;
  onPartSelect: (partIds: string[], append: boolean) => void;
  onContextMenu: (e: React.MouseEvent, partId: string) => void;
}

interface BoundingBoxCache {
  [partId: string]: {
    minX: number;
    minY: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
  };
}

// ... (FUNÇÕES AUXILIARES DE RENDERIZAÇÃO MANTIDAS IGUAIS) ...
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
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  const traverse = (ents: any[], ox = 0, oy = 0) => {
    if (!ents) return;
    ents.forEach((ent) => {
      // 1. BLOCOS (INSERT)
      if (ent.type === "INSERT") {
        const b = blocksData[ent.name];
        if (b && b.entities) {
          traverse(b.entities, (ent.position?.x || 0) + ox, (ent.position?.y || 0) + oy);
        } else {
          update((ent.position?.x || 0) + ox, (ent.position?.y || 0) + oy);
        }
      } 
      // 2. LINHAS E POLILINHAS
      else if (ent.vertices) {
        ent.vertices.forEach((v: any) => update(v.x + ox, v.y + oy));
      } 
      // 3. CÍRCULOS
      else if (ent.center && ent.radius && ent.type === "CIRCLE") {
        update(ent.center.x + ox - ent.radius, ent.center.y + oy - ent.radius);
        update(ent.center.x + ox + ent.radius, ent.center.y + oy + ent.radius);
      } 
      // 4. ARCOS (CORRIGIDO)
      else if (ent.type === "ARC") {
        const cx = ent.center.x + ox;
        const cy = ent.center.y + oy;
        const r = ent.radius;
        
        // CORREÇÃO DO ESLINT AQUI:
        const startAngle = ent.startAngle; // 'const' pois não muda
        let endAngle = ent.endAngle;       // 'let' pois pode mudar abaixo

        // Normaliza para garantir que end > start (sentido anti-horário)
        if (endAngle < startAngle) endAngle += 2 * Math.PI;

        // A. Adiciona os pontos inicial e final do arco
        update(cx + r * Math.cos(startAngle), cy + r * Math.sin(startAngle));
        update(cx + r * Math.cos(endAngle), cy + r * Math.sin(endAngle));

        // B. Verifica pontos cardeais (0, 90, 180, 270 graus e suas voltas)
        const cardinalAngles = [
            0,              
            0.5 * Math.PI,  
            Math.PI,        
            1.5 * Math.PI,  
            2.0 * Math.PI,  
            2.5 * Math.PI,  
            3.0 * Math.PI   
        ];

        for (const angle of cardinalAngles) {
            // Se o ângulo cardeal está DENTRO do intervalo do arco
            if (angle > startAngle && angle < endAngle) {
                update(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
            }
        }
      }
    });
  };

  traverse(entities);
  if (minX === Infinity) return { minX: 0, minY: 0, width: 0, height: 0 };
  return { minX, minY, width: maxX - minX, height: maxY - minY };
};

// --- SUBCOMPONENTE DE PEÇA ---
interface PartElementProps {
  placed: PlacedPart;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent, partId: string) => void;
  onDoubleClick: (e: React.MouseEvent, partId: string) => void;
  onContextMenu: (e: React.MouseEvent, partId: string) => void;
  partData: ImportedPart | undefined;
  showDebug: boolean;
  strategy: "rect" | "true-shape";
  transformData: any;
  // 3. Adicionado theme aqui também
  theme: AppTheme; 
}

const PartElement = React.memo(forwardRef<SVGGElement, PartElementProps>(
  ({
    placed,
    isSelected,
    onMouseDown,
    onDoubleClick,
    onContextMenu,
    partData,
    showDebug,
    strategy,
    transformData,
    theme // 4. Recebendo theme
  }, ref) => {
    if (!partData) return null;

    const occupiedW = placed.rotation % 180 !== 0 ? partData.height : partData.width;
    const occupiedH = placed.rotation % 180 !== 0 ? partData.width : partData.height;

    const finalTransform = transformData
      ? `translate(${placed.x + transformData.occupiedW / 2}, ${
          placed.y + transformData.occupiedH / 2
        }) rotate(${placed.rotation}) translate(${-transformData.centerX}, ${-transformData.centerY})`
      : "";

    // 5. Usando theme para cor (Opcional, mas mantém coerência com modo escuro)
    const strokeColor = isSelected ? "#c94028ff" : (theme.text === '#e0e0e0' ? '#007bff' : '#007bff');

    return (
      <g
        ref={ref}
        onMouseDown={(e) => onMouseDown(e, placed.partId)}
        onDoubleClick={(e) => onDoubleClick(e, placed.partId)}
        onContextMenu={(e) => onContextMenu(e, placed.partId)}
        style={{
          cursor: strategy === "rect" ? "default" : isSelected ? "move" : "pointer",
          opacity: isSelected ? 0.8 : 1, 
        }}
      >
        <g>
          <rect
            x={placed.x}
            y={placed.y}
            width={occupiedW}
            height={occupiedH}
            fill="transparent"
            stroke={isSelected ? "#a3a3a0ff" : showDebug ? "red" : "none"}
            strokeWidth={isSelected ? 1 : 1}
            vectorEffect="non-scaling-stroke"
            pointerEvents="all"
          />
          <g transform={finalTransform} style={{ pointerEvents: "none" }}>
            {partData.entities.map((ent, j) =>
              renderEntityFunction(
                ent,
                j,
                partData.blocks,
                1,
                strokeColor
              )
            )}
          </g>
        </g>
      </g>
    );
  })
);
PartElement.displayName = "PartElement";

// --- COMPONENTE PRINCIPAL ---
export const InteractiveCanvas: React.FC<InteractiveCanvasProps> = ({
  parts,
  placedParts,
  binWidth,
  binHeight,
  margin,
  showDebug,
  strategy,
  selectedPartIds,
  onPartsMove,
  onPartSelect,
  onContextMenu,
  theme, // 6. Recebendo theme
}) => {
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [dragMode, setDragMode] = useState<"none" | "pan" | "parts">("none");
  const [boundingBoxCache, setBoundingBoxCache] = useState<BoundingBoxCache>({});
  
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const panGroupRef = useRef<SVGGElement>(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const rafRef = useRef<number | null>(null);

  const partRefs = useRef<{ [key: string]: SVGGElement | null }>({});
  const draggingIdsRef = useRef<string[]>([]);

  const dragRef = useRef({
    startX: 0, startY: 0, startSvgX: 0, startSvgY: 0, initialX: 0, initialY: 0,
  });

  const getSVGPoint = useCallback((clientX: number, clientY: number) => {
    const svgElement = svgContainerRef.current?.querySelector("svg");
    if (!svgElement) return { x: 0, y: 0 };
    const point = svgElement.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(svgElement.getScreenCTM()?.inverse());
  }, []);

  // --- LÓGICA DE TRANSFORMAÇÃO (MANTIDA) ---
  const updateTransform = useCallback((newT: { x: number; y: number; k: number }) => {
      transformRef.current = newT;
      setTransform(newT);
      if (panGroupRef.current) {
        panGroupRef.current.setAttribute("transform", `translate(${newT.x}, ${newT.y}) scale(${newT.k})`);
      }
    }, []);

  const resetZoom = useCallback(() => updateTransform({ x: 0, y: 0, k: 1 }), [updateTransform]);

  // --- HANDLER DE ZOOM (MANTIDO) ---
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault(); 
    e.stopPropagation();
    
    const svgElement = svgContainerRef.current?.querySelector("svg");
    if (!svgElement) return;
    
    let mouseX = 0, mouseY = 0;
    try {
      const point = svgElement.createSVGPoint();
      point.x = e.clientX; point.y = e.clientY;
      const svgPoint = point.matrixTransform(svgElement.getScreenCTM()?.inverse());
      mouseX = svgPoint.x; mouseY = svgPoint.y;
    } catch { 
       const rect = svgContainerRef.current!.getBoundingClientRect();
       mouseX = e.clientX - rect.left; mouseY = e.clientY - rect.top;
    }
    
    const zoomIntensity = 0.15;
    const wheelDirection = e.deltaY < 0 ? 1 : -1;
    const scaleFactor = Math.exp(wheelDirection * zoomIntensity);
    
    const currentT = transformRef.current;
    let newScale = currentT.k * scaleFactor;
    newScale = Math.max(0.1, Math.min(newScale, 50));
    
    const scaleRatio = newScale / currentT.k;
    const newX = mouseX - (mouseX - currentT.x) * scaleRatio;
    const newY = mouseY - (mouseY - currentT.y) * scaleRatio;
    
    updateTransform({ x: newX, y: newY, k: newScale });
  }, [updateTransform]);

  // --- HANDLERS MOUSE (MANTIDOS) ---
  const handleMouseDownContainer = useCallback((e: React.MouseEvent) => {
      setDragMode("pan");
      dragRef.current = {
          startX: e.clientX, startY: e.clientY, startSvgX: 0, startSvgY: 0,
          initialX: transformRef.current.x, initialY: transformRef.current.y
      };
    }, []);

  const handleDoubleClickContainer = useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      onPartSelect([], false);
  }, [onPartSelect]);

  const partTransforms = useMemo(() => {
    const transforms: Record<string, any> = {};
    placedParts.forEach((placed) => {
      const part = parts.find((p) => p.id === placed.partId);
      if (!part) return;
      const cachedBox = boundingBoxCache[placed.partId];
      let box;
      if (cachedBox) {
        box = cachedBox;
      } else {
        box = calculateBoundingBox(part.entities, part.blocks);
        const newBox = {
          ...box, centerX: box.minX + box.width / 2, centerY: box.minY + box.height / 2,
        };
        requestAnimationFrame(() => {
          setBoundingBoxCache((prev) => ({ ...prev, [placed.partId]: newBox }));
        });
        box = newBox;
      }
      transforms[placed.partId] = {
        centerX: box.centerX, centerY: box.centerY,
        occupiedW: placed.rotation % 180 !== 0 ? part.height : part.width,
        occupiedH: placed.rotation % 180 !== 0 ? part.width : part.height,
      };
    });
    return transforms;
  }, [placedParts, parts, boundingBoxCache]);

  const handleDoubleClickPart = useCallback((e: React.MouseEvent, partId: string) => {
      e.preventDefault(); e.stopPropagation();
      const isCtrl = e.ctrlKey || e.metaKey;
      let newSelection = [...selectedPartIds];
      if (isCtrl) {
        if (newSelection.includes(partId)) newSelection = newSelection.filter((id) => id !== partId);
        else newSelection.push(partId);
        onPartSelect(newSelection, false);
      } else {
        onPartSelect([partId], false);
      }
    }, [selectedPartIds, onPartSelect]);

  const handleMouseDownPart = useCallback((e: React.MouseEvent, partId: string) => {
      e.stopPropagation();
      if (!selectedPartIds.includes(partId)) return;
      if (strategy !== "rect" && e.button === 0) {
        e.preventDefault();
        setDragMode("parts");
        draggingIdsRef.current = selectedPartIds;
        const svgPos = getSVGPoint(e.clientX, e.clientY);
        draggingIdsRef.current.forEach(id => {
            const el = partRefs.current[id];
            if (el) {
                el.style.transform = "translate3d(0, 0, 0)";
                el.style.willChange = "transform";
                el.style.cursor = "grabbing";
            }
        });
        dragRef.current = {
            startX: e.clientX, startY: e.clientY, startSvgX: svgPos.x, startSvgY: svgPos.y, initialX: 0, initialY: 0
        };
      }
    }, [strategy, selectedPartIds, getSVGPoint]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
      if (dragMode === "none") return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        if (dragMode === "pan" && panGroupRef.current) {
          const dx = e.clientX - dragRef.current.startX;
          const dy = e.clientY - dragRef.current.startY;
          const currentK = transformRef.current.k;
          const newX = dragRef.current.initialX + dx;
          const newY = dragRef.current.initialY + dy;
          transformRef.current.x = newX;
          transformRef.current.y = newY;
          panGroupRef.current.setAttribute("transform", `translate(${newX}, ${newY}) scale(${currentK})`);
        } 
        else if (dragMode === "parts") {
          const currentSvgPos = getSVGPoint(e.clientX, e.clientY);
          const deltaX = currentSvgPos.x - dragRef.current.startSvgX;
          const deltaY = currentSvgPos.y - dragRef.current.startSvgY;
          const visualToCncY = -deltaY;
          draggingIdsRef.current.forEach(id => {
              const el = partRefs.current[id];
              if (el) el.style.transform = `translate3d(${deltaX}px, ${visualToCncY}px, 0)`;
          });
        }
      });
    }, [dragMode, getSVGPoint]);

  const handleMouseUp = useCallback(() => {
    if (dragMode === "none") return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (dragMode === "pan") {
      setTransform({ ...transformRef.current });
    } 
    else if (dragMode === "parts") {
      const moves: { partId: string; dx: number; dy: number }[] = [];
      draggingIdsRef.current.forEach(id => {
          const el = partRefs.current[id];
          if (el) {
              const style = window.getComputedStyle(el);
              const matrix = new DOMMatrixReadOnly(style.transform);
              moves.push({ partId: id, dx: matrix.m41, dy: matrix.m42 });
              el.style.transform = ""; el.style.willChange = ""; el.style.cursor = "";
          }
      });
      if (moves.length > 0) onPartsMove(moves);
    }
    setDragMode("none");
    draggingIdsRef.current = [];
  }, [dragMode, onPartsMove]);

  const binViewBox = useMemo(() => {
    const paddingX = binWidth * 0.05;
    const paddingY = binHeight * 0.05;
    return `${-paddingX} ${-paddingY} ${binWidth + paddingX * 2} ${binHeight + paddingY * 2}`;
  }, [binWidth, binHeight]);

  const cncTransform = `translate(0, ${binHeight}) scale(1, -1)`;
  
  // -- BOTÕES (MANTIDOS FEIOS E FUNCIONAIS) --
  const btnStyle: React.CSSProperties = { 
    width: 30, 
    height: 30, 
    padding: 0,          // <--- Zera o padding padrão do navegador
    lineHeight: 1,       // <--- Remove altura de linha extra do texto
    cursor: "pointer", 
    background: theme.buttonBg, 
    border: `1px solid ${theme.buttonBorder}`,
    color: theme.text, 
    borderRadius: "4px", 
    fontWeight: "bold",
    fontSize: "16px",    // Tamanho do emoji
    display: 'flex', 
    alignItems: 'center', 
    justifyContent: 'center', // Garante o centro horizontal
    paddingBottom: '2px'      // <--- Ajuste fino: Emojis costumam ficar um pouco altos, isso centraliza visualmente
  };

  return (
    <div
      ref={svgContainerRef}
      style={{
        flex: 2, position: "relative", background: "transparent", display: "flex", flexDirection: "column",
        cursor: dragMode === "parts" ? "grabbing" : dragMode === "pan" ? "grabbing" : "grab",
        overflow: "hidden", width: "100%", height: "100%",
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDownContainer}
      onDoubleClick={handleDoubleClickContainer} 
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
        <div style={{ position: "absolute", right: 20, top: 20, display: "flex", flexDirection: "column", gap: "5px", zIndex: 10 }}>
            <button onClick={() => updateTransform({ ...transformRef.current, k: transformRef.current.k * 1.2 })} style={btnStyle}>➕</button>
            <button onClick={() => updateTransform({ ...transformRef.current, k: transformRef.current.k / 1.2 })} style={btnStyle}>➖</button>
            <button onClick={resetZoom} style={{...btnStyle, fontSize: "12px"}}>⛶</button>
        </div>

      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", overflow: "hidden" }}>
        <svg viewBox={binViewBox} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%" }}>
          <g ref={panGroupRef} transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
            <g transform={cncTransform}>
              <rect x="0" y="0" width={binWidth} height={binHeight} fill={showDebug ? "none" : "none"} stroke="#4e4e4dff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              {showDebug && <rect x={margin} y={margin} width={binWidth - margin * 2} height={binHeight - margin * 2} fill="none" stroke="#999" strokeDasharray="5" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
              
              {placedParts.map((placed) => {
                const part = parts.find(p => p.id === placed.partId);
                if (!part) return null;
                return (
                  <PartElement
                    key={placed.partId}
                    ref={(el: SVGGElement | null) => { partRefs.current[placed.partId] = el; }}
                    placed={placed}
                    isSelected={selectedPartIds.includes(placed.partId)}
                    onMouseDown={handleMouseDownPart}
                    onDoubleClick={handleDoubleClickPart} 
                    onContextMenu={onContextMenu}
                    partData={part}
                    showDebug={showDebug}
                    strategy={strategy}
                    transformData={partTransforms[placed.partId]}
                    theme={theme} // 7. Passando o tema para a peça
                  />
                );
              })}
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
};