import React from "react";

// Definimos exatamente o formato do tema esperado
interface ThemeProps {
  canvasBg: string;
  panelBg: string;
  headerBg: string;
  text: string;
  label: string;
  border: string;
  inputBg: string;
  hoverRow: string;
}

interface RemnantHeaderProps {
  theme: ThemeProps; // 👈 Substituímos o 'any' por 'ThemeProps'
  title: string;
  actionLabel: string;
  onActionClick: () => void;
  onClose?: () => void;
  onReset: () => void;
  isRefreshing: boolean;
}

export const RemnantHeader: React.FC<RemnantHeaderProps> = ({
  theme,
  title,
  actionLabel,
  onActionClick,
  onClose,
  onReset,
  isRefreshing,
}) => {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        background: theme.headerBg,
        padding: "15px 30px",
        borderBottom: `2px solid ${theme.border}`,
      }}
    >
     {/* Lado Esquerdo: Título */}
      <h1 style={{ margin: 0, fontSize: '28px', color: '#28a745', display: 'flex', alignItems: 'center', gap: '10px', whiteSpace: 'nowrap' }}>
        {title}
      </h1>

      {/* OBLONGO VERDE (Padrão EngineeringScreen) */}
      <div
        style={{
          flex: 1,
          margin: "0 40px",
          maxWidth: "500px",
          fontSize: "12px",
        }}
      >
        <div
          style={{
            background:
              theme.canvasBg === "#0a0a0a"
                ? "rgba(255, 255, 255, 0.05)"
                : "rgba(0, 0, 0, 0.05)",
            border: "1px solid #28a745",
            borderRadius: "20px",
            padding: "5px 15px",
            display: "flex",
            alignItems: "center",
            gap: "15px",
            color: theme.text,
            fontSize: "12px",
            whiteSpace: "nowrap",
            transition: "all 0.3s ease",
          }}
        >
          <span style={{ fontWeight: "bold", color: theme.text }}>
            Nome do Operador
          </span>
          <div
            style={{
              width: "1px",
              height: "14px",
              background:
                theme.canvasBg === "#0a0a0a"
                  ? "rgba(255,255,255,0.3)"
                  : "rgba(0,0,0,0.2)",
            }}
          ></div>
          <span style={{ color: "#28a745", fontWeight: "bold" }}>
            Ativo - PLANO PRO
          </span>
        </div>
      </div>

      {/* Lado Direito: Botões de Ação */}
      <div style={{ display: "flex", gap: "15px" }}>
        {/* Botão SVG de Reset */}
        <button
          onClick={onReset}
          title="Limpar todos os campos"
          style={{
            background: "transparent",
            color: theme.text,
            border: "none",
            padding: "10px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.7,
            transition: "opacity 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.7")}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transformOrigin: "center",
              transformBox: "fill-box",
              transition: "transform 0.7s ease",
              transform: isRefreshing ? "rotate(360deg)" : "rotate(0deg)",
            }}
          >
            <path d="M23 4v6h-6"></path>
            <path d="M1 20v-6h6"></path>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
        </button>

        {/* Botão de Navegação (Lista/Cadastro) */}
        <button
          onClick={onActionClick}
          style={{
            background: "#007bff",
            color: theme.text,
            border: `2px solid #007bff`,
            padding: "10px 20px",
            borderRadius: "8px",
            fontSize: "18px",
            cursor: "pointer",
             boxShadow: '0 4px 0 #084688',
            fontWeight: "bold",
            whiteSpace: "nowrap",
          }}
        >
          {actionLabel}
        </button>

        {onClose && (
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              color: "#dc3545",
              border: "2px solid #dc3545",
              padding: "10px 20px",
              borderRadius: "8px",
              fontSize: "18px",
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            Sair ✕
          </button>
        )}
      </div>
    </div>
  );
};
