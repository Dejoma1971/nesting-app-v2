/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useMemo } from "react";
import type { ImportedPart } from "./types";
import type { PlacedPart } from "../utils/nestingCore";
import type { AppTheme } from "../styles/theme";

interface MiniatureCanvasProps {
  binId: number;
  binWidth: number;
  binHeight: number;
  parts: ImportedPart[];
  placedParts: PlacedPart[];
  theme: AppTheme;
  onClick?: () => void;
  isSelected?: boolean;
}

// --- 1. FUNÇÕES MATEMÁTICAS ---

// Função idêntica à usada no NestingBoard para garantir consistência
const calculateRotatedDimensions = (
  width: number,
  height: number,
  rotationDeg: number
) => {
  const rad = rotationDeg * (Math.PI / 180);
  const occupiedW =
    width * Math.abs(Math.cos(rad)) + height * Math.abs(Math.sin(rad));
  const occupiedH =
    width * Math.abs(Math.sin(rad)) + height * Math.abs(Math.cos(rad));
  return { occupiedW, occupiedH };
};

const bulgeToArc = (p1: any, p2: any, bulge: number) => {
  const chordDx = p2.x - p1.x;
  const chordDy = p2.y - p1.y;
  const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy);
  const radius = (chordLen * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  const cx = (p1.x + p2.x) / 2 - (chordDy * (1 - bulge * bulge)) / (4 * bulge);
  const cy = (p1.y + p2.y) / 2 + (chordDx * (1 - bulge * bulge)) / (4 * bulge);
  return { radius, cx, cy };
};

// --- 2. RENDERIZADOR LEVE (SVG PURO) ---

