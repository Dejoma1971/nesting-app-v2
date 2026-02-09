import React, {
  useRef,
  useEffect,
  useMemo,
  useCallback,
  useState,
} from "react";
import DxfParser from "dxf-parser";
import { explodeDXFGeometry } from "../utils/dxfExploder";
import { calculateBoundingBox } from "../utils/geometryCore";
import { useCanvasPan } from "../hooks/useCanvasPan";
import { drawRulersSmart } from "../postProcessador/utils/canvasRuler";

// --- TIPOS E INTERFACES ---
export interface DxfLayer {
  name: string;
  color: string;
  aci: number;
}

interface DxfViewerProps {
  dxfContent: string | null;
  onLayersDetected?: (layers: DxfLayer[]) => void;
  // Novas Props
  showGrid?: boolean;
  gridSpacing?: number;
}

interface Point {
  x: number;
  y: number;
  bulge?: number;
}

interface RenderEntity {
  type: string;
  layer?: string;
  vertices?: Point[];
  center?: { x: number; y: number };
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  closed?: boolean;
}

interface IDxfLayerTable {
  [key: string]: {
    name: string;
    color: number;
  };
}

// --- COMPONENTE PRINCIPAL ---
export const DxfViewer: React.FC<DxfViewerProps> = ({
  dxfContent,
  onLayersDetected,
  showGrid = true, // Valor padrão definido aqui
  gridSpacing = 200, // Valor padrão definido aqui
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Estado React (usado apenas para sincronização final, não para animação)
  const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });

  // Refs para o "Game Loop" (Acesso instantâneo sem re-render)
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const processedRef = useRef<{
    entities: RenderEntity[];
    box: { x: number; y: number; w: number; h: number };
  } | null>(null);

  // 1. PROCESSAMENTO DO DXF (Pesado - Executa apenas quando o arquivo muda)
  const processedData = useMemo(() => {
    if (!dxfContent) return null;
    try {
      const parser = new DxfParser();
      const dxf = parser.parseSync(dxfContent);
      if (!dxf) return null;

      // Detecção de Layers
      if (onLayersDetected && dxf.tables?.layer?.layers) {
        const layersTable = dxf.tables.layer.layers as IDxfLayerTable;
        const layers: DxfLayer[] = Object.values(layersTable).map((l) => {
          let hex = "#ffffff";
          if (l.color === 3 || l.name === "1") hex = "#00ff00";
          else if (l.color === 6 || l.name === "2") hex = "#ff00ff";
          else if (l.color === 7 || l.name === "0") hex = "#ffffff";
          return { name: l.name, aci: l.color, color: hex };
        });
        onLayersDetected(layers);
      }

      const entities = explodeDXFGeometry(dxf.entities, dxf.blocks || {});
      const box = calculateBoundingBox(entities, dxf.blocks || {});

      return {
        entities: entities as RenderEntity[],
        box: {
          x: box.minX,
          y: box.minY,
          w: box.maxX - box.minX || 1,
          h: box.maxY - box.minY || 1,
        },
      };
    } catch (e) {
      console.error("Erro ao processar DXF:", e);
      return null;
    }
  }, [dxfContent, onLayersDetected]);

  // Atualiza a Ref de dados sempre que o processamento mudar
  useEffect(() => {
    processedRef.current = processedData;
  }, [processedData]);

  // 2. FUNÇÃO DE DESENHO (Imperativa - Otimizada para GPU)
  const draw = useCallback(
    (currentT: { x: number; y: number; k: number }) => {
      const canvas = canvasRef.current;
      const processed = processedRef.current;

      // NOTA: Removemos a checagem !processed aqui para permitir desenhar o grid vazio
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const parent = canvas.parentElement;
      const w = parent?.clientWidth || 800;
      const h = parent?.clientHeight || 600;
      const dpr = window.devicePixelRatio || 1;

      // Gerenciamento de Tamanho Físico vs Lógico (High DPI)
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
      }

      // Limpa a tela
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Fundo Preto
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // --- CÁLCULO DA MATRIZ DE TRANSFORMAÇÃO ---

      // 1. "Fit to Screen" (Escala Base)
      // Se não tiver peça (processed null), usamos área padrão 3000x1500mm
      const defaultBox = { w: 3000, h: 1500, x: 0, y: 0 };
      const box = processed ? processed.box : defaultBox;

      const pad = 40;
      const scaleBase = Math.min((w - pad) / box.w, (h - pad) / box.h);
      // Centraliza o Box (da peça ou da mesa padrão)
      const offXBase = (w - box.w * scaleBase) / 2 - box.x * scaleBase;
      const offYBase = (h - box.h * scaleBase) / 2 - box.y * scaleBase;

      // 2. Montagem da Matriz Final
      const k = currentT.k;
      const panX = currentT.x;
      const panY = currentT.y;

      const m_a = scaleBase * k * dpr;
      const m_b = 0;
      const m_c = 0;
      const m_d = -scaleBase * k * dpr; // Inverte Y
      const m_e = (offXBase * k + panX) * dpr;
      const m_f = ((h - offYBase) * k + panY) * dpr;

      // APLICA A MATRIZ GLOBAL
      ctx.setTransform(m_a, m_b, m_c, m_d, m_e, m_f);

      // DEFINIÇÃO DA ESPESSURA DE LINHA (RESOLVE O ERRO lineWidth)
      const globalScale = scaleBase * k * dpr;
      const lineWidth = 1.5 / Math.abs(globalScale / dpr); // Definição da variável

      ctx.lineWidth = lineWidth;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";

      // ======================================================================
      // DESENHO DO GRID (Fundo)
      // ======================================================================
      if (showGrid) {
        const spacing = gridSpacing;

        ctx.save();
        ctx.beginPath();

        // CONFIGURAÇÃO VISUAL
        // Cor: Branco com 20% de opacidade (aumente 0.2 para ficar mais forte)
        ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";

        ctx.lineWidth = lineWidth;

        // Padrão: Traço (15px), Espaço(5px), Ponto(2px), Espaço(5px), Ponto(2px), Espaço(5px)
        ctx.setLineDash([15, 5, 2, 5, 2, 5]);

        // Limites da tela em pixels físicos
        const left = 0;
        const right = canvas.width;
        const top = 0;
        const bottom = canvas.height;

        // Converte Limites da Tela -> Limites do Mundo (mm)
        const worldLeft = (left - m_e) / m_a;
        const worldRight = (right - m_e) / m_a;
        const worldTop = (top - m_f) / m_d;
        const worldBottom = (bottom - m_f) / m_d;

        // Range de iteração
        const startX = Math.floor(worldLeft / spacing) * spacing;
        const endX = Math.ceil(worldRight / spacing) * spacing;
        const startY =
          Math.floor(Math.min(worldTop, worldBottom) / spacing) * spacing;
        const endY =
          Math.ceil(Math.max(worldTop, worldBottom) / spacing) * spacing;

        // Desenha Verticais
        for (let x = startX; x <= endX; x += spacing) {
          ctx.moveTo(x, startY);
          ctx.lineTo(x, endY);
        }
        // Desenha Horizontais
        for (let y = startY; y <= endY; y += spacing) {
          ctx.moveTo(startX, y);
          ctx.lineTo(endX, y);
        }
        ctx.stroke();

        // Destaque dos Eixos X e Y (Sólidos, sem tracejado)
        ctx.setLineDash([]); // <--- Remove tracejado para os eixos principais
        ctx.beginPath();
        ctx.strokeStyle = "#666"; // Eixos um pouco mais fortes
        ctx.lineWidth = lineWidth * 0.3;

        if (startX <= 0 && endX >= 0) {
          ctx.moveTo(0, startY);
          ctx.lineTo(0, endY);
        }
        if (startY <= 0 && endY >= 0) {
          ctx.moveTo(startX, 0);
          ctx.lineTo(endX, 0);
        }
        ctx.stroke();

        ctx.restore(); // Restaura tudo para não afetar o desenho da peça
      }

      // ======================================================================
      // DESENHO DAS ENTIDADES (Se houver arquivo)
      // ======================================================================
      if (processed) {
        processed.entities.forEach((ent) => {
          ctx.beginPath();
          ctx.strokeStyle =
            ent.layer === "1" || ent.layer === "CORTE"
              ? "#0f0"
              : ent.layer === "2" || ent.layer === "GRAVACAO"
                ? "#f0f"
                : "#fff";

          if (ent.vertices && ent.vertices.length > 0) {
            ctx.moveTo(ent.vertices[0].x, ent.vertices[0].y);
            for (let i = 1; i < ent.vertices.length; i++) {
              ctx.lineTo(ent.vertices[i].x, ent.vertices[i].y);
            }
            if (ent.closed) ctx.closePath();
          } else if (ent.type === "CIRCLE" && ent.center && ent.radius) {
            ctx.moveTo(ent.center.x + ent.radius, ent.center.y);
            ctx.arc(ent.center.x, ent.center.y, ent.radius, 0, Math.PI * 2);
          } else if (ent.type === "ARC" && ent.center && ent.radius) {
            ctx.arc(
              ent.center.x,
              ent.center.y,
              ent.radius,
              ent.startAngle || 0,
              ent.endAngle || 0,
              false,
            );
          }
          ctx.stroke();
        });
      }

      // ======================================================================
      // DESENHO DAS RÉGUAS (Overlay)
      // ======================================================================

      // Funções de projeção para a régua (mesma lógica da matriz)
      const tx = (x: number) => (x * scaleBase + offXBase) * k + panX;
      const ty = (y: number) => (h - (y * scaleBase + offYBase)) * k + panY;

      // Reseta matriz para desenhar UI
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      drawRulersSmart(ctx, w, h, tx, ty, scaleBase * k);
    },
    [showGrid, gridSpacing],
  ); // Dependências atualizadas

  // 3. HANDLERS PARA O HOOK
  const handleVisualPan = useCallback(
    (newT: { x: number; y: number; k: number }) => {
      transformRef.current = newT;
      draw(newT);
    },
    [draw],
  );

  const handlePanEnd = useCallback(
    (finalT: { x: number; y: number; k: number }) => {
      setTransform(finalT);
      transformRef.current = finalT;
    },
    [],
  );

  // 4. INTEGRAÇÃO COM O HOOK
  const { panHandlers, isPanning } = useCanvasPan(
    transform,
    handleVisualPan,
    handlePanEnd,
    containerRef,
    transformRef,
  );

  // 5. ZOOM VIA SCROLL
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const zoomIntensity = 0.1;
      const wheelDirection = e.deltaY < 0 ? 1 : -1;
      const scaleFactor = Math.exp(wheelDirection * zoomIntensity);

      const current = transformRef.current;
      const newK = Math.max(0.1, Math.min(current.k * scaleFactor, 50));

      const newX = mouseX - (mouseX - current.x) * (newK / current.k);
      const newY = mouseY - (mouseY - current.y) * (newK / current.k);

      const newTransform = { x: newX, y: newY, k: newK };

      transformRef.current = newTransform;
      draw(newTransform);
      setTransform(newTransform);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [draw]);

  // Desenho Inicial
  useEffect(() => {
    const timer = setTimeout(() => {
      draw(transformRef.current);
    }, 50);
    return () => clearTimeout(timer);
  }, [processedData, draw]); // Redesenha se os dados mudarem

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        cursor: isPanning ? "grabbing" : "default",
        touchAction: "none",
      }}
      {...panHandlers}
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
};
