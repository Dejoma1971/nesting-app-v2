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
import { ContextControl } from "./ContextControl";
import { InteractiveCanvas } from "./InteractiveCanvas";
import { useUndoRedo } from "../hooks/useUndoRedo";
import { getTheme } from "../styles/theme";
import { PartFilter, type FilterState } from "./PartFilter";
import NestingWorker from "../workers/nesting.worker?worker";

import { useLabelManager } from "../hooks/useLabelManager";
import { GlobalLabelPanel, ThumbnailFlags } from "./labels/LabelControls";
import { LabelEditorModal } from "./labels/LabelEditorModal";
import type { LabelConfig } from "./labels/LabelTypes";
import { textToVectorLines } from "../utils/vectorFont";
import { useProductionManager } from "../hooks/useProductionManager";
import { useNestingSaveStatus } from "../hooks/useNestingSaveStatus";

interface Size {
  width: number;
  height: number;
}

interface NestingBoardProps {
  initialParts: ImportedPart[];
  initialSearchQuery?: string;
  onBack?: () => void;
}

const cleanTextContent = (text: string): string => {
  if (!text) return "";
  return text.replace(/[^a-zA-Z0-9-]/g, "");
};

// --- FUNÇÃO AUXILIAR: GERAR COR BASEADA NO TEXTO (PEDIDO) ---
const stringToColor = (str: string) => {
  if (!str) return "#999999";
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const c = (hash & 0x00ffffff).toString(16).toUpperCase();
  return "#" + "00000".substring(0, 6 - c.length) + c;
};

// --- MATEMÁTICA DE ARCOS E BOUNDING BOX ---
const bulgeToArc = (p1: any, p2: any, bulge: number) => {
  const chordDx = p2.x - p1.x;
  const chordDy = p2.y - p1.y;
  const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy);
  const radius = (chordLen * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  const cx = (p1.x + p2.x) / 2 - (chordDy * (1 - bulge * bulge)) / (4 * bulge);
  const cy = (p1.y + p2.y) / 2 + (chordDx * (1 - bulge * bulge)) / (4 * bulge);
  return { radius, cx, cy };
};

