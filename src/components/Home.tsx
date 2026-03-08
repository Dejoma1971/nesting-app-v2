import React, { useState, useEffect } from "react";
import { GiLaserburn } from "react-icons/gi";
import { SidebarMenu } from "../components/SidebarMenu";
import { TeamManagementScreen } from "../components/TeamManagementScreen";
import { useTheme } from "../context/ThemeContext";

import { RemnantEntryHMI } from "../components/RemnantEntryHMI";
import { RemnantStockHMI } from "../components/RemnantStockHMI"; // 👈 INSERÇÃO

type ScreenType =
  | "home"
  | "engineering"
  | "nesting"
  | "dashboard"
  | "postprocessor";

interface HomeProps {
  onNavigate: (screen: ScreenType) => void;
  onOpenTeam: () => void; // <--- ADICIONE ESTA LINHA
}

export const Home: React.FC<HomeProps> = ({ onNavigate }) => {
  const { isDarkMode } = useTheme();
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);

  // 👇 INSERÇÃO: Estado gerencia qual tela da IHM está aberta
  const [activeRemnantModal, setActiveRemnantModal] = useState<'ENTRY' | 'STOCK' | null>(null);

  // ⬇️ --- 1. CONFIGURAÇÃO DO EFEITO "EM DESENVOLVIMENTO" --- ⬇️

  // Altere de false para true para ativar o bloqueio
  const isPostProcessDisabled = true;

  // Estado que controla se o texto "Em Desenvolvimento" aparece ou não
  const [showOverlayText, setShowOverlayText] = useState(false);

  // ⬇️ --- INSERIR ISTO --- ⬇️
  // Estado para gatilho da animação visual (CSS)
  const [triggerFade, setTriggerFade] = useState(false);

  // --- LOGICA DE CONTROLE (SEM RENDERS EM CASCATA) ---
  useEffect(() => {
    // Se o card estiver habilitado, não fazemos nada (os valores padrão já são false)
    if (!isPostProcessDisabled) return;

    // Se estiver desabilitado, iniciamos os timers
    const fadeTimer = setTimeout(() => setTriggerFade(true), 100);
    const textTimer = setTimeout(() => setShowOverlayText(true), 5000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(textTimer);
      // Resetamos ao desmontar ou ao mudar a chave de controle
      setTriggerFade(false);
      setShowOverlayText(false);
    };
  }, [isPostProcessDisabled]);

  // --- TEMAS ---
  const theme = {
    bg: isDarkMode ? "#1e1e1e" : "#f0f2f5",
    text: isDarkMode ? "#e0e0e0" : "#333",
    cardBg: isDarkMode ? "#2d2d2d" : "#fff",
    cardBorder: isDarkMode ? "#444" : "#ddd",
    cardHover: isDarkMode ? "#383838" : "#fafafa",
    accentEng: "#007bff", // Azul para Engenharia
    accentNest: "#28a745", // Verde para Produção
    accentCam: "#fd7e14", // Laranja Fogo para CAM (Novo)
    accentStock: "#17a2b8", // 👇 INSERÇÃO: Cor Ciano/Eco para o Estoque
    shadow: isDarkMode
      ? "0 4px 6px rgba(0,0,0,0.3)"
      : "0 4px 6px rgba(0,0,0,0.1)",
  };

  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh", // Muda de height para minHeight
    background: theme.bg,
    color: theme.text,
    fontFamily: "Segoe UI, Roboto, Helvetica, Arial, sans-serif",
    transition: "0.3s",
    overflowX: "hidden", // ❌ Garante que não haverá scroll lateral
    userSelect: "none",
    WebkitUserSelect: "none",
    padding: "20px 0", // Dá um respiro em cima e embaixo
  };

  const cardsContainerStyle: React.CSSProperties = {
    display: "grid", // Mágica acontece aqui!
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", // Responsivo automático
    gap: "25px", // Espaço entre os cards
    marginTop: "40px",
    width: "100%",
    maxWidth: "1250px", // 👈 Limita a 3 colunas perfeitas no desktop
    padding: "0 20px",
    boxSizing: "border-box",
  };

  const cardStyle = (accentColor: string): React.CSSProperties => ({
    background: theme.cardBg,
    border: `1px solid ${theme.cardBorder}`,
    borderRadius: "12px",
    padding: "25px 20px", // 👇 Reduzimos bastante o padding (era 40px 30px)
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    cursor: "pointer",
    boxShadow: theme.shadow,
    transition: "transform 0.2s, box-shadow 0.2s, background 0.2s",
    borderTop: `4px solid ${accentColor}`,
    position: "relative",
    minHeight: "260px", // Garante que todos tenham a mesma altura base
  });
  // Estado local para hover (apenas visual)
  const [hoveredCard, setHoveredCard] = useState<
    "eng" | "nest" | "cam" | "stock" | null
  >(null);

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
        style={{ textAlign: "center", maxWidth: "800px", padding: "0 20px" }}
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
              width: "60px",
              height: "60px",
              background: "rgba(0, 123, 255, 0.1)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "15px",
              color: theme.accentEng,
            }}
          >
            <svg
              width="30"
              height="30"
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
          <h2
            style={{
              margin: "0 0 10px 0",
              color: theme.accentEng,
              fontSize: "1.3rem",
            }}
          >
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
              width: "60px",
              height: "60px",
              background: "rgba(40, 167, 69, 0.1)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "15px",
              color: theme.accentNest,
            }}
          >
            <svg
              width="30"
              height="30"
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
          <h2
            style={{
              margin: "0 0 10px 0",
              color: theme.accentNest,
              fontSize: "1.3rem",
            }}
          >
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
            Gerar Nesting →
          </span>
        </div>

        {/* --- CARD 4: ESTOQUE DE RETALHOS (ECO-SMART) --- */}
        <div
          style={{
            ...cardStyle(theme.accentStock),
            transform: hoveredCard === "stock" ? "translateY(-5px)" : "none",
            background:
              hoveredCard === "stock" ? theme.cardHover : theme.cardBg,
          }}
          onMouseEnter={() => setHoveredCard("stock")}
          onMouseLeave={() => setHoveredCard(null)}
          onClick={() => setActiveRemnantModal('ENTRY')} // Inicia pelo Cadastro
        >
          <div
            style={{
              width: "60px",
              height: "60px",
              background: "rgba(23, 162, 184, 0.1)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "15px",
              color: theme.accentStock,
            }}
          >
            {/* Ícone de Reciclagem / Estoque */}
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
              <polyline points="16 6 12 2 8 6"></polyline>
              <line x1="12" y1="2" x2="12" y2="15"></line>
            </svg>
          </div>
          <h2
            style={{
              margin: "0 0 10px 0",
              color: theme.accentStock,
              fontSize: "1.3rem",
            }}
          >
            Estoque de Retalhos
          </h2>
          <p style={{ fontSize: "0.9rem", opacity: 0.8, lineHeight: "1.5" }}>
            Entrada manual de material (Tablet), impressão de etiquetas e gestão
            do Almoxarifado.
          </p>
          <span
            style={{
              marginTop: "auto",
              paddingTop: "20px",
              fontSize: "0.85rem",
              fontWeight: "bold",
              color: theme.accentStock,
            }}
          >
            Acessar Terminal →
          </span>
        </div>

        {/* --- CARD 3: PÓS-PROCESSADOR (COM EFEITO DE ESMAECER 5s) --- */}
        <div
          style={{
            ...cardStyle(theme.accentCam), // Usa estilos base
            // Adiciona transições longas de 5s para opacidade e filtro
            transition:
              "transform 0.2s, box-shadow 0.2s, background 0.2s, opacity 5s ease-in-out, filter 5s ease-in-out",

            // Lógica de hover (só se não estiver desabilitado)
            transform:
              !isPostProcessDisabled && hoveredCard === "cam"
                ? "translateY(-5px)"
                : "none",
            background:
              !isPostProcessDisabled && hoveredCard === "cam"
                ? theme.cardHover
                : theme.cardBg,

            // --- CORREÇÃO AQUI ---
            // Usamos 'triggerFade' para que a mudança ocorra DEPOIS do render inicial
            opacity: isPostProcessDisabled && triggerFade ? 0.5 : 1,

            filter:
              isPostProcessDisabled && triggerFade
                ? "grayscale(1) brightness(0.9)"
                : "none",
            cursor: isPostProcessDisabled ? "not-allowed" : "pointer",
            // -----------------------------------
          }}
          onMouseEnter={() => !isPostProcessDisabled && setHoveredCard("cam")}
          onMouseLeave={() => setHoveredCard(null)}
          // Bloqueia clique
          onClick={() => !isPostProcessDisabled && onNavigate("postprocessor")}
        >
          {/* OVERLAY "EM DESENVOLVIMENTO" (Aparece suavemente após 5s) */}
          {isPostProcessDisabled && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 10,
                // O overlay começa invisível (opacity 0) e fica visível (1) quando o timer termina
                opacity: showOverlayText ? 1 : 0,
                transition: "opacity 0.5s ease-in", // Transição suave para o texto aparecer
                background: showOverlayText ? "rgba(0,0,0,0.2)" : "transparent", // Escurece um pouco o fundo quando o texto aparece
                backdropFilter: showOverlayText ? "blur(2px)" : "none",
              }}
            >
              <div
                style={{
                  background: "#333",
                  color: "#fff",
                  padding: "8px 16px",
                  borderRadius: "20px",
                  fontSize: "0.8rem",
                  fontWeight: "bold",
                  textTransform: "uppercase",
                  letterSpacing: "1px",
                  boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
                }}
              >
                Em Desenvolvimento 🚧
              </div>
            </div>
          )}

          <div
            style={{
              width: "60px",
              height: "60px",
              background: "rgba(253, 126, 20, 0.1)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "15px",
              color: theme.accentCam,
            }}
          >
            <GiLaserburn size={36} color={theme.accentCam} />
          </div>
          <h2
            style={{
              margin: "0 0 10px 0",
              color: theme.accentCam,
              fontSize: "1.3rem",
            }}
          >
            Pós-Processador
          </h2>
          <p style={{ fontSize: "0.9rem", opacity: 0.8, lineHeight: "1.5" }}>
            Configuração de parâmetros de corte e exportação G-Code / LXD.
          </p>
          <span
            style={{
              marginTop: "auto",
              paddingTop: "20px",
              fontSize: "0.85rem",
              fontWeight: "bold",
              color: theme.accentCam,
            }}
          >
            Gerar Código →
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

      {/* 👇 RENDERIZAÇÃO DAS TELAS DO TABLET (IHM) 👇 */}
      {activeRemnantModal === 'ENTRY' && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 9999 }}>
          <RemnantEntryHMI
            theme={{
              canvasBg: theme.bg, panelBg: theme.cardBg, headerBg: isDarkMode ? "#111111" : "#ffffff",
              text: theme.text, label: isDarkMode ? "#aaaaaa" : "#666666", border: theme.cardBorder,
              inputBg: isDarkMode ? "#222222" : "#f8f9fa", hoverRow: theme.cardHover,
            }}
            onClose={() => setActiveRemnantModal(null)}
            onOpenStock={() => setActiveRemnantModal('STOCK')} // 👈 GATILHO PARA A LISTA
          />
        </div>
      )}

      {activeRemnantModal === 'STOCK' && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", zIndex: 9999 }}>
          <RemnantStockHMI
            theme={{
              canvasBg: theme.bg, panelBg: theme.cardBg, headerBg: isDarkMode ? "#111111" : "#ffffff",
              text: theme.text, label: isDarkMode ? "#aaaaaa" : "#666666", border: theme.cardBorder,
              inputBg: isDarkMode ? "#222222" : "#f8f9fa", hoverRow: theme.cardHover,
            }}
            onClose={() => setActiveRemnantModal(null)}
            onOpenCadastro={() => setActiveRemnantModal('ENTRY')} // 👈 GATILHO PARA VOLTAR AO CADASTRO
          />
        </div>
      )}
    </div>
  );
};
