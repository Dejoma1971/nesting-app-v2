import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useTheme } from '../context/ThemeContext';

interface ContextControlProps {
  x: number;
  y: number;
  onClose: () => void;
  onMove: (dx: number, dy: number) => void;
  onRotate: (angle: number) => void;
  onDelete?: () => void;
}

export const ContextControl: React.FC<ContextControlProps> = ({
  x,
  y,
  onClose,
  onMove,
  onRotate,
  onDelete,
}) => {
  const { theme } = useTheme();
  
  const [step, setStep] = useState(1);
  const [rotationStep, setRotationStep] = useState(90);

  // Estado local da posição
  const [position, setPosition] = useState({ x, y });
  const [isDragging, setIsDragging] = useState(false);

  // Refs
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, menuX: 0, menuY: 0 });
  const menuRef = useRef<HTMLDivElement>(null);

  // --- LÓGICA INTELIGENTE DE POSICIONAMENTO (CORRIGIDA) ---
  useLayoutEffect(() => {
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let newX = x;
      let newY = y;
      const padding = 10;

      // Se passar da borda DIREITA, joga pra esquerda
      if (x + menuRect.width > viewportWidth) {
        newX = viewportWidth - menuRect.width - padding;
      }

      // Se passar da borda INFERIOR, joga pra cima
      if (y + menuRect.height > viewportHeight) {
        newY = viewportHeight - menuRect.height - padding;
      }
      
      // Garante que não saia pela esquerda ou topo
      if (newX < padding) newX = padding;
      if (newY < padding) newY = padding;

      // Só atualiza se a posição calculada for diferente da atual
      // Isso evita o erro de "cascading renders" e loops infinitos
      if (newX !== position.x || newY !== position.y) {
         setPosition({ x: newX, y: newY });
      }
    }
    // Desabilitamos o aviso de dependência pois queremos rodar APENAS quando x ou y (props) mudarem,
    // e não quando 'position' (estado interno) mudar, para evitar loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y]);

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

  // --- ESTILOS ---
  const btnStyle: React.CSSProperties = {
    background: theme.buttonBg,
    color: theme.text,
    border: `1px solid ${theme.border}`,
    borderRadius: '4px',
    cursor: 'pointer',
    padding: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '16px',
    minWidth: '32px',
    height: '32px'
  };

  const inputStyle: React.CSSProperties = {
    width: "50px",
    background: theme.inputBg,
    border: `1px solid ${theme.border}`,
    color: theme.text,
    padding: "2px 5px",
    borderRadius: "3px",
    textAlign: "center",
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
        borderRadius: '8px',
        padding: '10px',
        boxShadow: '0 8px 20px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        color: theme.text,
        minWidth: '180px',
        userSelect: 'none',
        maxWidth: '90vw'
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* CABEÇALHO ARRASTÁVEL */}
      <div 
        onMouseDown={handleMouseDownHeader}
        style={{ 
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: `1px solid ${theme.border}`, 
            paddingBottom: '8px',
            cursor: isDragging ? "grabbing" : "move",
            background: isDragging ? theme.hoverRow : 'transparent',
            borderRadius: '4px 4px 0 0'
        }}
        title="Clique e arraste para mover"
      >
        <div style={{ display:'flex', alignItems:'center', gap:'5px' }}>
             <span style={{ fontSize: '14px' }}>✥</span>
             <span style={{ fontSize: '12px', fontWeight: 'bold' }}>Ações</span>
        </div>

        <button 
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            title="Fechar"
            style={{
                background: 'transparent',
                border: 'none',
                color: theme.text,
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '16px',
                padding: '0 5px',
                lineHeight: 1
            }}
        >
            ✕
        </button>
      </div>

      {/* --- SEÇÃO DE MOVIMENTO --- */}
      <div style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px" }}>
        <span>Passo (mm):</span>
        <input
          type="number"
          min="0.1"
          value={step}
          onChange={(e) => setStep(Number(e.target.value))}
          style={inputStyle}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "5px" }}>
        <div />
        <button style={btnStyle} onClick={() => onMove(0, -step)} title="Cima">▲</button>
        <div />
        <button style={btnStyle} onClick={() => onMove(-step, 0)} title="Esquerda">◀</button>
        <button style={btnStyle} onClick={() => onMove(0, step)} title="Baixo">▼</button>
        <button style={btnStyle} onClick={() => onMove(step, 0)} title="Direita">▶</button>
      </div>

      {/* --- SEÇÃO DE ROTAÇÃO --- */}
      <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: "10px", display: "flex", flexDirection: "column", gap: "5px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "15px", fontSize: "12px" }}>
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

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "20px"}}>
          <button style={{...btnStyle, fontSize: "20px", fontWeight: "normal"}} onClick={() => onRotate(rotationStep)} title={`Girar ${rotationStep}° Anti`}>↺</button>
          <button style={{...btnStyle, fontSize: "20px", fontWeight: "normal"}} onClick={() => onRotate(-rotationStep)} title={`Girar ${rotationStep}° Horário`}>↻</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "5px" }}>
          <button style={{ ...btnStyle, fontSize: "15px", fontWeight: "normal" }} onClick={() => onRotate(1)} title="Ajuste Fino 1°">↺ 1°</button>
          <button style={{ ...btnStyle, fontSize: "15px", fontWeight: "normal" }} onClick={() => onRotate(-1)} title="Ajuste Fino 1°">↻ 1°</button>
        </div>
      </div>

      {/* --- SEÇÃO DA LIXEIRA --- */}
      {onDelete && (
        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: "10px", marginTop: "5px" }}>
            <button
            onClick={onDelete}
            style={{
                ...btnStyle,
                background: "#dc3545",
                borderColor: "#a71d2a",
                color: 'white',
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                justifyContent: "center"
            }}
            title="Remover peça da mesa"
            >
            <span>🗑️</span> Devolver 
            </button>
        </div>
      )}
    </div>
  );
};