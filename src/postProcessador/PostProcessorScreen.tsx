import React, { useState } from "react";
import {
  // Ícones Gerais e de Navegação
  FaArrowLeft,
  FaArrowUp,
  FaArrowDown,
  FaArrowRight,
  FaArrowLeft as FaArrowLeftDir,
  FaSearchPlus,
  FaSearchMinus,
  FaHandPaper,
  FaVectorSquare,
  FaLayerGroup,

  // Ícones Específicos da Aba FILE
  FaFolderOpen, // Open
  FaSave, // Save
  FaFileExport, // Save As / Export
  FaFileImport, // Import
  FaClipboardList, // Report
  FaDatabase, // Backup Params

  // Ícones de Controle CNC
  FaPlay,
  FaStop,
  FaPause,
} from "react-icons/fa";

import { MdOutlineGridOn, MdBorderOuter } from "react-icons/md";
import { GiLaserburn } from "react-icons/gi";

// --- DEFINIÇÃO DE TIPOS E INTERFACES ---

// Define quais abas são permitidas
type TabType = "file" | "home" | "draw" | "nest" | "cnc" | "view";

interface PostProcessorProps {
  onBack: () => void;
  nestingResult?: Record<string, unknown>[];
}

interface RibbonButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  highlight?: boolean;
  danger?: boolean;
  disabled?: boolean;
}

interface LayerRowProps {
  id: number;
  color: string;
  name: string;
  active: boolean;
  onClick: () => void;
  speed: string | number;
  pwr: string | number;
}

interface JogButtonProps {
  icon: React.ReactNode;
}

