import React from "react";
import type { AppTheme } from "../styles/theme";

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: AppTheme;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({
  isOpen,
  onClose,
  theme,
}) => {
  if (!isOpen) return null;

  const kbdStyle: React.CSSProperties = {
    background: theme.buttonBg,
    border: `1px solid ${theme.border}`,
    borderRadius: "4px",
    padding: "2px 6px",
    fontSize: "12px",
    fontWeight: "bold",
    boxShadow: "0 2px 0 rgba(0,0,0,0.2)",
    color: theme.text,
    display: "inline-block",
    margin: "0 2px",
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: `1px solid ${theme.border}`,
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 5,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: "rgba(0,0,0,0.6)",
        zIndex: 100000,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        backdropFilter: "blur(2px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: theme.panelBg,
          padding: "20px",
          borderRadius: "8px",
          width: "400px",
          // ⬇️ --- CORREÇÃO: ALTURA MÁXIMA E ROLAGEM INTERNA --- ⬇️
          maxHeight: "85vh",
          overflowY: "auto",
          // ⬆️ ------------------------------------------------ ⬆️
          border: `1px solid ${theme.border}`,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          color: theme.text,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "15px",
          }}
        >
          <h3
            style={{
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            ⌨️ Teclas de Atalho CAD
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: theme.text,
              cursor: "pointer",
              fontSize: "18px",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ fontSize: "13px" }}>
          <h4
            style={{
              margin: "15px 0 5px 0",
              opacity: 0.7,
              textTransform: "uppercase",
              fontSize: "11px",
            }}
          >
            Rotação Absoluta
          </h4>
          <div style={rowStyle}>
            <span>Girar exatos 180º (Inverter)</span>
            <div><span style={kbdStyle}>Shift</span> + <span style={kbdStyle}>8</span></div>
          </div>
          
          <div style={rowStyle}>
            <span>Girar exatos 90º</span>
            <div>
              <span style={kbdStyle}>Shift</span> +{" "}
              <span style={kbdStyle}>9</span>
            </div>
          </div>
          <div style={rowStyle}>
            <span>Girar exatos -90º</span>
            <div>
              <span style={kbdStyle}>Shift</span> +{" "}
              <span style={kbdStyle}>Ctrl</span> +{" "}
              <span style={kbdStyle}>9</span>
            </div>
          </div>
          <div style={rowStyle}>
            <span>Girar exatos 45º</span>
            <div>
              <span style={kbdStyle}>Shift</span> +{" "}
              <span style={kbdStyle}>4</span>
            </div>
          </div>
          <div style={rowStyle}>
            <span>Girar exatos -45º</span>
            <div>
              <span style={kbdStyle}>Shift</span> +{" "}
              <span style={kbdStyle}>Ctrl</span> +{" "}
              <span style={kbdStyle}>4</span>
            </div>
          </div>

          <h4
            style={{
              margin: "15px 0 5px 0",
              opacity: 0.7,
              textTransform: "uppercase",
              fontSize: "11px",
            }}
          >
            Rotação Fina
          </h4>
          <div style={rowStyle}>
            <span>Girar 1 passo à Esquerda</span>
            <div>
              <span style={kbdStyle}>Shift</span> +{" "}
              <span style={kbdStyle}>E</span>
            </div>
          </div>
          <div style={rowStyle}>
            <span>Girar 1 passo à Direita</span>
            <div>
              <span style={kbdStyle}>Shift</span> +{" "}
              <span style={kbdStyle}>D</span>
            </div>
          </div>
          <div style={rowStyle}>
            <span>Girar contínuo à Esquerda (Segurar)</span>
            <div>
              <span style={kbdStyle}>Shift</span> +{" "}
              <span style={kbdStyle}>Ctrl</span> +{" "}
              <span style={kbdStyle}>E</span>
            </div>
          </div>
          <div style={rowStyle}>
            <span>Girar contínuo à Direita (Segurar)</span>
            <div>
              <span style={kbdStyle}>Shift</span> +{" "}
              <span style={kbdStyle}>Ctrl</span> +{" "}
              <span style={kbdStyle}>D</span>
            </div>
          </div>

          <h4
            style={{
              margin: "15px 0 5px 0",
              opacity: 0.7,
              textTransform: "uppercase",
              fontSize: "11px",
            }}
          >
            Ações Gerais
          </h4>
          <div style={rowStyle}>
            <span>Devolver Peça</span>
            <div>
              <span style={kbdStyle}>Delete</span>
            </div>
          </div>
          <div style={{ ...rowStyle, borderBottom: "none" }}>
            <span>Desfazer Ação</span>
            <div>
              <span style={kbdStyle}>Ctrl</span> +{" "}
              <span style={kbdStyle}>Z</span>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          style={{
            width: "100%",
            padding: "10px",
            marginTop: "20px",
            background: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          Entendi
        </button>
      </div>
    </div>
  );
};