const renderEntitySimple = (
  entity: any,
  index: number,
  blocks: any,
  color: string,
  strokeWidth: number
): React.ReactNode => {
  const commonProps = {
    fill: "none",
    stroke: color,
    strokeWidth: strokeWidth,
    vectorEffect: "non-scaling-stroke", // Mantém a linha fina independente do zoom/escala
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (entity.type) {
    case "INSERT": {
      const block = blocks[entity.name];
      if (!block || !block.entities) return null;
      return (
        <g
          key={index}
          transform={`translate(${entity.position?.x || 0}, ${entity.position?.y || 0})`}
        >
          {block.entities.map((s: any, i: number) =>
            renderEntitySimple(s, i, blocks, color, strokeWidth)
          )}
        </g>
      );
    }
    case "LINE":
      return (
        <line
          key={index}
          x1={entity.vertices[0].x}
          y1={entity.vertices[0].y}
          x2={entity.vertices[1].x}
          y2={entity.vertices[1].y}
          {...commonProps}
        />
      );
    case "LWPOLYLINE":
    case "POLYLINE": {
      if (!entity.vertices || entity.vertices.length < 2) return null;
      let d = `M ${entity.vertices[0].x} ${entity.vertices[0].y}`;
      for (let i = 0; i < entity.vertices.length; i++) {
        const v1 = entity.vertices[i];
        const v2 = entity.vertices[(i + 1) % entity.vertices.length];
        if (i === entity.vertices.length - 1 && !entity.shape) break;
        if (v1.bulge && v1.bulge !== 0) {
          const { radius } = bulgeToArc(v1, v2, v1.bulge);
          const largeArc = Math.abs(v1.bulge) > 1 ? 1 : 0;
          const sweep = v1.bulge > 0 ? 1 : 0;
          d += ` A ${radius} ${radius} 0 ${largeArc} ${sweep} ${v2.x} ${v2.y}`;
        } else {
          d += ` L ${v2.x} ${v2.y}`;
        }
      }
      if (entity.shape) d += " Z";
      return <path key={index} d={d} {...commonProps} />;
    }
    case "CIRCLE":
      return (
        <circle
          key={index}
          cx={entity.center.x}
          cy={entity.center.y}
          r={entity.radius}
          {...commonProps}
        />
      );
    case "ARC": {
      const { startAngle, endAngle, radius, center } = entity;
      const x1 = center.x + radius * Math.cos(startAngle);
      const y1 = center.y + radius * Math.sin(startAngle);
      const x2 = center.x + radius * Math.cos(endAngle);
      const y2 = center.y + radius * Math.sin(endAngle);
      let da = endAngle - startAngle;
      if (da < 0) da += 2 * Math.PI;
      const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${da > Math.PI ? 1 : 0} 1 ${x2} ${y2}`;
      return <path key={index} d={d} {...commonProps} />;
    }
    default:
      return null;
  }
};

// --- 3. COMPONENTE PRINCIPAL ---

export const MiniatureCanvas: React.FC<MiniatureCanvasProps> = React.memo(
  ({
    binId,
    binWidth,
    binHeight,
    parts,
    placedParts,
    theme,
    onClick,
    isSelected,
  }) => {
    // Filtra apenas as peças desta chapa
    const myParts = useMemo(
      () => placedParts.filter((p) => p.binId === binId),
      [placedParts, binId]
    );

    // Configuração visual
    const strokeWidth = 1; // Espessura fina e elegante
    const viewPortBuffer = binWidth * 0.05;
    const viewBox = `${-viewPortBuffer} ${-viewPortBuffer} ${binWidth + viewPortBuffer * 2} ${binHeight + viewPortBuffer * 2}`;

    return (
      <div
        onClick={onClick}
        style={{
          width: "100%",
          height: "100%",
          cursor: "pointer",
          border: isSelected ? `2px solid #007bff` : `1px solid ${theme.border}`,
          borderRadius: "8px",
          overflow: "hidden",
          background: theme.canvasBg,
          boxShadow: isSelected ? "0 0 10px rgba(0,123,255,0.3)" : "none",
          transition: "all 0.2s ease",
          position: "relative",
        }}
      >
        <svg
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          style={{ width: "100%", height: "100%", display: "block" }}
        >
          {/* Sistema de Coordenadas CNC (Y invertido para cima) */}
          <g transform={`translate(0, ${binHeight}) scale(1, -1)`}>
            
            {/* Chapa (Borda) */}
            <rect
              x="0"
              y="0"
              width={binWidth}
              height={binHeight}
              fill={theme.canvasBg}
              stroke="#555"
              strokeWidth={strokeWidth}
              vectorEffect="non-scaling-stroke"
            />

            {/* Peças Posicionadas */}
            {myParts.map((placed) => {
              const originalPart = parts.find((p) => p.id === placed.partId);
              if (!originalPart) return null;

              // 1. Calcula o tamanho que a peça ocupa AGORA (Bounding Box Rotacionado)
              const { occupiedW, occupiedH } = calculateRotatedDimensions(
                originalPart.width,
                originalPart.height,
                placed.rotation
              );

              // 2. Encontra o CENTRO da Bounding Box na mesa
              // (Pois placed.x e placed.y são o canto superior esquerdo da Bounding Box)
              const centerX = placed.x + occupiedW / 2;
              const centerY = placed.y + occupiedH / 2;

              // 3. Transformação SVG:
              // - Move para o centro da caixa na mesa (translate centerX, centerY)
              // - Rotaciona (rotate)
              // - Move a geometria de volta metade do seu tamanho original (translate -w/2, -h/2) para centralizar a rotação
              const transform = `translate(${centerX}, ${centerY}) rotate(${placed.rotation}) translate(${-originalPart.width / 2}, ${-originalPart.height / 2})`;

              return (
                <g key={placed.uuid} transform={transform}>
                  {originalPart.entities.map((ent, i) =>
                    renderEntitySimple(
                      ent,
                      i,
                      originalPart.blocks,
                      isSelected ? "#007bff" : theme.text,
                      strokeWidth
                    )
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/* Identificador da Chapa */}
        <div
          style={{
            position: "absolute",
            bottom: "5px",
            right: "5px",
            background: "rgba(0,0,0,0.6)",
            color: "white",
            padding: "2px 6px",
            borderRadius: "4px",
            fontSize: "10px",
            fontWeight: "bold",
            pointerEvents: "none",
          }}
        >
          #{binId + 1}
        </div>
      </div>
    );
  }
);

MiniatureCanvas.displayName = "MiniatureCanvas";