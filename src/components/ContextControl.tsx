import React, { useState, useEffect, useRef } from "react";

interface ContextControlProps {
  x: number;
  y: number;
  onClose: () => void;
  onMove: (dx: number, dy: number) => void;
  onRotate: (angle: number) => void;
}

export const ContextControl: React.FC<ContextControlProps> = ({
  x,
  y,
  onClose,
  onMove,
  onRotate,
}) => {
  const [step, setStep] = useState(1); // Passo de deslocamento (mm)
  const [rotationStep, setRotationStep] = useState(90); // Novo: Passo de rotação (graus)

  // Estado local para a posição do menu (permite arrastar)
  const [position, setPosition] = useState({ x, y });
  const [isDragging, setIsDragging] = useState(false);

  // Refs para cálculo de arraste
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, menuX: 0, menuY: 0 });

  // Sincroniza se o pai mandar novas coordenadas
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosition({ x, y });
  }, [x, y]);

  // Efeito global para o arraste
  useEffect(() => {
    const handleGlobalMove = (e: MouseEvent) => {
      if (!isDragging) return;
      e.preventDefault();

      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;

      setPosition({
        x: dragStartRef.current.menuX + dx,
        y: dragStartRef.current.menuY + dy,
      });
    };

    const handleGlobalUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener("mousemove", handleGlobalMove);
      window.addEventListener("mouseup", handleGlobalUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleGlobalMove);
      window.removeEventListener("mouseup", handleGlobalUp);
    };
  }, [isDragging]);

  // Inicia o arraste
  const handleMouseDownHeader = (e: React.MouseEvent) => {
    if (e.button !== 0) return;

    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      menuX: position.x,
      menuY: position.y,
    };
  };

  // Estilos
  const style: React.CSSProperties = {
    position: "fixed",
    top: position.y,
    left: position.x,
    zIndex: 2000,
    background: "#333",
    border: "1px solid #555",
    borderRadius: "8px",
    padding: "10px",
    boxShadow: "0 4px 15px rgba(0,0,0,0.5)",
    color: "#fff",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    minWidth: "160px",
    userSelect: "none",
  };

  const btnStyle: React.CSSProperties = {
    background: "#444",
    border: "1px solid #666",
    color: "#fff",
    borderRadius: "4px",
    cursor: "pointer",
    padding: "5px",
    flex: 1,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontWeight: "bold",
    fontSize: "14px",
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #555",
    paddingBottom: "5px",
    marginBottom: "5px",
    cursor: isDragging ? "grabbing" : "move",
  };

  const inputStyle: React.CSSProperties = {
    width: "50px",
    background: "#222",
    border: "1px solid #555",
    color: "#fff",
    padding: "2px 5px",
    borderRadius: "3px",
    textAlign: "center",
  };

  return (
    <div style={style} onContextMenu={(e) => e.preventDefault()}>
      {/* CABEÇALHO ARRASTÁVEL */}
      <div style={headerStyle} onMouseDown={handleMouseDownHeader}>
        <span
          style={{
            fontSize: "12px",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <span style={{ fontSize: "14px" }}>✥</span> Ajuste Fino
        </span>
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onClose}
          style={{
            background: "transparent",
            border: "none",
            color: "#ff4d4d",
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "14px",
          }}
        >
          ✕
        </button>
      </div>

      {/* --- SEÇÃO DE MOVIMENTO --- */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "5px",
          fontSize: "12px",
        }}
      >
        <span>Passo (mm):</span>
        <input
          type="number"
          min="0.1"
          value={step}
          onChange={(e) => setStep(Number(e.target.value))}
          style={inputStyle}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: "5px",
        }}
      >
        <div />
        <button style={btnStyle} onClick={() => onMove(0, -step)} title="Cima">
          ▲
        </button>
        <div />
        <button
          style={btnStyle}
          onClick={() => onMove(-step, 0)}
          title="Esquerda"
        >
          ◀
        </button>
        <button style={btnStyle} onClick={() => onMove(0, step)} title="Baixo">
          ▼
        </button>
        <button
          style={btnStyle}
          onClick={() => onMove(step, 0)}
          title="Direita"
        >
          ▶
        </button>
      </div>

      {/* --- SEÇÃO DE ROTAÇÃO (MODIFICADA) --- */}
      <div
        style={{
          borderTop: "1px solid #555",
          paddingTop: "10px",
          display: "flex",
          flexDirection: "column",
          gap: "5px",
        }}
      >
        {/* Input de Giro Personalizado */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "12px",
          }}
        >
          <span>Giro (°):</span>
          <input
            type="number"
            min="1"
            max="90"
            value={rotationStep}
            onChange={(e) => setRotationStep(Number(e.target.value))}
            style={inputStyle}
          />
        </div>

        {/* Botões de Rotação Personalizada (Usam o valor do input) */}
        <div style={{ display: "flex", gap: "5px" }}>
          <button
            style={btnStyle}
            onClick={() => onRotate(rotationStep)}
            title={`Girar ${rotationStep}° Anti-horário`}
          >
            ↺
          </button>
          <button
            style={btnStyle}
            onClick={() => onRotate(-rotationStep)}
            title={`Girar ${rotationStep}° Horário`}
          >
            ↻
          </button>
        </div>

        {/* Botões de Rotação Fina (Fixos em 1°) */}
        <div style={{ display: "flex", gap: "5px" }}>
          <button
            style={{ ...btnStyle, fontSize: "11px", fontWeight: "normal" }}
            onClick={() => onRotate(1)}
            title="Ajuste Fino 1° Anti-horário"
          >
            ↺ 1°
          </button>
          <button
            style={{ ...btnStyle, fontSize: "11px", fontWeight: "normal" }}
            onClick={() => onRotate(-1)}
            title="Ajuste Fino 1° Horário"
          >
            ↻ 1°
          </button>
        </div>
      </div>
    </div>
  );
};