export const PostProcessorScreen: React.FC<PostProcessorProps> = ({
  onBack,
}) => {
  // Inicializa na aba 'file' conforme planejado
  const [activeTab, setActiveTab] = useState<TabType>("file");
  const [selectedLayer, setSelectedLayer] = useState<number>(0);

  // Função Placeholder para os botões ainda sem implementação
  const handleNotImplemented = (feature: string) => {
    console.log(`Funcionalidade [${feature}] será implementada em breve.`);
  };

  return (
    <div style={styles.container}>
      {/* 1. TOP BAR */}
      <div style={styles.titleBar}>
        <div style={styles.titleText}>
          <GiLaserburn style={{ marginRight: 8, color: "#fd7e14" }} />
          AutoNest CAM Processor - [Sem Título.lxd]
        </div>
        <div style={styles.windowControls}>
          <span style={styles.coordDisplay}>X: 0.00 Y: 0.00</span>
        </div>
      </div>

      {/* 2. RIBBON MENU */}
      <div style={styles.ribbonContainer}>
        {/* Lista de Abas */}
        <div style={styles.ribbonTabs}>
          {["File", "Home", "Draw", "Nest", "CNC", "View"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab.toLowerCase() as TabType)}
              style={{
                ...styles.ribbonTab,
                ...(activeTab === tab.toLowerCase()
                  ? styles.ribbonTabActive
                  : {}),
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Área de Ferramentas (Toolbar) - Conteúdo Dinâmico */}
        <div style={styles.ribbonToolbar}>
          {/* === CONTEÚDO DA ABA FILE === */}
          {activeTab === "file" && (
            <>
              {/* Grupo 1: Arquivo Básico */}
              <div style={styles.toolGroup}>
                <RibbonButton
                  icon={<FaFolderOpen />}
                  label="Open"
                  onClick={() => handleNotImplemented("Open")}
                />
                <RibbonButton
                  icon={<FaSave />}
                  label="Save"
                  onClick={() => handleNotImplemented("Save")}
                />
                <RibbonButton
                  icon={<FaFileExport />}
                  label="Save as"
                  onClick={() => handleNotImplemented("Save as")}
                />
                <div style={styles.separator} />
              </div>

              {/* Grupo 2: Importação e Dados */}
              <div style={styles.toolGroup}>
                <RibbonButton
                  icon={<FaFileImport />}
                  label="Import"
                  onClick={() => handleNotImplemented("Import")}
                />
                <RibbonButton
                  icon={<FaClipboardList />}
                  label="Report"
                  onClick={() => handleNotImplemented("Report")}
                />
                <div style={styles.separator} />
              </div>

              {/* Grupo 3: Sistema */}
              <div style={styles.toolGroup}>
                <RibbonButton
                  icon={<FaDatabase />}
                  label="Backup Params"
                  onClick={() => handleNotImplemented("Backup Params")}
                />
                <div style={styles.separator} />
              </div>

              {/* Grupo 4: Navegação (Sair) */}
              <div style={styles.toolGroup}>
                <RibbonButton
                  icon={<FaArrowLeft />}
                  label="Exit CAM"
                  onClick={onBack}
                  danger
                />
              </div>
            </>
          )}

          {/* === CONTEÚDO DA ABA HOME (Exemplo mantido para não ficar vazio se clicar) === */}
          {activeTab === "home" && (
            <div style={styles.toolGroup}>
              <RibbonButton icon={<FaSearchPlus />} label="Zoom In" />
              <RibbonButton icon={<FaSearchMinus />} label="Zoom Out" />
              <RibbonButton icon={<FaHandPaper />} label="Pan" />
              <div style={styles.separator} />
              <RibbonButton icon={<FaVectorSquare />} label="Simulate" />
            </div>
          )}
        </div>
      </div>

      {/* 3. ÁREA PRINCIPAL */}
      <div style={styles.mainArea}>
        {/* ESQUERDA: VIEWPORT */}
        <div style={styles.viewportContainer}>
          {/* Réguas Falsas */}
          <div style={styles.rulerTop}>
            {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90].map((n) => (
              <span
                key={n}
                style={{ position: "absolute", left: `${n}%`, fontSize: 9 }}
              >
                {n * 100}
              </span>
            ))}
          </div>
          <div style={styles.rulerLeft}>
            {[0, 10, 20, 30, 40, 50].map((n) => (
              <span
                key={n}
                style={{
                  position: "absolute",
                  top: `${n}%`,
                  fontSize: 9,
                  transform: "rotate(-90deg)",
                }}
              >
                {n * 100}
              </span>
            ))}
          </div>

          {/* CANVAS */}
          <div style={styles.canvasArea}>
            <div style={styles.gridBackground}></div>

            <div
              style={{
                position: "absolute",
                color: "#444",
                userSelect: "none",
                pointerEvents: "none",
              }}
            >
              <MdOutlineGridOn
                size={48}
                style={{ opacity: 0.2, margin: "0 auto", display: "block" }}
              />
              <p>Área de Corte: 3000mm x 1500mm</p>
            </div>
          </div>

          {/* Status Bar */}
          <div style={styles.viewportStatus}>
            <span>Ready</span>
            <span>Scale: 1.0</span>
            <span>Grid: 10mm</span>
          </div>
        </div>

        {/* DIREITA: PAINEL DE CONTROLE */}
        <div style={styles.rightPanel}>
          {/* Painel de Layers */}
          <div style={styles.panelSection}>
            <div style={styles.panelHeader}>
              <FaLayerGroup /> Layers / Parâmetros
            </div>
            <div style={styles.layerList}>
              <LayerRow
                id={0}
                color="#00ff00"
                name="Corte (Ext)"
                active={selectedLayer === 0}
                onClick={() => setSelectedLayer(0)}
                speed="100"
                pwr="100%"
              />
              <LayerRow
                id={1}
                color="#ff00ff"
                name="Gravação"
                active={selectedLayer === 1}
                onClick={() => setSelectedLayer(1)}
                speed="300"
                pwr="20%"
              />
              <LayerRow
                id={2}
                color="#ffff00"
                name="Marcação"
                active={selectedLayer === 2}
                onClick={() => setSelectedLayer(2)}
                speed="500"
                pwr="10%"
              />
            </div>
          </div>

          {/* Painel de Console CNC */}
          <div style={{ ...styles.panelSection, flex: 1 }}>
            <div style={styles.panelHeader}>Console (JOG)</div>

            <div style={styles.jogControl}>
              <div style={styles.jogRow}>
                <JogButton icon={<FaArrowUp />} />
              </div>
              <div style={styles.jogRow}>
                <JogButton icon={<FaArrowLeftDir />} />
                <div style={styles.jogCenter}>Home</div>
                <JogButton icon={<FaArrowRight />} />
              </div>
              <div style={styles.jogRow}>
                <JogButton icon={<FaArrowDown />} />
              </div>
            </div>

            <div style={styles.cncActions}>
              <button style={styles.btnStart}>
                <FaPlay /> START
              </button>
              <div style={{ display: "flex", gap: 5 }}>
                <button style={styles.btnPause}>
                  <FaPause /> PAUSE
                </button>
                <button style={styles.btnStop}>
                  <FaStop /> STOP
                </button>
              </div>
            </div>

            <div style={styles.paramsInputs}>
              <label style={styles.inputLabel}>Velocidade (mm/s)</label>
              <input
                type="number"
                defaultValue={500}
                style={styles.inputField}
              />
            </div>

            {/* Botão de Exportação Rápida */}
            <div style={{ marginTop: "auto", paddingTop: 10 }}>
              <button
                style={{
                  width: "100%",
                  padding: 10,
                  backgroundColor: "#007acc",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                }}
              >
                <MdBorderOuter /> Gerar G-Code
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- COMPONENTES AUXILIARES ---

const RibbonButton: React.FC<RibbonButtonProps> = ({
  icon,
  label,
  onClick,
  highlight,
  danger,
  disabled,
}) => {
  // Adicionamos um estado local para controlar o Hover
  const [isHovered, setIsHovered] = React.useState(false);

  // Lógica de cor: Laranja se estiver com mouse em cima OU se tiver a prop highlight fixa
  const iconColor = danger
    ? isHovered
      ? "#ff6666"
      : "#ff4d4d"
    : isHovered || highlight
      ? "#fd7e14"
      : "#e0e0e0"; // #e0e0e0 é o branco/cinza padrão

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)} // Ativa cor ao entrar
      onMouseLeave={() => setIsHovered(false)} // Desativa cor ao sair
      style={{
        ...styles.ribbonBtn,
        color: disabled ? "#666" : iconColor,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transform: isHovered && !disabled ? "scale(1.05)" : "scale(1)", // Efeito sutil de zoom
        transition: "all 0.2s ease", // Suaviza a troca de cor
      }}
    >
      <div style={{ fontSize: "1.2rem", marginBottom: 4 }}>{icon}</div>
      <span style={{ fontSize: "0.7rem" }}>{label}</span>
    </button>
  );
};