const calculateBoundingBox = (
  entities: any[],
  blocks: any = {}
): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
} => {
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
        const block = blocks[ent.name];
        if (block && block.entities)
          traverse(
            block.entities,
            ox + (ent.position?.x || 0),
            oy + (ent.position?.y || 0)
          );
        else if (ent.position) update(ox + ent.position.x, oy + ent.position.y);
      } else if (ent.vertices) {
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
            if (v1.bulge < 0)
              checkArcBounds(ox + cx, oy + cy, radius, endAngle, startAngle);
            else checkArcBounds(ox + cx, oy + cy, radius, startAngle, endAngle);
          }
        }
      } else if (ent.center && ent.radius) {
        if (ent.type === "ARC")
          checkArcBounds(
            ox + ent.center.x,
            oy + ent.center.y,
            ent.radius,
            ent.startAngle,
            ent.endAngle
          );
        else {
          update(
            ox + ent.center.x - ent.radius,
            oy + ent.center.y - ent.radius
          );
          update(
            ox + ent.center.x + ent.radius,
            oy + ent.center.y + ent.radius
          );
        }
      }
    });
  };
  traverse(entities);
  if (minX === Infinity)
    return {
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 100,
      width: 100,
      height: 100,
      cx: 50,
      cy: 50,
    };
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
};

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
    case "LINE": {
      const lineColor = entity.isLabel ? entity.color || color : color;
      return (
        <line
          key={index}
          x1={entity.vertices[0].x * scale}
          y1={entity.vertices[0].y * scale}
          x2={entity.vertices[1].x * scale}
          y2={entity.vertices[1].y * scale}
          stroke={lineColor}
          strokeWidth={2 * scale}
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    case "LWPOLYLINE":
    case "POLYLINE": {
      if (!entity.vertices) return null;
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

export const NestingBoard: React.FC<NestingBoardProps> = ({
  initialParts,
  initialSearchQuery,
  onBack,
}) => {
  // --- 1. DEFINIÇÃO DE ESTADOS ---
  const [parts, setParts] = useState<ImportedPart[]>(initialParts);
  const [binSize, setBinSize] = useState<Size>({ width: 1200, height: 3000 });
  const [currentBinIndex, setCurrentBinIndex] = useState(0);
  const [totalBins, setTotalBins] = useState(1);

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || "");
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<"replace" | "append">("append");
  const [filters, setFilters] = useState<FilterState>({
    pedido: [],
    op: [],
    material: "",
    espessura: "",
  });

  const [isDarkMode, setIsDarkMode] = useState(true);
  const theme = getTheme(isDarkMode);
  const [activeTab, setActiveTab] = useState<"grid" | "list">("grid");
  const [showDebug, setShowDebug] = useState(true);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
  } | null>(null);
  const [editingPartId, setEditingPartId] = useState<string | null>(null);

  const [gap, setGap] = useState(5);
  const [margin, setMargin] = useState(5);
  const [strategy, setStrategy] = useState<"rect" | "true-shape">("true-shape");
  const [direction, setDirection] = useState<
    "auto" | "vertical" | "horizontal"
  >("horizontal");
  const [iterations] = useState(50);
  const [rotationStep, setRotationStep] = useState(90);
  const [isComputing, setIsComputing] = useState(false);
  const [failedCount, setFailedCount] = useState(0);

  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<{ [key: string]: number }>(
    () => {
      const initialQ: { [key: string]: number } = {};
      initialParts.forEach((p) => {
        initialQ[p.id] = p.quantity || 1;
      });
      return initialQ;
    }
  );

  // Estado para controlar quais peças serão ignoradas no cálculo (Checkbox)
  const [disabledNestingIds, setDisabledNestingIds] = useState<Set<string>>(
    new Set()
  );

  // Dentro do componente NestingBoard
  const [collidingPartIds, setCollidingPartIds] = useState<string[]>([]);

  // Dentro do componente NestingBoard
  const collisionWorkerRef = useRef<Worker | null>(null);

  const nestingWorkerRef = useRef<Worker | null>(null);

  // Inicializa o Worker uma vez ao montar o componente
  // Inicializa o Worker de Colisão
  useEffect(() => {
    // Cria o worker
    collisionWorkerRef.current = new Worker(
      new URL("../workers/collision.worker.ts", import.meta.url)
    );

    // Configura o ouvinte de mensagens
    // Adicionamos ': MessageEvent' para corrigir o erro de 'implicitly any'
    collisionWorkerRef.current.onmessage = (e: MessageEvent) => {
      const collisions = e.data as string[];
      setCollidingPartIds(collisions);

      if (collisions.length > 0) {
        alert(
          `⚠️ ALERTA DE COLISÃO!\n\n${collisions.length} peças com problemas marcadas em VERMELHO.`
        );
      } else {
        alert("✅ Verificação Completa! Nenhuma colisão.");
      }
    };

    // Limpeza ao desmontar
    return () => {
      collisionWorkerRef.current?.terminate();
    };
  }, []);

  const thumbnailRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  // --- 2. HOOKS ---
  const [
    nestingResult,
    setNestingResult,
    undo,
    redo,
    resetNestingResult,
    canUndo,
    canRedo,
  ] = useUndoRedo<PlacedPart[]>([]);

  const {
    isSaving,
    lockedBins,
    handleProductionDownload,
    getPartStatus,
    resetProduction,
  } = useProductionManager(binSize);

  const {
    labelStates,
    globalWhiteEnabled,
    globalPinkEnabled,
    toggleGlobal,
    togglePartFlag,
    updateLabelConfig,
  } = useLabelManager(parts);

  const { isBinSaved, markBinAsSaved, resetAllSaveStatus } =
    useNestingSaveStatus(nestingResult);

  // --- 3. VARIÁVEIS DERIVADAS ---
  const isCurrentSheetSaved = isBinSaved(currentBinIndex);

  const displayedParts = useMemo(() => {
    const filtered = parts.filter((p) => {
      const matchPedido =
        filters.pedido.length === 0 || filters.pedido.includes(p.pedido);
      const matchOp = filters.op.length === 0 || filters.op.includes(p.op);
      const matchMaterial =
        !filters.material || p.material === filters.material;
      const matchEspessura =
        !filters.espessura || p.espessura === filters.espessura;
      return matchPedido && matchOp && matchMaterial && matchEspessura;
    });

    return filtered.map((part) => {
      const state = labelStates[part.id];
      if (!state) return part;
      const bounds = calculateBoundingBox(part.entities, part.blocks);
      const newEntities = [...part.entities];
      const rawText = part.pedido || part.op || part.name;
      const finalText =
        typeof cleanTextContent === "function"
          ? cleanTextContent(rawText)
          : rawText;
      const addLabelVector = (
        config: LabelConfig,
        color: string,
        type: "white" | "pink"
      ) => {
        if (config.active && finalText) {
          const posX = bounds.cx + config.offsetX;
          const posY = bounds.cy + config.offsetY;
          const vectorLines = textToVectorLines(
            finalText,
            posX,
            posY,
            config.fontSize,
            color
          );
          const rotatedLines = vectorLines.map((line: any) => {
            if (config.rotation === 0) return line;
            const rotatePoint = (x: number, y: number) => {
              const rad = (config.rotation * Math.PI) / 180;
              const dx = x - posX;
              const dy = y - posY;
              return {
                x: posX + dx * Math.cos(rad) - dy * Math.sin(rad),
                y: posY + dx * Math.sin(rad) + dy * Math.cos(rad),
              };
            };
            return {
              ...line,
              vertices: [
                rotatePoint(line.vertices[0].x, line.vertices[0].y),
                rotatePoint(line.vertices[1].x, line.vertices[1].y),
              ],
            };
          });
          const taggedLines = rotatedLines.map((line: any) => ({
            ...line,
            isLabel: true,
            labelType: type,
            partId: part.id,
            color: color,
          }));
          newEntities.push(...taggedLines);
        }
      };
      addLabelVector(state.white, "#FFFFFF", "white");
      addLabelVector(state.pink, "#FF00FF", "pink");
      return { ...part, entities: newEntities };
    });
  }, [parts, filters, labelStates]);

  const currentPlacedParts = useMemo(
    () => nestingResult.filter((p) => p.binId === currentBinIndex),
    [nestingResult, currentBinIndex]
  );

  // --- CÁLCULO DE APROVEITAMENTO DUPLO (REAL vs EFETIVO) ---
  const currentEfficiencies = useMemo(() => {
    // 1. Pega peças da chapa atual
    const partsInSheet = nestingResult.filter(
      (p) => p.binId === currentBinIndex
    );
    if (partsInSheet.length === 0) return { real: "0,0", effective: "0,0" };

    // 2. FILTRO DE VALIDADE (Sem colisão e dentro da chapa)
    const validParts = partsInSheet.filter((placed) => {
      if (collidingPartIds.includes(placed.uuid)) return false;

      const original = displayedParts.find((dp) => dp.id === placed.partId);
      if (!original) return false;

      const isRotated = Math.abs(placed.rotation) % 180 !== 0;
      const currentW = isRotated ? original.height : original.width;
      const currentH = isRotated ? original.width : original.height;

      return (
        placed.x >= 0 &&
        placed.y >= 0 &&
        placed.x + currentW <= binSize.width + 0.1 &&
        placed.y + currentH <= binSize.height + 0.1
      );
    });

    if (validParts.length === 0) return { real: "0,0", effective: "0,0" };

    // 3. Soma das Áreas ÚTEIS
    const usedNetArea = validParts.reduce((acc, placed) => {
      const original = displayedParts.find((dp) => dp.id === placed.partId);
      return acc + (original ? original.netArea || original.grossArea : 0);
    }, 0);

    // 4. Denominador 1: CUSTO (Área Total da Chapa)
    const totalBinArea = binSize.width * binSize.height;

    // 5. Denominador 2: DENSIDADE (Altura Máxima Usada)
    let maxUsedY = 0;
    validParts.forEach((placed) => {
      const original = displayedParts.find((dp) => dp.id === placed.partId);
      if (original) {
        const isRotated = Math.abs(placed.rotation) % 180 !== 0;
        const visualHeight = isRotated ? original.width : original.height;
        const topY = placed.y + visualHeight;
        if (topY > maxUsedY) maxUsedY = topY;
      }
    });
    const effectiveBinArea = binSize.width * Math.max(maxUsedY, 1);

    return {
      real: ((usedNetArea / totalBinArea) * 100).toFixed(1).replace(".", ","),
      effective: ((usedNetArea / effectiveBinArea) * 100)
        .toFixed(1)
        .replace(".", ","),
    };
  }, [
    nestingResult,
    currentBinIndex,
    displayedParts,
    binSize,
    collidingPartIds,
  ]);

  const activeSelectedPartIds = useMemo(() => {
    const ids = new Set<string>();
    selectedPartIds.forEach((id) => ids.add(id));
    nestingResult.forEach((placed) => {
      if (selectedPartIds.includes(placed.uuid)) ids.add(placed.partId);
    });
    return ids;
  }, [selectedPartIds, nestingResult]);

  // --- 4. EFEITOS ---
  useEffect(() => {
    if (initialSearchQuery && parts.length === 0) {
      const timer = setTimeout(() => {
        const doAutoSearch = async () => {
          if (!initialSearchQuery) return;
          setIsSearching(true);
          try {
            const params = new URLSearchParams();
            params.append("pedido", initialSearchQuery);
            const response = await fetch(
              `http://localhost:3001/api/pecas/buscar?${params.toString()}`
            );
            if (response.status === 404) {
              alert(
                `Nenhuma peça encontrada para o pedido: ${initialSearchQuery}`
              );
              setIsSearching(false);
              return;
            }
            if (!response.ok) throw new Error("Erro ao buscar.");
            const data = await response.json();
            if (Array.isArray(data) && data.length > 0) {
              const dbParts: ImportedPart[] = data.map((item: any) => ({
                id: item.id,
                name: item.name,
                entities: item.entities,
                blocks: item.blocks || {},
                width: Number(item.width),
                height: Number(item.height),
                grossArea: Number(item.grossArea),
                netArea: Number(item.grossArea),
                quantity: Number(item.quantity) || 1,
                pedido: item.pedido,
                op: item.op,
                material: item.material,
                espessura: item.espessura,
                autor: item.autor,
                dataCadastro: item.dataCadastro,
              }));
              setParts(dbParts);
            }
          } catch (e) {
            console.error(e);
            alert("Erro ao buscar dados iniciais.");
          } finally {
            setIsSearching(false);
          }
        };
        doAutoSearch();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    setQuantities((prev) => {
      const currentIds = new Set(Object.keys(prev));
      const missingParts = parts.filter((p) => !currentIds.has(p.id));
      if (missingParts.length > 0) {
        const newQ = { ...prev };
        missingParts.forEach((p) => {
          newQ[p.id] = p.quantity || 1;
        });
        return newQ;
      }
      return prev;
    });
  }, [parts]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    if (selectedPartIds.length > 0) {
      const lastUUID = selectedPartIds[selectedPartIds.length - 1];
      const placed = nestingResult.find((p) => p.uuid === lastUUID);
      if (placed) {
        const el = thumbnailRefs.current[placed.partId];
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [selectedPartIds, nestingResult]);

  // --- 5. HANDLERS ---
  const handleReturnToBank = useCallback(
    (uuidsToRemove: string[]) => {
      const targetPlaced = nestingResult.find((p) =>
        uuidsToRemove.includes(p.uuid)
      );
      const partIdToScroll = targetPlaced?.partId;
      setNestingResult((prev) =>
        prev.filter((p) => !uuidsToRemove.includes(p.uuid))
      );
      setSelectedPartIds([]);
      if (partIdToScroll) {
        setTimeout(() => {
          const element = thumbnailRefs.current[partIdToScroll];
          if (element)
            element.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }
    },
    [nestingResult, setNestingResult]
  );

  const handleSaveClick = async () => {
    const partsInBin = nestingResult.filter((p) => p.binId === currentBinIndex);
    if (partsInBin.length === 0) return;
    await handleProductionDownload(
      nestingResult,
      currentBinIndex,
      displayedParts
    );
    markBinAsSaved(currentBinIndex);
  };

  const handlePartRotate = useCallback(
    (uuid: string, newRotation: number) => {
      setNestingResult((prev) =>
        prev.map((p) => (p.uuid === uuid ? { ...p, rotation: newRotation } : p))
      );
    },
    [setNestingResult]
  );

  // --- NOVA FUNÇÃO: ADICIONAR CHAPA VAZIA ---
  const handleAddBin = useCallback(() => {
    setTotalBins((prev) => {
      const newTotal = prev + 1;
      // Move o visualizador para a nova chapa criada imediatamente
      setCurrentBinIndex(newTotal - 1);
      return newTotal;
    });
  }, []);

  const handleCalculate = useCallback(() => {
    // 1. Filtra apenas as peças que NÃO estão na lista de desabilitadas
    const partsToNest = displayedParts.filter(
      (p) => !disabledNestingIds.has(p.id)
    );

    if (partsToNest.length === 0) {
      alert(
        "Nenhuma peça selecionada para o cálculo! Marque pelo menos uma peça."
      );
      return;
    }

    if (nestingResult.length > 0) {
      if (
        !window.confirm(
          "O cálculo automático irá REORGANIZAR TODA A MESA... Deseja continuar?"
        )
      )
        return;
    }
    setIsComputing(true);
    resetNestingResult([]);
    setCurrentBinIndex(0);
    setTotalBins(1);
    setSelectedPartIds([]);
    resetAllSaveStatus();

    // CORREÇÃO AQUI: Usar nestingWorkerRef em vez de workerRef
    if (nestingWorkerRef.current) nestingWorkerRef.current.terminate();

    // Aqui assumo que NestingWorker é a classe importada do worker.
    // Se der erro no 'new NestingWorker()', use a sintaxe de URL como fizemos no outro:
    // nestingWorkerRef.current = new Worker(new URL('../workers/nesting.worker.ts', import.meta.url));
    nestingWorkerRef.current = new NestingWorker();

    nestingWorkerRef.current.onmessage = (e) => {
      const result = e.data;
      resetNestingResult(result.placed);
      setFailedCount(result.failed.length);
      setTotalBins(result.totalBins || 1);
      setIsComputing(false);
      if (result.placed.length === 0) alert("Nenhuma peça coube!");
    };

    nestingWorkerRef.current.postMessage({
      parts: JSON.parse(JSON.stringify(partsToNest)),
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
    displayedParts,
    quantities,
    gap,
    margin,
    binSize,
    strategy,
    iterations,
    rotationStep,
    direction,
    resetNestingResult,
    nestingResult.length,
    resetAllSaveStatus,
    disabledNestingIds, // <--- ADICIONE ESTA LINHA
  ]);

  const handleClearTable = useCallback(() => {
    if (
      window.confirm(
        "ATENÇÃO: Isso limpará a mesa de corte E O BANCO DE PEÇAS. Deseja reiniciar?"
      )
    ) {
      resetNestingResult([]);
      setParts([]);
      setFailedCount(0);
      setTotalBins(1);
      setCurrentBinIndex(0);
      setSelectedPartIds([]);
      setQuantities({});
      setSearchQuery("");
      resetProduction();
      resetAllSaveStatus();
    }
  }, [resetNestingResult, resetProduction, resetAllSaveStatus]);

  const handleDBSearch = async () => {
    if (!searchQuery) return;
    setIsSearching(true);
    try {
      const params = new URLSearchParams();
      params.append("pedido", searchQuery);
      const response = await fetch(
        `http://localhost:3001/api/pecas/buscar?${params.toString()}`
      );
      if (response.status === 404) {
        alert("Nenhum pedido encontrado.");
        setIsSearching(false);
        return;
      }
      if (!response.ok) throw new Error("Erro ao buscar.");
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        const dbParts: ImportedPart[] = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          entities: item.entities,
          blocks: item.blocks || {},
          width: Number(item.width),
          height: Number(item.height),
          grossArea: Number(item.grossArea),
          netArea: Number(item.grossArea),
          quantity: Number(item.quantity) || 1,
          pedido: item.pedido,
          op: item.op,
          material: item.material,
          espessura: item.espessura,
          autor: item.autor,
          dataCadastro: item.dataCadastro,
        }));

        if (searchMode === "replace") {
          if (
            nestingResult.length > 0 &&
            !window.confirm("Isso limpará o arranjo atual. Continuar?")
          ) {
            setIsSearching(false);
            return;
          }
          setParts(dbParts);
          resetNestingResult([]);
          resetProduction();
          resetAllSaveStatus();
        } else {
          setParts((prev) => {
            const currentIds = new Set(prev.map((p) => p.id));
            const newUnique = dbParts.filter((p) => !currentIds.has(p.id));
            if (newUnique.length === 0) {
              alert("Peças já estão na lista!");
              return prev;
            }
            return [...prev, ...newUnique];
          });
        }
        setSearchQuery("");
        setIsSearchModalOpen(false);
      }
    } catch (err) {
      console.error(err);
      alert("Erro de conexão.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleContextRotate = useCallback(
    (angle: number) => {
      if (selectedPartIds.length === 0) return;
      setNestingResult((prev) =>
        prev.map((p) =>
          selectedPartIds.includes(p.uuid)
            ? { ...p, rotation: (p.rotation + angle) % 360 }
            : p
        )
      );
    },
    [selectedPartIds, setNestingResult]
  );

  const handleContextMove = useCallback(
    (dx: number, dy: number) => {
      if (selectedPartIds.length === 0) return;
      setNestingResult((prev) =>
        prev.map((p) =>
          selectedPartIds.includes(p.uuid)
            ? { ...p, x: p.x + dx, y: p.y - dy }
            : p
        )
      );
    },
    [selectedPartIds, setNestingResult]
  );

  // 1. PRIMEIRO: A função original que calcula a matemática do movimento
  const handlePartsMove = useCallback(
    (moves: { partId: string; dx: number; dy: number }[]) => {
      // ... (sua lógica existente aqui dentro, mantenha como estava) ...
      // Se você não tiver o código dela fácil, é aquele que faz setNestingResult com map...
      setNestingResult((prev) => {
        const newPlaced = [...prev];
        moves.forEach(({ partId, dx, dy }) => {
          const index = newPlaced.findIndex((p) => p.uuid === partId);
          if (index !== -1) {
            // Atualiza posição
            newPlaced[index] = {
              ...newPlaced[index],
              x: newPlaced[index].x + dx,
              y: newPlaced[index].y + dy,
            };
          }
        });
        return newPlaced;
      });
    },
    [setNestingResult]
  );

  // 2. SEGUNDO: A função wrapper que limpa o erro e chama a primeira
  // (Esta deve vir DEPOIS da handlePartsMove)
  const handlePartsMoveWithClear = useCallback(
    (moves: any) => {
      // Chama a função original definida acima
      handlePartsMove(moves);

      // Limpa as marcas vermelhas se houver
      if (collidingPartIds.length > 0) {
        setCollidingPartIds([]);
      }
    },
    [handlePartsMove, collidingPartIds]
  );
  // --- COLE AQUI AS FUNÇÕES DE COLISÃO (PARA FICAREM DEPOIS DO MOVER) ---

  const handleCheckCollisions = useCallback(() => {
    if (currentPlacedParts.length < 1) {
      alert("A mesa está vazia.");
      return;
    }

    // Verifica se o worker existe antes de enviar
    if (collisionWorkerRef.current) {
      collisionWorkerRef.current.postMessage({
        placedParts: currentPlacedParts,
        partsData: parts,
        binWidth: binSize.width,
        binHeight: binSize.height,
        margin: margin,
      });
    }
  }, [currentPlacedParts, parts, binSize, margin]);

  const handlePartSelect = useCallback((ids: string[], append: boolean) => {
    setSelectedPartIds((prev) =>
      append ? [...new Set([...prev, ...ids])] : ids
    );
  }, []);

  const handlePartContextMenu = useCallback(
    (e: React.MouseEvent, partId: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (!selectedPartIds.includes(partId)) setSelectedPartIds([partId]);
      setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
    },
    [selectedPartIds]
  );

  const handleThumbnailContextMenu = (e: React.MouseEvent, partId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingPartId(partId);
  };

  const handleDragStart = (e: React.DragEvent, part: ImportedPart) => {
    e.dataTransfer.setData("application/react-dnd-part-id", part.id);
    e.dataTransfer.effectAllowed = "copy";
  };

  // --- LÓGICA SIMPLIFICADA (Recebe X/Y já em milímetros do Canvas) ---
  const handleExternalDrop = useCallback(
    (partId: string, x: number, y: number) => {
      const part = parts.find((p) => p.id === partId);
      if (!part) return;

      // Ajuste para centralizar a peça no mouse (opcional)
      const finalX = x - part.width / 2;
      const finalY = y - part.height / 2;

      const newPlacedPart: PlacedPart = {
        partId: part.id,
        x: finalX,
        y: finalY,
        rotation: 0,
        binId: currentBinIndex,
        uuid: crypto.randomUUID(),
      };
      setNestingResult((prev) => [...prev, newPlacedPart]);
    },
    [parts, currentBinIndex, setNestingResult]
  );

  const formatArea = useCallback(
    (mm2: number) =>
      mm2 > 100000
        ? (mm2 / 1000000).toFixed(3) + " m²"
        : mm2.toFixed(0) + " mm²",
    []
  );

  const totalPlacedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    nestingResult.forEach((p) => {
      counts[p.partId] = (counts[p.partId] || 0) + 1;
    });
    return counts;
  }, [nestingResult]);

  const currentBinPartIds = useMemo(() => {
    const ids = new Set<string>();
    currentPlacedParts.forEach((p) => ids.add(p.partId));
    return ids;
  }, [currentPlacedParts]);

  const sortedParts = useMemo(() => {
    const sorted = [...displayedParts].sort((a, b) => {
      // 1. PRIORIDADE MÁXIMA: Selecionado (para o usuário não perder o que clicou)
      const aSel = selectedPartIds.includes(a.id);
      const bSel = selectedPartIds.includes(b.id);
      if (aSel && !bSel) return -1;
      if (!aSel && bSel) return 1;

      // Dados de Quantidade
      const qtyA = quantities[a.id] || 1;
      const qtyB = quantities[b.id] || 1;
      // Usamos totalPlacedCounts (calculado acima no código)
      // Se não estiver disponível no escopo do useMemo, certifique-se de adicioná-lo nas dependências
      const placedA = totalPlacedCounts[a.id] || 0;
      const placedB = totalPlacedCounts[b.id] || 0;

      const isPendingA = placedA < qtyA;
      const isPendingB = placedB < qtyB;

      // 2. PRIORIDADE DE TRABALHO: Pendentes no topo, Concluídas no fundo
      if (isPendingA && !isPendingB) return -1; // A sobe (falta fazer)
      if (!isPendingA && isPendingB) return 1; // B sobe (falta fazer)

      // 3. Critério de Desempate: Se ambos forem pendentes (ou ambos concluídos),
      // mostra primeiro quem já está na chapa atual (contexto visual)
      const aOnBoard = currentBinPartIds.has(a.id);
      const bOnBoard = currentBinPartIds.has(b.id);
      if (aOnBoard && !bOnBoard) return -1;
      if (!aOnBoard && bOnBoard) return 1;

      return 0;
    });
    return sorted;
  }, [
    displayedParts,
    selectedPartIds,
    currentBinPartIds,
    quantities,
    totalPlacedCounts,
  ]);

  // --- 6. RENDERIZAÇÃO ---
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    background: theme.bg,
    color: theme.text,
  };
  const topBarStyle: React.CSSProperties = {
    padding: "10px 20px",
    borderBottom: `1px solid ${theme.border}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.headerBg,
  };
  const toolbarStyle: React.CSSProperties = {
    padding: "10px 20px",
    borderBottom: `1px solid ${theme.border}`,
    display: "flex",
    gap: "15px",
    alignItems: "center",
    backgroundColor: theme.panelBg,
    flexWrap: "nowrap",
    overflowX: "auto",
  };
  const inputStyle: React.CSSProperties = {
    padding: 5,
    borderRadius: 4,
    border: `1px solid ${theme.border}`,
    background: theme.inputBg,
    color: theme.text,
  };
  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: "4px 8px",
    border: "none",
    borderRadius: "3px",
    cursor: "pointer",
    background: active ? "#007bff" : "transparent",
    color: active ? "#fff" : theme.text,
    fontSize: "16px",
  });
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: "10px 15px",
    cursor: "pointer",
    background: "transparent",
    outline: "none",
    border: "none",
    borderBottom: active ? "2px solid #28a745" : "2px solid transparent",
    color: active ? theme.text : theme.label,
    fontWeight: active ? "bold" : "normal",
    fontSize: "13px",
  });
  const thStyle: React.CSSProperties = {
    padding: "10px",
    textAlign: "left",
    fontSize: "12px",
    opacity: 0.7,
    borderBottom: `1px solid ${theme.border}`,
    whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    padding: "8px 10px",
    fontSize: "13px",
    borderBottom: `1px solid ${theme.border}`,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "120px",
  };

  const renderProgressBar = (
    produced: number,
    total: number,
    color: string
  ) => {
    const pct = Math.min(100, Math.round((produced / total) * 100));
    return (
      <div
        style={{
          width: "100%",
          background: theme.border,
          height: "6px",
          borderRadius: "3px",
          marginTop: "5px",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            background: pct >= 100 ? "#28a745" : color,
            height: "100%",
          }}
        ></div>
      </div>
    );
  };

  return (
    <div style={containerStyle}>
      {isSearchModalOpen && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.6)",
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
          onClick={() => setIsSearchModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: theme.panelBg,
              padding: "25px",
              borderRadius: "8px",
              width: "350px",
              border: `1px solid ${theme.border}`,
              boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ marginTop: 0, color: theme.text }}>
              🔍 Buscar Pedido(s)
            </h3>
            <p style={{ fontSize: "13px", color: theme.label }}>
              Separe múltiplos pedidos por vírgula.
            </p>
            <div
              style={{
                marginBottom: "15px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                background: theme.inputBg,
                padding: "10px",
                borderRadius: "4px",
              }}
            >
              <span
                style={{ fontSize: "11px", fontWeight: "bold", opacity: 0.7 }}
              >
                MODO DE IMPORTAÇÃO:
              </span>
              <div style={{ display: "flex", gap: "15px" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                    fontSize: "13px",
                    color: theme.text,
                  }}
                >
                  <input
                    type="radio"
                    name="searchMode"
                    checked={searchMode === "replace"}
                    onChange={() => setSearchMode("replace")}
                    style={{ marginRight: "5px" }}
                  />{" "}
                  Nova Mesa (Limpar)
                </label>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: "bold",
                    color: "#28a745",
                  }}
                >
                  <input
                    type="radio"
                    name="searchMode"
                    checked={searchMode === "append"}
                    onChange={() => setSearchMode("append")}
                    style={{ marginRight: "5px" }}
                  />{" "}
                  Adicionar (Mix)
                </label>
              </div>
            </div>
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDBSearch()}
              placeholder="Ex: 35905, 35906"
              style={{
                width: "100%",
                padding: "10px",
                marginTop: "5px",
                marginBottom: "20px",
                background: theme.inputBg,
                color: theme.text,
                border: `1px solid ${theme.border}`,
                borderRadius: "4px",
                boxSizing: "border-box",
              }}
            />
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                onClick={() => setIsSearchModalOpen(false)}
                style={{
                  padding: "8px 15px",
                  background: "transparent",
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDBSearch}
                disabled={isSearching}
                style={{
                  padding: "8px 15px",
                  background: "#28a745",
                  border: "none",
                  color: "white",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                {isSearching ? "Buscando..." : "Buscar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {contextMenu && contextMenu.visible && selectedPartIds.length > 0 && (
        <ContextControl
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onMove={handleContextMove}
          onRotate={handleContextRotate}
        />
      )}

      <div style={topBarStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          {onBack && (
            <button
              onClick={onBack}
              title="Voltar"
              style={{
                background: "transparent",
                border: "none",
                color: theme.text,
                cursor: "pointer",
                fontSize: "24px",
                display: "flex",
                alignItems: "center",
                padding: 0,
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
              </svg>
            </button>
          )}
          <h2
            style={{
              margin: 0,
              fontSize: "18px",
              color: "#007bff",
              whiteSpace: "nowrap",
            }}
          >
            Planejamento de Corte
          </h2>
        </div>
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          <button
            onClick={() => setIsSearchModalOpen(true)}
            style={{
              background: "#6f42c1",
              color: "white",
              border: "none",
              padding: "6px 12px",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "13px",
            }}
          >
            🔍 Buscar Pedido
          </button>

          <button
            onClick={handleSaveClick}
            disabled={
              nestingResult.length === 0 || isSaving || isCurrentSheetSaved
            }
            style={{
              background: isCurrentSheetSaved
                ? "#28a745"
                : lockedBins.includes(currentBinIndex)
                ? "#17a2b8"
                : "#007bff",
              color: "white",
              border: "none",
              padding: "6px 12px",
              cursor:
                nestingResult.length === 0 || isSaving || isCurrentSheetSaved
                  ? "not-allowed"
                  : "pointer",
              borderRadius: "4px",
              opacity:
                nestingResult.length === 0 || isSaving || isCurrentSheetSaved
                  ? 0.6
                  : 1,
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              transition: "all 0.3s ease",
            }}
          >
            {isSaving
              ? "⏳ Salvando..."
              : isCurrentSheetSaved
              ? "✅ Chapa Salva"
              : "💾 Salvar DXF"}
          </button>

          <button
            onClick={handleClearTable}
            title="Reiniciar Página"
            style={{
              background: "transparent",
              color: "#dc3545",
              border: `1px solid #dc3545`,
              padding: "5px 10px",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "13px",
            }}
          >
            🗑️
          </button>
          <div
            style={{
              width: 1,
              height: 24,
              background: theme.border,
              margin: "0 5px",
            }}
          ></div>
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            title="Alternar Tema"
            style={{
              background: "transparent",
              border: `1px solid ${theme.border}`,
              color: theme.text,
              padding: "6px 12px",
              borderRadius: "20px",
              cursor: "pointer",
              fontSize: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isDarkMode ? "☀️" : "🌙"}
          </button>
        </div>
      </div>

      <div style={toolbarStyle}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderRight: `1px solid ${theme.border}`,
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
            onChange={(e) => setStrategy(e.target.value as any)}
            style={inputStyle}
          >
            <option value="rect">🔳 Retangular</option>
            <option value="true-shape">🧩 True Shape</option>
          </select>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            borderRight: `1px solid ${theme.border}`,
            paddingRight: "15px",
          }}
        >
          <span
            style={{ fontSize: "12px", marginRight: "5px", fontWeight: "bold" }}
          >
            Dir:
          </span>
          <div
            style={{
              display: "flex",
              gap: "2px",
              background: theme.inputBg,
              borderRadius: "4px",
              padding: "2px",
            }}
          >
            <button
              title="Auto"
              onClick={() => setDirection("auto")}
              style={btnStyle(direction === "auto")}
            >
              Auto
            </button>
            <button
              title="Vertical"
              onClick={() => setDirection("vertical")}
              style={btnStyle(direction === "vertical")}
            >
              ⬇️
            </button>
            <button
              title="Horizontal"
              onClick={() => setDirection("horizontal")}
              style={btnStyle(direction === "horizontal")}
            >
              ➡️
            </button>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: theme.hoverRow,
            padding: "5px",
            borderRadius: "4px",
            gap: "5px",
          }}
        >
          <label style={{ fontSize: 12 }}>L:</label>
          <input
            type="number"
            value={binSize.width}
            onChange={(e) =>
              setBinSize((p) => ({ ...p, width: Number(e.target.value) }))
            }
            style={{ ...inputStyle, width: 50 }}
          />
          <label style={{ fontSize: 12 }}>A:</label>
          <input
            type="number"
            value={binSize.height}
            onChange={(e) =>
              setBinSize((p) => ({ ...p, height: Number(e.target.value) }))
            }
            style={{ ...inputStyle, width: 50 }}
          />
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ fontSize: 12 }}>Gap:</label>
          <input
            type="number"
            value={gap}
            onChange={(e) => setGap(Number(e.target.value))}
            style={{ ...inputStyle, width: 40 }}
          />
          <label style={{ fontSize: 12 }}>Margem:</label>
          <input
            type="number"
            value={margin}
            onChange={(e) => setMargin(Number(e.target.value))}
            style={{ ...inputStyle, width: 40 }}
          />
        </div>

        {strategy === "true-shape" && (
          <div style={{ display: "flex", alignItems: "center" }}>
            <label style={{ fontSize: 12, marginRight: 5 }}>Rot:</label>
            <select
              value={rotationStep}
              onChange={(e) => setRotationStep(Number(e.target.value))}
              style={inputStyle}
            >
              <option value="90">90°</option>
              <option value="45">45°</option>
              <option value="10">10°</option>
            </select>
          </div>
        )}
        <label
          style={{
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
          />{" "}
          Ver Box
        </label>

        <button
          onClick={handleCheckCollisions}
          title="Verificar se há peças sobrepostas"
          style={{
            background: "#dc3545", // Vermelho para chamar atenção à segurança
            border: `1px solid ${theme.border}`,
            color: "#fff",
            padding: "5px 10px",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            marginLeft: "10px",
          }}
        >
          💥 Verificar Colisão
        </button>

        {/* --- NOVO BOTÃO: ADICIONAR CHAPA --- */}
        <button
          onClick={handleAddBin}
          title="Criar uma nova chapa vazia para nesting manual"
          style={{
            background: theme.buttonBg,
            border: `1px solid ${theme.border}`,
            color: theme.text,
            padding: "5px 10px",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            gap: "5px",
            marginLeft: "10px",
          }}
        >
          <span
            style={{ color: "#28a745", fontSize: "14px", marginRight: "3px" }}
          >
            +
          </span>{" "}
          Nova Chapa
        </button>
        {/* ----------------------------------- */}

        <button
          onClick={handleCalculate}
          disabled={isComputing}
          style={{
            marginLeft: "auto",
            background: isComputing ? "#666" : "#28a745",
            color: "white",
            border: "none",
            padding: "8px 15px",
            cursor: isComputing ? "wait" : "pointer",
            borderRadius: "4px",
            fontWeight: "bold",
            fontSize: "13px",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
          }}
        >
          {isComputing ? "..." : "▶ Calcular Nesting"}
        </button>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <div
          style={{
            flex: 2,
            position: "relative",
            background: theme.canvasBg,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
          onMouseDown={() => setContextMenu(null)}
        >
          {/* --- NAVEGADOR DE CHAPAS (VERTICAL, DISCRETO E COM TOOLTIPS) --- */}
          {totalBins > 1 && (
            <div
              style={{
                position: "absolute",
                top: 110, // Logo abaixo dos botões de Undo/Redo
                left: 20,
                zIndex: 20,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "5px",
                background: "rgba(30, 30, 30, 0.85)",
                color: theme.text,
                border: isCurrentSheetSaved
                  ? "1px solid #28a745"
                  : `1px solid ${theme.border}`,
                padding: "8px 4px",
                borderRadius: "20px",
                boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                width: "32px",
                transition: "all 0.3s ease",
              }}
            >
              {/* Botão Anterior */}
              <button
                onClick={() =>
                  setCurrentBinIndex(Math.max(0, currentBinIndex - 1))
                }
                disabled={currentBinIndex === 0}
                title="Voltar para a chapa anterior" // <--- TOOLTIP AQUI
                style={{
                  cursor: currentBinIndex === 0 ? "default" : "pointer",
                  border: "none",
                  background: "transparent",
                  fontWeight: "bold",
                  color: currentBinIndex === 0 ? "#555" : theme.text,
                  fontSize: "20px",
                  padding: 2,
                  display: "flex",
                  justifyContent: "center",
                  width: "100%",
                }}
              >
                ▴
              </button>

              {/* Indicador Numérico */}
              <div
                title={`Chapa ${currentBinIndex + 1} de ${totalBins} ${
                  isCurrentSheetSaved ? "(Salva)" : "(Não salva)"
                }`} // <--- TOOLTIP AQUI
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  fontSize: "12px",
                  fontWeight: "bold",
                  lineHeight: 2,
                  gap: "2px",
                  cursor: "help",
                }}
              >
                <span
                  style={{
                    color: isCurrentSheetSaved ? "#28a745" : theme.text,
                  }}
                >
                  {currentBinIndex + 1}
                </span>
                <div
                  style={{
                    width: "12px",
                    height: "1px",
                    background: theme.border,
                  }}
                ></div>
                <span style={{ opacity: 0.6 }}>{totalBins}</span>
              </div>

              {/* Botão Próximo */}
              <button
                onClick={() =>
                  setCurrentBinIndex(
                    Math.min(totalBins - 1, currentBinIndex + 1)
                  )
                }
                disabled={currentBinIndex === totalBins - 1}
                title="Avançar para a próxima chapa" // <--- TOOLTIP AQUI
                style={{
                  cursor:
                    currentBinIndex === totalBins - 1 ? "default" : "pointer",
                  border: "none",
                  background: "transparent",
                  fontWeight: "bold",
                  color:
                    currentBinIndex === totalBins - 1 ? "#555" : theme.text,
                  fontSize: "18px",
                  padding: 0,
                  display: "flex",
                  justifyContent: "center",
                  width: "100%",
                }}
              >
                ▾
              </button>
            </div>
          )}

          <InteractiveCanvas
            onCanvasDrop={handleExternalDrop} // <--- CONECTADO AQUI
            parts={displayedParts}
            placedParts={currentPlacedParts}
            binWidth={binSize.width}
            binHeight={binSize.height}
            margin={margin}
            showDebug={showDebug}
            strategy={strategy}
            theme={theme}
            selectedPartIds={selectedPartIds}
            onPartsMove={handlePartsMoveWithClear}
            collidingPartIds={collidingPartIds}
            onPartRotate={handlePartRotate}
            onPartSelect={handlePartSelect}
            onContextMenu={handlePartContextMenu}
            onPartReturn={handleReturnToBank}
            // --- NOVAS PROPRIEDADES ADICIONADAS ---
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            // --------------------------------------
          />

          {/* --- RODAPÉ FIXO (MODIFICADO) --- */}
          <div
            style={{
              padding: "10px 20px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderTop: `1px solid ${theme.border}`,
              background: theme.panelBg,
              zIndex: 5,
              color: theme.text,
            }}
          >
            {/* ESQUERDA: Contagem Detalhada */}
            <span
              style={{ opacity: 0.9, fontSize: "12px", fontWeight: "bold" }}
            >
              Total: {currentPlacedParts.length} de {displayedParts.length}{" "}
              Peças
            </span>

            {/* CENTRO: Aproveitamento Duplo (Engenharia + PCP) */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                marginLeft: "auto",
                marginRight: "auto",
              }}
            >
              {/* 1. Indicador Principal: CUSTO REAL (Da Chapa Inteira) */}
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: "bold",
                  color: theme.text,
                }}
              >
                Aprov. Real:{" "}
                <span
                  style={{
                    color:
                      Number(currentEfficiencies.real.replace(",", ".")) > 70
                        ? "#28a745"
                        : theme.text,
                  }}
                >
                  {currentEfficiencies.real}%
                </span>
              </span>

              {/* 2. Indicador Secundário: DENSIDADE (Do Espaço Usado) */}
              <span
                style={{
                  fontSize: "11px",
                  color: theme.label,
                  marginTop: "-2px",
                }}
              >
                Densidade de Encaixe:{" "}
                <span style={{ color: "#007bff" }}>
                  {currentEfficiencies.effective}%
                </span>
              </span>
            </div>

            {/* DIREITA: Status */}
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              {/* CORRETO: Só mostra se estiver salvo E sem alterações pendentes */}
              {isCurrentSheetSaved && (
                <span
                  style={{
                    color: "#28a745",
                    fontWeight: "bold",
                    fontSize: "13px",
                    lineHeight: "1",
                  }}
                >
                  ✅ ARRANJO SALVO
                </span>
              )}

              {failedCount > 0 && (
                <span
                  style={{
                    color: "#dc3545",
                    fontWeight: "bold",
                    fontSize: "12px",
                    background: "rgba(255,0,0,0.1)",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    lineHeight: "1",
                  }}
                >
                  ⚠️ {failedCount} NÃO COUBERAM
                </span>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            width: "500px",
            borderLeft: `1px solid ${theme.border}`,
            display: "flex",
            flexDirection: "column",
            backgroundColor: theme.panelBg,
            zIndex: 5,
            color: theme.text,
          }}
        >
          <PartFilter
            allParts={parts}
            filters={filters}
            onFilterChange={setFilters}
            theme={theme}
          />
          <GlobalLabelPanel
            showWhite={globalWhiteEnabled}
            showPink={globalPinkEnabled}
            onToggleWhite={() => toggleGlobal("white")}
            onTogglePink={() => toggleGlobal("pink")}
            theme={theme}
          />
          <div
            style={{
              display: "flex",
              borderBottom: `1px solid ${theme.border}`,
              background: theme.headerBg,
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
                {sortedParts.map((part) => {
                  const qty = quantities[part.id] || 1;
                  const { produced } = getPartStatus(part.id, qty);
                  const orderColor = stringToColor(part.pedido || "N/A");
                  const placedTotal = totalPlacedCounts[part.id] || 0;
                  const totalVisual = produced + placedTotal;
                  const remainingVisual = Math.max(0, qty - totalVisual);
                  const isDoneVisual = remainingVisual === 0;
                  const isSelected = activeSelectedPartIds.has(part.id);
                  const isOnCurrentSheet = currentBinPartIds.has(part.id);

                  let mainBorderColor = theme.border;
                  let mainBorderWidth = "1px";
                  if (isSelected) {
                    mainBorderColor = "#007bff";
                    mainBorderWidth = "2px";
                  } else if (isOnCurrentSheet) {
                    mainBorderColor = "#28a745";
                    mainBorderWidth = "3px";
                  }

                  const cardBorderStyle = {
                    borderLeft: `5px solid ${orderColor}`,
                    borderTop: `${mainBorderWidth} solid ${mainBorderColor}`,
                    borderRight: `${mainBorderWidth} solid ${mainBorderColor}`,
                    borderBottom: `${mainBorderWidth} solid ${mainBorderColor}`,
                  };
                  const cursorStyle = isDoneVisual ? "not-allowed" : "grab";
                  const canDrag = !isDoneVisual;
                  const box = calculateBoundingBox(part.entities, part.blocks);
                  const originalW = box.width || 100;
                  const originalH = box.height || 100;
                  const isTall = originalH > originalW;
                  const p = Math.max(originalW, originalH) * 0.1;
                  let finalViewBox = "";
                  let contentTransform = "";

                  if (isTall) {
                    const cx = (box.minX + box.maxX) / 2;
                    const cy = (box.minY + box.maxY) / 2;
                    contentTransform = `rotate(-90, ${cx}, ${cy})`;
                    const cameraW = originalH + p * 2;
                    const cameraH = originalW + p * 2;
                    const cameraX = cx - cameraW / 2;
                    const cameraY = cy - cameraH / 2;
                    finalViewBox = `${cameraX} ${cameraY} ${cameraW} ${cameraH}`;
                  } else {
                    finalViewBox = `${box.minX - p} ${box.minY - p} ${
                      originalW + p * 2
                    } ${originalH + p * 2}`;
                  }

                  return (
                    <div
                      key={part.id}
                      ref={(el) => {
                        thumbnailRefs.current[part.id] = el;
                      }}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        position: "relative",
                        opacity: 1,
                        cursor: cursorStyle,
                      }}
                      onContextMenu={(e) =>
                        handleThumbnailContextMenu(e, part.id)
                      }
                      draggable={canDrag}
                      onDragStart={(e) => canDrag && handleDragStart(e, part)}
                    >
                      <ThumbnailFlags
                        partId={part.id}
                        labelState={labelStates}
                        onTogglePartFlag={togglePartFlag}
                      />

                      <div
                        style={{
                          position: "absolute",
                          top: 5,
                          left: 5,
                          zIndex: 1000, // Acima do card
                          background: "rgba(255,255,255,0.7)",
                          borderRadius: "4px",
                          padding: "2px",
                          display: "flex",
                          alignItems: "center",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }}
                        onClick={(e) => e.stopPropagation()} // Impede que selecione a peça ao clicar no check
                        title="Incluir esta peça no cálculo automático?"
                      >
                        <input
                          type="checkbox"
                          checked={!disabledNestingIds.has(part.id)}
                          onChange={(e) => {
                            const newSet = new Set(disabledNestingIds);
                            if (e.target.checked) {
                              newSet.delete(part.id); // Marca (remove da lista de ignorados)
                            } else {
                              newSet.add(part.id); // Desmarca (adiciona aos ignorados)
                            }
                            setDisabledNestingIds(newSet);
                          }}
                          style={{
                            cursor: "pointer",
                            margin: 0,
                            width: "14px",
                            height: "14px",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          width: "100%",
                          aspectRatio: "1/1",
                          background: theme.cardBg,
                          borderRadius: "8px",
                          marginBottom: "5px",
                          padding: "10px",
                          boxSizing: "border-box",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                          boxShadow: isSelected
                            ? "0 0 8px rgba(0,123,255,0.6)"
                            : "none",
                          transition: "all 0.2s ease",
                          ...cardBorderStyle,
                        }}
                      >
                        <svg
                          viewBox={finalViewBox}
                          style={{
                            width: "100%",
                            height: "100%",
                            overflow: "visible",
                            color: theme.text,
                            opacity: isDoneVisual ? 0.8 : 1,
                            transition: "opacity 0.3s ease",
                          }}
                          transform="scale(1, -1)"
                          preserveAspectRatio="xMidYMid meet"
                        >
                          <g transform={contentTransform}>
                            {part.entities.map((ent, i) =>
                              renderEntityFunction(
                                ent,
                                i,
                                part.blocks,
                                1,
                                isDoneVisual ? theme.border : theme.text
                              )
                            )}
                          </g>
                        </svg>
                      </div>
                      <div
                        style={{
                          width: "100%",
                          display: "flex",
                          flexDirection: "column",
                          fontSize: "12px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              width: "65%",
                            }}
                          >
                            <span
                              title={part.name}
                              style={{
                                fontWeight: "bold",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {part.name}
                            </span>
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: "bold",
                                color: orderColor,
                              }}
                            >
                              Ped: {part.pedido || "-"}
                            </span>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "center",
                              background: isDoneVisual
                                ? "rgba(40, 167, 69, 0.1)"
                                : theme.hoverRow,
                              padding: "2px 4px",
                              borderRadius: "4px",
                              border: `1px solid ${
                                isDoneVisual ? "#28a745" : "transparent"
                              }`,
                            }}
                          >
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: "bold",
                                color: isDoneVisual ? "#28a745" : theme.text,
                              }}
                            >
                              {totalVisual}/{qty}
                            </span>
                          </div>
                        </div>
                        {renderProgressBar(totalVisual, qty, orderColor)}
                        <div
                          style={{
                            fontSize: "10px",
                            color: isDoneVisual ? "#28a745" : theme.label,
                            display: "flex",
                            justifyContent: "space-between",
                          }}
                        >
                          <span>
                            {isDoneVisual ? "✅ CONCLUÍDO" : "Em Produção"}
                          </span>
                          <span style={{ fontWeight: "bold" }}>
                            Falta: {remainingVisual}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {activeTab === "list" && (
              <div
                style={{
                  overflowX: "auto",
                  transform: "rotateX(180deg)",
                  borderBottom: `1px solid ${theme.border}`,
                }}
              >
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    borderSpacing: 0,
                    minWidth: "600px",
                    transform: "rotateX(180deg)",
                  }}
                >
                  <thead style={{ background: theme.panelBg }}>
                    <tr>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Peça</th>
                      <th style={thStyle}>Pedido</th>
                      <th style={thStyle}>Mat/Esp</th>
                      <th style={thStyle}>Dimensões</th>
                      <th style={thStyle}>Área</th>
                      <th style={thStyle}>Meta</th>
                      <th style={thStyle}>Status Produção</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedParts.map((part, index) => {
                      const qty = quantities[part.id] || 1;
                      const { produced } = getPartStatus(part.id, qty);
                      const orderColor = stringToColor(part.pedido || "N/A");
                      const placedTotal = totalPlacedCounts[part.id] || 0;
                      const totalVisual = produced + placedTotal;
                      const remainingVisual = Math.max(0, qty - totalVisual);
                      const isDoneVisual = remainingVisual === 0;
                      const isOnCurrentSheet = currentBinPartIds.has(part.id);
                      const rowBg = isOnCurrentSheet
                        ? "rgba(40, 167, 69, 0.05)"
                        : isDoneVisual
                        ? "rgba(40, 167, 69, 0.1)"
                        : "transparent";

                      return (
                        <tr
                          key={part.id}
                          style={{
                            borderBottom: `1px solid ${theme.border}`,
                            background: rowBg,
                          }}
                        >
                          <td
                            style={{
                              ...tdStyle,
                              borderLeft: `4px solid ${orderColor}`,
                            }}
                          >
                            {index + 1}
                          </td>
                          <td
                            style={{ ...tdStyle, fontWeight: "bold" }}
                            title={part.name}
                          >
                            {part.name}
                          </td>
                          <td
                            style={{
                              ...tdStyle,
                              color: orderColor,
                              fontWeight: "bold",
                            }}
                          >
                            {part.pedido || "-"}
                          </td>
                          <td style={tdStyle}>
                            {part.material}{" "}
                            {part.espessura && `/ ${part.espessura}`}
                          </td>
                          <td style={tdStyle}>
                            {part.width.toFixed(0)}x{part.height.toFixed(0)}
                          </td>
                          <td style={tdStyle}>{formatArea(part.grossArea)}</td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <span
                              style={{
                                fontWeight: "bold",
                                fontSize: "13px",
                                color: theme.text,
                              }}
                            >
                              {qty}
                            </span>
                          </td>
                          <td style={{ ...tdStyle, textAlign: "center" }}>
                            <div
                              style={{
                                padding: "4px 8px",
                                borderRadius: "4px",
                                background: isDoneVisual
                                  ? "rgba(40, 167, 69, 0.1)"
                                  : theme.hoverRow,
                                border: `1px solid ${
                                  isDoneVisual ? "#28a745" : theme.border
                                }`,
                                color: isDoneVisual ? "#28a745" : theme.text,
                                fontWeight: "bold",
                                fontSize: "12px",
                                display: "inline-block",
                                minWidth: "60px",
                              }}
                            >
                              {totalVisual}{" "}
                              <span
                                style={{
                                  fontSize: "10px",
                                  fontWeight: "normal",
                                  opacity: 0.7,
                                }}
                              >
                                de {qty}
                              </span>
                            </div>
                          </td>
                          <td style={{ ...tdStyle, width: "120px" }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: "10px",
                                marginBottom: "2px",
                              }}
                            >
                              <span style={{ fontWeight: "bold" }}>Saldo:</span>
                              <span>
                                {remainingVisual === 0
                                  ? "✅"
                                  : `-${remainingVisual}`}
                              </span>
                            </div>
                            {renderProgressBar(totalVisual, qty, orderColor)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      {editingPartId &&
        labelStates[editingPartId] &&
        parts.find((p) => p.id === editingPartId) && (
          <LabelEditorModal
            part={parts.find((p) => p.id === editingPartId)!}
            labelState={labelStates[editingPartId]}
            onUpdate={(type, changes) =>
              updateLabelConfig(editingPartId, type, changes)
            }
            onClose={() => setEditingPartId(null)}
            theme={theme}
          />
        )}
    </div>
  );
};
