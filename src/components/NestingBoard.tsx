/* eslint-disable @typescript-eslint/no-explicit-any */
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import type { ImportedPart } from "./types";
import {
  runGuillotineNesting, // <--- É uma função (valor), não use type aqui
  type PlacedPart, // <--- PlacedPart continua sendo um type
} from "../utils/nestingCore";
import { checkGuillotineCollisions } from "../utils/guillotineCollision";
import { ContextControl } from "./ContextControl";
import { InteractiveCanvas } from "./InteractiveCanvas";
import { useUndoRedo } from "../hooks/useUndoRedo";
import { PartFilter, type FilterState } from "./PartFilter";
import NestingWorker from "../workers/nesting.worker?worker";
import SmartNestNewWorker from "../workers/smartNestNew.worker?worker";
import SmartNestV3Worker from "../workers/smartNestV3.worker?worker";
import { useTheme } from "../context/ThemeContext";
import { useLabelManager } from "../hooks/useLabelManager";
import { GlobalLabelPanel, ThumbnailFlags } from "./labels/LabelControls";
import { LabelEditorModal } from "./labels/LabelEditorModal";
import type { LabelConfig } from "./labels/LabelTypes";
import { textToVectorLines } from "../utils/vectorFont";
import { useProductionManager } from "../hooks/useProductionManager";
import { useNestingSaveStatus } from "../hooks/useNestingSaveStatus";
import { useSheetManager } from "../hooks/useSheetManager";
import { SheetContextMenu } from "./SheetContextMenu";
import { SheetGalleryModal } from "./SheetGalleryModal";
import { useAuth } from "../context/AuthContext"; // <--- 1. IMPORTAÇÃO DE SEGURANÇA
import { SubscriptionPanel } from "./SubscriptionPanel";
import { SidebarMenu } from "../components/SidebarMenu";
// import { generateGuillotineReport } from "../utils/pdfGenerator";
import { useNestingAutoSave } from "../hooks/useNestingAutoSave";
// ... outras importações
import { useProductionRegister } from "../hooks/useProductionRegister"; // <--- GARANTA ESTA LINHA
import { useNestingFileManager } from "../hooks/useNestingFileManager";
import { TeamManagementScreen } from "../components/TeamManagementScreen";
import { calculatePartNetArea } from "../utils/areaCalculator";
// Adicione junto com os outros imports
import { rotatePartsGroup } from "../utils/transformUtils";
import { calculateSmartLabel } from "../utils/labelUtils";

// --- INSERÇÃO: CÁLCULO DE RETALHOS ---
import { 
  calculateOptimalRemnants, 
  resolveCropLines, 
  type RemnantRect 
} from "../utils/remnantCalculator";
// -------------------------------------

import { useNfpNesting } from "../hooks/useNfpNesting";

interface Size {
  width: number;
  height: number;
}

// Adicione esta interface para tipar o retorno do backend
interface OpData {
  name: string;
  isLocked: boolean;
  lockedBy: string | null;
}

interface AvailableOrder {
  pedido: string;
  ops: OpData[]; // Antes era string[], agora é lista de objetos
}

interface NestingBoardProps {
  initialParts: ImportedPart[];
  initialSearchQuery?: string;
  onBack?: () => void;
  onNavigate?: (
    screen: "home" | "engineering" | "nesting" | "dashboard",
  ) => void;
  onOpenTeam?: () => void; // <--- ADICIONE ESTA LINHA
  onEditOrder?: (parts: ImportedPart[]) => void;
}

// [NestingBoard.tsx]
interface NestingBoardProps {
  initialParts: ImportedPart[];
  initialSearchQuery?: string;
  onBack?: () => void;
  onNavigate?: (
    screen: "home" | "engineering" | "nesting" | "dashboard",
  ) => void;
  onOpenTeam?: () => void;
  // ⬇️ NOVO: Função para enviar peças para edição na Engenharia
  onEditOrder?: (parts: ImportedPart[]) => void;
}

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

