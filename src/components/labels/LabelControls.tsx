import React from "react";
import type { LabelStateMap } from "./LabelTypes";

// CORREÇÃO: Removido [key: string]: string para ser compatível com AppTheme
interface ThemeProps {
  border: string;
  headerBg: string;
  text: string;
}

// --- COMPONENTE 1: PAINEL GLOBAL (Estilizado como Aba) ---
interface GlobalLabelPanelProps {
  showWhite: boolean;
  showPink: boolean;
  onToggleWhite: () => void;
  onTogglePink: () => void;
  theme: ThemeProps;
}

export const GlobalLabelPanel: React.FC<GlobalLabelPanelProps> = ({
  showWhite,
  showPink,
  onToggleWhite,
  onTogglePink,
  theme,
}) => {
  // Estilo que imita a barra de abas (Tab Bar)
  const containerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "20px",
    padding: "10px 15px",
    borderBottom: `1px solid ${theme.border}`,
    background: theme.headerBg,
    color: theme.text,
    fontSize: "13px",
  };

  const checkboxLabelStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    cursor: "pointer",
    userSelect: "none",
    fontWeight: 500,
  };

  return (
    <div style={containerStyle}>
      <span style={{ opacity: 0.7, fontWeight: "bold", marginRight: "5px" }}>
        Etiquetas:
      </span>

      {/* Checkbox Mestre Branco */}
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          checked={showWhite}
          onChange={onToggleWhite}
          style={{ marginRight: "6px" }}
        />
        <span
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            background: showWhite ? "#FFFFFF" : "transparent",
            border: `1px solid ${theme.text}`,
            borderRadius: "50%",
            marginRight: 6,
          }}
        ></span>
        Identificação
      </label>

      {/* Checkbox Mestre Rosa */}
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          checked={showPink}
          onChange={onTogglePink}
          style={{ marginRight: "6px" }}
        />
        <span
          style={{
            display: "inline-block",
            width: 10,
            height: 10,
            background: showPink ? "#FF00FF" : "transparent",
            border: `1px solid ${showPink ? "#FF00FF" : theme.text}`,
            borderRadius: "50%",
            marginRight: 6,
          }}
        ></span>
        Gravação
      </label>
    </div>
  );
};

// --- COMPONENTE 2: FLAGS DA MINIATURA (Sem moldura) ---
interface ThumbnailFlagsProps {
  partId: string;
  labelState?: LabelStateMap;
  onTogglePartFlag: (partId: string, type: "white" | "pink") => void;
}

export const ThumbnailFlags: React.FC<ThumbnailFlagsProps> = ({
  partId,
  labelState,
  onTogglePartFlag,
}) => {
  const partState = labelState?.[partId];
  const isWhiteActive = partState?.white?.active ?? false;
  const isPinkActive = partState?.pink?.active ?? false;

  const dotStyle = (active: boolean, color: string): React.CSSProperties => ({
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    backgroundColor: active ? color : "transparent",
    border: `1px solid ${active ? color : "#888"}`,
    cursor: "pointer",
    transition: "all 0.2s",
    boxShadow: active ? "0 0 3px rgba(0,0,0,0.5)" : "none",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: "5px",
        right: "5px",
        display: "flex",
        gap: "4px",
        zIndex: 100,
      }}
    >
      <div
        title="Identificação Visual"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePartFlag(partId, "white");
        }}
        style={dotStyle(isWhiteActive, "#FFFFFF")}
      />

      <div
        title="Gravação CNC"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePartFlag(partId, "pink");
        }}
        style={dotStyle(isPinkActive, "#FF00FF")}
      />
    </div>
  );
};
