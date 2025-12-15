/* eslint-disable @typescript-eslint/no-explicit-any */
import React, {
  useState,
  useRef,
  useCallback,
  useMemo,
  forwardRef,
  useEffect,
} from "react";
import type { ImportedPart } from "./types";
import type { PlacedPart } from "../utils/nestingCore";
import type { AppTheme } from "../styles/theme";

interface InteractiveCanvasProps {
  parts: ImportedPart[];
  placedParts: PlacedPart[];
  binWidth: number;
  binHeight: number;
  margin: number;
  showDebug: boolean;
  strategy: "rect" | "true-shape";
  selectedPartIds: string[]; // UUIDs
  theme: AppTheme;
  onPartsMove: (moves: { partId: string; dx: number; dy: number }[]) => void;
  // --- NOVO: Callback para devolver ao banco ---
  onPartReturn: (uuids: string[]) => void;
  // ------------------------------------------
  onLabelDrag?: (
    partId: string,
    type: "white" | "pink",
    dx: number,
    dy: number
  ) => void;
  onPartSelect: (partIds: string[], append: boolean) => void;
  onContextMenu: (e: React.MouseEvent, partId: string) => void;
  onEntityContextMenu?: (e: React.MouseEvent, entity: any) => void;
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

// --- 1. FUNÇÕES AUXILIARES ---

const bulgeToArc = (
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  bulge: number
) => {
  const chordDx = p2.x - p1.x;
  const chordDy = p2.y - p1.y;
  const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy);
  const radius = (chordLen * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  const cx = (p1.x + p2.x) / 2 - (chordDy * (1 - bulge * bulge)) / (4 * bulge);
  const cy = (p1.y + p2.y) / 2 + (chordDx * (1 - bulge * bulge)) / (4 * bulge);
  return { radius, cx, cy };
};

const renderEntityFunction = (
  entity: any,
  index: number,
  blocks: any,
  scale = 1,
  color: string = "currentColor",
  onLabelDown?: (e: React.MouseEvent, type: "white" | "pink") => void,
  onEntityContextMenu?: (e: React.MouseEvent, entity: any) => void
): React.ReactNode => {
  const handleLabelDown = (e: React.MouseEvent) => {
    if (entity.isLabel && onLabelDown) {
      e.stopPropagation();
      onLabelDown(e, entity.labelType);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (entity.isLabel && onEntityContextMenu) {
      e.preventDefault();
      e.stopPropagation();
      onEntityContextMenu(e, entity);
    }
  };

  const labelStyle: React.CSSProperties = entity.isLabel
    ? { cursor: "move" }
    : {};
  const hitAreaWidth = 6 * scale;

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
            renderEntityFunction(
              s,
              i,
              blocks,
              1,
              color,
              onLabelDown,
              onEntityContextMenu
            )
          )}
        </g>
      );
    }
    case "LINE": {
      const lineColor = entity.isLabel ? entity.color || color : color;
      return (
        <g
          key={index}
          onMouseDown={handleLabelDown}
          onContextMenu={handleContextMenu}
          style={labelStyle}
        >
          <line
            x1={entity.vertices[0].x * scale}
            y1={entity.vertices[0].y * scale}
            x2={entity.vertices[1].x * scale}
            y2={entity.vertices[1].y * scale}
            stroke={lineColor}
            strokeWidth={2 * scale}
            vectorEffect="non-scaling-stroke"
          />
          {entity.isLabel && (
            <line
              x1={entity.vertices[0].x * scale}
              y1={entity.vertices[0].y * scale}
              x2={entity.vertices[1].x * scale}
              y2={entity.vertices[1].y * scale}
              stroke="transparent"
              strokeWidth={hitAreaWidth}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </g>
      );
    }
    case "LWPOLYLINE":
    case "POLYLINE": {
      if (!entity.vertices || entity.vertices.length < 2) return null;
      let d = `M ${entity.vertices[0].x * scale} ${
        entity.vertices[0].y * scale
      }`;
      for (let i = 0; i < entity.vertices.length; i++) {
        const v1 = entity.vertices[i];
        const v2 = entity.vertices[(i + 1) % entity.vertices.length];
        if (i === entity.vertices.length - 1 && !entity.shape) break;
        if (v1.bulge && v1.bulge !== 0) {
          const { radius } = bulgeToArc(v1, v2, v1.bulge);
          const rx = radius * scale;
          const ry = radius * scale;
          const largeArc = Math.abs(v1.bulge) > 1 ? 1 : 0;
          const sweep = v1.bulge > 0 ? 1 : 0;
          const x = v2.x * scale;
          const y = v2.y * scale;
          d += ` A ${rx} ${ry} 0 ${largeArc} ${sweep} ${x} ${y}`;
        } else {
          d += ` L ${v2.x * scale} ${v2.y * scale}`;
        }
      }
      if (entity.shape) d += " Z";
      return (
        <path
          key={index}
          d={d}
          fill="none"
          stroke={entity.isLabel ? entity.color || color : color}
          strokeWidth={2 * scale}
          vectorEffect="non-scaling-stroke"
          onMouseDown={handleLabelDown}
          onContextMenu={handleContextMenu}
          style={labelStyle}
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
          stroke={entity.isLabel ? entity.color || color : color}
          strokeWidth={2 * scale}
          vectorEffect="non-scaling-stroke"
          onMouseDown={handleLabelDown}
          onContextMenu={handleContextMenu}
          style={labelStyle}
        />
      );
    case "ARC": {
      const { startAngle, endAngle, radius, center } = entity;
      const r = radius * scale;
      const x1 = center.x * scale + r * Math.cos(startAngle);
      const y1 = center.y * scale + r * Math.sin(startAngle);
      const x2 = center.x * scale + r * Math.cos(endAngle);
      const y2 = center.y * scale + r * Math.sin(endAngle);
      let da = endAngle - startAngle;
      if (da < 0) da += 2 * Math.PI;
      const d = `M ${x1} ${y1} A ${r} ${r} 0 ${
        da > Math.PI ? 1 : 0
      } 1 ${x2} ${y2}`;
      return (
        <path
          key={index}
          d={d}
          fill="none"
          stroke={entity.isLabel ? entity.color || color : color}
          strokeWidth={2 * scale}
          vectorEffect="non-scaling-stroke"
          onMouseDown={handleLabelDown}
          onContextMenu={handleContextMenu}
          style={labelStyle}
        />
      );
    }
    case "TEXT": {
      const textColor = entity.color || color;
      const px = entity.position.x * scale;
      const py = entity.position.y * scale;
      const rotation = -(entity.rotation || 0);
      return (
        <text
          key={index}
          x={0}
          y={0}
          fill={textColor}
          stroke="none"
          fontSize={entity.height * scale}
          textAnchor="middle"
          dominantBaseline="middle"
          fontWeight="bold"
          transform={`translate(${px}, ${py}) scale(1, -1) rotate(${rotation})`}
          style={{ pointerEvents: "none", userSelect: "none" }}
        >
          {entity.text}
        </text>
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

  const checkArcBounds = (
    cx: number,
    cy: number,
    r: number,
    startAngle: number,
    endAngle: number
  ) => {
    let start = startAngle % (2 * Math.PI);
    if (start < 0) start += 2 * Math.PI;
    let end = endAngle % (2 * Math.PI);
    if (end < 0) end += 2 * Math.PI;
    if (end < start) end += 2 * Math.PI;
    update(cx + r * Math.cos(startAngle), cy + r * Math.sin(startAngle));
    update(cx + r * Math.cos(endAngle), cy + r * Math.sin(endAngle));
    const cardinals = [
      0,
      Math.PI / 2,
      Math.PI,
      (3 * Math.PI) / 2,
      2 * Math.PI,
      (5 * Math.PI) / 2,
    ];
    for (const ang of cardinals) {
      if (ang > start && ang < end)
        update(cx + r * Math.cos(ang), cy + r * Math.sin(ang));
    }
  };

  const traverse = (ents: any[], ox = 0, oy = 0) => {
    if (!ents) return;
    ents.forEach((ent) => {
      if (ent.type === "INSERT") {
        const b = blocksData[ent.name];
        if (b && b.entities)
          traverse(
            b.entities,
            (ent.position?.x || 0) + ox,
            (ent.position?.y || 0) + oy
          );
        else update((ent.position?.x || 0) + ox, (ent.position?.y || 0) + oy);
      } else if (ent.vertices) {
        for (let i = 0; i < ent.vertices.length; i++) {
          const v1 = ent.vertices[i];
          update(v1.x + ox, v1.y + oy);
          if (v1.bulge && v1.bulge !== 0) {
            const v2 = ent.vertices[(i + 1) % ent.vertices.length];
            if (i === ent.vertices.length - 1 && !ent.shape) continue;
            const { cx, cy, radius } = bulgeToArc(v1, v2, v1.bulge);
            const startAngle = Math.atan2(v1.y - cy, v1.x - cx);
            let endAngle = Math.atan2(v2.y - cy, v2.x - cx);
            if (v1.bulge > 0 && endAngle < startAngle) endAngle += 2 * Math.PI;
            if (v1.bulge < 0 && endAngle > startAngle) endAngle -= 2 * Math.PI;
            if (v1.bulge < 0)
              checkArcBounds(cx + ox, cy + oy, radius, endAngle, startAngle);
            else checkArcBounds(cx + ox, cy + oy, radius, startAngle, endAngle);
          }
        }
      } else if (ent.center && ent.radius) {
        if (ent.type === "ARC")
          checkArcBounds(
            ent.center.x + ox,
            ent.center.y + oy,
            ent.radius,
            ent.startAngle,
            ent.endAngle
          );
        else {
          update(
            ent.center.x + ox - ent.radius,
            ent.center.y + oy - ent.radius
          );
          update(
            ent.center.x + ox + ent.radius,
            ent.center.y + oy + ent.radius
          );
        }
      }
    });
  };
  traverse(entities);
  if (minX === Infinity) return { minX: 0, minY: 0, width: 0, height: 0 };
  return { minX, minY, width: maxX - minX, height: maxY - minY };
};

// --- 2. SUBCOMPONENTE PEÇA (PartElement) ---

interface PartElementProps {
  placed: PlacedPart;
  isSelected: boolean;
  onMouseDown: (e: React.MouseEvent, uuid: string) => void;
  onLabelDown: (e: React.MouseEvent, type: "white" | "pink") => void;
  onDoubleClick: (e: React.MouseEvent, uuid: string) => void;
  onContextMenu: (e: React.MouseEvent, uuid: string) => void;
  onEntityContextMenu?: (e: React.MouseEvent, entity: any) => void;
  partData: ImportedPart | undefined;
  showDebug: boolean;
  strategy: "rect" | "true-shape";
  transformData: any;
  theme: AppTheme;
}

const PartElement = React.memo(
  forwardRef<SVGGElement, PartElementProps>(
    (
      {
        placed,
        isSelected,
        onMouseDown,
        onLabelDown,
        onDoubleClick,
        onContextMenu,
        onEntityContextMenu,
        partData,
        showDebug,
        strategy,
        transformData,
        theme,
      },
      ref
    ) => {
      if (!partData) return null;
      const occupiedW =
        placed.rotation % 180 !== 0 ? partData.height : partData.width;
      const occupiedH =
        placed.rotation % 180 !== 0 ? partData.width : partData.height;

      const finalTransform = transformData
        ? `translate(${placed.x + transformData.occupiedW / 2}, ${
            placed.y + transformData.occupiedH / 2
          }) rotate(${
            placed.rotation
          }) translate(${-transformData.centerX}, ${-transformData.centerY})`
        : "";
      const strokeColor = isSelected
        ? "#01ff3cff"
        : theme.text === "#e0e0e0"
        ? "#007bff"
        : "#007bff";

      return (
        <g
          ref={ref}
          onMouseDown={(e) => onMouseDown(e, placed.uuid)}
          onDoubleClick={(e) => onDoubleClick(e, placed.uuid)}
          onContextMenu={(e) => onContextMenu(e, placed.uuid)}
          style={{
            cursor:
              strategy === "rect" ? "default" : isSelected ? "move" : "pointer",
            opacity: isSelected ? 0.8 : 1,
          }}
        >
          <rect
            x={placed.x}
            y={placed.y}
            width={occupiedW}
            height={occupiedH}
            fill="transparent"
            stroke={isSelected ? "#01ff3cff" : showDebug ? "red" : "none"}
            strokeWidth={1}
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
                strokeColor,
                onLabelDown,
                onEntityContextMenu
              )
            )}
          </g>
        </g>
      );
    }
  )
);
PartElement.displayName = "PartElement";

// --- 3. MAIN CANVAS ---

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
  onLabelDrag,
  onPartSelect,
  onContextMenu,
  onEntityContextMenu,
  theme,
  // Desestruturando a nova prop aqui para não causar erro
  onPartReturn,
}) => {
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const [dragMode, setDragMode] = useState<"none" | "pan" | "parts" | "label">(
    "none"
  );
  const [draggingLabel, setDraggingLabel] = useState<{
    partId: string;
    type: "white" | "pink";
  } | null>(null);
  const [boundingBoxCache, setBoundingBoxCache] = useState<BoundingBoxCache>(
    {}
  );

  const svgContainerRef = useRef<HTMLDivElement>(null);
  const panGroupRef = useRef<SVGGElement>(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const rafRef = useRef<number | null>(null);

  const partRefs = useRef<{ [key: string]: SVGGElement | null }>({});
  const draggingIdsRef = useRef<string[]>([]);
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    startSvgX: 0,
    startSvgY: 0,
    initialX: 0,
    initialY: 0,
  });

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
      if (panGroupRef.current)
        panGroupRef.current.setAttribute(
          "transform",
          `translate(${newT.x}, ${newT.y}) scale(${newT.k})`
        );
    },
    []
  );

  useEffect(() => {
    const el = svgContainerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const svgElement = el.querySelector("svg");
      if (!svgElement) return;

      let mouseX = 0,
        mouseY = 0;
      try {
        const point = svgElement.createSVGPoint();
        point.x = e.clientX;
        point.y = e.clientY;
        const svgPoint = point.matrixTransform(
          svgElement.getScreenCTM()?.inverse()
        );
        mouseX = svgPoint.x;
        mouseY = svgPoint.y;
      } catch {
        const rect = el.getBoundingClientRect();
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
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [updateTransform]);

  const resetZoom = useCallback(
    () => updateTransform({ x: 0, y: 0, k: 1 }),
    [updateTransform]
  );

  const handleMouseDownContainer = useCallback((e: React.MouseEvent) => {
    //setDragMode("pan");
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startSvgX: 0,
      startSvgY: 0,
      initialX: transformRef.current.x,
      initialY: transformRef.current.y,
    };
  }, []);

  const handleDoubleClickContainer = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onPartSelect([], false);
    },
    [onPartSelect]
  );

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
        requestAnimationFrame(() => {
          setBoundingBoxCache((prev) => ({ ...prev, [placed.partId]: newBox }));
        });
        box = newBox;
      }

      transforms[placed.uuid] = {
        centerX: box.centerX,
        centerY: box.centerY,
        occupiedW: placed.rotation % 180 !== 0 ? part.height : part.width,
        occupiedH: placed.rotation % 180 !== 0 ? part.width : part.height,
      };
    });
    return transforms;
  }, [placedParts, parts, boundingBoxCache]);

  const handleDoubleClickPart = useCallback(
    (e: React.MouseEvent, uuid: string) => {
      e.preventDefault();
      e.stopPropagation();
      const isCtrl = e.ctrlKey || e.metaKey;
      let newSelection = [...selectedPartIds];
      if (isCtrl) {
        if (newSelection.includes(uuid))
          newSelection = newSelection.filter((id) => id !== uuid);
        else newSelection.push(uuid);
        onPartSelect(newSelection, false);
      } else {
        onPartSelect([uuid], false);
      }
    },
    [selectedPartIds, onPartSelect]
  );

  const handleMouseDownPart = useCallback(
    (e: React.MouseEvent, uuid: string) => {
      e.stopPropagation();
      if (!selectedPartIds.includes(uuid)) return;
      if (strategy !== "rect" && e.button === 0) {
        e.preventDefault();
        setDragMode("parts");
        draggingIdsRef.current = selectedPartIds;
        const svgPos = getSVGPoint(e.clientX, e.clientY);
        dragRef.current = {
          startX: e.clientX,
          startY: e.clientY,
          startSvgX: svgPos.x,
          startSvgY: svgPos.y,
          initialX: 0,
          initialY: 0,
        };
      }
    },
    [strategy, selectedPartIds, getSVGPoint]
  );

  const handleLabelDown = useCallback(
    (e: React.MouseEvent, partId: string, type: "white" | "pink") => {
      setDragMode("label");
      setDraggingLabel({ partId, type });
      const svgPos = getSVGPoint(e.clientX, e.clientY);
      dragRef.current = {
        startX: 0,
        startY: 0,
        startSvgX: svgPos.x,
        startSvgY: svgPos.y,
        initialX: 0,
        initialY: 0,
      };
    },
    [getSVGPoint]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragMode === "none") return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      rafRef.current = requestAnimationFrame(() => {
        const currentSvgPos = getSVGPoint(e.clientX, e.clientY);

        if (dragMode === "label" && draggingLabel && onLabelDrag) {
          const dx = currentSvgPos.x - dragRef.current.startSvgX;
          const dy = currentSvgPos.y - dragRef.current.startSvgY;
          onLabelDrag(draggingLabel.partId, draggingLabel.type, dx, -dy);
          dragRef.current.startSvgX = currentSvgPos.x;
          dragRef.current.startSvgY = currentSvgPos.y;
        } else if (dragMode === "pan" && panGroupRef.current) {
          const dx = e.clientX - dragRef.current.startX;
          const dy = e.clientY - dragRef.current.startY;
          const currentK = transformRef.current.k;
          const newX = dragRef.current.initialX + dx;
          const newY = dragRef.current.initialY + dy;
          transformRef.current.x = newX;
          transformRef.current.y = newY;
          panGroupRef.current.setAttribute(
            "transform",
            `translate(${newX}, ${newY}) scale(${currentK})`
          );
        } else if (dragMode === "parts") {
          const deltaX = currentSvgPos.x - dragRef.current.startSvgX;
          const deltaY = currentSvgPos.y - dragRef.current.startSvgY;
          const visualToCncY = -deltaY;
          draggingIdsRef.current.forEach((id) => {
            const el = partRefs.current[id];
            if (el)
              el.style.transform = `translate3d(${deltaX}px, ${visualToCncY}px, 0)`;
          });
        }
      });
    },
    [dragMode, getSVGPoint, draggingLabel, onLabelDrag]
  );

  // --- ALTERAÇÃO AQUI: Detecção de drop fora do Canvas ---
  const handleMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (dragMode === "none") return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      if (dragMode === "pan") {
        setTransform({ ...transformRef.current });
      } else if (dragMode === "parts") {
        // Lógica de Devolução ao Banco
        if (svgContainerRef.current) {
          const rect = svgContainerRef.current.getBoundingClientRect();
          // Verifica se soltou fora da área visível do componente
          const isOutside =
            e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom;

          if (isOutside && draggingIdsRef.current.length > 0) {
            // Chama o callback para remover do nestingResult
            onPartReturn(draggingIdsRef.current);

            // Reseta estado e não processa o movimento (pois peça sumirá)
            setDragMode("none");
            draggingIdsRef.current = [];
            return;
          }
        }

        const moves: { partId: string; dx: number; dy: number }[] = [];
        draggingIdsRef.current.forEach((id) => {
          const el = partRefs.current[id];
          if (el) {
            const style = window.getComputedStyle(el);
            const matrix = new DOMMatrixReadOnly(style.transform);
            moves.push({ partId: id, dx: matrix.m41, dy: matrix.m42 });
            el.style.transform = "";
            el.style.willChange = "";
            el.style.cursor = "";
          }
        });
        if (moves.length > 0) onPartsMove(moves);
      }
      setDragMode("none");
      setDraggingLabel(null);
      draggingIdsRef.current = [];
    },
    [dragMode, onPartsMove, onPartReturn]
  );

  const binViewBox = useMemo(() => {
    const pX = binWidth * 0.05,
      pY = binHeight * 0.05;
    return `${-pX} ${-pY} ${binWidth + pX * 2} ${binHeight + pY * 2}`;
  }, [binWidth, binHeight]);

  const btnStyle: React.CSSProperties = {
    width: 30,
    height: 30,
    padding: 0,
    lineHeight: 1,
    cursor: "pointer",
    background: theme.buttonBg,
    border: `1px solid ${theme.buttonBorder}`,
    color: theme.text,
    borderRadius: "4px",
    fontWeight: "bold",
    fontSize: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: "2px",
  };

  const cncTransform = `translate(0, ${binHeight}) scale(1, -1)`;

  const handleReturnAll = useCallback(() => {
    if (placedParts.length === 0) return;

    // Confirmação opcional (pode remover se quiser ação imediata)
    if (
      window.confirm(
        "Deseja recolher todas as peças da mesa de volta para o banco?"
      )
    ) {
      const allUuids = placedParts.map((p) => p.uuid);
      onPartReturn(allUuids);
    }
  }, [placedParts, onPartReturn]);

  return (
    <div
      ref={svgContainerRef}
      style={{
        flex: 2,
        position: "relative",
        background: "transparent",
        display: "flex",
        flexDirection: "column",
        // ALTERAÇÃO AQUI: Se estiver movendo peça/etiqueta usa "grabbing", senão usa seta normal "default"
        cursor:
          dragMode === "label" || dragMode === "parts" ? "grabbing" : "default",
        overflow: "hidden",
        width: "100%",
        height: "100%",
      }}
      onMouseDown={handleMouseDownContainer}
      onDoubleClick={handleDoubleClickContainer}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div
        style={{
          position: "absolute",
          right: 20,
          top: 20,
          display: "flex",
          flexDirection: "column",
          gap: "5px",
          zIndex: 10,
        }}
      >
        <button
          onClick={() =>
            updateTransform({
              ...transformRef.current,
              k: transformRef.current.k * 1.2,
            })
          }
          style={btnStyle}
          title="Zoom In"
        >
          ➕
        </button>
        <button
          onClick={() =>
            updateTransform({
              ...transformRef.current,
              k: transformRef.current.k / 1.2,
            })
          }
          style={btnStyle}
          title="Zoom Out"
        >
          ➖
        </button>
        <button
          onClick={resetZoom}
          style={{ ...btnStyle, fontSize: "12px" }}
          title="Ajustar à Tela"
        >
          ⛶
        </button>

        {/* --- NOVO BOTÃO: RECOLHER TUDO --- */}
        <button
          onClick={handleReturnAll}
          style={{
            ...btnStyle,
            marginTop: "10px",
            color: "#dc3545",
            borderColor: "#dc3545",
          }}
          title="Recolher Todas para o Banco"
          disabled={placedParts.length === 0}
        >
          📥
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          padding: "20px",
          overflow: "hidden",
        }}
      >
        <svg
          viewBox={binViewBox}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", height: "100%" }}
        >
          <g
            ref={panGroupRef}
            transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}
          >
            <g transform={cncTransform}>
              <rect
                x="0"
                y="0"
                width={binWidth}
                height={binHeight}
                fill={showDebug ? "none" : "none"}
                stroke="#4e4e4dff"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
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

              {placedParts.map((placed) => {
                const part = parts.find((p) => p.id === placed.partId);
                if (!part) return null;
                return (
                  <PartElement
                    key={placed.uuid}
                    ref={(el) => {
                      partRefs.current[placed.uuid] = el;
                    }}
                    placed={placed}
                    isSelected={selectedPartIds.includes(placed.uuid)}
                    onMouseDown={handleMouseDownPart}
                    onLabelDown={(e, type) =>
                      handleLabelDown(e, placed.uuid, type)
                    }
                    onDoubleClick={handleDoubleClickPart}
                    onContextMenu={onContextMenu}
                    onEntityContextMenu={onEntityContextMenu}
                    partData={part}
                    showDebug={showDebug}
                    strategy={strategy}
                    transformData={partTransforms[placed.uuid] || {}}
                    theme={theme}
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
