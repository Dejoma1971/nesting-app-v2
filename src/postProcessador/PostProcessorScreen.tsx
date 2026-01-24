import React, { useState } from "react";
import {
  FaSave,
  FaArrowLeft,
  FaPlay,
  FaStop,
  FaPause,
  FaSearchPlus,
  FaSearchMinus,
  FaHandPaper,
  FaVectorSquare,
  FaArrowUp,
  FaArrowDown,
  FaArrowRight,
  FaArrowLeft as FaArrowLeftDir,
  FaCog,
  FaLayerGroup,
  FaRulerCombined,
} from "react-icons/fa";
import { MdBorderOuter, MdOutlineGridOn } from "react-icons/md";
import { GiLaserburn } from "react-icons/gi";

// --- DEFINIÇÃO DE TIPOS E INTERFACES ---

// Define quais abas são permitidas
type TabType = "file" | "home" | "draw" | "nest" | "cnc" | "view";

interface PostProcessorProps {
  onBack: () => void;
  // Substituímos any[] por um tipo genérico de objeto para evitar o erro,
  // ou você pode importar a interface PlacedPart se quiser ser mais específico.
  nestingResult?: Record<string, unknown>[];
}

// Interfaces para os componentes auxiliares (Botões e Linhas)
interface RibbonButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  highlight?: boolean;
  danger?: boolean;
}

interface LayerRowProps {
  id: number;
  color: string;
  name: string;
  active: boolean;
  onClick: () => void;
  speed: string | number;
  pwr: string | number; // Agora será usado
}

interface JogButtonProps {
  icon: React.ReactNode;
}

export const PostProcessorScreen: React.FC<PostProcessorProps> = ({
  onBack,
}) => {
  // Tipagem explícita do estado para evitar erros de string genérica
  const [activeTab, setActiveTab] = useState<TabType>("home");
  const [selectedLayer, setSelectedLayer] = useState<number>(0);

  return (
    <div style={styles.container}>
      {/* 1. TOP BAR */}
      <div style={styles.titleBar}>
        <div style={styles.titleText}>
          <GiLaserburn style={{ marginRight: 8, color: "#fd7e14" }} />
          AutoNest CAM Processor - [Sem Título.lxd]
        </div>
        <div style={styles.windowControls}>
          <span style={styles.coordDisplay}>X: 1250.00 Y: 500.00</span>
        </div>
      </div>

      {/* 2. RIBBON MENU */}
      <div style={styles.ribbonContainer}>
        {/* Abas */}
        <div style={styles.ribbonTabs}>
          {["File", "Home", "Draw", "Nest", "CNC", "View"].map((tab) => (
            <button
              key={tab}
              // Cast seguro para o tipo TabType
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

        {/* Ferramentas da Aba (Toolbar) */}
        <div style={styles.ribbonToolbar}>
          {/* Grupo: Arquivo */}
          <div style={styles.toolGroup}>
            <RibbonButton
              icon={<FaArrowLeft />}
              label="Sair"
              onClick={onBack}
              danger
            />
            <RibbonButton icon={<FaSave />} label="Salvar" />
            <div style={styles.separator} />
          </div>

          {/* Grupo: Visualização */}
          <div style={styles.toolGroup}>
            <RibbonButton icon={<FaSearchPlus />} label="Zoom In" />
            <RibbonButton icon={<FaSearchMinus />} label="Zoom Out" />
            <RibbonButton icon={<FaHandPaper />} label="Pan" />
            <div style={styles.separator} />
          </div>

          {/* Grupo: Processamento */}
          <div style={styles.toolGroup}>
            <RibbonButton icon={<FaVectorSquare />} label="Simular" />
            <RibbonButton icon={<FaRulerCombined />} label="Medir" />
            <RibbonButton icon={<FaCog />} label="Params" />
            <div style={styles.separator} />
          </div>

          {/* Grupo: Geração */}
          <div style={styles.toolGroup}>
            <RibbonButton
              icon={<MdBorderOuter size={20} />}
              label="Export G-Code"
              highlight
            />
          </div>
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
          </div>
        </div>
      </div>
    </div>
  );
};

// --- COMPONENTES AUXILIARES TIPADOS ---

const RibbonButton: React.FC<RibbonButtonProps> = ({
  icon,
  label,
  onClick,
  highlight,
  danger,
}) => (
  <button
    onClick={onClick}
    style={{
      ...styles.ribbonBtn,
      color: danger ? "#ff4d4d" : highlight ? "#fd7e14" : "#e0e0e0",
    }}
  >
    <div style={{ fontSize: "1.2rem", marginBottom: 4 }}>{icon}</div>
    <span style={{ fontSize: "0.7rem" }}>{label}</span>
  </button>
);

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
    {/* CORREÇÃO: Adicionamos o 'pwr' aqui para resolver o erro de variável não usada */}
    <div style={{ fontSize: "0.75rem", color: "#aaa" }}>
      V:{speed} / P:{pwr}
    </div>
  </div>
);

const JogButton: React.FC<JogButtonProps> = ({ icon }) => (
  <button style={styles.jogBtn}>{icon}</button>
);

// --- ESTILOS CSS-IN-JS (MANTIDOS IGUAIS) ---
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
  // Title Bar
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

  // Ribbon
  ribbonContainer: {
    height: "110px",
    backgroundColor: "#252526",
    borderBottom: "1px solid #3e3e42",
    display: "flex",
    flexDirection: "column",
  },
  ribbonTabs: {
    display: "flex",
    height: "28px",
    backgroundColor: "#2d2d2d",
  },
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
    color: "#e0e0e0",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "5px 10px",
    minWidth: "60px",
    cursor: "pointer",
    height: "70px",
    borderRadius: "4px",
  },
  separator: {
    width: 1,
    height: "50px",
    backgroundColor: "#3e3e42",
    marginLeft: 5,
  },

  // Main Area
  mainArea: { flex: 1, display: "flex", overflow: "hidden" },

  // Viewport
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
    marginLeft: 20, // Espaço da régua
    backgroundColor: "#000", // CAD Background Black
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
    backgroundColor: "#252526", // Status bar azul clássico VSCode/CAD
    color: "#fff",
    display: "flex",
    alignItems: "center",
    padding: "0 10px",
    fontSize: "0.75rem",
    gap: 20,
    marginLeft: 20,
  },

  // Right Panel
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

  // CNC Console
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
