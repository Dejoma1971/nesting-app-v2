/* eslint-disable @typescript-eslint/no-explicit-any */
import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import type { ImportedPart } from "./types";
import type { PlacedPart } from "../utils/nestingCore";
import { generateDxfContent } from "../utils/dxfWriter";
// IMPORTAÇÃO DO NOVO COMPONENTE
import { ContextControl } from './ContextControl';

import NestingWorker from "../workers/nesting.worker?worker";

interface Size {
  width: number;
  height: number;
}
interface NestingBoardProps {
  parts: ImportedPart[];
}

// Interface para cache de bounding boxes
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

// Função de renderização de entidade
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

// Componente memoizado para peças individuais
interface PartElementProps {
  placed: PlacedPart;
  isSelected: boolean;
  onMouseDown: (
    e: React.MouseEvent,
    partId: string,
    x: number,
    y: number
  ) => void;
  onDoubleClick: (e: React.MouseEvent, partId: string) => void;
  // NOVO: Prop para receber o clique direito
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
    onContextMenu, // Recebe a função
    partData,
    showDebug,
    strategy,
    transformData,
  }) => {
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

    return (
      <g
        onMouseDown={(e) => onMouseDown(e, placed.partId, placed.x, placed.y)}
        onDoubleClick={(e) => onDoubleClick(e, placed.partId)}
        onContextMenu={(e) => onContextMenu(e, placed.partId)} // Conecta o evento
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

// Função auxiliar para calcular bounding box
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

export const NestingBoard: React.FC<NestingBoardProps> = ({ parts }) => {
  const [binSize, setBinSize] = useState<Size>({ width: 1200, height: 3000 });
  const [gap, setGap] = useState(10);
  const [margin, setMargin] = useState(10);

  // CONFIGURAÇÕES
  const [strategy, setStrategy] = useState<"rect" | "true-shape">("rect");
  const [direction, setDirection] = useState<
    "auto" | "vertical" | "horizontal"
  >("auto");
  const [iterations] = useState(50);
  const [rotationStep, setRotationStep] = useState(90);

  const [quantities, setQuantities] = useState<{ [key: string]: number }>(
    () => {
      const initialQ: { [key: string]: number } = {};
      parts.forEach((p) => {
        initialQ[p.id] = 1;
      });
      return initialQ;
    }
  );

  const [activeTab, setActiveTab] = useState<"grid" | "list">("grid");
  const [showDebug, setShowDebug] = useState(true);

  // Estados de Resultado
  const [nestingResult, setNestingResult] = useState<PlacedPart[]>([]);
  const [isComputing, setIsComputing] = useState(false);
  const [failedCount, setFailedCount] = useState(0);
  const [totalBins, setTotalBins] = useState(1);
  const [currentBinIndex, setCurrentBinIndex] = useState(0);

  // Estados de Interação Visual
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
  const transformRef = useRef({ x: 0, y: 0, k: 1 });

  // Controle de Seleção
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [dragMode, setDragMode] = useState<"none" | "pan" | "part">("none");

  // NOVO ESTADO: MENU DE CONTEXTO
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number } | null>(null);

  // REFS DOM
  const workerRef = useRef<Worker | null>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const panGroupRef = useRef<SVGGElement>(null);
  const activePartElementRef = useRef<SVGGElement | null>(null);
  const panIntervalRef = useRef<number | null>(null);
  const [boundingBoxCache, setBoundingBoxCache] = useState<BoundingBoxCache>({});
  const rafRef = useRef<number | null>(null);

  const dragRef = useRef({
    startX: 0, startY: 0, startSvgX: 0, startSvgY: 0,
    initialX: 0, initialY: 0, partX: 0, partY: 0,
  });

  // --- Helpers SVG ---
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

  // --- FUNÇÕES DO MENU DE CONTEXTO ---
  const handleContextMove = useCallback((dx: number, dy: number) => {
      if (!selectedPartId) return;
      const realDy = -dy; // Inverte Y para sistema CNC
      setNestingResult(prev => prev.map(p => {
          if (p.partId === selectedPartId) {
              return { ...p, x: p.x + dx, y: p.y + realDy };
          }
          return p;
      }));
  }, [selectedPartId]);

  const handleContextRotate = useCallback((angle: number) => {
      if (!selectedPartId) return;
      setNestingResult(prev => prev.map(p => {
          if (p.partId === selectedPartId) {
              let newRot = (p.rotation + angle) % 360;
              if (newRot < 0) newRot += 360;
              return { ...p, rotation: newRot };
          }
          return p;
      }));
  }, [selectedPartId]);

  // --- GATILHO DO MENU (CLIQUE DIREITO NA PEÇA) ---
  const handlePartContextMenu = useCallback((e: React.MouseEvent, partId: string) => {
      e.preventDefault(); 
      e.stopPropagation();

      // Regra: Só abre se a peça já estiver selecionada (Verde)
      if (partId === selectedPartId) {
           setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
      } else {
           setContextMenu(null);
      }
  }, [selectedPartId]);


  // --- PAN CONTÍNUO ---
  const stopContinuousPan = useCallback(() => {
    if (panIntervalRef.current !== null) {
      window.clearInterval(panIntervalRef.current);
      panIntervalRef.current = null;
    }
  }, []);

  const startContinuousPan = useCallback(
    (dx: number, dy: number) => {
      stopContinuousPan();
      const step = () => {
        const current = transformRef.current;
        const newX = current.x + dx;
        const newY = current.y + dy;
        updateTransform({ ...current, x: newX, y: newY });
      };
      step();
      panIntervalRef.current = window.setInterval(step, 30);
    },
    [stopContinuousPan, updateTransform]
  );

  // --- PRÉ-CÁLCULO ---
  const partTransforms = useMemo(() => {
    const transforms: Record<string, any> = {};
    nestingResult.forEach((placed) => {
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
      transforms[placed.partId] = {
        centerX: box.centerX,
        centerY: box.centerY,
        occupiedW: placed.rotation % 180 !== 0 ? part.height : part.width,
        occupiedH: placed.rotation % 180 !== 0 ? part.width : part.height,
      };
    });
    return transforms;
  }, [nestingResult, parts, boundingBoxCache]);

  // --- EFFECTS ---
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuantities((prev) => {
      const currentIds = new Set(Object.keys(prev));
      const newParts = parts.filter((p) => !currentIds.has(p.id));
      if (newParts.length > 0) {
        const newQ = { ...prev };
        newParts.forEach((p) => { newQ[p.id] = 1; });
        return newQ;
      }
      return prev;
    });
  }, [parts]);

  useEffect(() => {
    return () => {
      stopContinuousPan();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [stopContinuousPan]);

  // --- MOUSE HANDLERS ---
  const handleMouseDownContainer = useCallback(
    (e: React.MouseEvent) => {
      // Se clicar fora, fecha o menu de contexto
      if (contextMenu) setContextMenu(null);

      if (dragMode === "none") {
        setDragMode("pan");
        dragRef.current = {
          startX: e.clientX, startY: e.clientY,
          startSvgX: 0, startSvgY: 0,
          initialX: transformRef.current.x, initialY: transformRef.current.y,
          partX: 0, partY: 0,
        };
      }
    },
    [dragMode, contextMenu]
  );

  const handleMouseDownPart = useCallback(
    (e: React.MouseEvent, partId: string, currentX: number, currentY: number) => {
      if (partId !== selectedPartId) return;
      e.stopPropagation();

      if (e.button === 0) {
        if (strategy !== "rect") {
          e.preventDefault();
          setDragMode("part");
          activePartElementRef.current = e.currentTarget as SVGGElement;
          const svgPos = getSVGPoint(e.clientX, e.clientY);
          if (activePartElementRef.current) {
            activePartElementRef.current.style.transform = "translate3d(0, 0, 0)";
            activePartElementRef.current.style.willChange = "transform";
            activePartElementRef.current.style.cursor = "grabbing";
          }
          dragRef.current = {
            startX: e.clientX, startY: e.clientY,
            startSvgX: svgPos.x, startSvgY: svgPos.y,
            initialX: 0, initialY: 0,
            partX: currentX, partY: currentY,
          };
        }
      }
    },
    [strategy, selectedPartId, getSVGPoint]
  );

  const handleDoubleClickPart = useCallback(
    (e: React.MouseEvent, partId: string) => {
      e.stopPropagation();
      setSelectedPartId(partId); // Clica 2x seleciona (comportamento padrão)
      // Se quiser deselecionar no duplo clique, use: setSelectedPartId(null);
    },
    []
  );

  const handleDoubleClickContainer = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setSelectedPartId(null); // Duplo clique no vazio limpa seleção
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
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
        } else if (dragMode === "part" && activePartElementRef.current) {
          const currentSvgPos = getSVGPoint(e.clientX, e.clientY);
          const deltaX = currentSvgPos.x - dragRef.current.startSvgX;
          const deltaY = currentSvgPos.y - dragRef.current.startSvgY;
          const visualToCncY = -deltaY;
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
      setTransform({ ...transformRef.current });
    } else if (dragMode === "part" && selectedPartId && activePartElementRef.current) {
      const style = window.getComputedStyle(activePartElementRef.current);
      const matrix = new DOMMatrixReadOnly(style.transform);
      const finalDeltaX = matrix.m41;
      const finalDeltaY = matrix.m42;

      setNestingResult((prev) =>
        prev.map((p) => {
          if (p.partId === selectedPartId) {
            return {
              ...p,
              x: dragRef.current.partX + finalDeltaX,
              y: dragRef.current.partY + finalDeltaY,
            };
          }
          return p;
        })
      );
      activePartElementRef.current.style.transform = "";
      activePartElementRef.current.style.willChange = "";
      activePartElementRef.current.style.cursor = "";
    }
    setDragMode("none");
    activePartElementRef.current = null;
  }, [dragMode, selectedPartId]);

  const handleMouseLeave = useCallback(() => {
    if (dragMode !== "none") handleMouseUp();
    stopContinuousPan();
  }, [dragMode, handleMouseUp, stopContinuousPan]);

  const resetZoom = useCallback(() => updateTransform({ x: 0, y: 0, k: 1 }), [updateTransform]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault(); e.stopPropagation();
      const svgElement = svgContainerRef.current?.querySelector("svg");
      if (!svgElement) return;
      let mouseX = 0; let mouseY = 0;
      try {
        const point = svgElement.createSVGPoint();
        point.x = e.clientX; point.y = e.clientY;
        const svgPoint = point.matrixTransform(svgElement.getScreenCTM()?.inverse());
        mouseX = svgPoint.x; mouseY = svgPoint.y;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
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
    },
    [updateTransform]
  );

  const handleWidthChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value); setBinSize((prev) => ({ ...prev, width: val }));
    }, []);
  const handleHeightChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value); setBinSize((prev) => ({ ...prev, height: val }));
    }, []);
  const swapDimensions = useCallback(() => {
    setBinSize((prev) => ({ width: prev.height, height: prev.width }));
  }, []);

  const handleCalculate = useCallback(() => {
    if (parts.length === 0) return;
    setIsComputing(true); setNestingResult([]); setCurrentBinIndex(0); setTotalBins(1); resetZoom(); setSelectedPartId(null); setBoundingBoxCache({});
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
      parts: JSON.parse(JSON.stringify(parts)), quantities, gap, margin, binWidth: binSize.width, binHeight: binSize.height, strategy, iterations, rotationStep, direction,
    });
  }, [parts, quantities, gap, margin, binSize, strategy, iterations, rotationStep, direction, resetZoom]);

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

  const updateQty = useCallback((id: string, val: number) => { setQuantities((prev) => ({ ...prev, [id]: val })); }, []);
  const formatArea = useCallback((mm2: number) => { return mm2 > 100000 ? (mm2 / 1000000).toFixed(3) + " m²" : mm2.toFixed(0) + " mm²"; }, []);
  const getPartById = useCallback((id: string) => { return parts.find((p) => p.id === id); }, [parts]);

  const binViewBox = useMemo(() => {
    const paddingX = binSize.width * 0.05; const paddingY = binSize.height * 0.05;
    return `${-paddingX} ${-paddingY} ${binSize.width + paddingX * 2} ${binSize.height + paddingY * 2}`;
  }, [binSize]);
  const cncTransform = `translate(0, ${binSize.height}) scale(1, -1)`;

  const getThumbnailViewBox = useCallback((part: ImportedPart) => {
      const cachedBox = boundingBoxCache[part.id];
      if (cachedBox) { const p = Math.max(cachedBox.width, cachedBox.height) * 0.1; return `${cachedBox.minX - p} ${cachedBox.minY - p} ${cachedBox.width + p * 2} ${cachedBox.height + p * 2}`; }
      const box = calculateBoundingBox(part.entities, part.blocks);
      const p = Math.max(box.width, box.height) * 0.1;
      return `${box.minX - p} ${box.minY - p} ${box.width + p * 2} ${box.height + p * 2}`;
    }, [boundingBoxCache]);

  const tabStyle = useCallback((isActive: boolean): React.CSSProperties => ({ padding: "10px 15px", cursor: "pointer", background: "transparent", outline: "none", border: "none", borderBottom: isActive ? "2px solid #28a745" : "2px solid transparent", color: isActive ? "inherit" : "rgba(128,128,128,0.7)", fontWeight: isActive ? "bold" : "normal", fontSize: "13px", }), []);
  const currentBinParts = useMemo(() => { return nestingResult.filter((p) => p.binId === currentBinIndex); }, [nestingResult, currentBinIndex]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      {/* MENU CONTEXTO */}
      {contextMenu && contextMenu.visible && selectedPartId && (
          <ContextControl 
              x={contextMenu.x}
              y={contextMenu.y}
              onClose={() => setContextMenu(null)}
              onMove={handleContextMove}
              onRotate={handleContextRotate}
          />
      )}

      {/* TOPO DE CONTROLES */}
      <div style={{ padding: "10px 20px", borderBottom: "1px solid #444", display: "flex", gap: "20px", alignItems: "center", backgroundColor: "rgba(0,0,0,0.03)", flexWrap: "wrap", }}>
        <div style={{ display: "flex", alignItems: "center", borderRight: "1px solid #555", paddingRight: "15px", }}>
          <span style={{ fontSize: "12px", marginRight: "5px", fontWeight: "bold" }}>Motor:</span>
          <select value={strategy} onChange={(e) => setStrategy(e.target.value as "rect" | "true-shape")} style={{ padding: "5px", borderRadius: "4px", border: "1px solid #555", background: "rgba(0,0,0,0.1)", color: "inherit", fontWeight: "bold", }}>
            <option value="rect">🔳 Retangular (Fixo)</option>
            <option value="true-shape">🧩 True Shape (Manual)</option>
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", borderRight: "1px solid #555", paddingRight: "15px", }}>
          <span style={{ fontSize: "12px", marginRight: "5px", fontWeight: "bold" }}>Preencher:</span>
          <div style={{ display: "flex", gap: "2px", background: "rgba(0,0,0,0.1)", borderRadius: "4px", padding: "2px", }}>
            <button title="Automático" onClick={() => setDirection("auto")} style={{ padding: "4px 8px", border: "none", borderRadius: "3px", cursor: "pointer", background: direction === "auto" ? "#007bff" : "transparent", color: direction === "auto" ? "#fff" : "inherit", fontSize: "12px", }}>Auto</button>
            <button title="Vertical" onClick={() => setDirection("vertical")} style={{ padding: "4px 8px", border: "none", borderRadius: "3px", cursor: "pointer", background: direction === "vertical" ? "#007bff" : "transparent", color: direction === "vertical" ? "#fff" : "inherit", fontSize: "16px", }}>⬇️</button>
            <button title="Horizontal" onClick={() => setDirection("horizontal")} style={{ padding: "4px 8px", border: "none", borderRadius: "3px", cursor: "pointer", background: direction === "horizontal" ? "#007bff" : "transparent", color: direction === "horizontal" ? "#fff" : "inherit", fontSize: "16px", }}>➡️</button>
          </div>
        </div>
        <div style={{ fontWeight: "bold", fontSize: "14px" }}>📐</div>
        <div style={{ display: "flex", alignItems: "center", background: "rgba(0,0,0,0.05)", padding: "5px", borderRadius: "4px", gap: "10px", }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <label style={{ marginRight: 5, fontSize: 13 }}>L:</label>
            <input type="number" value={binSize.width} onChange={handleWidthChange} style={{ padding: 5, width: 60, border: "1px solid #555", background: "rgba(0,0,0,0.1)", color: "inherit", }} />
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <label style={{ marginRight: 5, fontSize: 13 }}>A:</label>
            <input type="number" value={binSize.height} onChange={handleHeightChange} style={{ padding: 5, width: 60, border: "1px solid #555", background: "rgba(0,0,0,0.1)", color: "inherit", }} />
          </div>
          <button onClick={swapDimensions} title="Inverter X / Y" style={{ cursor: "pointer", border: "none", background: "transparent", fontSize: "16px", padding: "0 5px", }}>🔄</button>
        </div>
        {strategy === "true-shape" && (
          <div style={{ display: "flex", gap: "10px", borderLeft: "1px solid #555", paddingLeft: "15px", animation: "fadeIn 0.3s", }}>
            <div style={{ display: "flex", alignItems: "center" }} title="Precisão de rotação manual">
              <label style={{ marginRight: 5, fontSize: 12, color: "inherit" }}>Giro:</label>
              <select value={rotationStep} onChange={(e) => setRotationStep(Number(e.target.value))} style={{ padding: 5, border: "1px solid #555", background: "rgba(0,0,0,0.1)", color: "inherit", cursor: "pointer", }}>
                <option value="90">90°</option>
                <option value="45">45°</option>
                <option value="10">10°</option>
              </select>
            </div>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", borderLeft: "1px solid #555", paddingLeft: "15px", }}>
          <label style={{ marginRight: 5, fontSize: 13 }}>Gap:</label>
          <input type="number" value={gap} onChange={(e) => setGap(Number(e.target.value))} style={{ padding: 5, width: 40, border: "1px solid #555", background: "rgba(0,0,0,0.1)", color: "inherit", }} />
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <label style={{ marginRight: 5, fontSize: 13 }}>Margem:</label>
          <input type="number" value={margin} onChange={(e) => setMargin(Number(e.target.value))} style={{ padding: 5, width: 40, border: "1px solid #555", background: "rgba(0,0,0,0.1)", color: "inherit", }} />
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
          <button style={{ background: isComputing ? "#666" : "#28a745", color: "white", border: "none", padding: "8px 20px", cursor: isComputing ? "wait" : "pointer", borderRadius: "4px", fontWeight: "bold", transition: "0.3s", }} onClick={handleCalculate} disabled={isComputing}>{isComputing ? "⏳..." : "▶ Calcular"}</button>
          <button onClick={handleDownload} disabled={nestingResult.length === 0} style={{ background: "#007bff", color: "white", border: "none", padding: "8px 20px", cursor: nestingResult.length === 0 ? "not-allowed" : "pointer", borderRadius: "4px", opacity: nestingResult.length === 0 ? 0.5 : 1, }}>💾 DXF</button>
        </div>
        <label style={{ marginLeft: "10px", fontSize: "12px", display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none", }}>
          <input type="checkbox" checked={showDebug} onChange={(e) => setShowDebug(e.target.checked)} style={{ marginRight: "5px" }} />
          Ver Box
        </label>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div ref={svgContainerRef} style={{ flex: 2, position: "relative", background: "transparent", display: "flex", flexDirection: "column", cursor: dragMode === "part" ? "grabbing" : dragMode === "pan" ? "grabbing" : "grab", overflow: "hidden", }}
          onWheel={handleWheel} onMouseDown={handleMouseDownContainer} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave} onDoubleClick={handleDoubleClickContainer}
        >
          <div style={{ position: "absolute", right: 20, top: 20, display: "flex", flexDirection: "column", gap: "5px", zIndex: 10, }}>
            <button onClick={() => updateTransform({ ...transformRef.current, k: transformRef.current.k * 1.2, })} style={{ width: 30, height: 30, cursor: "pointer", background: "rgba(255,255,255,0.9)", border: "1px solid #777", color: "#000", borderRadius: "4px", fontWeight: "bold", }}>+</button>
            <button onClick={() => updateTransform({ ...transformRef.current, k: transformRef.current.k / 1.2, })} style={{ width: 30, height: 30, cursor: "pointer", background: "rgba(255,255,255,0.9)", border: "1px solid #777", color: "#000", borderRadius: "4px", fontWeight: "bold", }}>-</button>
            <button onClick={resetZoom} style={{ width: 30, height: 30, cursor: "pointer", background: "rgba(255,255,255,0.9)", border: "1px solid #777", color: "#000", borderRadius: "4px", fontSize: "12px", }}>Fit</button>
          </div>
          <div style={{ position: "absolute", left: 20, top: 20, display: "grid", gridTemplateColumns: "30px 30px 30px", gridTemplateRows: "30px 30px", gap: "2px", zIndex: 10, }}>
            <div />
            <button onMouseDown={() => startContinuousPan(0, -10)} onMouseUp={stopContinuousPan} onMouseLeave={stopContinuousPan} style={{ cursor: "pointer", background: "rgba(255,255,255,0.9)", border: "1px solid #777", borderRadius: "4px", }}>▲</button>
            <div />
            <button onMouseDown={() => startContinuousPan(-10, 0)} onMouseUp={stopContinuousPan} onMouseLeave={stopContinuousPan} style={{ cursor: "pointer", background: "rgba(255,255,255,0.9)", border: "1px solid #777", borderRadius: "4px", }}>◀</button>
            <button onMouseDown={() => startContinuousPan(0, 10)} onMouseUp={stopContinuousPan} onMouseLeave={stopContinuousPan} style={{ cursor: "pointer", background: "rgba(255,255,255,0.9)", border: "1px solid #777", borderRadius: "4px", }}>▼</button>
            <button onMouseDown={() => startContinuousPan(10, 0)} onMouseUp={stopContinuousPan} onMouseLeave={stopContinuousPan} style={{ cursor: "pointer", background: "rgba(255,255,255,0.9)", border: "1px solid #777", borderRadius: "4px", }}>▶</button>
          </div>
          {totalBins > 1 && (
            <div style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 10, display: "flex", alignItems: "center", gap: "10px", background: "rgba(255,255,255,0.9)", padding: "5px 15px", borderRadius: "20px", boxShadow: "0 2px 5px rgba(0,0,0,0.2)", }}>
              <button onClick={() => setCurrentBinIndex(Math.max(0, currentBinIndex - 1))} disabled={currentBinIndex === 0} style={{ cursor: "pointer", border: "1px solid #777", background: "transparent", borderRadius: "4px", padding: "2px 8px", opacity: currentBinIndex === 0 ? 0.3 : 1, }}>◀</button>
              <span style={{ fontWeight: "bold", fontSize: "13px", color: "#333" }}>Chapa {currentBinIndex + 1} de {totalBins}</span>
              <button onClick={() => setCurrentBinIndex(Math.min(totalBins - 1, currentBinIndex + 1))} disabled={currentBinIndex === totalBins - 1} style={{ cursor: "pointer", border: "1px solid #777", background: "transparent", borderRadius: "4px", padding: "2px 8px", opacity: currentBinIndex === totalBins - 1 ? 0.3 : 1, }}>▶</button>
            </div>
          )}
          <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: "20px", overflow: "hidden", }}>
            <svg viewBox={binViewBox} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "100%", maxHeight: "100%", maxWidth: "100%", }}>
              <g ref={panGroupRef} transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
                <g transform={cncTransform}>
                  <rect x="0" y="0" width={binSize.width} height={binSize.height} fill={showDebug ? "rgba(255,152,0,0.05)" : "none"} stroke="#ff9800" strokeWidth="4" vectorEffect="non-scaling-stroke" />
                  {showDebug && (<rect x={margin} y={margin} width={binSize.width - margin * 2} height={binSize.height - margin * 2} fill="none" stroke="#999" strokeDasharray="5" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
                  {currentBinParts.map((placed) => {
                    const part = getPartById(placed.partId);
                    if (!part) return null;
                    return (
                      <PartElement
                        key={placed.partId}
                        placed={placed}
                        isSelected={placed.partId === selectedPartId}
                        onMouseDown={handleMouseDownPart}
                        onDoubleClick={handleDoubleClickPart}
                        onContextMenu={handlePartContextMenu} // CONECTADO
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
          <div style={{ padding: "10px 20px", display: "flex", gap: "20px", borderTop: "1px solid #555", background: "transparent", }}>
            <span style={{ opacity: 0.6, fontSize: "12px" }}>{nestingResult.length > 0 ? `Total: ${nestingResult.length} Peças` : `Área: ${binSize.width}x${binSize.height}mm`}</span>
            {failedCount > 0 && (<span style={{ color: "#dc3545", fontWeight: "bold", fontSize: "12px", background: "rgba(255,0,0,0.1)", padding: "2px 8px", borderRadius: "4px", }}>⚠️ {failedCount} NÃO COUBERAM</span>)}
          </div>
        </div>
        <div style={{ width: "450px", borderLeft: "1px solid #444", display: "flex", flexDirection: "column", backgroundColor: "inherit", }}>
          <div style={{ display: "flex", borderBottom: "1px solid #444", background: "rgba(0,0,0,0.05)", }}>
            <button style={tabStyle(activeTab === "grid")} onClick={() => setActiveTab("grid")}>🔳 Banco de Peças</button>
            <button style={tabStyle(activeTab === "list")} onClick={() => setActiveTab("list")}>📄 Lista Técnica</button>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: activeTab === "grid" ? "15px" : "0", }}>
            {activeTab === "grid" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "15px", alignContent: "start", }}>
                {parts.map((part) => (
                  <div key={part.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", }}>
                    <div style={{ width: "100%", aspectRatio: "1/1", background: "rgba(127,127,127,0.1)", borderRadius: "8px", marginBottom: "8px", padding: "10px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center", }}>
                      <svg viewBox={getThumbnailViewBox(part)} style={{ width: "100%", height: "100%", overflow: "visible", }} transform="scale(1, -1)" preserveAspectRatio="xMidYMid meet">
                        {part.entities.map((ent, i) => renderEntityFunction(ent, i, part.blocks))}
                      </svg>
                    </div>
                    <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", }}>
                      <span title={part.name} style={{ fontWeight: "bold", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70px", }}>{part.name}</span>
                      <div style={{ display: "flex", alignItems: "center", background: "rgba(0,0,0,0.1)", borderRadius: "4px", }}>
                        <span style={{ padding: "0 4px", fontSize: 10, opacity: 0.7, }}>Qtd:</span>
                        <input type="number" min="1" value={quantities[part.id] || 1} onChange={(e) => updateQty(part.id, Number(e.target.value))} style={{ width: 35, border: "none", background: "transparent", textAlign: "center", color: "inherit", fontWeight: "bold", padding: "4px 0", }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {activeTab === "list" && (
              <table style={{ width: "100%", borderCollapse: "collapse", borderSpacing: 0, }}>
                <thead style={{ position: "sticky", top: 0, background: "inherit", zIndex: 1, }}>
                  <tr>
                    <th style={{ padding: "10px", textAlign: "left", borderBottom: "1px solid #555", fontSize: "12px", opacity: 0.7, }}>#</th>
                    <th style={{ padding: "10px", textAlign: "left", borderBottom: "1px solid #555", fontSize: "12px", opacity: 0.7, }}>Peça</th>
                    <th style={{ padding: "10px", textAlign: "left", borderBottom: "1px solid #555", fontSize: "12px", opacity: 0.7, }}>Dimensões</th>
                    <th style={{ padding: "10px", textAlign: "left", borderBottom: "1px solid #555", fontSize: "12px", opacity: 0.7, }}>Área</th>
                    <th style={{ padding: "10px", textAlign: "left", borderBottom: "1px solid #555", fontSize: "12px", opacity: 0.7, }}>Qtd.</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part, index) => (
                    <tr key={part.id} style={{ borderBottom: "1px solid rgba(128,128,128,0.1)", }}>
                      <td style={{ padding: "8px 10px", fontSize: "13px" }}>{index + 1}</td>
                      <td style={{ padding: "8px 10px", fontSize: "13px", fontWeight: "bold", }} title={part.name}>{part.name.length > 10 ? part.name.substring(0, 10) + "..." : part.name}</td>
                      <td style={{ padding: "8px 10px", fontSize: "13px" }}>{part.width.toFixed(0)}x{part.height.toFixed(0)}</td>
                      <td style={{ padding: "8px 10px", fontSize: "13px" }}>
                        <div style={{ fontSize: 11, opacity: 0.8 }}>B: {formatArea(part.grossArea)}</div>
                      </td>
                      <td style={{ padding: "8px 10px", fontSize: "13px" }}>
                        <input type="number" min="1" value={quantities[part.id] || 1} onChange={(e) => updateQty(part.id, Number(e.target.value))} style={{ width: 40, padding: "5px", borderRadius: "4px", border: "1px solid #555", background: "rgba(0,0,0,0.2)", color: "inherit", textAlign: "center", }} />
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