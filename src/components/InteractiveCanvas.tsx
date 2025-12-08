/* eslint-disable @typescript-eslint/no-explicit-any */
import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  // useEffect removido pois não era usado
} from "react";
import type { ImportedPart } from "./types";
import type { PlacedPart } from "../utils/nestingCore";

// --- TIPAGEM ---
interface InteractiveCanvasProps {
  // Dados Principais
  parts: ImportedPart[];
  placedParts: PlacedPart[];
  binWidth: number;
  binHeight: number;
  margin: number;
  
  // Estado Visual e Controle
  currentBinIndex: number;
  showDebug: boolean;
  strategy: "rect" | "true-shape";
  selectedPartId: string | null;

  // Callbacks de Ação
  onPartMove: (partId: string, deltaX: number, deltaY: number) => void;
  onPartSelect: (partId: string | null) => void;
  onContextMenu: (e: React.MouseEvent, partId: string) => void;
}

// Interface auxiliar interna
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

// --- FUNÇÕES AUXILIARES DE RENDERIZAÇÃO ---
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
      return (
        <line
          key={index}
          x1={entity.vertices[0].x * scale}
          y1={entity.vertices[0].y * scale}
          x2={entity.vertices[1].x * scale}
          y2={entity.vertices[1].y * scale}
          stroke={color}
          strokeWidth={2 * scale}
          vectorEffect="non-scaling-stroke"
        />
      );
    case "LWPOLYLINE":
    case "POLYLINE": {
      if (!entity.vertices) return null;
      const d = entity.vertices
        .map(
          (v: any, i: number) =>
            `${i === 0 ? "M" : "L"} ${v.x * scale} ${v.y * scale}`
        )
        .join(" ");
      return (
        <path
          key={index}
          d={entity.shape ? d + " Z" : d}
          fill="none"
          stroke={color}
          strokeWidth={2 * scale}
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    case "CIRCLE":
      return (
        <circle
          key={index}
          cx={entity.center.x * scale}
          cy={entity.center.y * scale}
          r={entity.radius * scale}
          fill="none"
          stroke={color}
          strokeWidth={2 * scale}
          vectorEffect="non-scaling-stroke"
        />
      );
    case "ARC": {
      const startAngle = entity.startAngle;
      const endAngle = entity.endAngle;
      const r = entity.radius * scale;
      const x1 = entity.center.x * scale + r * Math.cos(startAngle);
      const y1 = entity.center.y * scale + r * Math.sin(startAngle);
      const x2 = entity.center.x * scale + r * Math.cos(endAngle);
      const y2 = entity.center.y * scale + r * Math.sin(endAngle);
      let da = endAngle - startAngle;
      if (da < 0) da += 2 * Math.PI;
      const largeArc = da > Math.PI ? 1 : 0;
      const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
      return (
        <path
          key={index}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={2 * scale}
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    default:
      return null;
  }
};

const calculateBoundingBox = (entities: any[], blocksData: any) => {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  const update = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };

  const traverse = (ents: any[], ox = 0, oy = 0) => {
    if (!ents) return;
    ents.forEach((ent) => {
      if (ent.type === "INSERT") {
        const b = blocksData[ent.name];
        if (b && b.entities) {
          traverse(
            b.entities,
            (ent.position?.x || 0) + ox,
            (ent.position?.y || 0) + oy
          );
        } else {
          update((ent.position?.x || 0) + ox, (ent.position?.y || 0) + oy);
        }
      } else if (ent.vertices) {
        ent.vertices.forEach((v: any) => {
          update(v.x + ox, v.y + oy);
        });
      } else if (ent.center && ent.radius && ent.type === "CIRCLE") {
        update(ent.center.x + ox - ent.radius, ent.center.y + oy - ent.radius);
        update(ent.center.x + ox + ent.radius, ent.center.y + oy + ent.radius);
      } else if (ent.type === "ARC") {
        const cx = ent.center.x + ox;
        const cy = ent.center.y + oy;
        const r = ent.radius;
        const startAngle = ent.startAngle;
        let endAngle = ent.endAngle;
        if (endAngle < startAngle) endAngle += 2 * Math.PI;
        update(cx + r * Math.cos(startAngle), cy + r * Math.sin(startAngle));
        update(cx + r * Math.cos(endAngle), cy + r * Math.sin(endAngle));
        // Amostragem simples para arco
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

// --- SUBCOMPONENTE DE PEÇA (MEMOIZADO) ---
interface PartElementProps {
  placed: PlacedPart;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent, partId: string, x: number, y: number) => void;
  onDoubleClick: (e: React.MouseEvent, partId: string) => void;
  onContextMenu: (e: React.MouseEvent, partId: string) => void;
  partData: ImportedPart | undefined;
  showDebug: boolean;
  strategy: "rect" | "true-shape";
  transformData: any;
}

const PartElement = React.memo<PartElementProps>(
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
  }) => {
    if (!partData) return null;

    const occupiedW = placed.rotation % 180 !== 0 ? partData.height : partData.width;
    const occupiedH = placed.rotation % 180 !== 0 ? partData.width : partData.height;

    const finalTransform = transformData
      ? `translate(${placed.x + transformData.occupiedW / 2}, ${
          placed.y + transformData.occupiedH / 2
        }) rotate(${placed.rotation}) translate(${-transformData.centerX}, ${-transformData.centerY})`
      : "";

    return (
      <g
        onMouseDown={(e) => onMouseDown(e, placed.partId, placed.x, placed.y)}
        onDoubleClick={(e) => onDoubleClick(e, placed.partId)}
        onContextMenu={(e) => onContextMenu(e, placed.partId)}
        style={{
          cursor: strategy === "rect" ? "default" : "move",
          opacity: isSelected ? 0.6 : 1,
        }}
      >
        <g>
          <rect
            x={placed.x}
            y={placed.y}
            width={occupiedW}
            height={occupiedH}
            fill="transparent"
            stroke={isSelected ? "#00ff00" : showDebug ? "red" : "none"}
            strokeWidth={isSelected ? 4 : 1}
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
                isSelected ? "#00ff00" : "#007bff"
              )
            )}
          </g>
        </g>
      </g>
    );
  }
);
PartElement.displayName = "PartElement";

