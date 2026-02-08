import React, { useRef, useEffect, useMemo } from "react";
import DxfParser from "dxf-parser";
import { explodeDXFGeometry } from "../utils/dxfExploder";
import { calculateBoundingBox } from "../utils/geometryCore";
import { useCanvasNav } from "../postProcessador/hooks/useCanvasNav";

// Exportando a interface corretamente para o outro arquivo
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

// Interface para evitar o erro de 'any' do ESLint nas tabelas do parser
interface IDxfLayerTable {
  [key: string]: {
    name: string;
    color: number;
  };
}

export const DxfViewer: React.FC<DxfViewerProps> = ({
  dxfContent,
  onLayersDetected,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const { transform, handlers, isDragging } = useCanvasNav(canvasRef);

  const processed = useMemo(() => {
    if (!dxfContent) return null;
    try {
      const parser = new DxfParser();
      const dxf = parser.parseSync(dxfContent);
      if (!dxf) return null;

      // Dentro do useMemo do DxfViewer.tsx
      if (onLayersDetected && dxf.tables?.layer?.layers) {
        const layersTable = dxf.tables.layer.layers as IDxfLayerTable;
        const layers: DxfLayer[] = Object.values(layersTable).map((l) => {
          let hex = "#ffffff"; // Branco padrão (Layer 0)

          // Forçar cores baseadas no padrão que você quer:
          if (l.color === 3 || l.name === "1")
            hex = "#00ff00"; // Verde Vibrante
          else if (l.color === 6 || l.name === "2")
            hex = "#ff00ff"; // Magenta Vibrante
          else if (l.color === 7 || l.name === "0") hex = "#ffffff"; // Branco

          return {
            name: l.name,
            aci: l.color,
            color: hex,
          };
        });

        // Envia a lista para o PostProcessorScreen
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !processed) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const parent = canvas.parentElement;
    const w = parent?.clientWidth || 800;
    const h = parent?.clientHeight || 600;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    // Escala para High DPI
    ctx.scale(dpr, dpr);

    // Fundo
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    // ========================================================================
    // CÁLCULO "FIT TO SCREEN" (BASE)
    // ========================================================================
    const pad = 40;

    // 1. Definimos as variáveis com o sufixo 'Base' para evitar confusão
    const scaleBase = Math.min(
      (w - pad) / processed.box.w,
      (h - pad) / processed.box.h,
    );

    const offXBase =
      (w - processed.box.w * scaleBase) / 2 - processed.box.x * scaleBase;
    const offYBase =
      (h - processed.box.h * scaleBase) / 2 - processed.box.y * scaleBase;

    // ========================================================================
    // FUNÇÕES DE TRANSFORMAÇÃO DE COORDENADAS
    // ========================================================================
    // A fórmula é: (Coord * EscalaBase + OffsetBase) * ZoomDinamico + PanDinamico

    const tx = (x: number) =>
      (x * scaleBase + offXBase) * transform.k + transform.x;
    // O eixo Y é invertido no canvas (h - y)
    const ty = (y: number) =>
      (h - (y * scaleBase + offYBase)) * transform.k + transform.y;

    // Configurações visuais fixas (Hairline)
    ctx.lineWidth = 1;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    processed.entities.forEach((ent) => {
      ctx.beginPath();
      ctx.strokeStyle =
        ent.layer === "1" || ent.layer === "CORTE"
          ? "#0f0"
          : ent.layer === "2" || ent.layer === "GRAVACAO"
            ? "#f0f"
            : "#fff";

      if (ent.vertices && ent.vertices.length > 0) {
        ctx.moveTo(tx(ent.vertices[0].x), ty(ent.vertices[0].y));
        for (let i = 1; i < ent.vertices.length; i++) {
          ctx.lineTo(tx(ent.vertices[i].x), ty(ent.vertices[i].y));
        }
        if (ent.closed) ctx.closePath();
      } else if (ent.type === "CIRCLE" && ent.center && ent.radius) {
        // O raio também precisa ser multiplicado pelo Zoom do usuário (transform.k)
        const scaledRadius = ent.radius * scaleBase * transform.k;
        ctx.arc(
          tx(ent.center.x),
          ty(ent.center.y),
          scaledRadius,
          0,
          Math.PI * 2,
        );
      } else if (ent.type === "ARC" && ent.center && ent.radius) {
        const scaledRadius = ent.radius * scaleBase * transform.k;
        const s = ent.startAngle || 0;
        const e = ent.endAngle || 0;
        ctx.arc(tx(ent.center.x), ty(ent.center.y), scaledRadius, -s, -e, true);
      }
      ctx.stroke();
    });
  }, [processed, transform]);

  // Lógica do Cursor Inteligente
  let cursorStyle = "default";
  if (isDragging) {
    cursorStyle = "grabbing"; // Mão fechada (clicou e segurou)
  } else if (transform.k > 1.01) {
    cursorStyle = "grab"; // Mão aberta (tem zoom, pode arrastar)
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        display: "block",
        cursor: cursorStyle, // <--- Aplica o estilo dinâmico
      }}
      {...handlers}
    />
  );
};
