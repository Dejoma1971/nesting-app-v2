/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useRef, useEffect, useMemo } from "react"; // Injetado useMemo
import { calculateBoundingBox } from "../utils/geometryCore";
// Importações da nova funcionalidade de Medição/Snap
import {
  getSnapPoints,
  findNearestSnapPoint,
  getPerpendicularSnaps,
} from "../utils/snapService";
import type { SnapPoint } from "../utils/snapService";

interface PartViewerModalProps {
  part: any;
  openPoints: any[];
  theme: any;
  onClose: () => void;
  onRotate: (direction: "cw" | "ccw") => void;
  onMirror: (id: string) => void;
  onToggleLock: (id: string) => void;
  onFixGeometry: () => void;
}

// --- FUNÇÃO DE RENDERIZAÇÃO LOCAL (Mantida Original) ---
const renderEntityLocal = (
  entity: any,
  index: number,
  blocks?: any,
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
          {block.entities.map((child: any, i: number) =>
            renderEntityLocal(child, i, blocks),
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
      const { startAngle, endAngle, radius, center } = entity;
      const x1 = center.x + radius * Math.cos(startAngle);
      const y1 = center.y + radius * Math.sin(startAngle);
      const x2 = center.x + radius * Math.cos(endAngle);
      const y2 = center.y + radius * Math.sin(endAngle);
      let da = endAngle - startAngle;
      if (da < 0) da += 2 * Math.PI;
      const largeArc = da > Math.PI ? 1 : 0;
      const d = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`;
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

export const PartViewerModalOptimized: React.FC<PartViewerModalProps> = ({
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

  // --- LÓGICA ORIGINAL DE VIEWBOX (Mantida) ---
  const calcBox = (p: any) => {
    const box = calculateBoundingBox(p.entities, p.blocks);
    const w = box.maxX - box.minX || 100;
    const h = box.maxY - box.minY || 100;
    const pad = Math.max(w, h) * 0.2;
    return {
      x: box.minX - pad,
      y: box.minY - pad,
      w: w + pad * 2,
      h: h + pad * 2,
    };
  };

  const [viewBox, setViewBox] = useState(() => calcBox(part));

  // ⬇️ --- [INSERÇÃO 1] NOVO ESTADO PARA ESCALA DE TELA --- ⬇️
  const [matrixScale, setMatrixScale] = useState(1);

  // Toda vez que o ViewBox muda (zoom/pan), recalculamos a escala real da tela
  useEffect(() => {
    if (svgRef.current) {
      const ctm = svgRef.current.getScreenCTM();
      // 'a' representa a escala X (quantos pixels de tela = 1 unidade SVG)
      if (ctm && ctm.a > 0) {
        setMatrixScale(ctm.a);
      }
    }
  }, [viewBox]); // Reage ao zoom
  // ⬆️ --------------------------------------------------- ⬆️

  const [prevPartId, setPrevPartId] = useState(part.id);
  const [prevGeomString, setPrevGeomString] = useState(
    JSON.stringify(part.entities),
  );

  const currentGeomString = JSON.stringify(part.entities);

  if (part.id !== prevPartId || currentGeomString !== prevGeomString) {
    setPrevPartId(part.id);
    setPrevGeomString(currentGeomString);
    setViewBox(calcBox(part));
  }

  // --- NOVOS ESTADOS: FERRAMENTA DE MEDIDA ---
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureStart, setMeasureStart] = useState<SnapPoint | null>(null);
  const [activeSnap, setActiveSnap] = useState<SnapPoint | null>(null);
  const [currentMousePos, setCurrentMousePos] = useState({ x: 0, y: 0 });

  // Mapeamento de SnapPoints (useMemo para performance)
  const snapPoints = useMemo(() => {
    if (part && part.entities) return getSnapPoints(part.entities);
    return [];
  }, [part]);

  // ⬇️ --- [INSERÇÃO 2] SUBSTITUIR ESTE BLOCO INTEIRO --- ⬇️
  // Define o tamanho visual fixo (em pixels) para os elementos
  const visualScale = useMemo(() => {
    // 20 pixels é um bom tamanho para o texto e ícones na tela
    const TARGET_PIXEL_SIZE = 14;
    // Convertemos pixels de tela para unidades do desenho
    return TARGET_PIXEL_SIZE / matrixScale;
  }, [matrixScale]);
  // ⬆️ -------------------------------------------------- ⬆️

  // ⬇️ --- [CORREÇÃO] ZOOM DIRECIONADO AO PONTEIRO --- ⬇️
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    e.preventDefault();

    // 1. Define o fator de zoom (Inverter se quiser mudar a direção do scroll)
    const factor = e.deltaY > 0 ? 1.1 : 0.9;

    // 2. Obtém as dimensões atuais da tela
    const rect = svgRef.current!.getBoundingClientRect();

    // 3. Calcula a posição relativa do mouse (0 a 1)
    const ratioX = (e.clientX - rect.left) / rect.width;

    // IMPORTANTE: Como o SVG tem scale(1, -1), o eixo Y é invertido.
    // O 'Zero' do desenho é embaixo, mas o 'Zero' da tela é em cima.
    // Então, quanto mais para baixo o mouse (maior clientY), mais perto do zero Y do desenho.
    // Usamos (1 - ratio) para pegar a distância a partir de BAIXO.
    const ratioY = 1 - (e.clientY - rect.top) / rect.height;

    setViewBox((prev) => {
      // Novas dimensões
      const newW = prev.w * factor;
      const newH = prev.h * factor;

      // Diferença de tamanho (O quanto cresceu ou encolheu)
      const dx = newW - prev.w;
      const dy = newH - prev.h;

      return {
        // Movemos a origem (X, Y) na direção oposta ao mouse para compensar o zoom
        x: prev.x - dx * ratioX,
        y: prev.y - dy * ratioY,
        w: newW,
        h: newH,
      };
    });
  };
  // ⬆️ ------------------------------------------------ ⬆️

  // --- PAN ORIGINAL (Mantido) ---
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanning || !svgRef.current) return;
      const ctm = svgRef.current.getScreenCTM();
      if (!ctm) return;
      const dx = (e.clientX - dragRef.current.startX) / ctm.a;
      const dy = (e.clientY - dragRef.current.startY) / Math.abs(ctm.d);
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
  }, [isPanning]);

  // --- NOVAS FUNÇÕES DE APOIO À MEDIÇÃO ---
  const getSVGCoords = (clientX: number, clientY: number) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const pt = svgRef.current.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgP = pt.matrixTransform(ctm.inverse());
    return { x: svgP.x, y: svgP.y };
  };

  const handleMouseMoveInteractive = (e: React.MouseEvent) => {
    const coords = getSVGCoords(e.clientX, e.clientY);
    setCurrentMousePos(coords);

    if (isMeasuring && !isPanning) {
      const zoom = svgRef.current?.getScreenCTM()?.a || 1;
      const threshold = 15 / zoom;

      // ⬇️ --- LÓGICA DE PERPENDICULAR --- ⬇️
      let candidatePoints = snapPoints; // Começa com os estáticos (Endpoint, Midpoint, etc)

      // Se já temos o primeiro ponto, calculamos os perpendiculares em relação a ele
      if (measureStart) {
        const perpSnaps = getPerpendicularSnaps(part.entities, measureStart);
        // Fundimos as listas
        candidatePoints = [...snapPoints, ...perpSnaps];
      }
      // ⬆️ ------------------------------- ⬆️

      const nearest = findNearestSnapPoint(
        coords.x,
        coords.y,
        candidatePoints,
        threshold,
      );
      setActiveSnap(nearest);
    } else {
      setActiveSnap(null);
    }
  };

  const handleSVGClick = () => {
    if (!isMeasuring) return;
    const point = activeSnap || {
      x: currentMousePos.x,
      y: currentMousePos.y,
      type: "endpoint" as any,
    };
    if (!measureStart) {
      setMeasureStart(point);
    } else {
      setMeasureStart(null); // Reseta para nova medição
    }
  };

  const handleCenter = () => setViewBox(calcBox(part));

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
        {/* Header Original */}
        <div
          style={{
            padding: "15px",
            borderBottom: `1px solid ${theme.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
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

        {/* Alerta de Pontos Abertos Original */}
        {openPoints.length > 0 && (
          <div
            style={{
              background: "#fff3cd",
              color: "#856404",
              padding: "10px 15px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: "1px solid #ffeeba",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#d9534f"
                strokeWidth="2"
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
                <span style={{ fontWeight: "bold", fontSize: 13 }}>
                  Atenção: Perímetro Aberto
                </span>
                <span style={{ fontSize: 11 }}>
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
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              Fechar Peça
            </button>
          </div>
        )}

        {/* Área SVG Interativa */}
        <div
          style={{
            flex: 1,
            background: theme.inputBg,
            position: "relative",
            overflow: "hidden",
          }}
          onMouseDown={(e) => {
            if (!isMeasuring) {
              e.preventDefault();
              setIsPanning(true);
              dragRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                initialViewBox: { ...viewBox },
              };
            }
          }}
        >
          <svg
            ref={svgRef}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
            style={{
              width: "100%",
              height: "100%",
              cursor: isMeasuring
                ? "crosshair"
                : isPanning
                  ? "grabbing"
                  : "grab",
            }}
            transform="scale(1, -1)"
            preserveAspectRatio="xMidYMid meet"
            onWheel={handleWheel}
            onMouseMove={handleMouseMoveInteractive}
            onClick={handleSVGClick}
          >
            {/* Grid Original */}
            <defs>
              <pattern
                id="gridModal"
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
              fill="url(#gridModal)"
            />

            {part.entities.map((ent: any, i: number) =>
              renderEntityLocal(ent, i, part.blocks),
            )}

            {/* Pontos Abertos Originais */}
            {openPoints.map((p: any, idx: number) => (
              <circle
                key={idx}
                cx={p.x}
                cy={p.y}
                r={Math.max(part.width / 40, 3)}
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

            {/* 1. Visualização Gráfica da Régua (Dentro do SVG) */}
            {isMeasuring &&
              measureStart &&
              (() => {
                const endX = activeSnap?.x ?? currentMousePos.x;
                const endY = activeSnap?.y ?? currentMousePos.y;

                return (
                  <g>
                    {/* Linha Tracejada */}
                    <line
                      x1={measureStart.x}
                      y1={measureStart.y}
                      x2={endX}
                      y2={endY}
                      stroke="#007bff"
                      strokeWidth={2}
                      strokeDasharray="4 2"
                      vectorEffect="non-scaling-stroke"
                    />
                    {/* Bolinha no início */}
                    <circle
                      cx={measureStart.x}
                      cy={measureStart.y}
                      r={visualScale / 4}
                      fill="#007bff"
                    />
                    {/* Mira no final */}
                    <line
                      x1={endX - visualScale / 4}
                      y1={endY - visualScale / 4}
                      x2={endX + visualScale / 4}
                      y2={endY + visualScale / 4}
                      stroke="#007bff"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                    <line
                      x1={endX - visualScale / 4}
                      y1={endY + visualScale / 4}
                      x2={endX + visualScale / 4}
                      y2={endY - visualScale / 4}
                      stroke="#007bff"
                      strokeWidth={1}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })()}

            {/* 2. Indicador de Snap (Quadrado Verde) */}
            {activeSnap && (
              <g transform={`translate(${activeSnap.x}, ${activeSnap.y})`}>
                <rect
                  x={-visualScale / 2}
                  y={-visualScale / 2}
                  width={visualScale}
                  height={visualScale}
                  fill="none"
                  stroke="#28a745"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1={-visualScale / 3}
                  y1="0"
                  x2={visualScale / 3}
                  y2="0"
                  stroke="#28a745"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
                <line
                  x1="0"
                  y1={-visualScale / 3}
                  x2="0"
                  y2={visualScale / 3}
                  stroke="#28a745"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            )}
          </svg>{" "}
          {/* <--- FECHAMENTO DO SVG (Essencial) */}
          {/* ⬇️ --- Painel HUD de Medição (Fora do SVG) --- ⬇️ */}
          {isMeasuring &&
            measureStart &&
            (() => {
              const endX = activeSnap?.x ?? currentMousePos.x;
              const endY = activeSnap?.y ?? currentMousePos.y;
              const dx = Math.abs(endX - measureStart.x);
              const dy = Math.abs(endY - measureStart.y);
              const dist = Math.sqrt(dx * dx + dy * dy);

              return (
                <div
                  style={{
                    position: "absolute",
                    bottom: "20px",
                    right: "20px",
                    background: "rgba(33, 37, 41, 0.95)",
                    color: "#fff",
                    padding: "10px 15px",
                    borderRadius: "6px",
                    boxShadow: "0 4px 6px rgba(0,0,0,0.3)",
                    fontFamily: "monospace",
                    fontSize: "13px",
                    zIndex: 100,
                    border: "1px solid rgba(255,255,255,0.2)",
                    pointerEvents: "none",
                    display: "flex",
                    flexDirection: "column",
                    gap: "4px",
                  }}
                >
                  <div
                    style={{
                      fontWeight: "bold",
                      borderBottom: "1px solid #555",
                      paddingBottom: "4px",
                      marginBottom: "2px",
                      color: "#66b0ff",
                    }}
                  >
                    📏 Dimensão
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "15px",
                    }}
                  >
                    <span>Distância:</span>
                    <span style={{ fontWeight: "bold" }}>
                      {dist.toFixed(2)} mm
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "15px",
                      color: "#ced4da",
                    }}
                  >
                    <span>Delta X:</span>
                    <span>{dx.toFixed(2)}</span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "15px",
                      color: "#ced4da",
                    }}
                  >
                    <span>Delta Y:</span>
                    <span>{dy.toFixed(2)}</span>
                  </div>
                  <div
                    style={{
                      marginTop: "4px",
                      fontSize: "10px",
                      opacity: 0.6,
                      fontStyle: "italic",
                    }}
                  >
                    * Clique para soltar
                  </div>
                </div>
              );
            })()}
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
            {isMeasuring
              ? "Modo Medir: Clique em dois pontos (Snap ativo)"
              : "Scroll p/ Zoom • Arraste p/ Mover"}
          </div>
        </div>

        {/* Rodapé Original + Novo Botão Medir */}
        <div
          style={{
            padding: "20px",
            borderTop: `1px solid ${theme.border}`,
            display: "flex",
            justifyContent: "center",
            gap: "10px",
            background: theme.modalBg,
          }}
        >
          <button
            onClick={handleCenter}
            title="Centralizar"
            style={{
              padding: "8px",
              background: theme.inputBg,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M22 12h-4M6 12H2M12 6V2M12 22v-4" />
              <circle cx="12" cy="12" r="2" />
            </svg>
          </button>

          <button
            onClick={() => onToggleLock(part.id)}
            style={{
              padding: "8px",
              background: part.isRotationLocked ? "#dc3545" : "transparent",
              color: part.isRotationLocked ? "#fff" : theme.text,
              border: `1px solid ${part.isRotationLocked ? "#dc3545" : theme.border}`,
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
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
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
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
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
              </svg>
            )}
          </button>

          <button
            onClick={() => !part.isRotationLocked && onRotate("ccw")}
            disabled={part.isRotationLocked}
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
            ↺ Girar Anti
          </button>
          <button
            onClick={() => !part.isRotationLocked && onRotate("cw")}
            disabled={part.isRotationLocked}
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
            ↻ Girar Hor.
          </button>

          <button
            onClick={() => onMirror(part.id)}
            style={{
              padding: "6px 12px",
              borderRadius: "4px",
              border: `1px solid ${theme.border}`,
              background: theme.buttonBg || "#f0f0f0",
              color: theme.text,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ marginRight: 5 }}
            >
              <path d="M7.5 12h9" />
              <path d="M16.5 7.5L21 12l-4.5 4.5" />
              <path d="M7.5 7.5L3 12l4.5 4.5" />
              <line x1="12" y1="4" x2="12" y2="20" strokeDasharray="2 2" />
            </svg>
            Espelhar
          </button>

          {/* BOTÃO MÉTRICO: ÍCONE DE RÉGUA */}
          <button
            onClick={() => {
              setIsMeasuring(!isMeasuring);
              setMeasureStart(null);
            }}
            title={isMeasuring ? "Desativar Medição" : "Medir Distância (M)"}
            style={{
              padding: "8px",
              background: isMeasuring ? "#28a745" : theme.inputBg,
              color: isMeasuring ? "#fff" : theme.text,
              border: `1px solid ${isMeasuring ? "#28a745" : theme.border}`,
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              transition: "all 0.2s",
            }}
          >
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
              {/* Ícone de Régua Técnica */}
              <path d="M21.3 8.11 15.89 2.7a2.5 2.5 0 0 0-3.53 0L2.7 12.35a2.5 2.5 0 0 0 0 3.53l5.41 5.41a2.5 2.5 0 0 0 3.53 0L21.3 11.64a2.5 2.5 0 0 0 0-3.53Z" />
              <path d="m7.5 10.5 2 2" />
              <path d="m10.5 7.5 2 2" />
              <path d="m13.5 4.5 2 2" />
              <path d="m4.5 13.5 2 2" />
            </svg>
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