// --- COMPONENTE PRINCIPAL ---
export const InteractiveCanvas: React.FC<InteractiveCanvasProps> = ({
  parts,
  placedParts,
  binWidth,
  binHeight,
  margin,
  // currentBinIndex, <--- REMOVIDO DAQUI POIS NÃO ERA USADO NO JSX
  showDebug,
  strategy,
  selectedPartId,
  onPartMove,
  onPartSelect,
  onContextMenu,
}) => {
  // Estado local de Zoom/Pan
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [dragMode, setDragMode] = useState<"none" | "pan" | "part">("none");
  const [boundingBoxCache, setBoundingBoxCache] = useState<BoundingBoxCache>({});
  
  // Refs para manipulação direta do DOM (Performance Crítica)
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const panGroupRef = useRef<SVGGElement>(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const activePartElementRef = useRef<SVGGElement | null>(null);
  const rafRef = useRef<number | null>(null);

  // Refs de controle de arraste
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    startSvgX: 0,
    startSvgY: 0,
    initialX: 0,
    initialY: 0,
    partX: 0,
    partY: 0,
  });

  // Helper de conversão de coordenadas Mouse -> SVG
  const getSVGPoint = useCallback((clientX: number, clientY: number) => {
    const svgElement = svgContainerRef.current?.querySelector("svg");
    if (!svgElement) return { x: 0, y: 0 };
    const point = svgElement.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    return point.matrixTransform(svgElement.getScreenCTM()?.inverse());
  }, []);

  const updateTransform = useCallback(
    (newT: { x: number; y: number; k: number }) => {
      transformRef.current = newT;
      setTransform(newT);
      if (panGroupRef.current) {
        panGroupRef.current.setAttribute(
          "transform",
          `translate(${newT.x}, ${newT.y}) scale(${newT.k})`
        );
      }
    },
    []
  );

  const resetZoom = useCallback(
    () => updateTransform({ x: 0, y: 0, k: 1 }),
    [updateTransform]
  );

  // --- PRÉ-CÁLCULO DE CACHING ---
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
          ...box,
          centerX: box.minX + box.width / 2,
          centerY: box.minY + box.height / 2,
        };
        // Atualiza cache de forma assíncrona para não travar render
        requestAnimationFrame(() => {
          setBoundingBoxCache((prev) => ({ ...prev, [placed.partId]: newBox }));
        });
        box = newBox;
      }
      transforms[placed.partId] = {
        centerX: box.centerX,
        centerY: box.centerY,
        occupiedW: placed.rotation % 180 !== 0 ? part.height : part.width,
        occupiedH: placed.rotation % 180 !== 0 ? part.width : part.height,
      };
    });
    return transforms;
  }, [placedParts, parts, boundingBoxCache]);

  // --- EVENT HANDLERS (MOUSE) ---
  const handleMouseDownContainer = useCallback(
    (e: React.MouseEvent) => {
      if (dragMode === "none") {
        setDragMode("pan");
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startSvgX: 0,
            startSvgY: 0,
            initialX: transformRef.current.x,
            initialY: transformRef.current.y,
            partX: 0,
            partY: 0
        };
      }
    },
    [dragMode]
  );

  const handleMouseDownPart = useCallback(
    (e: React.MouseEvent, partId: string, currentX: number, currentY: number) => {
      if (partId !== selectedPartId) {
        // Se clicar em outra peça, seleciona ela primeiro
        onPartSelect(partId);
        return; 
      }
      e.stopPropagation();

      if (e.button === 0 && strategy !== "rect") {
        e.preventDefault();
        setDragMode("part");
        activePartElementRef.current = e.currentTarget as SVGGElement;
        const svgPos = getSVGPoint(e.clientX, e.clientY);
        
        // Prepara elemento para movimento GPU-accelerated
        if (activePartElementRef.current) {
          activePartElementRef.current.style.transform = "translate3d(0, 0, 0)";
          activePartElementRef.current.style.willChange = "transform";
          activePartElementRef.current.style.cursor = "grabbing";
        }
        
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            startSvgX: svgPos.x,
            startSvgY: svgPos.y,
            initialX: 0,
            initialY: 0,
            partX: currentX,
            partY: currentY
        };
      }
    },
    [strategy, selectedPartId, getSVGPoint, onPartSelect]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragMode === "none") return;
      
      // Limpa frame anterior para evitar acúmulo
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
          
          // Manipulação direta do DOM para Pan fluido
          panGroupRef.current.setAttribute(
            "transform",
            `translate(${newX}, ${newY}) scale(${currentK})`
          );
        } else if (dragMode === "part" && activePartElementRef.current) {
          const currentSvgPos = getSVGPoint(e.clientX, e.clientY);
          const deltaX = currentSvgPos.x - dragRef.current.startSvgX;
          const deltaY = currentSvgPos.y - dragRef.current.startSvgY;
          const visualToCncY = -deltaY; // Inversão eixo Y (SVG vs CNC)
          
          // Manipulação direta do DOM da peça (transform CSS não afeta SVG coordinates, só visual)
          activePartElementRef.current.style.transform = `translate3d(${deltaX}px, ${visualToCncY}px, 0)`;
        }
      });
    },
    [dragMode, getSVGPoint]
  );

  const handleMouseUp = useCallback(() => {
    if (dragMode === "none") return;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    if (dragMode === "pan") {
      // Sincroniza React state com o valor final do ref
      setTransform({ ...transformRef.current });
    } else if (dragMode === "part" && selectedPartId && activePartElementRef.current) {
      // Calcula o delta final baseado no estilo aplicado via JS
      const style = window.getComputedStyle(activePartElementRef.current);
      const matrix = new DOMMatrixReadOnly(style.transform);
      const finalDeltaX = matrix.m41;
      const finalDeltaY = matrix.m42; // Já está invertido visualmente

      // Comunica ao Pai o movimento final
      onPartMove(selectedPartId, finalDeltaX, finalDeltaY);

      // Limpa estilos temporários
      activePartElementRef.current.style.transform = "";
      activePartElementRef.current.style.willChange = "";
      activePartElementRef.current.style.cursor = "";
    }
    setDragMode("none");
    activePartElementRef.current = null;
  }, [dragMode, selectedPartId, onPartMove]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const svgElement = svgContainerRef.current?.querySelector("svg");
      if (!svgElement) return;

      let mouseX = 0;
      let mouseY = 0;
      try {
        const point = svgElement.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(svgElement.getScreenCTM()?.inverse());
        mouseX = svgPoint.x;
        mouseY = svgPoint.y;
      } catch {
         // Fallback seguro (removido a variável 'error' que não estava sendo usada)
         const rect = svgContainerRef.current!.getBoundingClientRect();
         mouseX = e.clientX - rect.left;
         mouseY = e.clientY - rect.top;
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
    },
    [updateTransform]
  );

  // Viewbox calculation
  const binViewBox = useMemo(() => {
    const paddingX = binWidth * 0.05;
    const paddingY = binHeight * 0.05;
    return `${-paddingX} ${-paddingY} ${binWidth + paddingX * 2} ${
      binHeight + paddingY * 2
    }`;
  }, [binWidth, binHeight]);

  const cncTransform = `translate(0, ${binHeight}) scale(1, -1)`;

  return (
    <div
      ref={svgContainerRef}
      style={{
        flex: 2,
        position: "relative",
        background: "transparent",
        display: "flex",
        flexDirection: "column",
        cursor: dragMode === "part" ? "grabbing" : dragMode === "pan" ? "grabbing" : "grab",
        overflow: "hidden",
        width: "100%",
        height: "100%",
      }}
      onWheel={handleWheel}
      onMouseDown={handleMouseDownContainer}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={(e) => {
          e.preventDefault();
          onPartSelect(null);
      }}
    >
        {/* Controles de Zoom Flutuantes */}
        <div style={{ position: "absolute", right: 20, top: 20, display: "flex", flexDirection: "column", gap: "5px", zIndex: 10 }}>
            <button onClick={() => updateTransform({ ...transformRef.current, k: transformRef.current.k * 1.2 })} style={btnStyle}>+</button>
            <button onClick={() => updateTransform({ ...transformRef.current, k: transformRef.current.k / 1.2 })} style={btnStyle}>-</button>
            <button onClick={resetZoom} style={{...btnStyle, fontSize: "12px"}}>Fit</button>
        </div>

      <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", overflow: "hidden" }}>
        <svg viewBox={binViewBox} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%" }}>
          <g
            ref={panGroupRef}
            transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}
          >
            <g transform={cncTransform}>
              {/* Borda da Chapa */}
              <rect
                x="0"
                y="0"
                width={binWidth}
                height={binHeight}
                fill={showDebug ? "rgba(255,152,0,0.05)" : "none"}
                stroke="#ff9800"
                strokeWidth="4"
                vectorEffect="non-scaling-stroke"
              />
              {/* Margem de Segurança */}
              {showDebug && (
                <rect
                  x={margin}
                  y={margin}
                  width={binWidth - margin * 2}
                  height={binHeight - margin * 2}
                  fill="none"
                  stroke="#999"
                  strokeDasharray="5"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              )}
              
              {/* Peças Posicionadas */}
              {placedParts.map((placed) => {
                const part = parts.find(p => p.id === placed.partId);
                if (!part) return null;
                return (
                  <PartElement
                    key={placed.partId}
                    placed={placed}
                    isSelected={placed.partId === selectedPartId}
                    onMouseDown={handleMouseDownPart}
                    onDoubleClick={(e) => { e.stopPropagation(); onPartSelect(placed.partId); }}
                    onContextMenu={onContextMenu}
                    partData={part}
                    showDebug={showDebug}
                    strategy={strategy}
                    transformData={partTransforms[placed.partId]}
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

const btnStyle: React.CSSProperties = {
    width: 30, height: 30, cursor: "pointer", background: "rgba(255,255,255,0.9)",
    border: "1px solid #777", color: "#000", borderRadius: "4px", fontWeight: "bold"
};