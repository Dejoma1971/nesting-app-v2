import React, { useRef, useEffect, useMemo } from "react";
import DxfParser from "dxf-parser";
import { explodeDXFGeometry } from "../utils/dxfExploder";
import { calculateBoundingBox } from "../utils/geometryCore";

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
    ctx.scale(dpr, dpr);

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);

    const pad = 40;
    const scale = Math.min(
      (w - pad) / processed.box.w,
      (h - pad) / processed.box.h,
    );
    const offX = (w - processed.box.w * scale) / 2 - processed.box.x * scale;
    const offY = (h - processed.box.h * scale) / 2 - processed.box.y * scale;

    const tx = (x: number) => x * scale + offX;
    const ty = (y: number) => h - (y * scale + offY);

    processed.entities.forEach((ent) => {
      ctx.beginPath();
      ctx.strokeStyle =
        ent.layer === "1" || ent.layer === "CORTE"
          ? "#0f0"
          : ent.layer === "2" || ent.layer === "GRAVACAO"
            ? "#f0f"
            : "#fff";
      ctx.lineWidth = 1;

      if (ent.vertices && ent.vertices.length > 0) {
        ctx.moveTo(tx(ent.vertices[0].x), ty(ent.vertices[0].y));
        for (let i = 1; i < ent.vertices.length; i++) {
          ctx.lineTo(tx(ent.vertices[i].x), ty(ent.vertices[i].y));
        }
        if (ent.closed) ctx.closePath();
      } else if (ent.type === "CIRCLE" && ent.center && ent.radius) {
        ctx.arc(
          tx(ent.center.x),
          ty(ent.center.y),
          ent.radius * scale,
          0,
          Math.PI * 2,
        );
      } else if (ent.type === "ARC" && ent.center && ent.radius) {
        const s = ent.startAngle || 0;
        const e = ent.endAngle || 0;
        ctx.arc(
          tx(ent.center.x),
          ty(ent.center.y),
          ent.radius * scale,
          -s,
          -e,
          true,
        );
      }
      ctx.stroke();
    });
  }, [processed]);

  return <canvas ref={canvasRef} style={{ display: "block" }} />;
};
