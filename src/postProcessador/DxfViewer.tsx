import React, { useRef, useEffect, useMemo, useCallback, useState } from "react";
import DxfParser from "dxf-parser";
import { explodeDXFGeometry } from "../utils/dxfExploder";
import { calculateBoundingBox } from "../utils/geometryCore";
import { useCanvasPan } from "../hooks/useCanvasPan";

// --- TIPOS E INTERFACES ---
export interface DxfLayer {
  name: string;
  color: string;
  aci: number;
}

interface DxfViewerProps {
  dxfContent: string | null;
  onLayersDetected?: (layers: DxfLayer[]) => void;
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
  const draw = useCallback((currentT: { x: number; y: number; k: number }) => {
    const canvas = canvasRef.current;
    const processed = processedRef.current;
    if (!canvas || !processed) return;

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

    // Limpa a tela (usando identidade para garantir limpeza total)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Fundo Preto
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // --- CÁLCULO DA MATRIZ DE TRANSFORMAÇÃO ---
    
    // 1. "Fit to Screen" (Escala Base)
    const pad = 40;
    const scaleBase = Math.min(
      (w - pad) / processed.box.w,
      (h - pad) / processed.box.h
    );
    const offXBase = (w - processed.box.w * scaleBase) / 2 - processed.box.x * scaleBase;
    const offYBase = (h - processed.box.h * scaleBase) / 2 - processed.box.y * scaleBase;

    // 2. Montagem da Matriz Final (Fit + User Pan/Zoom)
    // Fórmula: Screen = (World * BaseScale + BaseOffset) * UserZoom + UserPan
    // Ajustado para o DPR (Device Pixel Ratio)
    
    const k = currentT.k;
    const panX = currentT.x;
    const panY = currentT.y;

    // Parâmetros da Matriz: setTransform(a, b, c, d, e, f)
    // x' = ax + cy + e
    // y' = bx + dy + f
    
    const m_a = scaleBase * k * dpr;
    const m_b = 0;
    const m_c = 0;
    const m_d = -scaleBase * k * dpr; // Negativo para inverter o eixo Y (DXF Y+ é pra cima)
    
    // Translação Final X
    const m_e = (offXBase * k + panX) * dpr;
    
    // Translação Final Y
    // Como invertemos o eixo Y com 'm_d', precisamos transladar a origem para baixo
    // (h - offYBase) é o "ponto zero visual" vertical antes do zoom
    const m_f = ((h - offYBase) * k + panY) * dpr;

    // APLICA A MATRIZ GLOBAL
    ctx.setTransform(m_a, m_b, m_c, m_d, m_e, m_f);

    // Configurações de Estilo (Inverso do zoom para manter espessura visual constante)
    // Como a matriz já escala tudo, se usarmos lineWidth=1, a linha ficará grossa no zoom.
    // Dividimos pelo scale total para manter "Hairline"
    const globalScale = scaleBase * k * dpr;
    ctx.lineWidth = 1.5 / Math.abs(globalScale / dpr); // 1.5px visual
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    // Loop de Desenho (Agora usamos coordenadas puras do DXF, sem recálculo matemático)
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
         // Oclusão de arco: DXF e Canvas usam ângulos anti-horários, mas nosso Y está invertido na matriz.
         // Isso inverte o sentido do arco visualmente. Precisamos ajustar 'anticlockwise'.
         // Teste prático: true geralmente corrige quando Y é invertido via escala negativa.
         ctx.arc(ent.center.x, ent.center.y, ent.radius, ent.startAngle || 0, ent.endAngle || 0, false);
      }
      ctx.stroke();
    });
  }, []);

  // 3. HANDLERS PARA O HOOK useCanvasPan
  const handleVisualPan = useCallback((newT: { x: number; y: number; k: number }) => {
    transformRef.current = newT;
    draw(newT); // Redesenha imediatamente (bypass React)
  }, [draw]);

  const handlePanEnd = useCallback((finalT: { x: number; y: number; k: number }) => {
    setTransform(finalT); // Sincroniza estado React (opcional, mas bom pra persistência)
    transformRef.current = finalT;
  }, []);

  // 4. INTEGRAÇÃO COM O HOOK
  // containerRef é passado para que o hook capture eventos no DIV pai
  const { panHandlers, isPanning } = useCanvasPan(
    transform,
    handleVisualPan,
    handlePanEnd,
    containerRef,
    transformRef
  );

  // 5. ZOOM VIA SCROLL (Implementação Manual para controle total)
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

      // Matemática de Zoom focada no mouse
      // P' = Mouse + (P - Mouse) * (ScaleNew / ScaleOld)
      const newX = mouseX - (mouseX - current.x) * (newK / current.k);
      const newY = mouseY - (mouseY - current.y) * (newK / current.k);

      const newTransform = { x: newX, y: newY, k: newK };
      
      transformRef.current = newTransform;
      draw(newTransform);
      
      // Debounce para salvar estado (opcional)
      setTransform(newTransform);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [draw]);

  // Desenho Inicial e Redimensionamento
  useEffect(() => {
    // Timeout para garantir que o layout HTML esteja pronto
    const timer = setTimeout(() => {
        draw(transformRef.current);
    }, 50);
    return () => clearTimeout(timer);
  }, [processedData, draw]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        cursor: isPanning ? "grabbing" : "default",
        // Aumenta a área de 'pega' para eventos de mouse
        touchAction: "none", 
      }}
      // Espalha os handlers do hook (MouseDown, MouseMove, etc)
      {...panHandlers}
      // Importante: Impede menu de contexto nativo ao clicar com botão direito para arrastar
      onContextMenu={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        style={{ display: "block", width: "100%", height: "100%" }}
      />
    </div>
  );
};