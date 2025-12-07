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
  const [step, setStep] = useState(1); // Passo padrão de 1mm

  // Estado local para a posição do menu (permite arrastar)
  const [position, setPosition] = useState({ x, y });
  const [isDragging, setIsDragging] = useState(false);

  // Refs para cálculo de arraste
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, menuX: 0, menuY: 0 });

  // Sincroniza se o pai mandar novas coordenadas (ex: clicou com direito em outra peça)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPosition({ x, y });
  }, [x, y]);

  // Efeito global para o arraste (funciona mesmo se o mouse sair rápido do menu)
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
    // Apenas botão esquerdo
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

  // Estilo do Painel Flutuante
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
    userSelect: "none", // Evita selecionar texto ao arrastar
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
  };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #555",
    paddingBottom: "5px",
    marginBottom: "5px",
    cursor: isDragging ? "grabbing" : "move", // Cursor indica que pode mover
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
        {/* Botão fechar (não propaga o arraste) */}
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

      {/* Passo de Movimento */}
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
          value={step}
          onChange={(e) => setStep(Number(e.target.value))}
          style={{
            width: "50px",
            background: "#222",
            border: "1px solid #555",
            color: "#fff",
            padding: "2px 5px",
            borderRadius: "3px",
          }}
        />
      </div>

      {/* Direcionais */}
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
        </button>{" "}
        {/* Y negativo sobe */}
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
        </button>{" "}
        {/* Y positivo desce */}
        <button
          style={btnStyle}
          onClick={() => onMove(step, 0)}
          title="Direita"
        >
          ▶
        </button>
      </div>

      {/* Rotação */}
      <div
        style={{
          borderTop: "1px solid #555",
          paddingTop: "10px",
          display: "flex",
          gap: "5px",
        }}
      >
        <button style={btnStyle} onClick={() => onRotate(90)}>
          ↺ 90°
        </button>
        <button style={btnStyle} onClick={() => onRotate(-90)}>
          ↻ 90°
        </button>
      </div>
      <div style={{ display: "flex", gap: "5px" }}>
        <button style={btnStyle} onClick={() => onRotate(1)}>
          ↺ 1°
        </button>
        <button style={btnStyle} onClick={() => onRotate(-1)}>
          ↻ 1°
        </button>
      </div>
    </div>
  );
};