const LayerRow: React.FC<LayerRowProps> = ({
  color,
  name,
  active,
  onClick,
  speed,
  pwr,
}) => (
  <div
    onClick={onClick}
    style={{
      ...styles.layerRow,
      backgroundColor: active ? "#3e3e42" : "transparent",
    }}
  >
    <div
      style={{
        width: 12,
        height: 12,
        backgroundColor: color,
        marginRight: 8,
        border: "1px solid #fff",
      }}
    />
    <div style={{ flex: 1 }}>{name}</div>
    <div style={{ fontSize: "0.75rem", color: "#aaa" }}>
      V:{speed} / P:{pwr}
    </div>
  </div>
);

const JogButton: React.FC<JogButtonProps> = ({ icon }) => (
  <button style={styles.jogBtn}>{icon}</button>
);

// --- ESTILOS CSS-IN-JS ---
const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    backgroundColor: "#1e1e1e",
    color: "#d4d4d4",
    fontFamily: "Segoe UI, sans-serif",
    overflow: "hidden",
  },
  titleBar: {
    height: "30px",
    backgroundColor: "#2d2d2d",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 10px",
    fontSize: "0.8rem",
    borderBottom: "1px solid #3e3e42",
  },
  titleText: { display: "flex", alignItems: "center", fontWeight: 600 },
  coordDisplay: { fontFamily: "monospace", color: "#fd7e14" },
  ribbonContainer: {
    height: "110px",
    backgroundColor: "#252526",
    borderBottom: "1px solid #3e3e42",
    display: "flex",
    flexDirection: "column",
  },
  ribbonTabs: { display: "flex", height: "28px", backgroundColor: "#2d2d2d" },
  ribbonTab: {
    background: "transparent",
    border: "none",
    color: "#aaa",
    padding: "0 15px",
    fontSize: "0.8rem",
    cursor: "pointer",
    borderRight: "1px solid #3e3e42",
  },
  ribbonTabActive: {
    backgroundColor: "#252526",
    color: "#fd7e14",
    borderTop: "2px solid #fd7e14",
  },
  ribbonToolbar: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    gap: 5,
  },
  toolGroup: {
    display: "flex",
    alignItems: "center",
    height: "100%",
    paddingRight: 10,
  },
  ribbonBtn: {
    background: "transparent",
    border: "none",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "5px 10px",
    minWidth: "60px",
    height: "70px",
    borderRadius: "4px",
  },
  separator: {
    width: 1,
    height: "50px",
    backgroundColor: "#3e3e42",
    marginLeft: 5,
  },
  mainArea: { flex: 1, display: "flex", overflow: "hidden" },
  viewportContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#1e1e1e",
    position: "relative",
  },
  rulerTop: {
    height: 20,
    backgroundColor: "#2d2d2d",
    borderBottom: "1px solid #444",
    position: "relative",
    color: "#666",
  },
  rulerLeft: {
    width: 20,
    height: "100%",
    backgroundColor: "#2d2d2d",
    borderRight: "1px solid #444",
    position: "absolute",
    top: 20,
    left: 0,
    color: "#666",
  },
  canvasArea: {
    flex: 1,
    marginLeft: 20,
    backgroundColor: "#000",
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  gridBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage:
      "linear-gradient(#1a1a1a 1px, transparent 1px), linear-gradient(90deg, #1a1a1a 1px, transparent 1px)",
    backgroundSize: "50px 50px",
    opacity: 0.5,
  },
  viewportStatus: {
    height: 25,
    backgroundColor: "#007acc",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    fontSize: "0.75rem",
    gap: 20,
    marginLeft: 20,
  },
  rightPanel: {
    width: "280px",
    backgroundColor: "#252526",
    borderLeft: "1px solid #3e3e42",
    display: "flex",
    flexDirection: "column",
  },
  panelSection: { padding: 10, borderBottom: "1px solid #3e3e42" },
  panelHeader: {
    fontSize: "0.8rem",
    fontWeight: "bold",
    color: "#ccc",
    textTransform: "uppercase",
    marginBottom: 10,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  layerList: { display: "flex", flexDirection: "column", gap: 2 },
  layerRow: {
    display: "flex",
    alignItems: "center",
    padding: "4px 8px",
    fontSize: "0.85rem",
    cursor: "pointer",
    borderRadius: 3,
  },
  jogControl: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    marginBottom: 15,
  },
  jogRow: { display: "flex", gap: 5 },
  jogBtn: {
    width: 40,
    height: 40,
    backgroundColor: "#333",
    border: "1px solid #444",
    color: "#fff",
    borderRadius: 4,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  jogCenter: {
    width: 40,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.6rem",
    color: "#666",
  },
  cncActions: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 15,
  },
  btnStart: {
    padding: "12px",
    backgroundColor: "#28a745",
    color: "#fff",
    border: "none",
    fontWeight: "bold",
    borderRadius: 4,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnPause: {
    flex: 1,
    padding: 8,
    backgroundColor: "#ffc107",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    fontWeight: "bold",
  },
  btnStop: {
    flex: 1,
    padding: 8,
    backgroundColor: "#dc3545",
    border: "none",
    borderRadius: 4,
    cursor: "pointer",
    color: "#fff",
    fontWeight: "bold",
  },
  paramsInputs: { display: "flex", flexDirection: "column", gap: 5 },
  inputLabel: { fontSize: "0.75rem", color: "#888" },
  inputField: {
    background: "#333",
    border: "1px solid #444",
    color: "#fff",
    padding: "4px 8px",
    borderRadius: 3,
  },
};
