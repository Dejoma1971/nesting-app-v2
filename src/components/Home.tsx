import React, { useState } from "react";
import { SidebarMenu } from "../components/SidebarMenu";
import { TeamManagementScreen } from "../components/TeamManagementScreen";
import { useTheme } from "../context/ThemeContext";

type ScreenType = "home" | "engineering" | "nesting";

interface HomeProps {
  onNavigate: (screen: ScreenType) => void;
}

export const Home: React.FC<HomeProps> = ({ onNavigate }) => {
  const { isDarkMode } = useTheme();
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);

  // --- TEMAS ---
  const theme = {
    bg: isDarkMode ? "#1e1e1e" : "#f0f2f5",
    text: isDarkMode ? "#e0e0e0" : "#333",
    cardBg: isDarkMode ? "#2d2d2d" : "#fff",
    cardBorder: isDarkMode ? "#444" : "#ddd",
    cardHover: isDarkMode ? "#383838" : "#fafafa",
    accentEng: "#007bff", // Azul para Engenharia
    accentNest: "#28a745", // Verde para Produção
    shadow: isDarkMode
      ? "0 4px 6px rgba(0,0,0,0.3)"
      : "0 4px 6px rgba(0,0,0,0.1)",
  };

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh",
    background: theme.bg,
    color: theme.text,
    fontFamily: "Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    transition: "0.3s",
  };

  const cardsContainerStyle: React.CSSProperties = {
    display: "flex",
    gap: "40px",
    marginTop: "50px",
    flexWrap: "wrap",
    justifyContent: "center",
  };

  const cardStyle = (accentColor: string): React.CSSProperties => ({
    background: theme.cardBg,
    border: `1px solid ${theme.cardBorder}`,
    borderRadius: "12px",
    width: "300px",
    padding: "40px 30px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    cursor: "pointer",
    boxShadow: theme.shadow,
    transition: "transform 0.2s, box-shadow 0.2s, background 0.2s",
    borderTop: `5px solid ${accentColor}`,
    position: "relative",
  });

  // Estado local para hover (apenas visual)
  const [hoveredCard, setHoveredCard] = useState<"eng" | "nest" | null>(null);

  return (
    <div style={containerStyle}>
      {/* Botão de Tema no Canto */}
      <div style={{ position: "absolute", top: 20, right: 20 }}>
        {/* MENU PRINCIPAL (Substitui o botão de tema) */}
        <div style={{ position: "absolute", top: 20, right: 20, zIndex: 1000 }}>
          <SidebarMenu
            onNavigate={onNavigate}
            onOpenProfile={() => alert("Perfil do Usuário (Em breve)")}
            // ADICIONE ESTA LINHA:
            onOpenTeam={() => setIsTeamModalOpen(true)}
          />
        </div>
      </div>

      <div
        style={{ textAlign: "center", maxWidth: "600px", padding: "0 20px" }}
      >
        <h1
          style={{
            fontSize: "3rem",
            margin: "0 0 10px 0",
            letterSpacing: "-1px",
          }}
        >
          AutoNest Hub
        </h1>
        <p style={{ fontSize: "1.1rem", opacity: 0.7, margin: 0 }}>
          Selecione o fluxo de trabalho desejado para iniciar.
        </p>
      </div>

      <div style={cardsContainerStyle}>
        {/* --- CARD 1: ENGENHARIA --- */}
        <div
          style={{
            ...cardStyle(theme.accentEng),
            transform: hoveredCard === "eng" ? "translateY(-5px)" : "none",
            background: hoveredCard === "eng" ? theme.cardHover : theme.cardBg,
          }}
          onMouseEnter={() => setHoveredCard("eng")}
          onMouseLeave={() => setHoveredCard(null)}
          onClick={() => onNavigate("engineering")}
        >
          <div
            style={{
              width: "80px",
              height: "80px",
              background: "rgba(0, 123, 255, 0.1)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "20px",
              color: theme.accentEng,
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </div>
          <h2 style={{ margin: "0 0 10px 0", color: theme.accentEng }}>
            Engenharia & Cadastro
          </h2>
          <p style={{ fontSize: "0.9rem", opacity: 0.8, lineHeight: "1.5" }}>
            Importe arquivos DXF, limpe geometrias, cadastre materiais e salve
            os pedidos no banco de dados.
          </p>
          <span
            style={{
              marginTop: "auto",
              paddingTop: "20px",
              fontSize: "0.85rem",
              fontWeight: "bold",
              color: theme.accentEng,
            }}
          >
            Iniciar Cadastro →
          </span>
        </div>

        {/* --- CARD 2: NESTING / PRODUÇÃO --- */}
        <div
          style={{
            ...cardStyle(theme.accentNest),
            transform: hoveredCard === "nest" ? "translateY(-5px)" : "none",
            background: hoveredCard === "nest" ? theme.cardHover : theme.cardBg,
          }}
          onMouseEnter={() => setHoveredCard("nest")}
          onMouseLeave={() => setHoveredCard(null)}
          onClick={() => onNavigate("nesting")}
        >
          <div
            style={{
              width: "80px",
              height: "80px",
              background: "rgba(40, 167, 69, 0.1)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "20px",
              color: theme.accentNest,
            }}
          >
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </div>
          <h2 style={{ margin: "0 0 10px 0", color: theme.accentNest }}>
            Mesa de Corte (Nesting)
          </h2>
          <p style={{ fontSize: "0.9rem", opacity: 0.8, lineHeight: "1.5" }}>
            Busque pedidos aprovados no banco, monte arranjos de corte
            otimizados e gere o arquivo final.
          </p>
          <span
            style={{
              marginTop: "auto",
              paddingTop: "20px",
              fontSize: "0.85rem",
              fontWeight: "bold",
              color: theme.accentNest,
            }}
          >
            Ir para Produção →
          </span>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 20,
          opacity: 0.3,
          fontSize: "0.8rem",
        }}
      >
        v1.2.0 - Sistema Integrado
      </div>
      {/* SE O ESTADO FOR TRUE, MOSTRA A TELA */}
      {isTeamModalOpen && (
        <TeamManagementScreen onClose={() => setIsTeamModalOpen(false)} />
      )}

    </div>
  );
};