// Adicione no topo do NestingBoard.tsx, junto com as outras funções auxiliares
const calculateRotatedDimensions = (
  width: number,
  height: number,
  rotationDeg: number,
) => {
  const rad = rotationDeg * (Math.PI / 180);
  const occupiedW =
    width * Math.abs(Math.cos(rad)) + height * Math.abs(Math.sin(rad));
  const occupiedH =
    width * Math.abs(Math.sin(rad)) + height * Math.abs(Math.cos(rad));
  return { width: occupiedW, height: occupiedH };
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
  blocks: any = {},
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
    endAngle: number,
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
            oy + (ent.position?.y || 0),
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
            ent.endAngle,
          );
        else {
          update(
            ox + ent.center.x - ent.radius,
            oy + ent.center.y - ent.radius,
          );
          update(
            ox + ent.center.x + ent.radius,
            oy + ent.center.y + ent.radius,
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
  color: string = "currentColor",
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
            renderEntityFunction(s, i, blocks, 1, color),
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
  onNavigate,
  onOpenTeam,
  onEditOrder,
}) => {
  // --- 2. PEGAR O USUÁRIO DO CONTEXTO DE SEGURANÇA ---
  const { user } = useAuth();

  // --- NOVO: Estado para bloquear recursos do Trial ---
  const [isTrial, setIsTrial] = useState(false);
  
  // Estado para controlar o modal da equipe
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);

  // =========================================================
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  // =========================================================

  // ⬇️ --- [INSERÇÃO 1] ESTADOS PARA O RESIZE DA BARRA LATERAL --- ⬇️
  const [sidebarWidth, setSidebarWidth] = useState(500); // Começa com 500px
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  // ⬆️ ----------------------------------------------------------- ⬆️

  const [viewKey, setViewKey] = useState(0); // Controla o reset visual do Canvas

  const [isRestoring, setIsRestoring] = useState(true);

  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (user && user.token) {
      fetch("http://localhost:3001/api/subscription/status", {
        headers: { Authorization: `Bearer ${user.token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          // Normaliza para garantir que 'trial' ou 'TRIAL' funcione
          if (data.status && data.status.toLowerCase() === "trial") {
            setIsTrial(true);
          }
        })
        .catch((err) => console.error("Erro ao verificar status:", err));
    }
  }, [user]);

  // --- DEFINIÇÃO DE ESTADOS ---
  const [parts, setParts] = useState<ImportedPart[]>(initialParts);

  // --- NOVO: Sincroniza quando a Engenharia manda peças (Botão Cortar Agora) ---
  useEffect(() => {
    // Se initialParts mudar e não for vazio, atualizamos a mesa
    if (initialParts && initialParts.length > 0) {
      setParts(initialParts);

      // Também resetamos as quantidades para bater com a nova lista
      const newQuantities: { [key: string]: number } = {};
      initialParts.forEach((p) => {
        newQuantities[p.id] = p.quantity || 1;
      });
      setQuantities(newQuantities);

      // Opcional: Se quiser limpar o arranjo anterior ao trazer novas peças
      // resetNestingResult([]);
    }
  }, [initialParts]);

  const [binSize, setBinSize] = useState<Size>({ width: 1200, height: 3000 });
  const [sheetMenu, setSheetMenu] = useState<{
    x: number;
    y: number;
    lineId?: string;
    binX?: number; // <--- ADICIONE ISSO
    binY?: number; // <--- ADICIONE ISSO
  } | null>(null);

  const {
    totalBins,
    setTotalBins,
    currentBinIndex,
    setCurrentBinIndex,
    handleAddBin,
    cropLines,
    moveCropLine,
    removeCropLine,
    // --- ADICIONE ESTA LINHA: ---
    trimCropLine,
    // ----------------------------
    handleDeleteCurrentBin,
    addCropLine,
    setCropLines,
  } = useSheetManager({ initialBins: 1 });

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || "");
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isGalleryOpen, setIsGalleryOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMode, setSearchMode] = useState<"replace" | "append">("append");
  const [filters, setFilters] = useState<FilterState>({
    pedido: [],
    op: [],
    material: "",
    espessura: "",
  });

  const { isDarkMode, theme } = useTheme();
  // const [isDarkMode, setIsDarkMode] = useState(true);
  // const theme = getTheme(isDarkMode);
  const [activeTab, setActiveTab] = useState<"grid" | "list">("grid");
  const [showDebug, setShowDebug] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    binX?: number; // Posição REAL do clique na Chapa (mm)
    binY?: number; // Posição REAL do clique na Chapa (mm)
  } | null>(null);
  const [editingPartId, setEditingPartId] = useState<string | null>(null);

  const [gap, setGap] = useState(5);
  const [margin, setMargin] = useState(5);
  const [strategy, setStrategy] = useState<
    | "guillotine"
    | "true-shape"
    | "true-shape-v2"
    | "true-shape-v3"
    | "wise"
    | "nfp" // <--- Adicione | "nfp"
  >("true-shape-v2");
  const [direction, setDirection] = useState<
    "auto" | "vertical" | "horizontal"
  >("horizontal");
  const [iterations] = useState(50);
  const [rotationStep] = useState(90);
  const [isComputing, setIsComputing] = useState(false);
  const [calculationTime, setCalculationTime] = useState<number | null>(null);
  const [failedCount, setFailedCount] = useState(0);

  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<{ [key: string]: number }>(
    () => {
      const initialQ: { [key: string]: number } = {};
      initialParts.forEach((p) => {
        initialQ[p.id] = p.quantity || 1;
      });
      return initialQ;
    },
  );

  const [disabledNestingIds, setDisabledNestingIds] = useState<Set<string>>(
    new Set(),
  );

  const [collidingPartIds, setCollidingPartIds] = useState<string[]>([]);
  const collisionWorkerRef = useRef<Worker | null>(null);
  const nestingWorkerRef = useRef<Worker | null>(null);
  const wiseNestingWorkerRef = useRef<Worker | null>(null);
  const smartNestNewWorkerRef = useRef<Worker | null>(null);
  const smartNestV3WorkerRef = useRef<Worker | null>(null);

  useEffect(() => {
    collisionWorkerRef.current = new Worker(
      new URL("../workers/collision.worker.ts", import.meta.url),
    );

    collisionWorkerRef.current.onmessage = (e: MessageEvent) => {
      const collisions = e.data as string[];
      setCollidingPartIds(collisions);

      if (collisions.length > 0) {
        alert(
          `⚠️ ALERTA DE COLISÃO!\n\n${collisions.length} peças com problemas marcadas em VERMELHO.`,
        );
      } else {
        alert("✅ Verificação Completa! Nenhuma colisão.");
      }
    };

    return () => {
      collisionWorkerRef.current?.terminate();
    };
  }, []);

  // ⬇️ --- [INSERÇÃO 2] LÓGICA DO ARRASTO (MOUSE MOVE) --- ⬇️
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingSidebar) return;

      // A largura é: Largura da Janela - Posição X do Mouse
      // (Porque a barra está na direita, quanto menor o X, maior a barra)
      const newWidth = window.innerWidth - e.clientX;

      // Limites
      const minWidth = 500;
      const maxWidth = window.innerWidth * 0.5; // 50% da tela

      // Aplica com as restrições
      setSidebarWidth(Math.max(minWidth, Math.min(maxWidth, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizingSidebar(false);
      document.body.style.cursor = "default"; // Restaura cursor
    };

    if (isResizingSidebar) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "ew-resize"; // Força cursor de redimensionamento
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "default";
    };
  }, [isResizingSidebar]);
  // ⬆️ --------------------------------------------------- ⬆️

  const thumbnailRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const {
    labelStates,
    setLabelStates,
    globalWhiteEnabled,
    globalPinkEnabled,
    toggleGlobal,
    togglePartFlag,
    updateLabelConfig,
  } = useLabelManager(parts);

  // --- HOOKS ---
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
    startNesting: startNfpNesting,
    isNesting: isNfpRunning,
    progress: nfpProgress,
    placedParts: nfpResultData,
  } = useNfpNesting(binSize.width, binSize.height);

  // --- AUTO-SAVE HOOK ---
  // Agrupa o estado atual para passar para o hook
  const currentAutoSaveState = useMemo(
    () => ({
      nestingResult,
      parts,
      quantities,
      binSize,
      totalBins,
      currentBinIndex,
      cropLines,
      calculationTime,
      labelStates,
    }),
    [
      nestingResult,
      parts,
      quantities,
      binSize,
      totalBins,
      currentBinIndex,
      cropLines,
      calculationTime,
      labelStates,
    ],
  );

  const { loadSavedState, clearSavedState } = useNestingAutoSave(
    isTrial,
    currentAutoSaveState,
  );

  // --- EFEITO: RESTAURAÇÃO DE ESTADO (AUTO-LOAD) ---
  // [NestingBoard.tsx]

  // --- EFEITO: RESTAURAÇÃO DE ESTADO (SEM DELAY E SEM TELA BRANCA) ---
  // [NestingBoard.tsx]

  // --- EFEITO: RESTAURAÇÃO DE ESTADO ---
  useEffect(() => {
    const restoreSession = () => {
      // Cenário A: Veio da Engenharia (Prioridade)
      if (initialParts && initialParts.length > 0) {
        setIsRestoring(false); // Libera a tela imediatamente
        return;
      }

      // Cenário B: Tenta restaurar do LocalStorage
      const savedData = loadSavedState();

      if (savedData && !isTrial) {
        if (savedData.parts.length > 0 || savedData.nestingResult.length > 0) {
          console.log("Restaurando sessão...");
          
          // Carrega todos os dados
          setParts(savedData.parts);
          setQuantities(savedData.quantities);
          setNestingResult(savedData.nestingResult);
          setBinSize(savedData.binSize);
          setTotalBins(savedData.totalBins);
          setCurrentBinIndex(savedData.currentBinIndex);
          if (setCropLines) setCropLines(savedData.cropLines);
          if (savedData.labelStates) setLabelStates(savedData.labelStates);
          if (savedData.calculationTime !== undefined) setCalculationTime(savedData.calculationTime);
        }
      }
      
      // FINALMENTE: Desliga o loader (mesmo se não tiver dados)
      setIsRestoring(false);
    };

    // Pequeno timeout (0ms ou 50ms) ajuda a garantir que o navegador renderize o loader antes de travar processando o JSON
    setTimeout(restoreSession, 50);

  }, [
    initialParts, isTrial, loadSavedState, setParts, setQuantities, 
    setNestingResult, setBinSize, setTotalBins, setCurrentBinIndex, 
    setCropLines, setCalculationTime, setLabelStates
  ]);

  const {
    isSaving,
    lockedBins,
    handleProductionDownload,
    getPartStatus,
    resetProduction,
  } = useProductionManager(binSize);

  // --- NOVO HOOK DE REGISTRO ---
  const { registerProduction } = useProductionRegister();

  // =========================================================
  // --- INÍCIO DA LÓGICA DO NOVO MODAL DE BUSCA (Passos 1 e 2) ---
  // =========================================================

  // 1. ESTADOS (Substitua o antigo state do availableOrders por este bloco)
  const [availableOrders, setAvailableOrders] = useState<AvailableOrder[]>([]); // Note a tipagem <AvailableOrder[]>
  const [expandedOrders, setExpandedOrders] = useState<string[]>([]); // Controle do Accordion
  const [selectedOps, setSelectedOps] = useState<string[]>([]); // Controle das OPs
  const [loadingOrders, setLoadingOrders] = useState(false); // (Mantenha se já existir)

  // 2. BUSCA DE DADOS (Substitua o useEffect antigo de busca)
  useEffect(() => {
    if (isSearchModalOpen && user?.token) {
      setLoadingOrders(true);
      fetch("http://localhost:3001/api/pedidos/disponiveis", {
        headers: { Authorization: `Bearer ${user.token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setAvailableOrders(data);
        })
        .catch((err) => console.error("Erro ao carregar pedidos:", err))
        .finally(() => setLoadingOrders(false));
    }
  }, [isSearchModalOpen, user]);

  // Adicione isso junto com os outros useEffects
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Tenta enviar um sinal de desbloqueio ao fechar a aba
      if (user && user.token) {
        const url = "http://localhost:3001/api/pedidos/unlock";
        const data = JSON.stringify({});
        const blob = new Blob([data], { type: "application/json" });
        // Navigator.sendBeacon é mais confiável para eventos de fechamento de aba
        navigator.sendBeacon(url, blob);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [user]);

  // Efeito para carregar a lista quando o modal abrir
  useEffect(() => {
    if (isSearchModalOpen && user?.token) {
      setLoadingOrders(true);
      fetch("http://localhost:3001/api/pedidos/disponiveis", {
        headers: { Authorization: `Bearer ${user.token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          // O backend agora retorna [{ pedido: "...", ops: [...] }, ...]
          if (Array.isArray(data)) setAvailableOrders(data);
        })
        .catch((err) => console.error("Erro ao carregar pedidos:", err))
        .finally(() => setLoadingOrders(false));
    }
  }, [isSearchModalOpen, user]);

  // --- LÓGICA DE SELEÇÃO HIERÁRQUICA ---

  // 3. FUNÇÕES DE CONTROLE (Adicione estas funções)

  // Expandir/Recolher lista de OPs
  const toggleExpandOrder = (pedido: string) => {
    setExpandedOrders((prev) =>
      prev.includes(pedido)
        ? prev.filter((p) => p !== pedido)
        : [...prev, pedido],
    );
  };

  // --- FUNÇÃO CORRIGIDA PARA EXTRAIR O NOME DA OP ---
  const toggleOrderSelection = (pedidoStr: string) => {
    const orderData = availableOrders.find((o) => o.pedido === pedidoStr);

    // CORREÇÃO AQUI: Mapeamos para pegar apenas o NOME das OPs
    // Se orderData.ops for undefined, retorna array vazio
    const orderOpNames = orderData?.ops?.map((o) => o.name) || [];

    const currentList = searchQuery
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const isSelected = currentList.includes(pedidoStr);

    let newList;
    let newSelectedOps = [...selectedOps];

    if (isSelected) {
      // DESMARCAR: Remove o pedido da lista de busca
      newList = currentList.filter((s) => s !== pedidoStr);
      // Remove todas as OPs deste pedido da lista de OPs selecionadas
      newSelectedOps = newSelectedOps.filter(
        (opName) => !orderOpNames.includes(opName),
      );
    } else {
      // MARCAR: Adiciona o pedido
      newList = [...currentList, pedidoStr];

      // Adiciona todas as OPs do pedido (apenas se já não estiverem na lista)
      orderOpNames.forEach((opName) => {
        if (!newSelectedOps.includes(opName)) {
          newSelectedOps.push(opName);
        }
      });

      // Auto-expandir visualmente
      if (!expandedOrders.includes(pedidoStr)) {
        setExpandedOrders((prev) => [...prev, pedidoStr]);
      }
    }

    setSearchQuery(newList.join(", "));
    setSelectedOps(newSelectedOps);
  };

  // 3. Selecionar/Deselecionar OP (Filho)
  const toggleOpSelection = (op: string, parentPedido: string) => {
    // Atualiza lista de OPs
    let newOpsList;
    if (selectedOps.includes(op)) {
      newOpsList = selectedOps.filter((o) => o !== op);
    } else {
      newOpsList = [...selectedOps, op];
    }
    setSelectedOps(newOpsList);

    // LÓGICA DE VÍNCULO COM O PAI:
    // Se selecionei uma OP, garanto que o Pedido Pai esteja marcado no input
    const currentOrders = searchQuery
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!currentOrders.includes(parentPedido)) {
      const newOrders = [...currentOrders, parentPedido];
      setSearchQuery(newOrders.join(", "));
    }
    // Nota: Se desmarcar todas as OPs, optamos por MANTER o pedido pai marcado
    // para não causar confusão visual, mas o usuário pode desmarcar o pai se quiser.
  };

  const { isBinSaved, markBinAsSaved, resetAllSaveStatus } =
    useNestingSaveStatus(nestingResult);

  // --- INTEGRAÇÃO: GERENCIADOR DE ARQUIVO LOCAL ---
  const { handleSaveProject, handleLoadProject, fileInputRef } =
    useNestingFileManager({
      currentState: {
        parts,
        quantities,
        nestingResult,
        binSize,
        totalBins,
        currentBinIndex,
        cropLines,
        gap,
        margin,
        strategy:
          strategy === "true-shape-v2" ||
          strategy === "true-shape-v3" ||
          strategy === "nfp"
            ? "true-shape"
            : strategy,
        direction,
        labelStates,
        disabledNestingIds,
      },
      setters: {
        setParts,
        setQuantities,
        setNestingResult,
        setBinSize,
        setTotalBins,
        setCurrentBinIndex,
        setCropLines,
        setGap,
        setMargin,
        setStrategy,
        setDirection,
        setLabelStates,
        setDisabledNestingIds,
        resetProduction, // Agora o erro vai sumir
        resetAllSaveStatus, // Agora o erro vai sumir
      },
    });
  // ------------------------------------------------
  // --- VARIÁVEIS DERIVADAS ---
  const isCurrentSheetSaved = isBinSaved(currentBinIndex);

  // =====================================================================
  // NOVO: LÓGICA DO CHECKBOX "SELECIONAR TODOS"
  // =====================================================================
  const isAllEnabled = useMemo(() => {
    if (parts.length === 0) return false;
    // Se não houver nenhum ID na lista de bloqueados, então todos estão habilitados
    return parts.every((p) => !disabledNestingIds.has(p.id));
  }, [parts, disabledNestingIds]);

  const handleToggleAll = useCallback(() => {
    if (isAllEnabled) {
      // Se está tudo marcado -> Desmarca tudo (Adiciona todos os IDs na lista de bloqueio)
      const allIds = parts.map((p) => p.id);
      setDisabledNestingIds(new Set(allIds));
    } else {
      // Se não está tudo marcado -> Marca tudo (Limpa a lista de bloqueio)
      setDisabledNestingIds(new Set());
    }
  }, [isAllEnabled, parts]);
  // =====================================================================

  const displayedParts = useMemo(() => {
    const filtered = parts.filter((p) => {
      // ⬇️ CORREÇÃO: Função auxiliar para limpar espaços invisíveis
      const clean = (val: string) => String(val || "").trim();

      const matchPedido =
        filters.pedido.length === 0 || filters.pedido.includes(p.pedido);
      const matchOp = filters.op.length === 0 || filters.op.includes(p.op);

      // ⬇️ Comparação Inteligente (Ignora espaços)
      const matchMaterial =
        !filters.material || clean(p.material) === filters.material;

      const matchEspessura =
        !filters.espessura || clean(p.espessura) === filters.espessura;
      // ⬆️ ------------------------------------

      return matchPedido && matchOp && matchMaterial && matchEspessura;
    });

    return filtered.map((part) => {
      const state = labelStates[part.id];
      if (!state) return part;
      const bounds = calculateBoundingBox(part.entities, part.blocks);
      const newEntities = [...part.entities];
      // 1. DEFINE O TEXTO PADRÃO (FALLBACK)
      // Se o usuário não digitou nada, usamos: Pedido > OP > Vazio (sem nome de arquivo)
      const defaultText = part.pedido || part.op || "";

      // Função auxiliar que decide qual texto usar e gera o vetor
      // Adicione o import no topo do arquivo se não houver:
      // import { calculateSmartLabel } from "../utils/labelUtils";

      const addLabelVector = (
        config: LabelConfig,
        color: string,
        type: "white" | "pink",
      ) => {
        // Texto: Configurado ou Padrão
        const textToRender = config.text ? config.text : defaultText;

        if (config.active && textToRender) {
          const isCircular = part.entities.some((e) => e.type === "CIRCLE");

          // 1. Define o tamanho da fonte (Editado pelo usuário ou Padrão do Tipo)
          // Se o usuário nunca editou, config.fontSize pode ser undefined/0, então assumimos o padrão.
          const baseSize = config.fontSize || (type === "pink" ? 6 : 38);

          // 2. Calcula a Posição Inteligente (Sugestão)
          const { smartRotation, suggestedFontSize, smartX, smartY } =
            calculateSmartLabel(
              part.width,
              part.height,
              textToRender,
              type,
              isCircular,
              baseSize,
              5,
            );

          // 3. Sistema de Prioridades: Manual vs Automático

          // Detecta se o usuário já moveu a etiqueta manualmente
          // (Assumimos que etiquetas ROSA na posição 0,0 estão no estado "virgem")
          const userHasMoved = config.offsetX !== 0 || config.offsetY !== 0;

          // Detecta se o usuário girou manualmente
          const userHasRotated = config.rotation !== 0;

          // -- APLICAÇÃO FINAL --

          // Posição: Se moveu, usa a do usuário. Se não, usa a Smart (Canto).
          const finalOffsetX = userHasMoved ? config.offsetX : smartX;
          const finalOffsetY = userHasMoved ? config.offsetY : smartY;

          // Rotação: Soma a rotação manual com a inteligente
          // Ex: Smart é 90º. Usuário adicionou 45º. Final = 135º.
          const finalRotation =
            (config.rotation + (userHasRotated ? 0 : smartRotation)) % 360;

          // Tamanho: Prioriza o config do usuário se existir, senão usa o sugerido
          const finalFontSize = config.fontSize || suggestedFontSize;

          // -- GERAÇÃO DOS VETORES --
          const posX = bounds.cx + finalOffsetX;
          const posY = bounds.cy + finalOffsetY;

          const vectorLines = textToVectorLines(
            textToRender,
            posX,
            posY,
            finalFontSize,
            color,
          );

          const rotatedLines = vectorLines.map((line: any) => {
            if (finalRotation === 0) return line;

            const rotatePoint = (x: number, y: number) => {
              const rad = (finalRotation * Math.PI) / 180;
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

      // Adiciona as etiquetas
      addLabelVector(state.white, theme.partLabel, "white");
      addLabelVector(state.pink, "#FF00FF", "pink");
      return { ...part, entities: newEntities };
    });
  }, [parts, filters, labelStates, theme]);

  // --- SINCRONIZAÇÃO DO NFP COM A MESA ---
  useEffect(() => {
    if (strategy === "nfp" && !isNfpRunning && nfpResultData.length > 0) {
      setNestingResult(nfpResultData);

      const totalRequested = displayedParts.filter(
        (p) => !disabledNestingIds.has(p.id),
      ).length;
      const totalPlaced = nfpResultData.length;
      setFailedCount(Math.max(0, totalRequested - totalPlaced));

      // 👇👇👇 CÓDIGO NOVO PARA DETECTAR TOTAL DE CHAPAS 👇👇👇
      // Descobre qual foi o maior ID de chapa gerado
      const maxBinId = nfpResultData.reduce(
        (max, p) => Math.max(max, p.binId),
        0,
      );
      setTotalBins(maxBinId + 1); // Se o ID for 2, temos 3 chapas (0, 1, 2)
      // 👆👆👆 ------------------------------------------- 👆👆👆

      setIsComputing(false);

      if (totalPlaced === 0) alert("Nenhuma peça coube (NFP Nest)!");
    }
  }, [
    isNfpRunning,
    nfpResultData,
    strategy,
    displayedParts,
    disabledNestingIds,
    setNestingResult,
    setTotalBins,
  ]); // Adicione setTotalBins nas dependências

  const currentPlacedParts = useMemo(
    () => nestingResult.filter((p) => p.binId === currentBinIndex),
    [nestingResult, currentBinIndex],
  );

  // --- CÁLCULO DE EFICIÊNCIA, RETALHO E CONSUMO (CORRIGIDO) ---
  const currentEfficiencies = useMemo(() => {
    const partsInSheet = nestingResult.filter(
      (p) => p.binId === currentBinIndex,
    );

    if (partsInSheet.length === 0) {
      return {
        real: "0,0",
        effective: "0,0",
        consumption: "0,0",
        // CORREÇÃO AQUI: Adicionado .toFixed(0) para converter number -> string
        remnantHeight: binSize.height.toFixed(0),
        remnantArea: ((binSize.width * binSize.height) / 1000000).toFixed(2),
        isManual: false,
      };
    }

    // 1. Soma da Área Líquida das Peças
    const usedNetArea = partsInSheet.reduce((acc, placed) => {
      const original = parts.find((p) => p.id === placed.partId);
      return acc + (original?.netArea || original?.grossArea || 0);
    }, 0);

    const totalBinArea = binSize.width * binSize.height;

    // 2. Determina o Limite de Uso (Bounding Box Automático)
    let maxUsedY = 0;

    partsInSheet.forEach((placed) => {
      const original = parts.find((p) => p.id === placed.partId);
      if (original) {
        const dims = calculateRotatedDimensions(
          original.width,
          original.height,
          placed.rotation,
        );
        const topY = placed.y + dims.height;
        if (topY > maxUsedY) maxUsedY = topY;
      }
    });

    // 3. Verifica se existe Linha de Retalho Manual
    const hLine = cropLines.find((l) => l.type === "horizontal");
    const vLine = cropLines.find((l) => l.type === "vertical");

    const limitY = hLine ? hLine.position : maxUsedY;
    const limitX = vLine ? vLine.position : binSize.width;

    const effectiveWidth = limitX;
    const effectiveHeight = Math.max(limitY, 1);

    // Área Efetiva (Retângulo usado da chapa)
    const effectiveUsedArea = effectiveWidth * effectiveHeight;

    // 4. Cálculos Finais
    const realYield = (usedNetArea / totalBinArea) * 100;
    const effectiveYield = (usedNetArea / effectiveUsedArea) * 100;
    const consumptionYield = (effectiveUsedArea / totalBinArea) * 100;

    const remnantAreaMM = totalBinArea - effectiveUsedArea;
    const remnantLinearY = binSize.height - effectiveHeight;

    return {
      real: realYield.toFixed(1).replace(".", ","),
      effective: Math.min(effectiveYield, 100).toFixed(1).replace(".", ","),
      consumption: Math.min(consumptionYield, 100).toFixed(1).replace(".", ","),
      remnantHeight: remnantLinearY.toFixed(0), // Aqui já estava retornando string
      remnantArea: (remnantAreaMM / 1000000).toFixed(2),
      isManual: !!(hLine || vLine),
    };
  }, [nestingResult, currentBinIndex, parts, binSize, cropLines]);

  const activeSelectedPartIds = useMemo(() => {
    const ids = new Set<string>();
    selectedPartIds.forEach((id) => ids.add(id));
    nestingResult.forEach((placed) => {
      if (selectedPartIds.includes(placed.uuid)) ids.add(placed.partId);
    });
    return ids;
  }, [selectedPartIds, nestingResult]);

  // --- NOVO: Verifica se a seleção atual contém peças travadas ---
  const isSelectionLocked = useMemo(() => {
    if (selectedPartIds.length === 0) return false;

    return selectedPartIds.some((uuid) => {
      // 1. Tenta achar a peça posicionada na mesa
      const placedPart = nestingResult.find((p) => p.uuid === uuid);

      // 2. Descobre o ID original (seja da mesa ou da lista lateral)
      const realPartId = placedPart ? placedPart.partId : uuid;

      // 3. Busca a configuração original da peça
      const originalPart = parts.find((p) => p.id === realPartId);

      // 4. Retorna verdadeiro se tiver a trava
      return originalPart?.isRotationLocked === true;
    });
  }, [selectedPartIds, nestingResult, parts]);

  // ... (outros useEffects)

  // =====================================================================
  // --- NOVO: SINCRONIZAR FILTRO COM A MESA DE CORTE ---
  // =====================================================================
  useEffect(() => {
    // 1. Verifica se há peças posicionadas na mesa
    if (nestingResult.length > 0) {
      // Pega a primeira peça da mesa para usar como referência
      const firstPlaced = nestingResult[0];
      const partInfo = parts.find((p) => p.id === firstPlaced.partId);

      if (partInfo) {
        setFilters((prev) => {
          // 1. Declara as variáveis limpas
          const cleanMat = String(partInfo.material || "").trim();
          const cleanThick = String(partInfo.espessura || "").trim();

          // 2. USA as variáveis na comparação (Aqui estava o erro: você devia estar usando partInfo ainda)
          if (prev.material !== cleanMat || prev.espessura !== cleanThick) {
            // 3. USA as variáveis na atualização
            return {
              ...prev,
              material: cleanMat,
              espessura: cleanThick,
            };
          }
          return prev;
        });
      }
    }
  }, [nestingResult, parts]);

  // --- 4. EFEITOS (COM SEGURANÇA AGORA) ---
  useEffect(() => {
    if (initialSearchQuery && parts.length === 0) {
      const timer = setTimeout(() => {
        const doAutoSearch = async () => {
          if (!initialSearchQuery) return;
          // SEGURANÇA: Se não estiver logado ou carregando usuário, não faz a busca ainda
          if (!user || !user.token) return;

          setIsSearching(true);
          try {
            const params = new URLSearchParams();
            params.append("pedido", initialSearchQuery);
            const response = await fetch(
              `http://localhost:3001/api/pecas/buscar?${params.toString()}`,
              {
                method: "GET",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${user.token}`, // <--- TOKEN ADICIONADO
                },
              },
            );
            if (response.status === 404) {
              alert(
                `Nenhuma peça encontrada para o pedido: ${initialSearchQuery}`,
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
                isRotationLocked: item.isRotationLocked,
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
  }, [initialSearchQuery, user]); // eslint-disable-line

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

  const handleBackgroundContextMenu = useCallback(
    (e: React.MouseEvent, coords?: { x: number; y: number }) => {
      e.preventDefault();

      // Agora salvamos no 'setSheetMenu' (Menu da Chapa)
      setSheetMenu({
        x: e.clientX,
        y: e.clientY,
        // Se coords vier do InteractiveCanvas, usamos. Se não, 0.
        binX: coords ? coords.x : 0,
        binY: coords ? coords.y : 0,
        lineId: undefined, // Sem ID de linha significa que clicou no fundo
      });
    },
    [],
  );

  const handleLineContextMenu = useCallback(
    (e: React.MouseEvent, lineId: string, binX: number, binY: number) => {
      e.preventDefault();
      // Salva a posição da tela (x,y) E a posição na chapa (binX, binY)
      setSheetMenu({
        x: e.clientX,
        y: e.clientY,
        lineId,
        binX,
        binY,
      });
    },
    [],
  );

  const handleAddCropLineWrapper = useCallback(
    (type: "horizontal" | "vertical") => {
      // Valor padrão (meio da chapa) caso algo falhe
      let position =
        type === "vertical" ? binSize.width / 2 : binSize.height / 2;

      // Se tivermos a posição do clique salva, usamos ela!
      if (
        sheetMenu &&
        sheetMenu.binX !== undefined &&
        sheetMenu.binY !== undefined
      ) {
        position = type === "vertical" ? sheetMenu.binX : sheetMenu.binY;
      }

      addCropLine(type, position);
      setSheetMenu(null); // Fecha o menu após adicionar
    },
    [addCropLine, binSize, sheetMenu], // Adicione sheetMenu nas dependências
  );

  const handleDeleteSheetWrapper = useCallback(() => {
    handleDeleteCurrentBin(nestingResult, setNestingResult);
  }, [handleDeleteCurrentBin, nestingResult, setNestingResult]);

  // =================================================================
  // --- INSERÇÃO: ESTADO E CÁLCULO DOS RETALHOS (REMNANTS) ---
  // =================================================================
  const [calculatedRemnants, setCalculatedRemnants] = useState<RemnantRect[]>([]);

  // Limpa os retalhos visuais se o usuário apagar todas as linhas de corte
  useEffect(() => {
    if (cropLines.length === 0 && calculatedRemnants.length > 0) {
      setCalculatedRemnants([]);
    }
  }, [cropLines, calculatedRemnants]);

  const handleCalculateRemnants = useCallback(() => {
    if (cropLines.length === 0) {
      alert("Adicione pelo menos uma linha de corte antes de definir os retalhos.");
      setSheetMenu(null);
      return;
    }

    // 1. Descobre os limites X e Y formados pelas linhas atuais
    const { cutX, cutY } = resolveCropLines(binSize.width, binSize.height, cropLines);

    // 2. Calcula os retângulos perfeitos usando a nossa regra de negócio
    const optimalRemnants = calculateOptimalRemnants(binSize.width, binSize.height, cutX, cutY);

    // 3. Salva no estado para a tela desenhar as cores
    setCalculatedRemnants(optimalRemnants);
    
    // ===============================================================
    // 4. --- AUTO-TRIM MÁGICO PARA O LASER ---
    // ===============================================================
    // Verificamos o ID do retalho gerado para saber quem ganhou o direito de passagem
    const isHorizontalWinner = optimalRemnants.some(r => r.id === 'retalho-primario-horizontal');
    const isVerticalWinner = optimalRemnants.some(r => r.id === 'retalho-primario-vertical');

    if (isHorizontalWinner || isVerticalWinner) {
      // Atualiza as linhas no Canvas automaticamente (Se houver a função setCropLines)
      if (setCropLines) {
        setCropLines(prev => prev.map(line => {
          if (line.type === 'vertical') {
            // Se a horizontal venceu, a vertical bate nela e para (max = cutY). Se não, vai até o topo.
            return { ...line, max: isHorizontalWinner ? cutY : binSize.height, min: 0 };
          }
          if (line.type === 'horizontal') {
            // Se a vertical venceu, a horizontal bate nela e para (max = cutX). Se não, vai até a lateral.
            return { ...line, max: isVerticalWinner ? cutX : binSize.width, min: 0 };
          }
          return line;
        }));
      }
    }
    // ===============================================================

    setSheetMenu(null); // Fecha o menu de contexto
  }, [cropLines, binSize, setCropLines]); // <-- GARANTA QUE O setCropLines ESTÁ AQUI
  // =================================================================

  useEffect(() => {
    if (selectedPartIds.length > 0) {
      // Pega o último ID selecionado
      const lastId = selectedPartIds[selectedPartIds.length - 1];

      // Tenta descobrir o ID da peça (seja selecionado via UUID da mesa ou ID direto do banco)
      let partIdToScroll = nestingResult.find((p) => p.uuid === lastId)?.partId;

      // Se não achou na mesa, assume que o ID selecionado é o próprio ID da peça (ex: clique na lista)
      if (!partIdToScroll) {
        if (parts.some((p) => p.id === lastId)) {
          partIdToScroll = lastId;
        }
      }

      if (partIdToScroll) {
        // Pequeno timeout para garantir que a aba trocou e o DOM renderizou
        setTimeout(() => {
          const element = thumbnailRefs.current[partIdToScroll];
          if (element) {
            element.scrollIntoView({
              behavior: "smooth",
              block: "center", // "center" ou "start" para forçar a visão
            });
          }
        }, 100);
      }
    }
  }, [selectedPartIds, nestingResult, activeTab, parts]); // Adicionei activeTab e parts

  const handleReturnToBank = useCallback(
    (uuidsToRemove: string[]) => {
      // 1. Calcula como ficará a mesa antes de atualizar o estado
      const newResult = nestingResult.filter(
        (p) => !uuidsToRemove.includes(p.uuid),
      );

      // 2. Verifica se limpou tudo (ou se a lista resultante está vazia)
      const isRemovingAll = uuidsToRemove.length === nestingResult.length;

      if (newResult.length === 0 || isRemovingAll) {
        // Se o hook já foi atualizado no Passo 1, isso funcionará
        if (setCropLines) setCropLines([]);
      }

      // 3. Atualiza o estado das peças
      setNestingResult(newResult);

      // 4. Lógica de Scroll (mantida)
      const targetPlaced = nestingResult.find((p) =>
        uuidsToRemove.includes(p.uuid),
      );
      const partIdToScroll = targetPlaced?.partId;

      setSelectedPartIds([]);

      if (partIdToScroll) {
        setTimeout(() => {
          const element = thumbnailRefs.current[partIdToScroll];
          if (element)
            element.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }
    },
    [nestingResult, setNestingResult, setCropLines],
  );

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
      // --- CORREÇÃO: DEVOLVER AO BANCO (DELETE) ---
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedPartIds.length > 0) {
          e.preventDefault();
          // Chama a função que já existia, mas não era usada
          handleReturnToBank(selectedPartIds);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo, selectedPartIds, handleReturnToBank]);

  // ... (outros useEffects)

  // =====================================================================
  // --- CORREÇÃO: RESETAR MESA AO MUDAR O FILTRO ---
  // =====================================================================
  useEffect(() => {
    // 1. Se a mesa já está vazia, não precisa fazer nada
    if (nestingResult.length === 0) return;

    // 2. Descobre o material das peças que estão atualmente na mesa
    const firstPlaced = nestingResult[0];
    const partOnTable = parts.find((p) => p.id === firstPlaced.partId);

    if (!partOnTable) return;

    // 3. Verifica se houve um conflito
    // ⬇️ CORREÇÃO: Função auxiliar para limpar espaços invisíveis
    const clean = (val: string) => String(val || "").trim();

    // 3. Verifica se houve um conflito (Comparando limpo com limpo)
    // Se o filtro estiver vazio, não há conflito.
    const materialConflict =
      filters.material &&
      clean(filters.material) !== clean(partOnTable.material);

    const thicknessConflict =
      filters.espessura &&
      clean(filters.espessura) !== clean(partOnTable.espessura);

    // 4. Se houver conflito REAL, reseta tudo
    if (materialConflict || thicknessConflict) {
      console.log("♻️ Filtro alterado: Limpando mesa incompatível...");
      console.log(
        `Filtro: '${filters.material}' vs Peça: '${partOnTable.material}'`,
      );

      resetNestingResult([]);
      setTotalBins(1);
      setCurrentBinIndex(0);
      setFailedCount(0);
      resetAllSaveStatus();
      if (setCropLines) setCropLines([]);
    }
  }, [
    filters.material,
    filters.espessura,
    nestingResult, // O nestingResult muda quando o cálculo termina, disparando esta verificação
    parts,
    resetNestingResult,
    setTotalBins,
    setCurrentBinIndex,
    resetAllSaveStatus,
    setCropLines,
  ]);
  const handleSaveClick = async () => {
    // Validação básica se tem peças
    const partsInBin = nestingResult.filter((p) => p.binId === currentBinIndex);
    if (partsInBin.length === 0 && cropLines.length === 0) return;

    // 1. Prepara a densidade numérica
    let densidadeNumerica = 0;
    if (currentEfficiencies && currentEfficiencies.effective) {
      densidadeNumerica = Number(
        currentEfficiencies.effective.replace(",", "."),
      );
    }

    // 2. ETAPA BANCO DE DADOS (Usa o registerProduction)
    // ETAPA BANCO DE DADOS
    let bancoSalvoComSucesso = false;

    if (user && user.token) {
      const registro = await registerProduction({
        nestingResult,
        currentBinIndex,
        parts: displayedParts,
        user,
        cropLines,
        motor:
          strategy === "true-shape-v2" ||
          strategy === "true-shape-v3" ||
          strategy === "nfp"
            ? "true-shape"
            : strategy,

        // NOVOS PARÂMETROS
        binWidth: binSize.width,
        binHeight: binSize.height,
        metricas: currentEfficiencies, // <--- Passamos o objeto inteiro calculado no useMemo
      });

      if (registro.success) {
        bancoSalvoComSucesso = true;
        markBinAsSaved(currentBinIndex);
      } else {
        console.warn("Aviso do banco:", registro.message);
      }
    }

    // 3. ETAPA ARQUIVO DXF (Usa o handleProductionDownload)
    // Passamos 'bancoSalvoComSucesso' para que ele saiba que não precisa tentar salvar de novo
    await handleProductionDownload(
      nestingResult,
      currentBinIndex,
      displayedParts,
      cropLines,
      null, // User null para garantir que o manager antigo não tente salvar no banco
      densidadeNumerica,
      bancoSalvoComSucesso, // <--- O PARÂMETRO MAIS IMPORTANTE
    );
  };

  const handleCalculate = useCallback(() => {
    // 1. Identifica quais peças vão para o cálculo
    const partsToNest = displayedParts.filter(
      (p) => !disabledNestingIds.has(p.id),
    );

    if (partsToNest.length === 0) {
      alert("Selecione pelo menos uma peça.");
      return;
    }

    // Validação de Material (Segurança)
    const refMat = partsToNest[0].material;
    const refThick = partsToNest[0].espessura;
    if (
      partsToNest.some((p) => p.material !== refMat || p.espessura !== refThick)
    ) {
      alert("Mistura de materiais detectada! Filtre antes de calcular.");
      return;
    }

    // Reset Prévio
    if (nestingResult.length > 0) {
      if (!confirm("Recalcular o arranjo? Isso limpará a mesa atual.")) return;
    }

    const startTime = Date.now();
    setCalculationTime(null);
    setIsComputing(true);
    resetNestingResult([]);
    setCurrentBinIndex(0);
    setTotalBins(1);
    setSelectedPartIds([]);
    resetAllSaveStatus();

    // --- DECISÃO DO MOTOR ---

    if (strategy === "guillotine") {
      // --- 1. MOTOR GUILHOTINA (Síncrono / Main Thread) ---
      // Como é matemática simples, é instantâneo, não precisa de Worker.
      setTimeout(() => {
        // Timeout minúsculo só para o UI atualizar o loading
        const result = runGuillotineNesting(
          partsToNest,
          quantities,
          binSize.width,
          binSize.height,
          direction,
        );

        const duration = (Date.now() - startTime) / 1000;
        setCalculationTime(duration);
        resetNestingResult(result.placed);
        setFailedCount(result.failed.length);
        setTotalBins(result.totalBins || 1);
        setIsComputing(false);

        if (result.placed.length === 0) alert("Nenhuma peça coube!");
      }, 50);
    } else if (strategy === "nfp") {
      // --- MOTOR NFP (NOVO) ---
      startNfpNesting(partsToNest);
      // O loading será controlado pelo useEffect que criamos no passo 4
    } else if (strategy === "wise") {
      // --- 3. MOTOR WISE NEST (Clipper / Geometria Real) ---
      if (wiseNestingWorkerRef.current)
        wiseNestingWorkerRef.current.terminate();

      // Inicializa em modo Clássico para permitir importScripts no Worker
      wiseNestingWorkerRef.current = new Worker(
        new URL("../workers/wiseNesting.worker.ts", import.meta.url),
        { type: "classic" },
      );

      wiseNestingWorkerRef.current.onmessage = (e) => {
        const { type, progress, message, result } = e.data;

        if (type === "PROGRESS") {
          // Opcional: Você pode criar um estado para mostrar "Processando 10%..."
          console.log(`[WiseNest] ${progress}% - ${message}`);
        } else if (type === "COMPLETED") {
          const duration = (Date.now() - startTime) / 1000;
          setCalculationTime(duration);

          // Atualiza a mesa com o resultado
          if (result.placed && result.placed.length > 0) {
            resetNestingResult(result.placed);
            setFailedCount(result.failed.length);
            setTotalBins(result.totalBins || 1);
          } else {
            alert("Nenhuma peça coube com as configurações atuais.");
          }

          setIsComputing(false);
        } else if (type === "ERROR") {
          console.error("Erro no Wise Nest:", message);
          setIsComputing(false);
          alert("Erro técnico no processamento do Nesting.");
        }
      };

      // Envia os dados PLANOS, exatamente como o Worker novo espera
      wiseNestingWorkerRef.current.postMessage({
        type: "START_NESTING", // Comando explicito
        parts: JSON.parse(JSON.stringify(partsToNest)),
        quantities, // Objeto { "id": quantidade }
        binWidth: binSize.width,
        binHeight: binSize.height,
        gap: Number(gap), // Força número
        margin: Number(margin), // Força número
        rotationStep: 90, // Rotação permitida (0, 90, 180, 270)
      });
    } else if (strategy === "true-shape-v3") {
      // --- 5. MOTOR SMART NEST V3 (Memória + Furos) ---
      // <--- NOVA LÓGICA AQUI
      if (smartNestV3WorkerRef.current)
        smartNestV3WorkerRef.current.terminate();
      smartNestV3WorkerRef.current = new SmartNestV3Worker();

      smartNestV3WorkerRef.current.onmessage = (e) => {
        const result = e.data;

        // --- CORREÇÃO DE SEGURANÇA ---
        // Se for apenas uma mensagem de progresso, ignoramos ou logamos (não processa como final)
        if (result.type === "progress") {
          console.log(`🚀 Processando V3: ${result.percent}%`);
          return; // Sai da função para não quebrar a tela
        }
        // -----------------------------

        const duration = (Date.now() - startTime) / 1000;
        setCalculationTime(duration);

        // Proteção extra: Garante que 'placed' e 'failed' existam antes de usar
        resetNestingResult(result.placed || []);
        setFailedCount(result.failed ? result.failed.length : 0);
        setTotalBins(result.totalBins || 1);
        setIsComputing(false);

        if (!result.placed || result.placed.length === 0) {
          alert("Nenhuma peça coube (Motor V3)!");
        }
      };

      smartNestV3WorkerRef.current.postMessage({
        parts: JSON.parse(JSON.stringify(partsToNest)),
        quantities,
        gap,
        margin,
        binWidth: binSize.width,
        binHeight: binSize.height,
        iterations,
        rotationStep,
        targetEfficiency: 96, // Meta agressiva para o V3
      });
    } else if (strategy === "true-shape-v2") {
      // --- 4. MOTOR SMART NEST V2 (First Fit / Preencher) ---
      // <--- AQUI ENTRA A LÓGICA DO NOVO MOTOR SELECIONADO NO DROPDOWN
      if (smartNestNewWorkerRef.current)
        smartNestNewWorkerRef.current.terminate();
      smartNestNewWorkerRef.current = new SmartNestNewWorker();

      smartNestNewWorkerRef.current.onmessage = (e) => {
        const result = e.data;
        const duration = (Date.now() - startTime) / 1000;
        setCalculationTime(duration);

        resetNestingResult(result.placed);
        setFailedCount(result.failed.length);
        setTotalBins(result.totalBins || 1);
        setIsComputing(false);

        if (result.placed.length === 0) alert("Nenhuma peça coube (Motor V2)!");
      };

      smartNestNewWorkerRef.current.postMessage({
        parts: JSON.parse(JSON.stringify(partsToNest)),
        quantities,
        gap,
        margin,
        binWidth: binSize.width,
        binHeight: binSize.height,
        strategy: "true-shape", // O worker interno usa a mesma lógica base
        iterations,
        rotationStep,
        direction,
      });
    } else {
      // --- 2. MOTOR SMART NEST PADRÃO (Next Fit / Original) ---
      // <--- CAI AQUI SE strategy === "true-shape"
      if (nestingWorkerRef.current) nestingWorkerRef.current.terminate();
      nestingWorkerRef.current = new NestingWorker();

      nestingWorkerRef.current.onmessage = (e) => {
        const result = e.data;
        const duration = (Date.now() - startTime) / 1000;
        setCalculationTime(duration);
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
    }
  }, [
    displayedParts,
    disabledNestingIds,
    nestingResult.length,
    resetNestingResult,
    setCurrentBinIndex,
    setTotalBins,
    resetAllSaveStatus,
    quantities,
    gap,
    margin,
    binSize,
    strategy,
    iterations,
    rotationStep,
    direction,
    startNfpNesting,
  ]);

  const handleCheckGuillotineCollisions = useCallback(() => {
    if (currentPlacedParts.length < 1) {
      alert("A mesa está vazia.");
      return;
    }

    // Usa a nova lógica simples e síncrona (não precisa de Worker pois é muito leve)
    const collisions = checkGuillotineCollisions(
      currentPlacedParts,
      parts,
      binSize.width,
      binSize.height,
    );

    setCollidingPartIds(collisions);

    if (collisions.length > 0) {
      alert(
        `⚠️ ALERTA DE GUILHOTINA!\n\n${collisions.length} peças sobrepostas ou fora da chapa.`,
      );
    } else {
      alert("✅ Corte Guilhotina Validado! Tudo OK.");
    }
  }, [currentPlacedParts, parts, binSize]);

  // --- FUNÇÃO PARA LIMPAR MESA E DESBLOQUEAR PEDIDOS ---
  const handleClearTable = useCallback(async () => {
    if (
      window.confirm(
        "ATENÇÃO: Isso limpará a mesa de corte, O BANCO DE PEÇAS e LIBERARÁ os pedidos para outros usuários. Deseja reiniciar?",
      )
    ) {
      // 1. CHAMA O DESBLOQUEIO NO SERVIDOR (Silent call - não bloqueia a UI se falhar)
      if (user && user.token) {
        try {
          await fetch("http://localhost:3001/api/pedidos/unlock", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${user.token}`,
            },
            // Body vazio = Desbloqueia TUDO que estiver preso no meu nome
            body: JSON.stringify({}),
          });
          console.log("🔓 Pedidos liberados com sucesso.");
        } catch (error) {
          console.error("Erro ao liberar pedidos:", error);
        }
      }

      // 2. LIMPEZA LOCAL (O que já existia)
      resetNestingResult([]);
      setParts([]);
      clearSavedState();
      setFailedCount(0);
      setTotalBins(1);
      setCurrentBinIndex(0);
      setSelectedPartIds([]);
      setQuantities({});
      setSearchQuery("");
      resetProduction();
      resetAllSaveStatus();
      if (setCropLines) setCropLines([]);

      // Limpa seleções do modal também, por garantia
      setSelectedOps([]);
    }
  }, [
    resetNestingResult,
    resetProduction,
    resetAllSaveStatus,
    setTotalBins,
    setCurrentBinIndex,
    setParts,
    setCropLines,
    clearSavedState,
    user, // <--- Adicione user nas dependências
  ]);

  // ⬇️ --- SUBSTITUIR ESTA FUNÇÃO INTEIRA --- ⬇️
  const handleRefreshView = useCallback(
    (e: React.MouseEvent) => {
      // 1. HARD RESET (Shift + Click) - Limpeza de Cache
      if (e.shiftKey) {
        if (
          window.confirm(
            "⚠️ LIMPEZA DE CACHE (Shift detectado):\n\nIsso apagará o salvamento automático e reiniciará a mesa do zero. Continuar?",
          )
        ) {
          clearSavedState(); // Limpa o localStorage (Cache)
          handleClearTable(); // Limpa a memória RAM (React State)
        }
        return;
      }

      // 2. SOFT RESET (Click Normal) - Destravar Interface
      setIsRefreshing(true);
      setViewKey((prev) => prev + 1);
      setNestingResult((prev) => [...prev]); // Força re-render
      setContextMenu(null);
      setSheetMenu(null);

      setTimeout(() => setIsRefreshing(false), 700);
      console.log("♻️ Interface gráfica recarregada (Soft Reset).");
    },
    [setNestingResult, clearSavedState, handleClearTable],
  );
  // ⬆️ -------------------------------------- ⬆️

  // --- NOVA FUNÇÃO: Navegação Segura para Home (COM DESBLOQUEIO) ---
  const handleSafeHomeExit = useCallback(async () => {
    const hasWorkInProgress = parts.length > 0 || nestingResult.length > 0;

    const performExit = async () => {
      // 1. Tenta liberar o pedido no banco (sem travar a UI)
      if (user && user.token) {
        try {
          // Usa sendBeacon se possível para garantir envio ao fechar, ou fetch normal
          // Aqui usaremos fetch para manter padrão, mas 'no-await' para não segurar demais
          await fetch("http://localhost:3001/api/pedidos/unlock", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${user.token}`,
            },
            body: JSON.stringify({}), // Body vazio libera TUDO do usuário
          });
        } catch (err) {
          console.error("Erro ao liberar pedidos na saída:", err);
        }
      }

      // 2. Limpa e navega
      clearSavedState();
      if (onNavigate) onNavigate("home");
      else if (onBack) onBack();
    };

    if (hasWorkInProgress) {
      if (
        window.confirm(
          "Atenção: Você tem um trabalho em andamento.\n\nSe sair agora, o pedido será liberado e o progresso não salvo será perdido. Continuar?",
        )
      ) {
        await performExit();
      }
    } else {
      await performExit();
    }
  }, [
    parts.length,
    nestingResult.length,
    clearSavedState,
    onNavigate,
    onBack,
    user,
  ]);

  // Função para o botão do Menu de Contexto
  const handleContextDelete = useCallback(() => {
    if (selectedPartIds.length > 0) {
      handleReturnToBank(selectedPartIds);
      setContextMenu(null); // Fecha o menu
    }
  }, [selectedPartIds, handleReturnToBank]);

  // --- FUNÇÃO DE BUSCA MANUAL BLINDADA ---
  const handleDBSearch = async () => {
    if (!searchQuery) return;
    // SEGURANÇA: Bloqueia busca sem login
    if (!user || !user.token) {
      alert(
        "Erro de segurança: Você precisa estar logado para buscar no banco.",
      );
      return;
    }

    setIsSearching(true);
    try {
      // =================================================================
      // 1. INSERIR ESTE BLOCO NOVO AQUI (ANTES DE MONTAR OS PARAMS)
      // =================================================================
      const lockResponse = await fetch(
        "http://localhost:3001/api/pedidos/lock",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify({
            pedido: searchQuery,
            op: selectedOps.length > 0 ? selectedOps : undefined,
          }),
        },
      );

      // --- AQUI ESTÁ A CORREÇÃO DO RETURN ---
      if (lockResponse.status === 409) {
        const errorData = await lockResponse.json();

        // 1. Mostra o alerta
        alert(`🚫 PEDIDO BLOQUEADO:\n\n${errorData.message}`);

        // 2. Para o loading
        setIsSearching(false);

        // 3. O RETURN QUE CANCELA TUDO
        return; // <--- SE ESTIVER BLOQUEADO, O CÓDIGO PARA AQUI E NÃO EXECUTA O GET ABAIXO
      }

      if (!lockResponse.ok) throw new Error("Erro ao tentar reservar pedidos.");
      // =================================================================

      // DAQUI PARA BAIXO SEGUE O CÓDIGO QUE JÁ EXISTIA NO ARQUIVO [cite: 129]
      const params = new URLSearchParams();
      params.append("pedido", searchQuery);

      if (selectedOps.length > 0) {
        params.append("op", selectedOps.join(","));
      }

      const response = await fetch(
        `http://localhost:3001/api/pecas/buscar?${params.toString()}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
        },
      );

      if (response.status === 404) {
        alert("Nenhum pedido encontrado.");
        setIsSearching(false);
        return;
      }

      if (!response.ok) throw new Error("Erro ao buscar.");

      const data = await response.json();

      if (Array.isArray(data) && data.length > 0) {
        // ... (Mantenha o restante do seu código de mapeamento das peças igual ao original [cite: 135-142])
        const dbParts: ImportedPart[] = data.map((item: any) => ({
          id: item.id,
          name: item.name,
          entities: item.entities,
          blocks: item.blocks || {},
          width: Number(item.width),
          height: Number(item.height),
          grossArea: Number(item.grossArea),
          netArea:
            calculatePartNetArea(item.entities) || Number(item.grossArea),
          quantity: Number(item.quantity) || 1,
          pedido: item.pedido,
          op: item.op,
          material: item.material,
          espessura: item.espessura,
          autor: item.autor,
          dataCadastro: item.dataCadastro,
          isRotationLocked: item.isRotationLocked,
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
          // --- MODO: ADICIONAR (SILENT UPSERT + GARANTIA DE VISIBILIDADE) ---

          // 1. GARANTIA DE VISIBILIDADE: Limpa filtros para evitar que a peça entre "escondida"
          // Isso resolve 99% dos casos de "importei e não apareceu"
          setFilters({
            pedido: [],
            op: [],
            material: "",
            espessura: "",
          });

          setParts((prev) => {
            // 2. DIAGNÓSTICO TÉCNICO (Invisível ao usuário, útil para você)
            // Mostra no console o que está acontecendo sem travar a tela
            const incomingIds = new Set(dbParts.map((p) => p.id));
            const existingCount = prev.filter((p) =>
              incomingIds.has(p.id),
            ).length;

            if (existingCount > 0) {
              console.warn(
                `⚡ [Auto-Repair] ${existingCount} peças já existiam na memória. Substituindo por versões novas do banco.`,
              );
            } else {
              console.log(`📥 Importando ${dbParts.length} novas peças.`);
            }

            // 3. SILENT UPSERT (A Lógica de Cura)
            // Remove as antigas da memória (prev) que coincidem com as novas
            const partsKept = prev.filter((p) => !incomingIds.has(p.id));

            // Retorna a lista misturada. O React detecta novos objetos e FORÇA o re-render.
            return [...partsKept, ...dbParts];
          });

          // Feedback visual sutil (Opcional: Toast ou apenas fechar o modal)
          // Como não temos sistema de Toast, apenas limpamos a busca e fechamos.
        }
        setSearchQuery("");
        setIsSearchModalOpen(false);
        // Limpar seleção de OPs após importar
        setSelectedOps([]);
      }
    } catch (err) {
      console.error(err);
      alert("Erro de conexão ou bloqueio.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleContextRotate = useCallback(
    (angle: number) => {
      if (selectedPartIds.length === 0) return;

      // 1. Verificação de travas (Apenas aviso visual, a lógica real está no utilitário)
      const hasLockedParts = selectedPartIds.some((uuid) => {
        const placedPart = nestingResult.find((p) => p.uuid === uuid);
        if (!placedPart) return false;
        const originalPart = parts.find((p) => p.id === placedPart.partId);
        return originalPart?.isRotationLocked === true;
      });

      if (hasLockedParts) {
        // LÓGICA DE EXCEÇÃO:
        // Se a peça for travada, verificamos se o ângulo é 180 (ou -180).
        // Se NÃO for 180 (ex: 90, 45), aí sim bloqueamos e mostramos o alerta.
        if (Math.abs(angle) !== 180) {
          alert(
            "⚠️ Trava de rotação para manter o sentido do escovado.\n\nPermitido apenas inverter (180º).",
          );
          return; // <--- O return aqui impede que o código continue
        }
        // Se for 180, ele ignora o alerta e desce para executar o rotatePartsGroup abaixo.
      }

      // 2. Chama a função utilitária para calcular a rotação em GRUPO
      const newResult = rotatePartsGroup(
        nestingResult,
        selectedPartIds,
        parts,
        angle,
      );

      setNestingResult(newResult);
    },
    [selectedPartIds, nestingResult, parts, setNestingResult],
  );

  const handleContextMove = useCallback(
    (dx: number, dy: number) => {
      if (selectedPartIds.length === 0) return;
      setNestingResult((prev) =>
        prev.map((p) =>
          selectedPartIds.includes(p.uuid)
            ? { ...p, x: p.x + dx, y: p.y - dy }
            : p,
        ),
      );
    },
    [selectedPartIds, setNestingResult],
  );

  const handlePartsMove = useCallback(
    (moves: { partId: string; dx: number; dy: number }[]) => {
      setNestingResult((prev) => {
        const newPlaced = [...prev];
        moves.forEach(({ partId, dx, dy }) => {
          const index = newPlaced.findIndex((p) => p.uuid === partId);
          if (index !== -1) {
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
    [setNestingResult],
  );

  const handlePartsMoveWithClear = useCallback(
    (moves: any) => {
      handlePartsMove(moves);
      if (collidingPartIds.length > 0) {
        setCollidingPartIds([]);
      }
    },
    [handlePartsMove, collidingPartIds],
  );

  const handleCheckCollisions = useCallback(() => {
    if (currentPlacedParts.length < 1) {
      alert("A mesa está vazia.");
      return;
    }

    if (collisionWorkerRef.current) {
      collisionWorkerRef.current.postMessage({
        placedParts: currentPlacedParts,
        partsData: parts,
        binWidth: binSize.width,
        binHeight: binSize.height,
        margin: margin,
        cropLines: cropLines,
      });
    }
  }, [currentPlacedParts, parts, binSize, margin, cropLines]);

  const handlePartSelect = useCallback((ids: string[], append: boolean) => {
    setSelectedPartIds((prev) =>
      append ? [...new Set([...prev, ...ids])] : ids,
    );
  }, []);

  const handlePartContextMenu = useCallback(
    (e: React.MouseEvent, partId: string) => {
      e.preventDefault();
      e.stopPropagation();
      if (!selectedPartIds.includes(partId)) setSelectedPartIds([partId]);
      setContextMenu({ visible: true, x: e.clientX, y: e.clientY });
    },
    [selectedPartIds],
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

  // [NestingBoard.tsx] - Adicione esta função junto com os outros handlers

  // --- FUNÇÃO PARA DELETAR PEDIDO (COM TRAVA DE SEGURANÇA) ---
  const handleDeleteOrder = useCallback(async (pedidoToDelete: string) => {
    // 1. VALIDAÇÃO DE SEGURANÇA (IGUAL À EDIÇÃO)
    
    // A. Verifica se tem peças deste pedido na MESA DE CORTE
    const hasOnTable = nestingResult.some(placed => {
      // Busca a peça original na memória para conferir o número do pedido
      const original = parts.find(p => p.id === placed.partId);
      return original?.pedido === pedidoToDelete;
    });

    // B. Verifica se tem peças deste pedido na LISTA LATERAL
    const hasInList = parts.some(p => p.pedido === pedidoToDelete);

    // Se estiver em uso, BLOQUEIA e avisa
    if (hasOnTable || hasInList) {
      alert(
        `⛔ AÇÃO BLOQUEADA\n\n` +
        `O pedido "${pedidoToDelete}" está carregado na sua área de trabalho (na Mesa ou na Lista).\n\n` +
        `Para evitar erros graves de sistema, você deve limpar essas peças da tela antes de excluir o pedido do banco de dados.\n` + 
        `Dica: Use o botão "Reset" ou remova as peças manualmente.`
      );
      return; // <--- O CÓDIGO PARA AQUI
    }

    // 2. CONFIRMAÇÃO DO USUÁRIO (FLUXO NORMAL)
    if (!window.confirm(
      `TEM CERTEZA?\n\n` +
      `Isso excluirá PERMANENTEMENTE o pedido "${pedidoToDelete}" e todas as suas peças do banco de dados.\n\n` +
      `Essa ação não pode ser desfeita. Continuar?`
    )) {
      return;
    }

    if (!user || !user.token) return;

    try {
      const encodedPedido = encodeURIComponent(pedidoToDelete);
      const response = await fetch(`http://localhost:3001/api/pedidos/${encodedPedido}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${user.token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        alert(`❌ ERRO: ${data.message || data.error}`);
        return;
      }

      // Sucesso: Removemos o pedido da lista visualmente
      setAvailableOrders((prev) => prev.filter((o) => o.pedido !== pedidoToDelete));
      
      // Se o pedido estava selecionado no input de busca, removemos ele do texto
      setSearchQuery((prev) => {
        const parts = prev.split(",").map(s => s.trim());
        return parts.filter(p => p !== pedidoToDelete).join(", ");
      });

      // Se esse pedido estava expandido na árvore, remove da lista de expandidos
      setExpandedOrders(prev => prev.filter(p => p !== pedidoToDelete));

      alert("✅ Pedido excluído com sucesso!");

    } catch (error) {
      console.error(error);
      alert("Erro de conexão ao tentar excluir.");
    }
  }, [user, setAvailableOrders, setSearchQuery, nestingResult, parts]); 
  // ⬆️ Adicionamos nestingResult e parts nas dependências do useCallback

  // [NestingBoard.tsx] - Função de Edição com Travas de Segurança

  const handleEditOrder = useCallback(
    async (pedidoToEdit: string) => {
      // 1. VALIDAÇÃO DE SEGURANÇA (TRAVA LOCAL)

      // A. Verifica se tem peças deste pedido na MESA DE CORTE (Nesting)
      const hasOnTable = nestingResult.some((placed) => {
        // Busca a peça original para conferir o pedido
        const original = parts.find((p) => p.id === placed.partId);
        return original?.pedido === pedidoToEdit;
      });

      // B. Verifica se tem peças deste pedido no BANCO DE PEÇAS (Lista Lateral)
      const hasInList = parts.some((p) => p.pedido === pedidoToEdit);

      if (hasOnTable || hasInList) {
        alert(
          `⛔ AÇÃO BLOQUEADA\n\n` +
            `O pedido "${pedidoToEdit}" já está carregado na sua área de trabalho.\n\n` +
            `Para evitar conflitos de versão, você deve limpar as peças deste pedido da mesa e da lista lateral antes de baixá-lo novamente para edição.`,
        );
        return;
      }

      // 2. BUSCA NO BANCO DE DADOS (Lógica de Carregamento)
      if (!user || !user.token) return;

      try {
        const encodedPedido = encodeURIComponent(pedidoToEdit);
        // A rota /buscar já filtra por status='AGUARDANDO', ignorando 'EM PRODUÇÃO'
        const response = await fetch(
          `http://localhost:3001/api/pecas/buscar?pedido=${encodedPedido}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${user.token}` },
          },
        );

        if (response.status === 404) {
          alert(
            "Nenhuma peça 'Aguardando' encontrada para este pedido.\n\nProvavelmente todas já foram produzidas ou excluídas.",
          );
          return;
        }

        const data = await response.json();

        if (Array.isArray(data) && data.length > 0) {
          // Mapeia os dados (mesma lógica do handleDBSearch)
          const partsToEdit: ImportedPart[] = data.map((item: any) => ({
            id: item.id,
            name: item.name,
            entities: item.entities,
            blocks: item.blocks || {},
            width: Number(item.width),
            height: Number(item.height),
            grossArea: Number(item.grossArea),
            netArea: Number(item.grossArea), // ou calculatePartNetArea(item.entities)
            quantity: Number(item.quantity) || 1,
            pedido: item.pedido,
            op: item.op,
            material: item.material,
            espessura: item.espessura,
            autor: item.autor,
            dataCadastro: item.dataCadastro,
            tipo_producao: item.tipo_producao, // Importante trazer isso
            isRotationLocked: item.isRotationLocked,
          }));

          // 3. NAVEGAÇÃO
          if (onEditOrder && onNavigate) {
            if (
              confirm(
                `Deseja carregar ${partsToEdit.length} peças do pedido ${pedidoToEdit} na Engenharia para edição?`,
              )
            ) {
              onEditOrder(partsToEdit); // Atualiza o estado global/pai
              onNavigate("engineering"); // Troca a tela
            }
          } else {
            console.warn("Função onEditOrder ou onNavigate não fornecida.");
          }
        }
      } catch (error) {
        console.error("Erro ao carregar para edição:", error);
        alert("Erro ao buscar dados do pedido.");
      }
    },
    [nestingResult, parts, user, onEditOrder, onNavigate],
  );

  const handleExternalDrop = useCallback(
    (partId: string, x: number, y: number) => {
      const part = parts.find((p) => p.id === partId);
      if (!part) return;

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
    [parts, currentBinIndex, setNestingResult],
  );

  const formatArea = useCallback(
    (mm2: number) =>
      mm2 > 100000
        ? (mm2 / 1000000).toFixed(3) + " m²"
        : mm2.toFixed(0) + " mm²",
    [],
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
      const aSel = selectedPartIds.includes(a.id);
      const bSel = selectedPartIds.includes(b.id);
      if (aSel && !bSel) return -1;
      if (!aSel && bSel) return 1;

      const qtyA = quantities[a.id] || 1;
      const qtyB = quantities[b.id] || 1;
      const placedA = totalPlacedCounts[a.id] || 0;
      const placedB = totalPlacedCounts[b.id] || 0;

      const isPendingA = placedA < qtyA;
      const isPendingB = placedB < qtyB;

      if (isPendingA && !isPendingB) return -1;
      if (!isPendingA && isPendingB) return 1;

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

  // =====================================================================
  // --- NOVO: HEARTBEAT (PULSAÇÃO) PARA MANTER BLOQUEIO ATIVO ---
  // =====================================================================
  useEffect(() => {
    // 1. Só executa se houver peças e usuário logado
    if (parts.length === 0 || !user?.token) return;

    const sendHeartbeat = async () => {
      // 2. Agrupa os pedidos e OPs que estão na tela agora
      const mapPedidosOps = new Map<string, Set<string>>();

      parts.forEach((p) => {
        if (!p.pedido) return;
        if (!mapPedidosOps.has(p.pedido)) {
          mapPedidosOps.set(p.pedido, new Set());
        }
        // Se tiver OP, adiciona ao conjunto desse pedido
        if (p.op) {
          mapPedidosOps.get(p.pedido)?.add(p.op);
        }
      });

      // 3. Envia um sinal de renovação para cada pedido identificado
      for (const [pedido, opsSet] of mapPedidosOps.entries()) {
        try {
          // Chamada silenciosa (sem loading, sem alert) para a rota /lock
          await fetch("http://localhost:3001/api/pedidos/lock", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${user.token}`,
            },
            body: JSON.stringify({
              pedido: pedido,
              op: Array.from(opsSet), // Envia lista de OPs para renovação precisa
            }),
          });
          // console.log(`💓 Heartbeat enviado para ${pedido}`);
        } catch (error) {
          console.warn(`Falha ao renovar bloqueio do pedido ${pedido}`, error);
        }
      }
    };

    // Executa imediatamente ao carregar as peças ou mudar o usuário
    sendHeartbeat();

    // Configura o relógio para repetir a cada 60 segundos (1 minuto)
    // O backend tem tolerância de 2 minutos, então 1 minuto é seguro.
    const intervalId = setInterval(sendHeartbeat, 60000);

    // Limpa o intervalo se o componente desmontar
    return () => clearInterval(intervalId);
  }, [parts, user]);

  // ⬇️ --- INSERIR AQUI --- ⬇️
  const buttonHeight = "30px";
  // ⬆️ -------------------- ⬆️

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    width: "100%",
    background: theme.bg,
    color: theme.text,
    userSelect: "none", // <--- ADICIONE ESTA LINHA
    WebkitUserSelect: "none", // Para garantir compatibilidade com Safari/Chrome antigos
  };
  const topBarStyle: React.CSSProperties = {
    padding: "5px 20px",
    borderBottom: `1px solid ${theme.border}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.headerBg,
  };
  const toolbarStyle: React.CSSProperties = {
    padding: "5px 20px",
    borderBottom: `1px solid ${theme.border}`,
    display: "flex",
    gap: "15px",
    alignItems: "center",
    backgroundColor: theme.panelBg,
    flexWrap: "nowrap",
    overflowX: "hidden",
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
    // ⬇️ --- CORREÇÃO: SUBSTITUIR 'border: "none"' POR LADOS ESPECÍFICOS --- ⬇️
    borderTop: "none",
    borderLeft: "none",
    borderRight: "none",
    // O 'border' genérico conflitava com o 'borderBottom' abaixo
    // ⬆️ ------------------------------------------------------------------- ⬆️
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
    color: string,
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

  // =========================================================
  // --- [2] LÓGICA DE FILTRAGEM E CONTAGEM (ADICIONE ISTO) ---
  // =========================================================

  // 1. Identifica os IDs que estão digitados no input
  const currentSelectedIds = useMemo(() => {
    return searchQuery
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [searchQuery]);

  // 2. Conta quantos pedidos da lista batem com o input (para o contador)
  const selectedCount = useMemo(() => {
    return availableOrders.filter((o) => currentSelectedIds.includes(o.pedido))
      .length;
  }, [availableOrders, currentSelectedIds]);

  // 3. Define qual lista será renderizada na tela (Total ou Filtrada)
  const displayedOrdersList = useMemo(() => {
    if (!showOnlySelected) return availableOrders;
    // Se o filtro estiver ativo, mostra só o que bate com o input
    return availableOrders.filter((o) => currentSelectedIds.includes(o.pedido));
  }, [availableOrders, showOnlySelected, currentSelectedIds]);

  // =========================================================

  // =========================================================
  // --- [NOVO] FUNÇÃO PARA LIMPAR TUDO AO FECHAR O MODAL ---
  // =========================================================
  const handleCloseSearchModal = useCallback(() => {
    setIsSearchModalOpen(false); // Fecha o modal

    // RESETA A VISUALIZAÇÃO
    setShowOnlySelected(false); // Volta a mostrar a lista completa

    // ZERA A SELEÇÃO (Limpa o que foi digitado/marcado)
    setSearchQuery("");
    setSelectedOps([]);
    setExpandedOrders([]);
  }, []);

  // =========================================================

  //   // --- FUNÇÃO DE EXPORTAÇÃO PDF (Versão Corrigida) ---
  // const handleExportPDF = useCallback(() => {
  //     if (nestingResult.length === 0) {
  //       alert("Faça o nesting antes de gerar o PDF.");
  //       return;
  //     }

  //     const refPart = parts.find((p) => p.id === nestingResult[0].partId);
  //     const currentMaterial = refPart?.material || "Desconhecido";
  //     const currentThickness = refPart?.espessura || "0";
  //     const defaultDensity = 7.85; // Aço padrão

  //     // Busca pedidos
  //     const uniqueOrders = Array.from(new Set(
  //         nestingResult.map((p) => {
  //             const orig = parts.find((op) => op.id === p.partId);
  //             return orig?.pedido || "";
  //         }).filter(Boolean)
  //     ));

  //     const safeUser = user as any;

  //     const companyName =
  //         safeUser?.empresaNome ||
  //         safeUser?.companyName ||
  //         "Minha Serralheria (Nome não configurado)";

  //     const operatorName =
  //         safeUser?.nome ||
  //         safeUser?.name ||
  //         safeUser?.email ||
  //         "Operador";

  //     generateGuillotineReport({
  //       companyName: companyName,
  //       operatorName: operatorName,
  //       orders: uniqueOrders,
  //       material: currentMaterial,
  //       thickness: currentThickness,
  //       density: defaultDensity,
  //       binWidth: binSize.width,
  //       binHeight: binSize.height,
  //       parts: parts,
  //       placedParts: nestingResult, // Envia TODAS as chapas
  //     });
  // }, [nestingResult, parts, binSize, user]);

  return (
  <>
    {/* 3. BLOQUEIO DE TELA (LOADING LARANJA) */}
    {isRestoring && (
      <div
        style={{
          height: "100vh",
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          background: "#1e1e1e", // Mesmo fundo escuro do AppLoader
          color: "#e0e0e0",
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 99999, // Garante que fique acima de tudo
        }}
      >
        <style>{`
          @keyframes rotate { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          .app-loader-ring { animation: rotate 1s linear infinite; transform-origin: center; }
        `}</style>
        <svg width="60" height="60" viewBox="0 0 512 512" fill="none">
          <path d="M256 32L210 160H302L256 32Z" fill="#fd7e14" />
          <circle
            cx="256"
            cy="256"
            r="80"
            stroke="#fd7e14"
            strokeWidth="20"
            strokeDasharray="300"
            className="app-loader-ring"
          />
          <path d="M256 480L302 352H210L256 480Z" fill="#fd7e14" />
        </svg>
        <p style={{ marginTop: 20, fontSize: "0.9rem", opacity: 0.7 }}>
          Restaurando sessão...
        </p>
      </div>
    )}   
    <div style={containerStyle}>    

      {/* ========================================================= */}
      {/* INÍCIO DO MODAL DE BUSCA (ATUALIZADO E CORRIGIDO)         */}
      {/* ========================================================= */}
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
          onClick={handleCloseSearchModal}
        >
          <div
            style={{
              backgroundColor: theme.panelBg,
              padding: "25px",
              borderRadius: "8px",
              width: "450px", // Levemente mais largo para acomodar a árvore
              height: "85vh",
              display: "flex",
              flexDirection: "column",
              border: `1px solid ${theme.border}`,
              boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* ANIMAÇÃO CSS INJETADA */}
            <style>
              {`
                @keyframes smoothFadeIn {
                  from { opacity: 0; transform: translateY(10px); }
                  to { opacity: 1; transform: translateY(0); }
                }
              `}
            </style>

            {/* CABEÇALHO DO MODAL */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 15,
              }}
            >
              <h3 style={{ margin: 0, color: theme.text }}>
                🔍 Buscar Pedido(s)
              </h3>
              <button
                onClick={handleCloseSearchModal}
                style={{
                  background: "transparent",
                  border: "none",
                  color: theme.text,
                  fontSize: 20,
                  cursor: "pointer",
                }}
              >
                ✕
              </button>
            </div>

            {/* ÁREA DA LISTA (SCROLLÁVEL) */}
            <div
              style={{
                marginBottom: "15px",
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* --- [3.1] BARRA DE CONTROLE (SUBSTITUA O TÍTULO SIMPLES POR ISTO) --- */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "5px",
                }}
              >
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: "bold",
                    color: theme.label,
                    marginBottom: "5px",
                  }}
                >
                  SELECIONE OS PEDIDOS DISPONÍVEIS:
                </span>

                {/* TOGGLE: VER APENAS SELECIONADOS */}
                <label
                  style={{
                    fontSize: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "5px",
                    cursor: "pointer",
                    color: showOnlySelected ? "#007bff" : theme.text,
                    fontWeight: showOnlySelected ? "bold" : "normal",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={showOnlySelected}
                    onChange={(e) => setShowOnlySelected(e.target.checked)}
                    style={{ cursor: "pointer" }}
                  />
                  Ver Selecionados ({selectedCount})
                </label>
              </div>
              {/* ------------------------------------------------------------------ */}

              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  background: theme.inputBg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: "4px",
                  padding: "5px",
                  minHeight: "200px",
                }}
              >
                {/* --- LÓGICA DE RENDERIZAÇÃO DA ÁRVORE --- */}
                {loadingOrders ? (
                  <div
                    style={{
                      height: "100%",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      fontSize: "12px",
                      color: theme.label,
                    }}
                  >
                    Carregando estrutura de pedidos...
                  </div>
                ) : displayedOrdersList.length === 0 ? (
                  <div
                    style={{
                      height: "100%",
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      fontSize: "12px",
                      color: theme.label,
                      textAlign: "center",
                      padding: "20px",
                    }}
                  >
                    {showOnlySelected
                      ? "Nenhum pedido selecionado encontrado."
                      : "Nenhum pedido encontrado no banco."}
                  </div>
                ) : (
                  <div
                    style={{
                      animation: "smoothFadeIn 0.4s ease-out forwards",
                    }}
                  >
                    {displayedOrdersList.map((orderData) => {
                      const isOrderChecked = searchQuery
                        .split(",")
                        .map((s) => s.trim())
                        .includes(orderData.pedido);

                      const isExpanded = expandedOrders.includes(
                        orderData.pedido,
                      );
                      const hasOps = orderData.ops && orderData.ops.length > 0;

                      return (
                        <div
                          key={orderData.pedido}
                          style={{
                            borderBottom: `1px solid ${theme.hoverRow}`,
                            userSelect: "none",
                          }}
                        >
                          {/* LINHA DO PEDIDO (PAI) */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              padding: "8px",
                              background: isOrderChecked
                                ? "rgba(0,123,255,0.05)"
                                : "transparent",
                              justifyContent: "space-between", // Garante espaçamento para o botão da direita
                              cursor: "pointer", // O cursor agora indica que a linha toda é clicável
                              userSelect: "none", // Evita seleção de texto acidental ao clicar rápido
                            }}
                            onClick={() =>
                              toggleOrderSelection(orderData.pedido)
                            }
                          >
                            {/* ESQUERDA: Toggle + Checkbox + Nome */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                flex: 1,
                              }}
                            >
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleExpandOrder(orderData.pedido);
                                }}
                                style={{
                                  marginRight: "8px",
                                  border: "none",
                                  background: "transparent",
                                  cursor: "pointer",
                                  fontWeight: "bold",
                                  color: theme.label,
                                  visibility: hasOps ? "visible" : "hidden",
                                  width: "20px",
                                  fontSize: "10px",
                                  padding: "4px", // Aumenta um pouco a área de clique da seta
                                }}
                              >
                                {isExpanded ? "▼" : "▶"}
                              </button>

                              <input
                                type="checkbox"
                                checked={isOrderChecked}
                                onChange={() => {}} // O onClick da div pai já resolve isso
                                style={{
                                  marginRight: "8px",
                                  cursor: "pointer",
                                  pointerEvents: "none", // O clique passa direto para a div pai (opcional, mas bom para UX)
                                }}
                              />

                              <span
                                style={{
                                  fontWeight: "bold",
                                  fontSize: "13px",
                                  color: theme.text,
                                }}
                              >
                                Pedido {orderData.pedido}
                                <span
                                  style={{
                                    fontSize: "11px",
                                    fontWeight: "normal",
                                    marginLeft: "6px",
                                    opacity: 0.7,
                                  }}
                                >
                                  ({orderData.ops.length} OPs)
                                </span>
                              </span>
                            </div>

                            {/* LADO DIREITO: Botões de Ação (Editar e Excluir) */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                              }}
                            >
                              {/* BOTÃO EDITAR (Lápis) */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditOrder(orderData.pedido);
                                }}
                                title="Editar pedido na Engenharia"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "#007bff",
                                  padding: "4px 6px",
                                  opacity: 0.7,
                                  display: "flex", // Garante alinhamento do ícone
                                  alignItems: "center",
                                }}
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                              </button>

                              {/* BOTÃO EXCLUIR (Lixeira) */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // handleDeleteOrder(orderData.pedido); // Descomente se tiver a função
                                  handleDeleteOrder(orderData.pedido); // Placeholder se não tiver a função ainda
                                }}
                                title="Excluir pedido"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "#dc3545",
                                  padding: "4px 6px",
                                  opacity: 0.7,
                                  display: "flex", // Garante alinhamento do ícone
                                  alignItems: "center",
                                }}
                              >
                                <svg
                                  width="14"
                                  height="14"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <polyline points="3 6 5 6 21 6"></polyline>
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                              </button>
                            </div>
                          </div>

                          {/* LISTA DE OPs (FILHOS) */}
                          {isExpanded && hasOps && (
                            <div
                              style={{
                                paddingLeft: "45px",
                                paddingBottom: "5px",
                                background: theme.inputBg,
                              }}
                            >
                              {orderData.ops.map((opObj) => {
                                const opName = opObj.name;
                                const isLocked = opObj.isLocked;
                                const lockerName = opObj.lockedBy;
                                const isOpChecked =
                                  selectedOps.includes(opName);

                                return (
                                  <div
                                    key={opName}
                                    title={
                                      isLocked
                                        ? `Bloqueado por ${lockerName}`
                                        : "Disponível"
                                    }
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      padding: "4px 0",
                                      opacity: isLocked ? 0.6 : 1,
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isOpChecked}
                                      disabled={isLocked}
                                      onChange={() =>
                                        toggleOpSelection(
                                          opName,
                                          orderData.pedido,
                                        )
                                      }
                                      style={{
                                        marginRight: "8px",
                                        cursor: isLocked
                                          ? "not-allowed"
                                          : "pointer",
                                      }}
                                    />
                                    <span
                                      style={{
                                        fontSize: "12px",
                                        color: isLocked
                                          ? "#dc3545"
                                          : theme.text,
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "5px",
                                      }}
                                    >
                                      {isLocked && <span>🔒</span>}
                                      OP: {opName}{" "}
                                      {isLocked && (
                                        <span style={{ fontSize: "10px" }}>
                                          ({lockerName})
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* INPUT MANUAL (READONLY PARA FEEDBACK VISUAL) */}
            <div style={{ marginBottom: 15 }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: "bold",
                  opacity: 0.7,
                  color: theme.label,
                }}
              >
                PEDIDOS SELECIONADOS:
              </span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Ex: PED-100, PED-101..."
                style={{
                  width: "100%",
                  padding: "10px",
                  marginTop: "5px",
                  background: theme.inputBg,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: "4px",
                  boxSizing: "border-box",
                  fontWeight: "bold",
                }}
              />
            </div>

            {/* OPÇÕES DE MODO (LIMPAR / ADICIONAR) */}
            <div
              style={{
                marginBottom: "20px",
                padding: "10px",
                background: theme.inputBg,
                borderRadius: "4px",
                display: "flex",
                gap: "15px",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: "bold",
                  opacity: 0.7,
                  color: theme.label,
                }}
              >
                MODO:
              </span>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  fontSize: "12px",
                  color: theme.text,
                }}
              >
                <input
                  type="radio"
                  name="searchMode"
                  checked={searchMode === "replace"}
                  onChange={() => setSearchMode("replace")}
                  style={{ marginRight: "5px" }}
                />
                Limpar Mesa
              </label>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  fontSize: "12px",
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
                />
                Adicionar (Mix)
              </label>
            </div>

            {/* BOTÃO DE AÇÃO */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                onClick={handleDBSearch}
                disabled={isSearching || !searchQuery}
                style={{
                  padding: "10px 20px",
                  background: "#6f42c1",
                  border: "none",
                  color: "white",
                  borderRadius: "4px",
                  cursor:
                    isSearching || !searchQuery ? "not-allowed" : "pointer",
                  fontWeight: "bold",
                  width: "100%",
                  opacity: isSearching || !searchQuery ? 0.6 : 1,
                }}
              >
                {isSearching ? "Buscando Peças..." : "📥 Importar Selecionados"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================= */}
      {/* FIM DO MODAL DE BUSCA                                     */}
      {/* ========================================================= */}

      {contextMenu && contextMenu.visible && selectedPartIds.length > 0 && (
        <ContextControl
          key={`${contextMenu.x}-${contextMenu.y}`}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          onMove={handleContextMove}
          onRotate={handleContextRotate}
          onDelete={handleContextDelete}
          isLocked={isSelectionLocked}
        />
      )}

      <div style={topBarStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          {onBack && (
            <button
              onClick={handleSafeHomeExit}
              title="Home"
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
          {/* BOTÃO 2: IR PARA ENGENHARIA (LISTA DE PEÇAS) */}
          <button
            onClick={() =>
              onNavigate ? onNavigate("engineering") : onBack?.()
            }
            title="Ir para a Engenharia"
            style={{
              background: "transparent",
              border: "none",
              color: theme.text,
              cursor: "pointer",
              fontSize: "20px",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              borderRadius: "4px",
              transition: "background 0.2s",
              opacity: isTrial ? 0.5 : 1,
              marginLeft: "10px",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = theme.hoverRow)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            🛠️
          </button>

          <h2
            style={{
              margin: 0,
              fontSize: "20px",
              color: "#007bff",
              whiteSpace: "nowrap",
            }}
          >
            Planejamento de Corte
          </h2>
        </div>
        {/* --- NOVO: PAINEL DE ASSINATURA CENTRALIZADO --- */}
        <div
          style={{
            flex: 1,
            margin: "0 40px",
            maxWidth: "400px",
            fontSize: "12px",
          }}
        >
          <SubscriptionPanel isDarkMode={isDarkMode} />
        </div>
        {/* ----------------------------------------------- */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}
        >
          {/* --- NOVOS BOTÕES: ARQUIVO LOCAL --- */}
          <div
            style={{
              display: "flex",
              gap: "5px",
              marginRight: "10px",
              // borderRight: `1px solid ${theme.border}`,
              // paddingRight: "15px",
            }}
          >
            {/* Input Oculto para Carregar */}
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept=".json"
              onChange={handleLoadProject}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              title="Abrir projeto salvo no computador"
              style={{
                background: "transparent",
                border: `1px solid ${theme.border}`,
                color: theme.text,
                padding: "6px 12px",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              📂 Abrir
            </button>

            <button
              onClick={handleSaveProject}
              title="Salvar projeto atual no computador"
              style={{
                background: "transparent",
                border: `1px solid ${theme.border}`,
                color: theme.text,
                padding: "6px 12px",
                borderRadius: "4px",
                cursor: "pointer",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              💾 Salvar
            </button>
          </div>
          {/* ----------------------------------- */}
          {/* BOTÃO BUSCAR PEDIDO (ALTERADO) */}
          <button
            onClick={() => {
              if (isTrial) return; // Bloqueio funcional
              // --- [NOVO] GARANTIA DE LIMPEZA AO ABRIR ---
              setSearchQuery(""); // Limpa o texto
              setShowOnlySelected(false); // <--- FORÇA O CHECKBOX A ABRIR DESMARCADO
              setSelectedOps([]); // Limpa OPs
              setExpandedOrders([]); // Fecha accordions
              // -------------------------------------------
              setIsSearchModalOpen(true);
            }}
            title={
              isTrial
                ? "Recurso indisponível no modo Trial"
                : "Buscar peças salvas no banco"
            }
            style={{
              background: isTrial ? "#6c757d" : "#6f42c1", // Cinza se Trial, Roxo se Premium
              color: "white",
              border: "none",
              padding: "6px 12px",
              borderRadius: "4px",
              cursor: isTrial ? "not-allowed" : "pointer", // Cursor de proibido
              opacity: isTrial ? 0.6 : 1, // Visual "desabilitado"
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "13px",
              transition: "all 0.3s ease",
            }}
          >
            🔍 Buscar Pedido {isTrial && "🔒"}
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
          {/* <button
            onClick={handleExportPDF}
            title="Gerar Relatório de Produção (PDF)"
            style={{
              background: "#6610f2", // Cor roxa/indigo para diferenciar
              color: "white",
              border: "none",
              padding: "6px 12px",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              marginLeft: "5px",
            }}
          >
            📄 PDF
          </button> */}

          <button
            onClick={handleClearTable}
            title="Reiniciar Página (Limpar Mesa e Cache)"
            // ⬇️ --- NOVO ESTILO PADRONIZADO (VERMELHO SÓLIDO) --- ⬇️
            style={{
              background: "#dc3545", // Vermelho "Danger" (Igual Engenharia)
              color: "white",
              border: "none", // Remove borda para ficar sólido
              padding: "6px 12px", // Mesmo tamanho dos botões vizinhos
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "13px",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              transition: "all 0.3s ease",
            }}
            // ⬆️ ------------------------------------------------ ⬆️
          >
            🗑️ Reset
          </button>

          <SidebarMenu
            onNavigate={(screen) => {
              // 1. Lógica para Home
              if (screen === "home" && onBack) {
                onBack();
              }
              // 2. Lógica para Dashboard e outros
              else if (onNavigate) {
                onNavigate(screen);
              }
            }}
            onOpenProfile={() => alert("Perfil em breve")}
            onOpenTeam={onOpenTeam}
          />
          {/* <button
            onClick={toggleTheme}
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
          </button> */}
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
            style={{ ...inputStyle, width: "180px" }}
          >
            <option value="guillotine">✂️ Guilhotina</option>{" "}
            {/* Mudou de "rect" */}
            <option value="true-shape">🧩 Smart Nest</option>
            <option value="true-shape-v2">⚡ Smart Nest V2</option>
            {/* ADICIONE ESTA OPÇÃO: */}
            {/* <option
              value="true-shape-v3"
              style={{ fontWeight: "bold", color: "#007bff" }}
            >
              🚀 Smart Nest V3 (Furos)
            </option> */}
            {/* ALTERAÇÃO AQUI: Adicionado disabled e estilo de cor/opacidade */}
            {/* <option
              value="wise"
              style={{ fontWeight: "bold", color: "#6f42c1" }}
            >
              🧠 Wise Nest (Clipper Engine)
            </option> */}
            {/* --- NOVA OPÇÃO --- */}
            {/* <option
              value="nfp"
              style={{ fontWeight: "bold", color: "#e83e8c" }}
            >
              🧬 NFP Nest (Geometria Real)
            </option> */}
            {/* ------------------ */}
            {/* <--- INSERIR ESTA LINHA */}
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

        {/* INPUTS DE DIMENSÃO */}
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

        {/* INPUTS GAP/MARGEM (COM LÓGICA DE DESABILITAR) */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label
            style={{
              fontSize: 12,
              opacity: strategy === "guillotine" ? 0.5 : 1,
            }}
          >
            Gap:
          </label>
          <input
            type="number"
            value={gap}
            onChange={(e) => setGap(Number(e.target.value))}
            disabled={strategy === "guillotine"}
            style={{
              ...inputStyle,
              width: 40,
              opacity: strategy === "guillotine" ? 0.5 : 1,
              cursor: strategy === "guillotine" ? "not-allowed" : "text",
            }}
            title={
              strategy === "guillotine"
                ? "Não utilizado no modo Guilhotina"
                : ""
            }
          />
          <label
            style={{
              fontSize: 12,
              opacity: strategy === "guillotine" ? 0.5 : 1,
            }}
          >
            Margem:
          </label>
          <input
            type="number"
            value={margin}
            onChange={(e) => setMargin(Number(e.target.value))}
            disabled={strategy === "guillotine"}
            style={{
              ...inputStyle,
              width: 40,
              opacity: strategy === "guillotine" ? 0.5 : 1,
              cursor: strategy === "guillotine" ? "not-allowed" : "text",
            }}
            title={
              strategy === "guillotine"
                ? "Não utilizado no modo Guilhotina"
                : ""
            }
          />
        </div>

        {/* {strategy === "true-shape" && (
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
        )} */}

        {/* CHECKBOX DEBUG */}
        <label
          style={{
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            cursor: "pointer",
            userSelect: "none",
            marginLeft: "15px",
          }}
        >
          <input
            type="checkbox"
            checked={showDebug}
            onChange={(e) => setShowDebug(e.target.checked)}
            style={{ marginRight: "5px", backgroundColor: theme.checkboxBg }}
          />{" "}
          Box
        </label>
        {/* ⬇️ --- BOTÃO DE REFRESH COM ÍCONE PADRÃO --- ⬇️ */}
        <button
          onClick={handleRefreshView}
          disabled={isRefreshing}
          title="Recarregar visualização (Destravar interface)"
          style={{
            background: "transparent",
            border: `1px solid ${theme.border}`,
            color: theme.text,
            // --- ALTERAÇÃO: TAMANHO FIXO ---
            height: buttonHeight,
            width: buttonHeight,
            padding: 0, // Remove padding para centrar o ícone
            gap: 0,
            // -------------------------------
            borderRadius: "4px",
            cursor: isRefreshing ? "wait" : "pointer", // Cursor de espera
            fontSize: "12px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginLeft: "10px",
            transition: "background 0.2s",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = theme.hoverRow)
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          {/* Ícone SVG com Rotação */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              // A Mágica da Rotação:
              transformOrigin: "center",
              transformBox: "view-box",
              transition: "transform 0.7s ease",
              transform: isRefreshing ? "rotate(360deg)" : "rotate(0deg)",
            }}
          >
            <path d="M23 4v6h-6"></path>
            <path d="M1 20v-6h6"></path>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>
        {/* ⬆️ ------------------------------------------ ⬆️ */}

        {/* LÓGICA DOS BOTÕES DE COLISÃO (CORRIGIDA) */}
        {strategy === "guillotine" ? (
          <button
            onClick={handleCheckGuillotineCollisions}
            title="Validação rápida para cortes retos"
            style={{
              background: "#dc3545",
              border: `1px solid ${theme.border}`,
              color: "#fff",
              // --- ALTERAÇÃO: ALTURA FIXA ---
              height: buttonHeight,
              padding: "0 10px", // Padding lateral apenas
              // ------------------------------
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
            Guilhotina
          </button>
        ) : (
          <button
            onClick={handleCheckCollisions}
            title="Verificar se há peças sobrepostas (Pixel Perfect)"
            style={{
              background: "#dc3545",
              border: `1px solid ${theme.border}`,
              color: "#fff",
              // --- ALTERAÇÃO: ALTURA FIXA ---
              height: buttonHeight,
              padding: "0 10px",
              // ------------------------------
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
            💥 Colisão
          </button>
        )}

        {/* BOTÃO NOVA CHAPA */}
        <button
          onClick={handleAddBin}
          title="Criar uma nova chapa vazia para nesting manual"
          style={{
            background: " #0056b3",
            border: `1px solid ${theme.border}`,
            color: "white",
            // --- ALTERAÇÃO: ALTURA FIXA ---
            height: buttonHeight,
            padding: "0 10px",
            // ------------------------------
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
          Nova Chapa
        </button>

        {/* Adicionamos um estilo inline para a animação de rotação */}
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>

        <button
          onClick={handleCalculate}
          // 👇 ATUALIZADO: Adicionamos isNfpRunning para travar o botão
          disabled={isComputing || isNfpRunning}
          style={{
            marginLeft: "auto",
            // 👇 ATUALIZADO: Muda a cor se estiver rodando
            background: isComputing || isNfpRunning ? theme.panelBg : "#28a745",
            color: isComputing || isNfpRunning ? theme.text : "white",
            border:
              isComputing || isNfpRunning
                ? `1px solid ${theme.border}`
                : "none",
            // --- ALTERAÇÃO: ALTURA FIXA ---
            height: buttonHeight,
            padding: "0 15px", // Um pouco mais largo pois é o principal
            // ------------------------------
            cursor: isComputing || isNfpRunning ? "wait" : "pointer",
            borderRadius: "4px",
            fontWeight: "bold",
            fontSize: "16px",
            whiteSpace: "nowrap",
            boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            minWidth: "120px",
            justifyContent: "center",
          }}
        >
          {isComputing || isNfpRunning ? ( // 👇 ATUALIZADO: Verifica ambos os estados
            <>
              {/* Animação CSS inline mantida */}
              <style>
                {`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}
              </style>
              <div
                style={{
                  animation: "spin 1s linear infinite",
                  display: "flex",
                }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
              </div>
              {/* 👇 ATUALIZADO: Mostra a porcentagem se for NFP, senão "Processando..." */}
              <span>
                {strategy === "nfp" ? `NFP: ${nfpProgress}%` : "Processando..."}
              </span>
            </>
          ) : (
            <>Nesting</>
          )}
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
          {totalBins > 1 && (
            <div
              style={{
                position: "absolute",
                top: 110,
                left: 20,
                zIndex: 20,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "5px",
                background: theme.buttonBg,
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
              <button
                onClick={() =>
                  setCurrentBinIndex(Math.max(0, currentBinIndex - 1))
                }
                disabled={currentBinIndex === 0}
                title="Voltar para a chapa anterior"
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

              <div
                title={`Chapa ${currentBinIndex + 1} de ${totalBins} ${
                  isCurrentSheetSaved ? "(Salva)" : "(Não salva)"
                }`}
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

              <button
                onClick={() =>
                  setCurrentBinIndex(
                    Math.min(totalBins - 1, currentBinIndex + 1),
                  )
                }
                disabled={currentBinIndex === totalBins - 1}
                title="Avançar para a próxima chapa"
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
              {/* --- NOVO ÍCONE DE GALERIA (INSERIDO AQUI) --- */}
              <div
                style={{
                  width: "20px",
                  height: "1px",
                  background: "rgba(255,255,255,0.2)",
                  margin: "2px 0",
                }}
              />
              <button
                onClick={() => setIsGalleryOpen(true)}
                title="Abrir Galeria de Chapas (Visão Geral)"
                style={{
                  cursor: "pointer",
                  border: "none",
                  background: "transparent",
                  color: theme.text,
                  padding: "4px 0",
                  display: "flex",
                  justifyContent: "center",
                  width: "100%",
                  opacity: 0.9,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.9")}
              >
                {/* Ícone de Grid/Carrossel SVG */}
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
              </button>
              {/* ------------------------------------------- */}
            </div>
          )}

          <InteractiveCanvas
            key={viewKey}
            parts={displayedParts}
            placedParts={currentPlacedParts}
            binWidth={binSize.width}
            binHeight={binSize.height}
            margin={margin}
            showDebug={showDebug}
            strategy={
              // Adicione a verificação para 'nfp' aqui
              strategy === "true-shape-v2" ||
              strategy === "true-shape-v3" ||
              strategy === "nfp"
                ? "true-shape"
                : strategy
            }
            theme={theme}
            selectedPartIds={selectedPartIds}
            collidingPartIds={collidingPartIds}
            cropLines={cropLines}
            calculatedRemnants={calculatedRemnants}
            onCropLineMove={moveCropLine}
            onCropLineContextMenu={handleLineContextMenu}
            onBackgroundContextMenu={handleBackgroundContextMenu}
            onPartsMove={handlePartsMoveWithClear}
            onPartSelect={handlePartSelect}
            onContextMenu={handlePartContextMenu}
            onPartReturn={handleReturnToBank}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            onCanvasDrop={handleExternalDrop}
          />

          {/* --- BARRA DE RODAPÉ (FOOTER) APRIMORADA COM CONSUMO --- */}
          <div
            style={{
              padding: "0 15px",
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              alignItems: "center",
              borderTop: `1px solid ${theme.border}`,
              background: theme.panelBg,
              zIndex: 5,
              color: theme.text,
              height: "50px",
            }}
          >
            {/* ESQUERDA: Contagem */}
            <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
              <span
                style={{ opacity: 0.9, fontSize: "12px", fontWeight: "bold" }}
              >
                Total: {currentPlacedParts.length} / {displayedParts.length}{" "}
                Peças
              </span>
            </div>

            {/* CENTRO: MÉTRICAS DE EFICIÊNCIA */}
            <div
              style={{
                display: "flex",
                gap: "15px",
                alignItems: "center",
                background: theme.canvasBg,
                padding: "4px 15px",
                borderRadius: "20px",
                border: `1px solid ${theme.border}`,
                boxShadow: "inset 0 1px 3px rgba(0,0,0,0.1)",
              }}
            >
              {/* 1. REAL (CUSTO) */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  lineHeight: 1,
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    color: theme.label,
                    textTransform: "uppercase",
                  }}
                >
                  Aprov. Global
                </span>
                <span style={{ fontSize: "14px", fontWeight: "bold" }}>
                  {currentEfficiencies.real}%
                </span>
              </div>

              <div
                style={{
                  width: "1px",
                  height: "20px",
                  background: theme.border,
                }}
              ></div>

              {/* 2. CONSUMO (NOVO) */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  lineHeight: 1,
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    color: theme.label,
                    textTransform: "uppercase",
                  }}
                >
                  Consumo Chapa
                </span>
                <span
                  title="Porcentagem da chapa que foi utilizada (inclui peças e sucata interna). Quanto mais próximo do Global, melhor."
                  style={{
                    fontSize: "14px",
                    fontWeight: "bold",
                    color: theme.text,
                  }}
                >
                  {currentEfficiencies.consumption}%
                </span>
              </div>

              <div
                style={{
                  width: "1px",
                  height: "20px",
                  background: theme.border,
                }}
              ></div>

              {/* 3. EFETIVO (DENSIDADE) */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  lineHeight: 1,
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    color: theme.label,
                    textTransform: "uppercase",
                  }}
                >
                  Densidade {currentEfficiencies.isManual && "(Manual)"}
                </span>
                <span
                  title={
                    currentEfficiencies.isManual
                      ? "Calculado com base na Linha de Corte definida"
                      : "Calculado pelo topo das peças"
                  }
                  style={{
                    fontSize: "14px",
                    fontWeight: "bold",
                    color: currentEfficiencies.isManual ? "#6f42c1" : "#007bff",
                  }}
                >
                  {currentEfficiencies.effective}%
                </span>
              </div>

              <div
                style={{
                  width: "1px",
                  height: "20px",
                  background: theme.border,
                }}
              ></div>

              {/* 4. SOBRA (RETALHO) */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  lineHeight: 1,
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    color: theme.label,
                    textTransform: "uppercase",
                  }}
                >
                  {/* CONDICIONAL AQUI: Se não tem peças, chama de "Mesa de Corte" ou "Área Livre" */}
                  {currentPlacedParts.length === 0
                    ? "Mesa de Corte"
                    : "Retalho Útil"}
                </span>
                <span
                  title={`Sobra linear de chapa: ${currentEfficiencies.remnantHeight}mm`}
                  style={{
                    fontSize: "14px",
                    fontWeight: "bold",
                    color: "#28a745",
                  }}
                >
                  {currentEfficiencies.remnantHeight}mm{" "}
                  <span style={{ fontSize: "10px", opacity: 0.7 }}>
                    ({currentEfficiencies.remnantArea}m²)
                  </span>
                </span>
              </div>
            </div>

            {/* DIREITA: STATUS E TEMPO */}
            <div
              style={{
                display: "flex",
                gap: "15px",
                alignItems: "center",
                justifyContent: "flex-end",
              }}
            >
              {calculationTime !== null && (
                <span style={{ fontSize: "12px", color: theme.label }}>
                  ⏱️ {calculationTime.toFixed(2)}s
                </span>
              )}

              {isCurrentSheetSaved && (
                <span
                  style={{
                    color: "#28a745",
                    fontWeight: "bold",
                    fontSize: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  ✅ SALVO
                </span>
              )}

              {failedCount > 0 && (
                <span
                  style={{
                    color: "#dc3545",
                    fontWeight: "bold",
                    fontSize: "12px",
                    background: "rgba(220,53,69,0.1)",
                    padding: "2px 6px",
                    borderRadius: "4px",
                  }}
                >
                  ⚠️ {failedCount} FALHAS
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ⬇️ --- [INSERÇÃO 3] BARRA LATERAL REDIMENSIONÁVEL --- ⬇️ */}
        <div
          style={{
            width: sidebarWidth, // <--- Agora usa a variável de estado
            // minWidth: "500px", // (Opcional, já tratado na lógica, mas bom garantir)
            borderLeft: `1px solid ${theme.border}`,
            display: "flex",
            flexDirection: "column",
            backgroundColor: theme.panelBg,
            zIndex: 5,
            color: theme.text,
            position: "relative", // <--- IMPORTANTE: Para posicionar o "puxador"
          }}
        >
          {/* --- O "PUXADOR" (Área sensível ao clique) --- */}
          <div
            onMouseDown={(e) => {
              e.preventDefault(); // Evita seleção de texto
              setIsResizingSidebar(true);
            }}
            title="Arraste para redimensionar"
            style={{
              position: "absolute",
              left: "-4px", // Fica levemente sobre a borda para facilitar o clique
              top: 0,
              bottom: 0,
              width: "8px", // Área de clique confortável (invisível visualmente)
              cursor: "ew-resize",
              zIndex: 100, // Garante que fique acima de tudo
              background: isResizingSidebar
                ? "rgba(0, 123, 255, 0.2)" // Feedback visual azul quando arrasta
                : "transparent",
              transition: "background 0.2s",
            }}
            // Opcional: Feedback visual ao passar o mouse (hover)
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "rgba(0, 123, 255, 0.1)")
            }
            onMouseLeave={(e) => {
              if (!isResizingSidebar)
                e.currentTarget.style.background = "transparent";
            }}
          />
          {/* --------------------------------------------- */}
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
          {/* --- ABAS DE NAVEGAÇÃO + SELECT ALL --- */}
          <div
            style={{
              display: "flex",
              alignItems: "center", // Garante alinhamento vertical
              borderBottom: `1px solid ${theme.border}`,
              background: theme.headerBg,
              paddingRight: "15px", // Margem direita para não colar na borda
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

            {/* --- NOVO: CHECKBOX ALINHADO À DIREITA --- */}
            <div style={{ marginLeft: "auto" }}>
              <label
                style={{
                  fontSize: "12px",
                  fontWeight: "bold",
                  color: theme.text,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: parts.length === 0 ? "not-allowed" : "pointer",
                  userSelect: "none",
                  opacity: parts.length === 0 ? 0.5 : 1,
                }}
                title={
                  isAllEnabled
                    ? "Remover todas do cálculo"
                    : "Incluir todas no cálculo"
                }
              >
                <input
                  type="checkbox"
                  checked={isAllEnabled}
                  onChange={handleToggleAll}
                  disabled={parts.length === 0}
                  style={{
                    cursor: "pointer",
                    backgroundColor: theme.checkboxBg,
                  }}
                />
                Selecionar Todos
              </label>
            </div>
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

                  // --- ALTERAÇÃO AQUI ---
                  // Só consideramos "Alta" (para girar a visualização) se ela NÃO estiver travada.
                  // Se estiver travada, queremos ver a orientação real (WYSIWYG).
                  const shouldRotateVisual =
                    originalH > originalW && !part.isRotationLocked;

                  const p = Math.max(originalW, originalH) * 0.1;
                  let finalViewBox = "";
                  let contentTransform = "";

                  if (shouldRotateVisual) {
                    // LÓGICA ANTIGA: Gira a peça visualmente para caber melhor
                    const cx = (box.minX + box.maxX) / 2;
                    const cy = (box.minY + box.maxY) / 2;
                    contentTransform = `rotate(-90, ${cx}, ${cy})`;
                    const cameraW = originalH + p * 2;
                    const cameraH = originalW + p * 2;
                    const cameraX = cx - cameraW / 2;
                    const cameraY = cy - cameraH / 2;
                    finalViewBox = `${cameraX} ${cameraY} ${cameraW} ${cameraH}`;
                  } else {
                    // VISUALIZAÇÃO REAL: Mostra como a peça realmente está
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
                        theme={theme}
                      />

                      <div
                        style={{
                          position: "absolute",
                          top: 5,
                          left: 8,
                          zIndex: 1000,
                          background: theme.checkboxBg,
                          borderRadius: "4px",
                          padding: "2px",
                          display: "flex",
                          alignItems: "center",
                          boxShadow: "0 1px 1px rgba(0,0,0,0.2)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                        title="Incluir esta peça no cálculo automático?"
                      >
                        <input
                          type="checkbox"
                          checked={!disabledNestingIds.has(part.id)}
                          onChange={(e) => {
                            const newSet = new Set(disabledNestingIds);
                            if (e.target.checked) {
                              newSet.delete(part.id);
                            } else {
                              newSet.add(part.id);
                            }
                            setDisabledNestingIds(newSet);
                          }}
                          style={{
                            cursor: "pointer",
                            margin: 0,
                            width: "16px",
                            height: "16px",
                          }}
                        />
                      </div>
                      {/* --- INSERIR O CÓDIGO DO CADEADO AQUI (ENTRE AS DIVS) --- */}

                      {part.isRotationLocked && (
                        <div
                          title="Rotação Travada no Sentido Escovado"
                          style={{
                            position: "absolute",
                            top: 35, // Coloquei 35 para ficar logo abaixo do checkbox
                            left: 8,
                            background: "#dc3545",
                            color: "white",
                            borderRadius: "50%",
                            width: "18px",
                            height: "18px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "10px",
                            zIndex: 1000,
                            boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
                            pointerEvents: "none",
                          }}
                        >
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect
                              x="3"
                              y="11"
                              width="18"
                              height="11"
                              rx="2"
                              ry="2"
                            ></rect>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                          </svg>
                        </div>
                      )}

                      {/* -------------------------------------------------------- */}

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
                                isDoneVisual ? theme.border : theme.text,
                              ),
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

            {sheetMenu && (() => {
              // --- CORREÇÃO 1: Verificação correta baseada no tipo PlacedPart[] ---
              let hasPartsInBin = false;
              if (Array.isArray(nestingResult)) {
                // Se for um array de arrays (múltiplas chapas), pega a atual. 
                // Se for um array simples (uma chapa), usa ele mesmo.
                const currentBinData = nestingResult[currentBinIndex] || nestingResult;
                hasPartsInBin = Array.isArray(currentBinData) 
                  ? currentBinData.length > 0 
                  : nestingResult.length > 0;
              }

              return (
                <SheetContextMenu
                  x={sheetMenu.x}
                  y={sheetMenu.y}
                  targetLineId={sheetMenu.lineId}
                  
                  // --- CORREÇÃO 2: Restaurando o uso real da função trimCropLine ---
                  onTrim={() => {
                    if (
                      sheetMenu.lineId &&
                      sheetMenu.binX !== undefined &&
                      sheetMenu.binY !== undefined
                    ) {
                      trimCropLine(
                        sheetMenu.lineId,
                        sheetMenu.binX,
                        sheetMenu.binY,
                      );
                      setSheetMenu(null); // Fecha o menu
                    }
                  }}
                  // -----------------------------------------------------------------

                  onDeleteLine={removeCropLine}
                  onClose={() => setSheetMenu(null)}
                  onDeleteSheet={handleDeleteSheetWrapper}
                  onAddCropLine={handleAddCropLineWrapper}
                  onDefineRemnants={handleCalculateRemnants}
                  hasPlacedParts={hasPartsInBin}
                />
              );
            })()}

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
                      // --- ALTERAÇÃO 1: Detecta se está selecionado ---
                      const isSelected = activeSelectedPartIds.has(part.id);

                      // --- ALTERAÇÃO 2: Prioriza a cor de seleção (Azul) sobre as outras ---
                      const rowBg = isSelected
                        ? theme.selectedRow // Fundo azulado definido no tema
                        : isOnCurrentSheet
                          ? "rgba(40, 167, 69, 0.05)" // Verde claro (na chapa)
                          : isDoneVisual
                            ? "rgba(40, 167, 69, 0.1)" // Verde escuro (concluído)
                            : "transparent";

                      // --- ALTERAÇÃO 3: Borda de destaque para seleção ---
                      // Se selecionado, usamos uma borda azul grossa (#007bff).
                      // Se não, mantemos a borda padrão do tema.
                      const rowBorder = isSelected
                        ? "2px solid #007bff"
                        : `1px solid ${theme.border}`;
                      return (
                        <tr
                          key={part.id}
                          // ADICIONE ESTA LINHA ABAIXO:
                          ref={(el) => {
                            if (el) thumbnailRefs.current[part.id] = el;
                          }}
                          // --- OPCIONAL: Clique na linha seleciona a peça também ---
                          onClick={(e) => {
                            // Se quiser que o clique na lista selecione a peça na mesa:
                            if (e.ctrlKey) handlePartSelect([part.id], true);
                            else handlePartSelect([part.id], false);
                          }}
                          style={{
                            // Aplica a borda calculada acima
                            borderBottom: rowBorder,
                            borderTop: isSelected
                              ? "2px solid #007bff"
                              : undefined, // Borda dupla para destaque total
                            background: rowBg,
                            cursor: "pointer", // Indica que é clicável
                            position: "relative", // Para garantir que o z-index da borda funcione se necessário
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

      {/* SE O ESTADO FOR TRUE, MOSTRA A TELA DE EQUIPE */}
      {isTeamModalOpen && (
        <TeamManagementScreen onClose={() => setIsTeamModalOpen(false)} />
      )}
      <SheetGalleryModal
        isOpen={isGalleryOpen}
        onClose={() => setIsGalleryOpen(false)}
        totalBins={totalBins}
        currentBinIndex={currentBinIndex}
        onSelectBin={setCurrentBinIndex}
        binWidth={binSize.width}
        binHeight={binSize.height}
        parts={parts}
        nestingResult={nestingResult}
        theme={theme}
      />
    </div>
   </> 
  );
};
