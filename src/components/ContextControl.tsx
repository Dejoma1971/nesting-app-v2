import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useTheme } from "../context/ThemeContext";

interface ContextControlProps {
  x: number;
  y: number;
  isLocked?: boolean;
  onClose: () => void;
  onMove: (dx: number, dy: number) => void;
  onRotate: (angle: number) => void;
  onDelete?: () => void;
  // ⬇️ --- NOVAS PROPS RECEBIDAS --- ⬇️
  moveStep: number;
  setMoveStep: (val: number) => void;
  fineRotStep: number;
  setFineRotStep: (val: number) => void;
  onOpenShortcuts?: () => void;
  // ⬆️ ----------------------------- ⬆️
}

export const ContextControl: React.FC<ContextControlProps> = ({
  x,
  y,
  onClose,
  onMove,
  onRotate,
  onDelete,
  isLocked = false,
  moveStep,
  setMoveStep,
  fineRotStep,
  setFineRotStep,
  onOpenShortcuts,
}) => {
  const { theme } = useTheme();

  // ⬇️ --- ESTADOS SUBSTITUÍDOS --- ⬇️
  // Garante que se a peça for bloqueada, a interface aplique 180º, sem perder a memória do passo fino original
  const currentFineRot = isLocked ? 180 : fineRotStep;
  // ⬆️ --------------------------- ⬆️

  // Estado local da posição
  const [position, setPosition] = useState({ x, y });
  const [isDragging, setIsDragging] = useState(false);

  // Refs
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, menuX: 0, menuY: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  // --- NOVO: REF PARA INTERVALO DE ROTAÇÃO CONTÍNUA ---
  const rotationIntervalRef = useRef<number | null>(null);

  // --- LÓGICA INTELIGENTE DE POSICIONAMENTO ---
  // --- LÓGICA INTELIGENTE DE POSICIONAMENTO (CORRIGIDO) ---
  // --- LÓGICA INTELIGENTE DE POSICIONAMENTO (CANTO INFERIOR ESQUERDO) ---
  useLayoutEffect(() => {
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      // const viewportWidth = window.innerWidth; // Não precisamos da largura total para alinhar à esquerda
      const viewportHeight = window.innerHeight;

      const MARGIN_LEFT = 20; // Margem da borda esquerda
      const MARGIN_BOTTOM = 80; // Margem do rodapé

      // Define X fixo na esquerda
      let newX = MARGIN_LEFT;
      // Define Y fixo embaixo
      let newY = viewportHeight - menuRect.height - MARGIN_BOTTOM;

      // Segurança para não sair da tela (caso a janela seja muito pequena)
      if (newX < 10) newX = 10;
      if (newY < 10) newY = 10;

      // Usa requestAnimationFrame para evitar erro de setState síncrono no efeito
      requestAnimationFrame(() => {
        setPosition({ x: newX, y: newY });
      });
    }
  }, []);
  // --- LÓGICA DE ARRASTE ---
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

  // --- NOVA LÓGICA DE ROTAÇÃO CONTÍNUA (PRESS & HOLD) ---
  const handleMouseDownRotate = (direction: 1 | -1) => {
    // 1. Aplica a primeira rotação imediatamente
    const angle = direction * currentFineRot; // <--- CORRIGIDO AQUI

    // 2. Limpa qualquer intervalo existente (segurança)
    if (rotationIntervalRef.current) {
      window.clearInterval(rotationIntervalRef.current);
    }

    // 3. Inicia o loop (a cada 50ms = 20 vezes por segundo)
    rotationIntervalRef.current = window.setInterval(() => {
      onRotate(angle);
    }, 50);
  };

  const stopRotation = () => {
    if (rotationIntervalRef.current) {
      window.clearInterval(rotationIntervalRef.current);
      rotationIntervalRef.current = null;
    }
  };

  // Garante que o intervalo pare se o componente desmontar
  useEffect(() => {
    return () => stopRotation();
  }, []);

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

  // --- ESTILOS AUXILIARES ---
  const btnBaseStyle: React.CSSProperties = {
    background: theme.buttonBg,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    borderRadius: "4px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.2s",
  };

  const separatorStyle: React.CSSProperties = {
    height: "1px",
    background: theme.border,
    margin: "8px 0",
    opacity: 0.5,
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top: position.y,
        left: position.x,
        zIndex: 9999,
        background: theme.panelBg,
        border: `1px solid ${theme.border}`,
        borderRadius: "8px",
        padding: "8px",
        boxShadow: "0 8px 25px rgba(0,0,0,0.5)",
        display: "flex",
        flexDirection: "column",
        color: theme.text,
        width: "200px",
        userSelect: "none",
        backdropFilter: "blur(5px)",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* 1. CABEÇALHO (Move & Close) */}
      <div
        onMouseDown={handleMouseDownHeader}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
          cursor: isDragging ? "grabbing" : "grab",
          padding: "4px",
          background: isDragging ? theme.hoverRow : "transparent",
          borderRadius: "4px",
        }}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (onOpenShortcuts) onOpenShortcuts();
          }}
          title="Ver teclas de atalho CAD"
          style={{
            background: "transparent",
            border: "none",
            color: theme.text,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            padding: "2px 4px",
            borderRadius: "4px",
            fontSize: "11px",
            fontWeight: "bold",
            textTransform: "uppercase",
            opacity: 0.9,
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "rgba(255,255,255,0.1)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <span style={{ marginRight: 5 }}>✥</span> Ações{" "}
          <span style={{ fontSize: "14px", marginLeft: "4px" }}>⌨️</span>
        </button>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          style={{
            background: "transparent",
            border: "none",
            color: theme.text,
            cursor: "pointer",
            fontWeight: "bold",
            fontSize: "14px",
            lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {/* 2. CONTROLE DE MOVIMENTO (Grid 3x3) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.5fr 1fr",
          gap: "4px",
          marginBottom: "5px",
        }}
      >
        <div />
        <button
          style={{ ...btnBaseStyle, height: "30px" }}
          onClick={() => onMove(0, -moveStep)}
          title="Mover para Cima"
        >
          ▲
        </button>
        <div />

        <button
          style={{ ...btnBaseStyle, height: "30px" }}
          onClick={() => onMove(-moveStep, 0)}
          title="Mover para Esquerda"
        >
          ◀
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <input
            type="number"
            min="0.1"
            value={moveStep}
            onChange={(e) => setMoveStep(Number(e.target.value))}
            style={{
              width: "100%",
              height: "28px",
              textAlign: "center",
              background: theme.inputBg,
              border: `1px solid ${theme.border}`,
              color: theme.text,
              borderRadius: "4px",
              fontSize: "12px",
              fontWeight: "bold",
            }}
            title="Passo de movimento em mm"
          />
        </div>

        <button
          style={{ ...btnBaseStyle, height: "30px" }}
          onClick={() => onMove(moveStep, 0)}
          title="Mover para Direita"
        >
          ▶
        </button>

        <div />
        <button
          style={{ ...btnBaseStyle, height: "30px" }}
          onClick={() => onMove(0, moveStep)}
          title="Mover para Baixo"
        >
          ▼
        </button>
        <div />
      </div>

      <div style={separatorStyle} />

      {/* 3. CONTROLE DE ROTAÇÃO */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {/* Presets Rápidos (Ângulos fixos mais usados) */}
        {isLocked ? (
          // CASO 1: TRAVADO (Mostra apenas o botão de 180º)
          <button
            style={{
              ...btnBaseStyle,
              fontSize: "12px",
              height: "25px",
              fontWeight: "bold",
              color: "#007bff",
            }}
            onClick={() => onRotate(180)}
          >
            ↻ Inverter 180°
          </button>
        ) : (
          // CASO 2: DESTROVADO (Mantém exatamente seu código original)
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: "4px",
            }}
          >
            <button
              style={{ ...btnBaseStyle, fontSize: "10px", height: "25px" }}
              onClick={() => onRotate(-90)}
            >
              -90°
            </button>
            <button
              style={{ ...btnBaseStyle, fontSize: "10px", height: "25px" }}
              onClick={() => onRotate(-45)}
            >
              -45°
            </button>
            <button
              style={{ ...btnBaseStyle, fontSize: "10px", height: "25px" }}
              onClick={() => onRotate(45)}
            >
              +45°
            </button>
            <button
              style={{ ...btnBaseStyle, fontSize: "10px", height: "25px" }}
              onClick={() => onRotate(90)}
            >
              +90°
            </button>
          </div>
        )}

        {/* Ajuste Preciso (Controlado pelo input) */}
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          {/* Botão Anti-horário (PRESS & HOLD IMPLEMENTADO) */}
          <button
            style={{ ...btnBaseStyle, width: "40px", height: "28px" }}
            onMouseDown={() => handleMouseDownRotate(-1)}
            onMouseUp={stopRotation}
            onMouseLeave={stopRotation}
            title={`Segure para girar Anti-Horário (Passo: ${currentFineRot}°)`}
          >
            ↻
          </button>

          {/* Input Central (Define o ângulo) */}
          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              background: theme.inputBg,
              borderRadius: "4px",
              border: `1px solid ${theme.border}`,
              padding: "0 4px",
            }}
          >
            <input
              type="number"
              min="1"
              max="90"
              value={currentFineRot}
              onChange={(e) => {
                // Garante limite entre 1 e 90
                let val = Number(e.target.value);
                if (val > 90) val = 90;
                setFineRotStep(val);
              }}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                color: theme.text,
                textAlign: "center",
                fontSize: "12px",
                fontWeight: "bold",
              }}
              title="Digite o ângulo para ajuste preciso"
            />
            <span
              style={{ fontSize: "16px", opacity: 0.7, paddingRight: "2px" }}
            >
              °
            </span>
          </div>

          {/* Botão Horário (PRESS & HOLD IMPLEMENTADO) */}
          <button
            style={{ ...btnBaseStyle, width: "40px", height: "28px" }}
            onMouseDown={() => handleMouseDownRotate(1)}
            onMouseUp={stopRotation}
            onMouseLeave={stopRotation}
            title={`Segure para girar Horário (Passo: ${currentFineRot}°)`}
          >
            ↺
          </button>
        </div>
      </div>

      {/* 4. AÇÕES DESTRUTIVAS */}
      {onDelete && (
        <>
          <div style={separatorStyle} />
          <button
            onClick={onDelete}
            style={{
              ...btnBaseStyle,
              background: "rgba(220, 53, 69, 0.1)",
              border: "1px solid #dc3545",
              color: "#dc3545",
              width: "100%",
              height: "32px",
              gap: "8px",
              fontWeight: "bold",
              fontSize: "12px",
            }}
            title="Remover peça da mesa e devolver para a lista"
          >
            🗑️ Devolver
          </button>
        </>
      )}
    </div>
  );
};
