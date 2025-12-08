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
import { InteractiveCanvas } from "./InteractiveCanvas"; // Importação do Canvas

import NestingWorker from "../workers/nesting.worker?worker";

interface Size {
  width: number;
  height: number;
}
interface NestingBoardProps {
  parts: ImportedPart[];
}

// --- FUNÇÕES DE RENDERIZAÇÃO DA BARRA LATERAL (THUMBNAILS) ---
// Mantemos esta cópia aqui para renderizar a lista lateral sem depender do Canvas
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
        ent.vertices.forEach((v: any) => update(v.x + ox, v.y + oy));
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

// --- COMPONENTE PRINCIPAL ---
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

  // --- CONTROLE DE SELEÇÃO (Agora Array) ---
  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([]);

  // NOVO ESTADO: MENU DE CONTEXTO
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  } | null>(null);

  // REFS
  const workerRef = useRef<Worker | null>(null);

  // --- FUNÇÕES DE CONTROLE DE PEÇAS ---

  // Rotação (Aplica a todas as selecionadas)
  const handleContextRotate = useCallback(
    (angle: number) => {
      if (selectedPartIds.length === 0) return;
      setNestingResult((prev) =>
        prev.map((p) => {
          if (selectedPartIds.includes(p.partId)) {
            let newRot = (p.rotation + angle) % 360;
            if (newRot < 0) newRot += 360;
            return { ...p, rotation: newRot };
          }
          return p;
        })
      );
    },
    [selectedPartIds]
  );

  // Movimento via Contexto ou Teclado (Aplica a todas)
  const handleContextMove = useCallback(
    (dx: number, dy: number) => {
      if (selectedPartIds.length === 0) return;
      const realDy = -dy; // Inverte Y para sistema CNC
      setNestingResult((prev) =>
        prev.map((p) => {
          if (selectedPartIds.includes(p.partId)) {
            return { ...p, x: p.x + dx, y: p.y + realDy };
          }
          return p;
        })
      );
    },
    [selectedPartIds]
  );

  // MOVIMENTO VIA MOUSE (VINDO DO CANVAS)
  // Recebe um array de movimentos para performance O(N)
  const handlePartsMove = useCallback(
    (moves: { partId: string; dx: number; dy: number }[]) => {
      if (moves.length === 0) return;

      setNestingResult((prev) => {
        // Mapa para lookup rápido
        const moveMap = new Map(moves.map((m) => [m.partId, m]));

        return prev.map((p) => {
          const move = moveMap.get(p.partId);
          if (move) {
            return {
              ...p,
              x: p.x + move.dx,
              y: p.y + move.dy,
            };
          }
          return p;
        });
      });
    },
    []
  );

  // SELEÇÃO
  const handlePartSelect = useCallback((ids: string[], append: boolean) => {
    if (append) {
      setSelectedPartIds((prev) => [...new Set([...prev, ...ids])]);
    } else {
      setSelectedPartIds(ids);
    }
  }, []);

  // MENU DE CONTEXTO
  const handlePartContextMenu = useCallback(
    (e: React.MouseEvent, partId: string) => {
      e.preventDefault();
      e.stopPropagation();

      // Se clicar com botão direito numa peça que NÃO está selecionada,
      // seleciona apenas ela (comportamento padrão de SO)
      if (!selectedPartIds.includes(partId)) {
        setSelectedPartIds([partId]);
      }
      setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
    },
    [selectedPartIds]
  );

  // --- EFFECTS ---
  useEffect(() => {
    // 1. Identifica quais peças já temos no estado
    const currentIds = new Set(Object.keys(quantities));

    // 2. Filtra apenas as peças novas que ainda não têm quantidade definida
    const missingParts = parts.filter((p) => !currentIds.has(p.id));

    // 3. Só chama o setState se realmente houver novidade (Evita o erro do ESLint)
    if (missingParts.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuantities((prev) => {
        const newQ = { ...prev };
        missingParts.forEach((p) => {
          newQ[p.id] = 1;
        });
        return newQ;
      });
    }
  }, [parts, quantities]); // Adicionei 'quantities' nas dependências para a verificação funcionar

  // --- HANDLERS DA BARRA DE TOPO ---
  const handleWidthChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setBinSize((prev) => ({ ...prev, width: Number(e.target.value) }));
    },
    []
  );
  const handleHeightChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setBinSize((prev) => ({ ...prev, height: Number(e.target.value) }));
    },
    []
  );
  const swapDimensions = useCallback(() => {
    setBinSize((prev) => ({ width: prev.height, height: prev.width }));
  }, []);

  const handleCalculate = useCallback(() => {
    if (parts.length === 0) return;
    setIsComputing(true);
    setNestingResult([]);
    setCurrentBinIndex(0);
    setTotalBins(1);
    setSelectedPartIds([]); // Limpa seleção

    if (workerRef.current) workerRef.current.terminate();

    workerRef.current = new NestingWorker();
    workerRef.current.onmessage = (e) => {
      const result = e.data;
      setNestingResult(result.placed);
      setFailedCount(result.failed.length);
      setTotalBins(result.totalBins || 1);
      setIsComputing(false);
      if (result.placed.length === 0) alert("Nenhuma peça coube!");
      else if (result.failed.length > 0)
        console.warn("Algumas peças não couberam.");
    };

    workerRef.current.postMessage({
      parts: JSON.parse(JSON.stringify(parts)),
      quantities,
      gap,
      margin,
      binWidth: binSize.width,
      binHeight: binSize.height,
      strategy,
      iterations,
      rotationStep,
      direction,
    });
  }, [
    parts,
    quantities,
    gap,
    margin,
    binSize,
    strategy,
    iterations,
    rotationStep,
    direction,
  ]);

  const handleDownload = useCallback(() => {
    if (nestingResult.length === 0) return;
    const currentBinParts = nestingResult.filter(
      (p) => p.binId === currentBinIndex
    );
    const dxfString = generateDxfContent(currentBinParts, parts);
    const blob = new Blob([dxfString], { type: "application/dxf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nesting_chapa_${currentBinIndex + 1}.dxf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [nestingResult, currentBinIndex, parts]);

  const updateQty = useCallback((id: string, val: number) => {
    setQuantities((prev) => ({ ...prev, [id]: val }));
  }, []);

  const formatArea = useCallback((mm2: number) => {
    return mm2 > 100000
      ? (mm2 / 1000000).toFixed(3) + " m²"
      : mm2.toFixed(0) + " mm²";
  }, []);

  // --- DADOS PARA O CANVAS ---
  const currentPlacedParts = useMemo(() => {
    return nestingResult.filter((p) => p.binId === currentBinIndex);
  }, [nestingResult, currentBinIndex]);

  // --- HELPERS BARRA LATERAL ---
  const getThumbnailViewBox = useCallback((part: ImportedPart) => {
    const box = calculateBoundingBox(part.entities, part.blocks);
    const p = Math.max(box.width, box.height) * 0.1;
    return `${box.minX - p} ${box.minY - p} ${box.width + p * 2} ${
      box.height + p * 2
    }`;
  }, []);

  const tabStyle = useCallback(
    (isActive: boolean): React.CSSProperties => ({
      padding: "10px 15px",
      cursor: "pointer",
      background: "transparent",
      outline: "none",
      border: "none",
      borderBottom: isActive ? "2px solid #28a745" : "2px solid transparent",
      color: isActive ? "inherit" : "rgba(128,128,128,0.7)",
      fontWeight: isActive ? "bold" : "normal",
      fontSize: "13px",
    }),
    []
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
      }}
    >
      {/* MENU CONTEXTO */}
      {contextMenu && contextMenu.visible && selectedPartIds.length > 0 && (
        <ContextControl
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onMove={handleContextMove}
          onRotate={handleContextRotate}
        />
      )}

      {/* TOPO DE CONTROLES */}
      <div
        style={{
          padding: "10px 20px",
          borderBottom: "1px solid #444",
          display: "flex",
          gap: "20px",
          alignItems: "center",
          backgroundColor: "rgba(0,0,0,0.03)",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderRight: "1px solid #555",
            paddingRight: "15px",
          }}
        >
          <span
            style={{ fontSize: "12px", marginRight: "5px", fontWeight: "bold" }}
          >
            Motor:
          </span>
          <select
            value={strategy}
            onChange={(e) =>
              setStrategy(e.target.value as "rect" | "true-shape")
            }
            style={{
              padding: "5px",
              borderRadius: "4px",
              border: "1px solid #555",
              background: "rgba(0,0,0,0.1)",
              color: "inherit",
              fontWeight: "bold",
            }}
          >
            <option value="rect">🔳 Retangular (Fixo)</option>
            <option value="true-shape">🧩 True Shape (Manual)</option>
          </select>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderRight: "1px solid #555",
            paddingRight: "15px",
          }}
        >
          <span
            style={{ fontSize: "12px", marginRight: "5px", fontWeight: "bold" }}
          >
            Preencher:
          </span>
          <div
            style={{
              display: "flex",
              gap: "2px",
              background: "rgba(0,0,0,0.1)",
              borderRadius: "4px",
              padding: "2px",
            }}
          >
            <button
              title="Automático"
              onClick={() => setDirection("auto")}
              style={{
                padding: "4px 8px",
                border: "none",
                borderRadius: "3px",
                cursor: "pointer",
                background: direction === "auto" ? "#007bff" : "transparent",
                color: direction === "auto" ? "#fff" : "inherit",
                fontSize: "12px",
              }}
            >
              Auto
            </button>
            <button
              title="Vertical"
              onClick={() => setDirection("vertical")}
              style={{
                padding: "4px 8px",
                border: "none",
                borderRadius: "3px",
                cursor: "pointer",
                background:
                  direction === "vertical" ? "#007bff" : "transparent",
                color: direction === "vertical" ? "#fff" : "inherit",
                fontSize: "16px",
              }}
            >
              ⬇️
            </button>
            <button
              title="Horizontal"
              onClick={() => setDirection("horizontal")}
              style={{
                padding: "4px 8px",
                border: "none",
                borderRadius: "3px",
                cursor: "pointer",
                background:
                  direction === "horizontal" ? "#007bff" : "transparent",
                color: direction === "horizontal" ? "#fff" : "inherit",
                fontSize: "16px",
              }}
            >
              ➡️
            </button>
          </div>
        </div>
        <div style={{ fontWeight: "bold", fontSize: "14px" }}>📐</div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "rgba(0,0,0,0.05)",
            padding: "5px",
            borderRadius: "4px",
            gap: "10px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <label style={{ marginRight: 5, fontSize: 13 }}>L:</label>
            <input
              type="number"
              value={binSize.width}
              onChange={handleWidthChange}
              style={{
                padding: 5,
                width: 60,
                border: "1px solid #555",
                background: "rgba(0,0,0,0.1)",
                color: "inherit",
              }}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <label style={{ marginRight: 5, fontSize: 13 }}>A:</label>
            <input
              type="number"
              value={binSize.height}
              onChange={handleHeightChange}
              style={{
                padding: 5,
                width: 60,
                border: "1px solid #555",
                background: "rgba(0,0,0,0.1)",
                color: "inherit",
              }}
            />
          </div>
          <button
            onClick={swapDimensions}
            title="Inverter X / Y"
            style={{
              cursor: "pointer",
              border: "none",
              background: "transparent",
              fontSize: "16px",
              padding: "0 5px",
            }}
          >
            🔄
          </button>
        </div>

        {strategy === "true-shape" && (
          <div
            style={{
              display: "flex",
              gap: "10px",
              borderLeft: "1px solid #555",
              paddingLeft: "15px",
              animation: "fadeIn 0.3s",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center" }}
              title="Precisão de rotação manual"
            >
              <label style={{ marginRight: 5, fontSize: 12, color: "inherit" }}>
                Giro:
              </label>
              <select
                value={rotationStep}
                onChange={(e) => setRotationStep(Number(e.target.value))}
                style={{
                  padding: 5,
                  border: "1px solid #555",
                  background: "rgba(0,0,0,0.1)",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                <option value="90">90°</option>
                <option value="45">45°</option>
                <option value="10">10°</option>
              </select>
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderLeft: "1px solid #555",
            paddingLeft: "15px",
          }}
        >
          <label style={{ marginRight: 5, fontSize: 13 }}>Gap:</label>
          <input
            type="number"
            value={gap}
            onChange={(e) => setGap(Number(e.target.value))}
            style={{
              padding: 5,
              width: 40,
              border: "1px solid #555",
              background: "rgba(0,0,0,0.1)",
              color: "inherit",
            }}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <label style={{ marginRight: 5, fontSize: 13 }}>Margem:</label>
          <input
            type="number"
            value={margin}
            onChange={(e) => setMargin(Number(e.target.value))}
            style={{
              padding: 5,
              width: 40,
              border: "1px solid #555",
              background: "rgba(0,0,0,0.1)",
              color: "inherit",
            }}
          />
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "10px" }}>
          <button
            style={{
              background: isComputing ? "#666" : "#28a745",
              color: "white",
              border: "none",
              padding: "8px 20px",
              cursor: isComputing ? "wait" : "pointer",
              borderRadius: "4px",
              fontWeight: "bold",
              transition: "0.3s",
            }}
            onClick={handleCalculate}
            disabled={isComputing}
          >
            {isComputing ? "⏳..." : "▶ Calcular"}
          </button>
          <button
            onClick={handleDownload}
            disabled={nestingResult.length === 0}
            style={{
              background: "#007bff",
              color: "white",
              border: "none",
              padding: "8px 20px",
              cursor: nestingResult.length === 0 ? "not-allowed" : "pointer",
              borderRadius: "4px",
              opacity: nestingResult.length === 0 ? 0.5 : 1,
            }}
          >
            💾 DXF
          </button>
        </div>
        <label
          style={{
            marginLeft: "10px",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            userSelect: "none",
          }}
        >
          <input
            type="checkbox"
            checked={showDebug}
            onChange={(e) => setShowDebug(e.target.checked)}
            style={{ marginRight: "5px" }}
          />
          Ver Box
        </label>
      </div>

      {/* ÁREA PRINCIPAL + SIDEBAR */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* CONTAINER DO CANVAS INTERATIVO */}
        <div
          style={{
            flex: 2,
            position: "relative",
            background: "transparent",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
          onMouseDown={() => setContextMenu(null)}
        >
          {totalBins > 1 && (
            <div
              style={{
                position: "absolute",
                top: 10,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 10,
                display: "flex",
                alignItems: "center",
                gap: "10px",
                background: "rgba(255,255,255,0.9)",
                padding: "5px 15px",
                borderRadius: "20px",
                boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
              }}
            >
              <button
                onClick={() =>
                  setCurrentBinIndex(Math.max(0, currentBinIndex - 1))
                }
                disabled={currentBinIndex === 0}
                style={{
                  cursor: "pointer",
                  border: "1px solid #777",
                  background: "transparent",
                  borderRadius: "4px",
                  padding: "2px 8px",
                  opacity: currentBinIndex === 0 ? 0.3 : 1,
                }}
              >
                ◀
              </button>
              <span
                style={{ fontWeight: "bold", fontSize: "13px", color: "#333" }}
              >
                Chapa {currentBinIndex + 1} de {totalBins}
              </span>
              <button
                onClick={() =>
                  setCurrentBinIndex(
                    Math.min(totalBins - 1, currentBinIndex + 1)
                  )
                }
                disabled={currentBinIndex === totalBins - 1}
                style={{
                  cursor: "pointer",
                  border: "1px solid #777",
                  background: "transparent",
                  borderRadius: "4px",
                  padding: "2px 8px",
                  opacity: currentBinIndex === totalBins - 1 ? 0.3 : 1,
                }}
              >
                ▶
              </button>
            </div>
          )}

          {/* O COMPONENTE INTERATIVO FICA AQUI */}
          <InteractiveCanvas
            parts={parts}
            placedParts={currentPlacedParts}
            binWidth={binSize.width}
            binHeight={binSize.height}
            margin={margin}
            showDebug={showDebug}
            strategy={strategy}
            // Props atualizadas para multi-seleção
            selectedPartIds={selectedPartIds}
            onPartsMove={handlePartsMove}
            onPartSelect={handlePartSelect}
            onContextMenu={handlePartContextMenu}
          />

          <div
            style={{
              padding: "10px 20px",
              display: "flex",
              gap: "20px",
              borderTop: "1px solid #555",
              background: "transparent",
              zIndex: 5,
            }}
          >
            <span style={{ opacity: 0.6, fontSize: "12px" }}>
              {nestingResult.length > 0
                ? `Total: ${nestingResult.length} Peças`
                : `Área: ${binSize.width}x${binSize.height}mm`}
            </span>
            {failedCount > 0 && (
              <span
                style={{
                  color: "#dc3545",
                  fontWeight: "bold",
                  fontSize: "12px",
                  background: "rgba(255,0,0,0.1)",
                  padding: "2px 8px",
                  borderRadius: "4px",
                }}
              >
                ⚠️ {failedCount} NÃO COUBERAM
              </span>
            )}
          </div>
        </div>

        {/* SIDEBAR (LISTA TÉCNICA E BANCO DE PEÇAS) */}
        <div
          style={{
            width: "450px",
            borderLeft: "1px solid #444",
            display: "flex",
            flexDirection: "column",
            backgroundColor: "inherit",
            zIndex: 5,
          }}
        >
          <div
            style={{
              display: "flex",
              borderBottom: "1px solid #444",
              background: "rgba(0,0,0,0.05)",
            }}
          >
            <button
              style={tabStyle(activeTab === "grid")}
              onClick={() => setActiveTab("grid")}
            >
              🔳 Banco de Peças
            </button>
            <button
              style={tabStyle(activeTab === "list")}
              onClick={() => setActiveTab("list")}
            >
              📄 Lista Técnica
            </button>
          </div>
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: activeTab === "grid" ? "15px" : "0",
            }}
          >
            {activeTab === "grid" && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                  gap: "15px",
                  alignContent: "start",
                }}
              >
                {parts.map((part) => (
                  <div
                    key={part.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "1/1",
                        background: "rgba(127,127,127,0.1)",
                        borderRadius: "8px",
                        marginBottom: "8px",
                        padding: "10px",
                        boxSizing: "border-box",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <svg
                        viewBox={getThumbnailViewBox(part)}
                        style={{
                          width: "100%",
                          height: "100%",
                          overflow: "visible",
                        }}
                        transform="scale(1, -1)"
                        preserveAspectRatio="xMidYMid meet"
                      >
                        {part.entities.map((ent, i) =>
                          renderEntityFunction(ent, i, part.blocks)
                        )}
                      </svg>
                    </div>
                    <div
                      style={{
                        width: "100%",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "12px",
                      }}
                    >
                      <span
                        title={part.name}
                        style={{
                          fontWeight: "bold",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          maxWidth: "70px",
                        }}
                      >
                        {part.name}
                      </span>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          background: "rgba(0,0,0,0.1)",
                          borderRadius: "4px",
                        }}
                      >
                        <span
                          style={{
                            padding: "0 4px",
                            fontSize: 10,
                            opacity: 0.7,
                          }}
                        >
                          Qtd:
                        </span>
                        <input
                          type="number"
                          min="1"
                          value={quantities[part.id] || 1}
                          onChange={(e) =>
                            updateQty(part.id, Number(e.target.value))
                          }
                          style={{
                            width: 35,
                            border: "none",
                            background: "transparent",
                            textAlign: "center",
                            color: "inherit",
                            fontWeight: "bold",
                            padding: "4px 0",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {activeTab === "list" && (
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  borderSpacing: 0,
                }}
              >
                <thead
                  style={{
                    position: "sticky",
                    top: 0,
                    background: "inherit",
                    zIndex: 1,
                  }}
                >
                  <tr>
                    <th
                      style={{
                        padding: "10px",
                        textAlign: "left",
                        borderBottom: "1px solid #555",
                        fontSize: "12px",
                        opacity: 0.7,
                      }}
                    >
                      #
                    </th>
                    <th
                      style={{
                        padding: "10px",
                        textAlign: "left",
                        borderBottom: "1px solid #555",
                        fontSize: "12px",
                        opacity: 0.7,
                      }}
                    >
                      Peça
                    </th>
                    <th
                      style={{
                        padding: "10px",
                        textAlign: "left",
                        borderBottom: "1px solid #555",
                        fontSize: "12px",
                        opacity: 0.7,
                      }}
                    >
                      Dimensões
                    </th>
                    <th
                      style={{
                        padding: "10px",
                        textAlign: "left",
                        borderBottom: "1px solid #555",
                        fontSize: "12px",
                        opacity: 0.7,
                      }}
                    >
                      Área
                    </th>
                    <th
                      style={{
                        padding: "10px",
                        textAlign: "left",
                        borderBottom: "1px solid #555",
                        fontSize: "12px",
                        opacity: 0.7,
                      }}
                    >
                      Qtd.
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((part, index) => (
                    <tr
                      key={part.id}
                      style={{
                        borderBottom: "1px solid rgba(128,128,128,0.1)",
                      }}
                    >
                      <td style={{ padding: "8px 10px", fontSize: "13px" }}>
                        {index + 1}
                      </td>
                      <td
                        style={{
                          padding: "8px 10px",
                          fontSize: "13px",
                          fontWeight: "bold",
                        }}
                        title={part.name}
                      >
                        {part.name.length > 10
                          ? part.name.substring(0, 10) + "..."
                          : part.name}
                      </td>
                      <td style={{ padding: "8px 10px", fontSize: "13px" }}>
                        {part.width.toFixed(0)}x{part.height.toFixed(0)}
                      </td>
                      <td style={{ padding: "8px 10px", fontSize: "13px" }}>
                        <div style={{ fontSize: 11, opacity: 0.8 }}>
                          B: {formatArea(part.grossArea)}
                        </div>
                      </td>
                      <td style={{ padding: "8px 10px", fontSize: "13px" }}>
                        <input
                          type="number"
                          min="1"
                          value={quantities[part.id] || 1}
                          onChange={(e) =>
                            updateQty(part.id, Number(e.target.value))
                          }
                          style={{
                            width: 40,
                            padding: "5px",
                            borderRadius: "4px",
                            border: "1px solid #555",
                            background: "rgba(0,0,0,0.2)",
                            color: "inherit",
                            textAlign: "center",
                          }}
                        />
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
