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
import type { CropLine } from "../hooks/useSheetManager";

// CONFIGURAÇÃO DO SNAP
const SNAP_THRESHOLD = 15;

interface InteractiveCanvasProps {
  parts: ImportedPart[];
  placedParts: PlacedPart[];
  binWidth: number;
  binHeight: number;
  margin: number;
  showDebug: boolean;
  strategy: "guillotine" | "true-shape";
  selectedPartIds: string[];
  theme: AppTheme;

  collidingPartIds?: string[];

  // Props de Linhas de Retalho
  cropLines?: CropLine[];
  onCropLineMove?: (lineId: string, newPosition: number) => void;
  onBackgroundContextMenu?: (e: React.MouseEvent) => void;

  // Funções de Manipulação
  onPartsMove: (moves: { partId: string; dx: number; dy: number }[]) => void;
  
  onPartReturn: (uuids: string[]) => void;
  onLabelDrag?: (
    partId: string,
    type: "white" | "pink",
    dx: number,
    dy: number
  ) => void;
  onPartSelect: (partIds: string[], append: boolean) => void;
  onContextMenu: (e: React.MouseEvent, partId: string) => void;
  onEntityContextMenu?: (e: React.MouseEvent, entity: any) => void;

  // Undo/Redo
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;

  onCanvasDrop?: (partId: string, x: number, y: number) => void;
  onCropLineContextMenu?: (e: React.MouseEvent, lineId: string) => void; // <--- NOVO
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

interface SnapLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  key: string;
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
          d += ` A ${rx} ${ry} 0 ${largeArc} ${sweep} ${v2.x * scale} ${
            v2.y * scale
          }`;
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
  isColliding?: boolean;
  onMouseDown: (e: React.MouseEvent, uuid: string) => void;
  onLabelDown: (e: React.MouseEvent, type: "white" | "pink") => void;  
  onDoubleClick: (e: React.MouseEvent, uuid: string) => void;
  onContextMenu: (e: React.MouseEvent, uuid: string) => void;
  onEntityContextMenu?: (e: React.MouseEvent, entity: any) => void;
  partData: ImportedPart | undefined;
  showDebug: boolean;
  strategy: "guillotine" | "true-shape";
  transformData: any;
  theme: AppTheme;
  globalScale: number;
}

