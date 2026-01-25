/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useRef, useEffect, useState, useCallback } from "react";
import { calculateBoundingBox } from "../utils/geometryCore";
import type { ImportedPart } from "./types";

interface PartViewerModalProps {
  part: ImportedPart;
  openPoints: any[];
  theme: any;
  onClose: () => void;
  onRotate: (direction: "cw" | "ccw") => void;
  onMirror: (id: string) => void;
  onToggleLock: (id: string) => void;
  onFixGeometry: () => void;
}

// --- FUNÇÃO DE RENDERIZAÇÃO ---
const renderEntity = (
  entity: any,
  index: number,
  blocks?: any
): React.ReactNode => {
  switch (entity.type) {
    case "INSERT": {
      if (!blocks || !blocks[entity.name]) return null;
      const block = blocks[entity.name];
      const bPos = entity.position || { x: 0, y: 0 };
      const bScale = entity.scale?.x || 1;
      const bRot = entity.rotation || 0;
      return (
        <g
          key={index}
          transform={`translate(${bPos.x}, ${bPos.y}) rotate(${bRot}) scale(${bScale})`}
        >
          {block.entities &&
            block.entities.map((child: any, i: number) =>
              renderEntity(child, i, blocks)
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
          stroke="currentColor"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      );
    case "LWPOLYLINE":
    case "POLYLINE": {
      if (!entity.vertices) return null;
      const d = entity.vertices
        .map((v: any, i: number) => `${i === 0 ? "M" : "L"} ${v.x} ${v.y}`)
        .join(" ");
      return (
        <path
          key={index}
          d={entity.shape ? d + " Z" : d}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    case "CIRCLE":
      return (
        <circle
          key={index}
          cx={entity.center.x}
          cy={entity.center.y}
          r={entity.radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      );
    case "ARC": {
      const startAngle = entity.startAngle;
      const endAngle = entity.endAngle;
      const r = entity.radius;
      const x1 = entity.center.x + r * Math.cos(startAngle);
      const y1 = entity.center.y + r * Math.sin(startAngle);
      const x2 = entity.center.x + r * Math.cos(endAngle);
      const y2 = entity.center.y + r * Math.sin(endAngle);
      let da = endAngle - startAngle;
      if (da < 0) da += 2 * Math.PI;
      const largeArc = da > Math.PI ? 1 : 0;
      const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
      return (
        <path
          key={index}
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      );
    }
    default:
      return null;
  }
};

export const PartViewerModal: React.FC<PartViewerModalProps> = ({
  part,
  openPoints,
  theme,
  onClose,
  onRotate,
  onMirror,
  onToggleLock,
  onFixGeometry,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef({
    startX: 0,
    startY: 0,
    initialViewBox: { x: 0, y: 0 },
  });
  const [isPanning, setIsPanning] = useState(false);

  // Helper para calcular o ViewBox padrão da peça atual
  const calculateDefaultViewBox = (p: ImportedPart) => {
    const box = calculateBoundingBox(p.entities, p.blocks);
    const w = box.maxX - box.minX || 100;
    const h = box.maxY - box.minY || 100;
    const padding = Math.max(w, h) * 0.2; // 20% de margem
    return {
      x: box.minX - padding,
      y: box.minY - padding,
      w: w + padding * 2,
      h: h + padding * 2,
    };
  };

  // 1. Inicializa o ViewBox
  const [viewBox, setViewBox] = useState(() => calculateDefaultViewBox(part));

  // 2. CORREÇÃO: Padrão "Derived State" (Estado Derivado)
  // Armazenamos a peça anterior para comparar.
  const [prevPart, setPrevPart] = useState(part);

  // Se a peça mudou (rotação, espelhamento, etc), recalculamos IMEDIATAMENTE.
  // Isso acontece DURANTE o render, o React descarta o render atual e refaz com o novo valor.
  // Isso elimina a necessidade do useEffect e o erro de lint.
  if (part !== prevPart) {
    setPrevPart(part);
    setViewBox(calculateDefaultViewBox(part));
  }

  // 3. Lógica de Zoom (Roda do Mouse)
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const zoomSpeed = 0.1;
      const direction = e.deltaY > 0 ? 1 : -1;
      const factor = 1 + direction * zoomSpeed;

      const svgEl = svgRef.current;
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const ratioX = mouseX / rect.width;
      const ratioY = mouseY / rect.height;

      const newW = viewBox.w * factor;
      const newH = viewBox.h * factor;

      const dx = (newW - viewBox.w) * ratioX;
      const dy = (newH - viewBox.h) * ratioY;

      setViewBox((prev) => ({
        x: prev.x - dx,
        y: prev.y - dy,
        w: newW,
        h: newH,
      }));
    },
    [viewBox]
  );

  // 4. Lógica de Pan (Arrastar Fundo)
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsPanning(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialViewBox: { x: viewBox.x, y: viewBox.y },
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanning || !svgRef.current) return;

      const rect = svgRef.current.getBoundingClientRect();

      // Cálculo de escala
      const scaleX = viewBox.w / rect.width;
      const scaleY = viewBox.h / rect.height;
      const scale = Math.max(scaleX, scaleY);

      const deltaPixelX = e.clientX - dragRef.current.startX;
      const deltaPixelY = e.clientY - dragRef.current.startY;

      const dx = deltaPixelX * scale;
      const dy = deltaPixelY * scale;

      // Invertemos o sinal do DY por causa do sistema de coordenadas SVG flipado (scale 1, -1)
      setViewBox((prev) => ({
        ...prev,
        x: dragRef.current.initialViewBox.x - dx,
        y: dragRef.current.initialViewBox.y + dy,
      }));
    };

    const handleMouseUp = () => setIsPanning(false);

    if (isPanning) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isPanning, viewBox.w, viewBox.h]);

  const currentViewBoxString = `${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        background: theme.modalOverlay || "rgba(0,0,0,0.7)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          background: theme.modalBg,
          width: "80%",
          height: "80%",
          borderRadius: "8px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 0 20px rgba(0,0,0,0.5)",
          border: `1px solid ${theme.border}`,
        }}
      >
        {/* CABEÇALHO */}
        <div
          style={{
            padding: "15px",
            borderBottom: `1px solid ${theme.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <h3 style={{ margin: 0, color: theme.text }}>
            Visualização e Ajuste
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: theme.text,
              fontSize: "20px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* ALERTA DE GEOMETRIA ABERTA */}
        {openPoints.length > 0 && (
          <div
            style={{
              background: "#fff3cd",
              color: "#856404",
              padding: "10px 15px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: "1px solid #ffeeba",
              animation: "fadeIn 0.3s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#d9534f"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                <line
                  x1="11"
                  y1="13"
                  x2="13"
                  y2="11"
                  stroke="#fff"
                  strokeWidth="3"
                />
              </svg>

              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ fontWeight: "bold", fontSize: "13px" }}>
                  Atenção: Perímetro Aberto
                </span>
                <span style={{ fontSize: "11px" }}>
                  Detectadas {openPoints.length} pontas soltas.
                </span>
              </div>
            </div>

            <button
              onClick={onFixGeometry}
              style={{
                background: "#d9534f",
                border: "none",
                color: "white",
                padding: "5px 10px",
                borderRadius: "4px",
                fontSize: "11px",
                cursor: "pointer",
                fontWeight: "bold",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              Fechar Peça
            </button>
          </div>
        )}

        {/* ÁREA DE DESENHO (CANVAS) */}
        <div
          style={{
            flex: 1,
            position: "relative",
            background: theme.inputBg,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            padding: "0",
            minHeight: 0,
            overflow: "hidden",
            color: theme.text,
          }}
          // Eventos de Mouse no Container
          onMouseDown={handleMouseDown}
          onWheel={handleWheel}
        >
          <svg
            ref={svgRef}
            viewBox={currentViewBoxString}
            style={{
              width: "100%",
              height: "100%",
              maxWidth: "100%",
              maxHeight: "100%",
              cursor: isPanning ? "grabbing" : "default",
            }}
            transform="scale(1, -1)"
            preserveAspectRatio="xMidYMid meet"
          >
            {/* GRID DE FUNDO */}
            <defs>
              <pattern
                id="grid"
                width="100"
                height="100"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 100 0 L 0 0 0 100"
                  fill="none"
                  stroke={theme.text}
                  strokeOpacity="0.1"
                  strokeWidth="1"
                />
              </pattern>
            </defs>
            <rect
              x={viewBox.x - 50000}
              y={viewBox.y - 50000}
              width={100000}
              height={100000}
              fill="url(#grid)"
            />

            {part.entities.map((ent: any, i: number) =>
              renderEntity(ent, i, part.blocks)
            )}

            {/* Marcadores de Erro */}
            {openPoints.map((p, idx) => (
              <circle
                key={`open-${idx}`}
                cx={p.x}
                cy={p.y}
                r={Math.max((part.width || 100) / 40, 3)}
                fill="#d9534f"
                stroke="white"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              >
                <animate
                  attributeName="r"
                  values="3;6;3"
                  dur="1.5s"
                  repeatCount="indefinite"
                />
              </circle>
            ))}
          </svg>

          <div
            style={{
              position: "absolute",
              bottom: 10,
              left: 10,
              fontSize: "11px",
              opacity: 0.6,
              color: theme.text,
              pointerEvents: "none",
            }}
          >
            Scroll p/ Zoom • Arraste p/ Mover
          </div>
        </div>

        {/* BARRA DE CONTROLES INFERIOR */}
        <div
          style={{
            padding: "20px",
            borderTop: `1px solid ${theme.border}`,
            display: "flex",
            justifyContent: "center",
            gap: "10px",
            background: theme.modalBg,
            flexShrink: 0,
            alignItems: "center",
          }}
        >
          <button
            onClick={() => onToggleLock(part.id)}
            title={
              part.isRotationLocked
                ? "Destravar Rotação"
                : "Travar Rotação (Sentido do Fio)"
            }
            style={{
              padding: "8px",
              background: part.isRotationLocked ? "#dc3545" : "transparent",
              color: part.isRotationLocked ? "#fff" : theme.text,
              border: `1px solid ${
                part.isRotationLocked ? "#dc3545" : theme.border
              }`,
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginRight: "10px",
              transition: "all 0.2s",
            }}
          >
            {part.isRotationLocked ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
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
            ) : (
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
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
                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
              </svg>
            )}
          </button>

          <button
            onClick={() => !part.isRotationLocked && onRotate("ccw")}
            disabled={part.isRotationLocked}
            title="Girar Anti-Horário (90°)"
            style={{
              padding: "10px 20px",
              background: theme.inputBg,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: "4px",
              cursor: part.isRotationLocked ? "not-allowed" : "pointer",
              opacity: part.isRotationLocked ? 0.5 : 1,
            }}
          >
            ↺ Girar Anti-Horário
          </button>

          <button
            onClick={() => !part.isRotationLocked && onRotate("cw")}
            disabled={part.isRotationLocked}
            title="Girar Horário (90°)"
            style={{
              padding: "10px 20px",
              background: theme.inputBg,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: "4px",
              cursor: part.isRotationLocked ? "not-allowed" : "pointer",
              opacity: part.isRotationLocked ? 0.5 : 1,
            }}
          >
            ↻ Girar Horário
          </button>

          <button
            onClick={() => onMirror(part.id)}
            title="Espelhar (Flip Horizontal)"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "6px 12px",
              marginLeft: "5px",
              borderRadius: "4px",
              border: `1px solid ${theme.border || "#ccc"}`,
              backgroundColor: theme.buttonBg || "#f0f0f0",
              color: theme.text || "#333",
              cursor: "pointer",
            }}
          >
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
              <path d="M7.5 12h9" />
              <path d="M16.5 7.5L21 12l-4.5 4.5" />
              <path d="M7.5 7.5L3 12l4.5 4.5" />
              <line x1="12" y1="4" x2="12" y2="20" strokeDasharray="2 2" />
            </svg>
            <span style={{ marginLeft: "5px" }}>Espelhar</span>
          </button>

          <button
            onClick={onClose}
            style={{
              padding: "10px 20px",
              background: "#007bff",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              marginLeft: "20px",
            }}
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
};