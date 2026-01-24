import React, { useRef, useEffect, useMemo } from "react";
import DxfParser from "dxf-parser";
import { explodeDXFGeometry } from "../utils/dxfExploder"; // Usando o seu exploder robusto
import { calculateBoundingBox } from "../utils/geometryCore";

interface DxfViewerProps {
  dxfContent: string | null;
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

export const DxfViewer: React.FC<DxfViewerProps> = ({ dxfContent }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 1. PROCESSAMENTO: Usa o que você já tem no dxfExploder
  const processed = useMemo(() => {
    if (!dxfContent) return null;
    try {
      const parser = new DxfParser();
      const dxf = parser.parseSync(dxfContent);
      if (!dxf) return null;

      // O explodeDXFGeometry já resolve blocos, splines e elipses
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
  }, [dxfContent]);

  // 2. RENDERIZAÇÃO: Apenas desenha os pontos
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

    ctx.fillStyle = "#000"; // Fundo preto padrão CAD
    ctx.fillRect(0, 0, w, h);

    const pad = 40;
    const scale = Math.min(
      (w - pad) / processed.box.w,
      (h - pad) / processed.box.h,
    );

    // Centralização
    const offX = (w - processed.box.w * scale) / 2 - processed.box.x * scale;
    const offY = (h - processed.box.h * scale) / 2 - processed.box.y * scale;

    const tx = (x: number) => x * scale + offX;
    const ty = (y: number) => h - (y * scale + offY); // Inverte Y para CAD

    processed.entities.forEach((ent) => {
      ctx.beginPath();
      // Cores do seu padrão LAYER_CONFIG
      ctx.strokeStyle =
        ent.layer === "1" || ent.layer === "CORTE"
          ? "#0f0"
          : ent.layer === "2" || ent.layer === "GRAVACAO"
            ? "#f0f"
            : "#fff";
      ctx.lineWidth = 1;

      // Se o exploder funcionou, quase tudo virou vértices
      if (ent.vertices && ent.vertices.length > 0) {
        ctx.moveTo(tx(ent.vertices[0].x), ty(ent.vertices[0].y));
        for (let i = 1; i < ent.vertices.length; i++) {
          ctx.lineTo(tx(ent.vertices[i].x), ty(ent.vertices[i].y));
        }
        if (ent.closed) ctx.closePath();
      }
      // Arcos e círculos que não precisaram ser explodidos (escala uniforme)
      else if (ent.type === "CIRCLE" && ent.center && ent.radius) {
        ctx.arc(
          tx(ent.center.x),
          ty(ent.center.y),
          ent.radius * scale,
          0,
          Math.PI * 2,
        );
      } else if (ent.type === "ARC" && ent.center && ent.radius) {
        // O Canvas usa radianos, o exploder já normalizou os ângulos
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