const PartElement = React.memo(
  forwardRef<SVGGElement, PartElementProps>(
    (
      {
        placed,
        isSelected,
        isColliding,
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
      const localW = partData.width;
      const localH = partData.height;
      const occupiedW = placed.rotation % 180 !== 0 ? localH : localW;
      const occupiedH = placed.rotation % 180 !== 0 ? localW : localH;

      const finalTransform = transformData
        ? `translate(${placed.x + transformData.occupiedW / 2}, ${
            placed.y + transformData.occupiedH / 2
          }) rotate(${
            placed.rotation
          }) translate(${-transformData.centerX}, ${-transformData.centerY})`
        : "";

      let strokeColor = theme.text === "#e0e0e0" ? "#007bff" : "#007bff";
      if (isSelected) strokeColor = "#01ff3cff";
      if (isColliding) strokeColor = "#ff0000";

      const fillColor = isColliding ? "rgba(255, 0, 0, 0.3)" : "transparent";      

      return (
        <g ref={ref}>
          <g
            onMouseDown={(e) => onMouseDown(e, placed.uuid)}
            onDoubleClick={(e) => onDoubleClick(e, placed.uuid)}
            onContextMenu={(e) => onContextMenu(e, placed.uuid)}
            style={{
              cursor:
                strategy === "guillotine"
                  ? "default"
                  : isSelected
                  ? "move"
                  : "pointer",
              opacity: isSelected ? 0.8 : 1,
            }}
          >
            <rect
              x={placed.x}
              y={placed.y}
              width={occupiedW}
              height={occupiedH}
              fill={fillColor}
              stroke={
                isColliding
                  ? "red"
                  : isSelected
                  ? "#01ff3cff"
                  : showDebug
                  ? "red"
                  : "none"
              }
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
  onPartReturn,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  collidingPartIds = [],
  onCanvasDrop,
  onBackgroundContextMenu,
  cropLines = [],
  onCropLineContextMenu,
  onCropLineMove,
}) => {
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  const [dragMode, setDragMode] = useState<
    "none" | "pan" | "parts" | "label" | "rotate" | "cropline"
  >("none");
  const [draggingLabel, setDraggingLabel] = useState<{
    partId: string;
    type: "white" | "pink";
  } | null>(null);
  const [draggingLine, setDraggingLine] = useState<{
    id: string;
    type: "horizontal" | "vertical";
    startVal: number;
  } | null>(null);

  const [boundingBoxCache, setBoundingBoxCache] = useState<BoundingBoxCache>(
    {}
  );
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);

  const svgContainerRef = useRef<HTMLDivElement>(null);
  const panGroupRef = useRef<SVGGElement>(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const rafRef = useRef<number | null>(null);

  const partRefs = useRef<{ [key: string]: SVGGElement | null }>({});
  const draggingIdsRef = useRef<string[]>([]);
  const currentDragDeltaRef = useRef({ dx: 0, dy: 0 });
  
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
  const handleMouseDownContainer = useCallback(() => {}, []);
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
        rawWidth: placed.rotation % 180 !== 0 ? part.height : part.width,
        rawHeight: placed.rotation % 180 !== 0 ? part.width : part.height,
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
      if (strategy !== "guillotine" && e.button === 0) {
        e.preventDefault();
        setDragMode("parts");
        draggingIdsRef.current = selectedPartIds;
        currentDragDeltaRef.current = { dx: 0, dy: 0 };
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

  const handleLineDown = useCallback(
    (
      e: React.MouseEvent,
      lineId: string,
      type: "horizontal" | "vertical",
      position: number
    ) => {
      e.stopPropagation();
      e.preventDefault();
      setDragMode("cropline");
      setDraggingLine({ id: lineId, type, startVal: position });
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

  const calculateSnap = useCallback(
    (deltaX: number, deltaY: number) => {
      const leaderId = draggingIdsRef.current[0];
      const leaderPlaced = placedParts.find((p) => p.uuid === leaderId);
      if (!leaderPlaced)
        return { snapedDx: deltaX, snapedDy: deltaY, guides: [] };
      const leaderInfo = partTransforms[leaderId];
      if (!leaderInfo)
        return { snapedDx: deltaX, snapedDy: deltaY, guides: [] };

      const proposedX = leaderPlaced.x + deltaX;
      const proposedY = leaderPlaced.y + deltaY;
      const w = leaderInfo.rawWidth;
      const h = leaderInfo.rawHeight;
      const left = proposedX;
      const right = proposedX + w;
      const bottom = proposedY;
      const top = proposedY + h;

      let snapDx = 0;
      let snapDy = 0;
      const guides: SnapLine[] = [];
      const threshold = SNAP_THRESHOLD / transformRef.current.k;

      if (Math.abs(left - 0) < threshold) {
        snapDx = 0 - left;
        guides.push({ x1: 0, y1: 0, x2: 0, y2: binHeight, key: "margin-left" });
      } else if (Math.abs(right - binWidth) < threshold) {
        snapDx = binWidth - right;
        guides.push({
          x1: binWidth,
          y1: 0,
          x2: binWidth,
          y2: binHeight,
          key: "margin-right",
        });
      }
      if (Math.abs(bottom - 0) < threshold) {
        snapDy = 0 - bottom;
        guides.push({
          x1: 0,
          y1: 0,
          x2: binWidth,
          y2: 0,
          key: "margin-bottom",
        });
      } else if (Math.abs(top - binHeight) < threshold) {
        snapDy = binHeight - top;
        guides.push({
          x1: 0,
          y1: binHeight,
          x2: binWidth,
          y2: binHeight,
          key: "margin-top",
        });
      }

      const draggingSet = new Set(draggingIdsRef.current);
      placedParts.forEach((other) => {
        if (draggingSet.has(other.uuid)) return;
        const otherInfo = partTransforms[other.uuid];
        if (!otherInfo) return;
        const oLeft = other.x;
        const oRight = other.x + otherInfo.rawWidth;
        const oBottom = other.y;
        const oTop = other.y + otherInfo.rawHeight;

        if (Math.abs(left - oRight) < threshold) {
          snapDx = oRight - left;
          guides.push({
            x1: oRight,
            y1: Math.min(bottom, oBottom) - 100,
            x2: oRight,
            y2: Math.max(top, oTop) + 100,
            key: `v-${other.uuid}-R`,
          });
        } else if (Math.abs(right - oLeft) < threshold) {
          snapDx = oLeft - right;
          guides.push({
            x1: oLeft,
            y1: Math.min(bottom, oBottom) - 100,
            x2: oLeft,
            y2: Math.max(top, oTop) + 100,
            key: `v-${other.uuid}-L`,
          });
        } else if (Math.abs(left - oLeft) < threshold) {
          snapDx = oLeft - left;
          guides.push({
            x1: oLeft,
            y1: Math.min(bottom, oBottom) - 100,
            x2: oLeft,
            y2: Math.max(top, oTop) + 100,
            key: `v-${other.uuid}-LL`,
          });
        } else if (Math.abs(right - oRight) < threshold) {
          snapDx = oRight - right;
          guides.push({
            x1: oRight,
            y1: Math.min(bottom, oBottom) - 100,
            x2: oRight,
            y2: Math.max(top, oTop) + 100,
            key: `v-${other.uuid}-RR`,
          });
        }

        if (Math.abs(bottom - oTop) < threshold) {
          snapDy = oTop - bottom;
          guides.push({
            x1: Math.min(left, oLeft) - 100,
            y1: oTop,
            x2: Math.max(right, oRight) + 100,
            y2: oTop,
            key: `h-${other.uuid}-T`,
          });
        } else if (Math.abs(top - oBottom) < threshold) {
          snapDy = oBottom - top;
          guides.push({
            x1: Math.min(left, oLeft) - 100,
            y1: oBottom,
            x2: Math.max(right, oRight) + 100,
            y2: oBottom,
            key: `h-${other.uuid}-B`,
          });
        } else if (Math.abs(bottom - oBottom) < threshold) {
          snapDy = oBottom - bottom;
          guides.push({
            x1: Math.min(left, oLeft) - 100,
            y1: oBottom,
            x2: Math.max(right, oRight) + 100,
            y2: oBottom,
            key: `h-${other.uuid}-BB`,
          });
        } else if (Math.abs(top - oTop) < threshold) {
          snapDy = oTop - top;
          guides.push({
            x1: Math.min(left, oLeft) - 100,
            y1: oTop,
            x2: Math.max(right, oRight) + 100,
            y2: oTop,
            key: `h-${other.uuid}-TT`,
          });
        }
      });
      return { snapedDx: deltaX + snapDx, snapedDy: deltaY + snapDy, guides };
    },
    [placedParts, partTransforms, binWidth, binHeight]
  );

  useEffect(() => {
    if (dragMode === "none") return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      rafRef.current = requestAnimationFrame(() => {
        const currentSvgPos = getSVGPoint(e.clientX, e.clientY);

        if (dragMode === "cropline" && draggingLine && onCropLineMove) {
          const rawDx = currentSvgPos.x - dragRef.current.startSvgX;
          const rawDy = currentSvgPos.y - dragRef.current.startSvgY;

          // AQUI ESTÁ A CORREÇÃO: Dividir pelo zoom (transform.k)
          const dx = rawDx / transformRef.current.k;
          const dy = rawDy / transformRef.current.k;

          let newValue = draggingLine.startVal;
          if (draggingLine.type === "vertical") {
            newValue += dx;
            newValue = Math.max(0, Math.min(newValue, binWidth));
          } else {
            newValue += -dy;
            newValue = Math.max(0, Math.min(newValue, binHeight));
          }
          onCropLineMove(draggingLine.id, newValue);
        } else if (dragMode === "label" && draggingLabel && onLabelDrag) {
          const dx = currentSvgPos.x - dragRef.current.startSvgX;
          const dy = currentSvgPos.y - dragRef.current.startSvgY;
          onLabelDrag(draggingLabel.partId, draggingLabel.type, dx, -dy);
          dragRef.current.startSvgX = currentSvgPos.x;
          dragRef.current.startSvgY = currentSvgPos.y;
        } else if (dragMode === "parts") {
          let deltaX = currentSvgPos.x - dragRef.current.startSvgX;
          let deltaY = currentSvgPos.y - dragRef.current.startSvgY;
          const currentZoom = transformRef.current.k;
          if (currentZoom > 1.5) {
            const dampFactor = 1 / Math.pow(currentZoom, 0.6);
            deltaX *= dampFactor;
            deltaY *= dampFactor;
          }
          const machineDeltaY = -deltaY;
          const { snapedDx, snapedDy, guides } = calculateSnap(
            deltaX,
            machineDeltaY
          );

          setSnapLines(guides);
          currentDragDeltaRef.current = { dx: snapedDx, dy: snapedDy };
          const visualSnapDy = snapedDy;

          draggingIdsRef.current.forEach((id) => {
            const el = partRefs.current[id];
            if (el)
              el.style.transform = `translate3d(${snapedDx}px, ${visualSnapDy}px, 0)`;
          });
        }
      });
    };

    // REMOVER 'e' ou 'e: MouseEvent' dos parênteses
    const handleWindowMouseUp = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      setSnapLines([]);

      if (dragMode === "parts") {
        const finalDx = currentDragDeltaRef.current.dx;
        const finalDy = currentDragDeltaRef.current.dy;
        const moves: { partId: string; dx: number; dy: number }[] = [];
        draggingIdsRef.current.forEach((id) => {
          const el = partRefs.current[id];
          if (el) {
            moves.push({ partId: id, dx: finalDx, dy: finalDy });
            el.style.transform = "";
          }
        });
        if (moves.length > 0) onPartsMove(moves);
      }

      setDragMode("none");
      setDraggingLabel(null);
      setDraggingLine(null);
      draggingIdsRef.current = [];
      currentDragDeltaRef.current = { dx: 0, dy: 0 };
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [
    dragMode,
    getSVGPoint,
    calculateSnap,
    onLabelDrag,    
    onPartReturn,
    onPartsMove,
    draggingLabel,
    draggingLine,
    onCropLineMove,
    binWidth,
    binHeight,
  ]);

  const handleNativeDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const partId = e.dataTransfer.getData("application/react-dnd-part-id");
      if (!partId || !onCanvasDrop) return;
      const svgPos = getSVGPoint(e.clientX, e.clientY);
      const visualX = (svgPos.x - transform.x) / transform.k;
      const visualY = (svgPos.y - transform.y) / transform.k;
      onCanvasDrop(partId, visualX, binHeight - visualY);
    },
    [getSVGPoint, transform, binHeight, onCanvasDrop]
  );

  const handleNativeDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const handleReturnAll = useCallback(() => {
    if (placedParts.length === 0) return;
    if (
      window.confirm(
        "Deseja recolher todas as peças da mesa de volta para o banco?"
      )
    ) {
      const allUuids = placedParts.map((p) => p.uuid);
      onPartReturn(allUuids);
    }
  }, [placedParts, onPartReturn]);

  const binViewBox = useMemo(
    () =>
      `${-binWidth * 0.05} ${-binHeight * 0.05} ${binWidth * 1.1} ${
        binHeight * 1.1
      }`,
    [binWidth, binHeight]
  );

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

  return (
    <div
      ref={svgContainerRef}
      style={{
        flex: 2,
        position: "relative",
        background: "transparent",
        display: "flex",
        flexDirection: "column",
        cursor: dragMode !== "none" ? "grabbing" : "default",
        overflow: "hidden",
        width: "100%",
        height: "100%",
      }}
      onMouseDown={handleMouseDownContainer}
      onDoubleClick={handleDoubleClickContainer}
      onDrop={handleNativeDrop}
      onDragOver={handleNativeDragOver}
    >
      <div
        style={{
          position: "absolute",
          left: 20,
          top: 20,
          display: "flex",
          flexDirection: "column",
          gap: "5px",
          zIndex: 10,
        }}
      >
        <button
          onClick={onUndo}
          disabled={!canUndo}
          style={{ ...btnStyle, opacity: !canUndo ? 0.5 : 1 }}
          title="Desfazer"
        >
          ↩
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          style={{ ...btnStyle, opacity: !canRedo ? 0.5 : 1 }}
          title="Refazer"
        >
          ↪
        </button>
      </div>

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
                fill="transparent"
                stroke="#4e4e4dff"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: "all" }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (onBackgroundContextMenu) onBackgroundContextMenu(e);
                }}
              />

              {/* CORREÇÃO: Mostra a margem sempre que ela for maior que 0, independente do Debug */}
              {margin > 0 && (
                <rect
                  x={margin}
                  y={margin}
                  width={binWidth - margin * 2}
                  height={binHeight - margin * 2}
                  fill="none"
                  stroke="#999" // Cor da linha (cinza tracejado)
                  strokeDasharray="5"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: "none" }} // Garante que não atrapalhe cliques
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
                    isColliding={collidingPartIds?.includes(placed.uuid)}
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
                    globalScale={transform.k}
                  />
                );
              })}

              {/* --- RENDERIZAÇÃO DAS LINHAS DE RETALHO (Espessura Fixa) --- */}
              {cropLines.map((line) => {
                // ALTERAÇÃO: Valores fixos (pixels de tela), sem dividir por transform.k
                const strokeW = 2; // Sempre 2px de espessura visual
                const hitW = 20; // Sempre 20px de área de clique visual

                const cursor =
                  line.type === "vertical" ? "col-resize" : "row-resize";

                const x1 = line.type === "vertical" ? line.position : 0;
                const x2 = line.type === "vertical" ? line.position : binWidth;
                const y1 = line.type === "horizontal" ? line.position : 0;
                const y2 =
                  line.type === "horizontal" ? line.position : binHeight;

                return (
                  <g
                    key={line.id}
                    onMouseDown={(e) =>
                      handleLineDown(e, line.id, line.type, line.position)
                    }
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (onCropLineContextMenu)
                        onCropLineContextMenu(e, line.id);
                    }}
                    style={{ cursor: cursor }}
                  >
                    {/* 1. Área de clique (Invisível) */}
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="transparent"
                      strokeWidth={hitW}
                      vectorEffect="non-scaling-stroke" // Garante que a área de clique não mude com zoom
                    />

                    {/* 2. Linha Visível (Verde Sólido) */}
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#00ff3cff"
                      strokeWidth={strokeW}
                      vectorEffect="non-scaling-stroke" // Garante que a linha não afine/engrosse com zoom
                      style={{ pointerEvents: "none" }}
                    />
                  </g>
                );
              })}

              {snapLines.map((line) => (
                <line
                  key={line.key}
                  x1={line.x1}
                  y1={line.y1}
                  x2={line.x2}
                  y2={line.y2}
                  stroke="#00aaff"
                  strokeWidth={1 / transform.k}
                  strokeDasharray={`${4 / transform.k}, ${4 / transform.k}`}
                  vectorEffect="non-scaling-stroke"
                  style={{ pointerEvents: "none" }}
                />
              ))}
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
};
