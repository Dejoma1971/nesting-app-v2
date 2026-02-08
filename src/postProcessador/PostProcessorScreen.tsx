import React, { useState } from "react";
// 1. IMPORTAÇÃO DOS ÍCONES
import {
  FaArrowLeft,
  FaArrowUp,
  FaArrowDown,
  FaArrowRight,
  FaArrowLeft as FaArrowLeftDir,
  FaLayerGroup,
  FaFolderOpen,
  FaSave,
  FaFileExport,
  FaPlay,
  FaStop,
  FaPause,
  FaFileImport,
  FaClipboardList,
  FaDatabase,
} from "react-icons/fa";
import { GiLaserburn } from "react-icons/gi";

// 2. IMPORTAÇÃO DAS UTILIDADES (Verifique se os caminhos estão corretos)
import { selectDxfFile } from "./utils/fileSystem";
import { DxfViewer } from "./DxfViewer";
import type { DxfLayer } from "./DxfViewer";

// --- DEFINIÇÃO DE TIPOS ---
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

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export const PostProcessorScreen: React.FC<PostProcessorProps> = ({
  onBack,
}) => {
  // 1. ESTADOS (HOOKS)
  const [activeTab, setActiveTab] = useState<TabType>("file");
  const [detectedLayers, setDetectedLayers] = useState<DxfLayer[]>([]); // Novo estado
  const [selectedLayer, setSelectedLayer] = useState<number>(0);
  const [dxfString, setDxfString] = useState<string | null>(null);

  // 2. FUNÇÕES AUXILIARES (DEVEM ESTAR AQUI, ANTES DO RETURN)
  const handleNotImplemented = (feature: string) => {
    console.log(`Funcionalidade [${feature}] será implementada em breve.`);
  };

  const handleOpenFile = async () => {
    console.log("Iniciando abertura de arquivo...");
    try {
      const file = await selectDxfFile();
      if (file) {
        console.log(`Arquivo selecionado: ${file.name}`);
        const reader = new FileReader();

        reader.onload = (e) => {
          const content = e.target?.result as string;
          console.log("Conteúdo lido. Atualizando estado...");
          setDxfString(content); // <--- Aqui atualizamos o estado
        };

        reader.onerror = (err) => console.error("Erro na leitura:", err);
        reader.readAsText(file);
      } else {
        console.log("Nenhum arquivo selecionado.");
      }
    } catch (err) {
      console.error("Erro fatal ao abrir arquivo:", err);
    }
  };

  // 3. RENDERIZAÇÃO (JSX)
  return (
    <div style={styles.container}>
      {/* BARRA DE TÍTULO */}
      <div style={styles.titleBar}>
        <div style={styles.titleText}>
          <GiLaserburn style={{ marginRight: 8, color: "#fd7e14" }} />
          AutoNest CAM Processor - [Sem Título.lxd]
        </div>
        <div style={styles.windowControls}>
          <span style={styles.coordDisplay}>X: 0.00 Y: 0.00</span>
        </div>
      </div>

      {/* RIBBON MENU */}
      <div style={styles.ribbonContainer}>
        {/* ABAS */}
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

        {/* TOOLBAR */}
        <div style={styles.ribbonToolbar}>
          {/* CONTEÚDO DA ABA FILE */}
          {activeTab === "file" && (
            <div style={styles.toolGroup}>
              <RibbonButton
                icon={<FaFolderOpen />}
                label="Open"
                onClick={handleOpenFile}
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
              {/* 👇 COLE ESTES DOIS GRUPOS NOVOS AQUI: */}

              {/* Grupo 2: Importação e Relatórios */}
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

              {/* Grupo 3: Backup/Sistema */}
              <RibbonButton
                icon={<FaDatabase />}
                label="Backup"
                onClick={() => handleNotImplemented("Backup Params")}
              />
              <div style={styles.separator} />
            </div>
          )}

          {/* BOTÃO DE SAÍDA (SEMPRE VISÍVEL OU NA ABA FILE) */}
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
            }}
          >
            <RibbonButton
              icon={<FaArrowLeft />}
              label="Exit CAM"
              onClick={onBack}
              danger
            />
          </div>
        </div>
      </div>

      {/* ÁREA PRINCIPAL */}
      <div style={styles.mainArea}>
        {/* VIEWPORT (ESQUERDA) */}
        <div style={styles.viewportContainer}>    
          {/* CANVAS AREA */}
          <div style={styles.canvasArea}>
            {/* ALTERAÇÃO: Removemos o if/else. O DxfViewer é renderizado sempre.
                Se 'dxfString' for null, ele mostrará apenas o grid vazio.
            */}
            <div style={{ width: "100%", height: "100%" }}>
              <DxfViewer
                dxfContent={dxfString}
                onLayersDetected={setDetectedLayers}
                showGrid={true}       // <--- Grid sempre ligado
                gridSpacing={250}      // <--- Espaçamento padrão 50mm
              />
            </div>
          </div>

          {/* STATUS BAR */}
          <div style={styles.viewportStatus}>
            <span>{dxfString ? "DXF Loaded" : "Ready"}</span>
            <span>Scale: 1.0</span>
            <span>Grid: 10mm</span>
          </div>
        </div>

        {/* PAINEL DIREITO */}
        <div style={styles.rightPanel}>
          <div style={styles.panelSection}>
            <div style={styles.panelHeader}>
              <FaLayerGroup /> Layers
            </div>
            <div style={styles.layerList}>
              {/* RENDERIZAÇÃO DINÂMICA DOS LAYERS */}
              {detectedLayers.length > 0 ? (
                detectedLayers.map((layer, idx) => (
                  <LayerRow
                    key={layer.name}
                    id={idx}
                    // Aqui passamos a cor detectada no DXF para o quadradinho do painel
                    color={layer.color}
                    // Tradução amigável do nome para o usuário
                    name={
                      layer.name === "0"
                        ? "Mesa / Labels"
                        : layer.name === "1"
                          ? "Corte"
                          : "Gravação"
                    }
                    active={selectedLayer === idx}
                    onClick={() => setSelectedLayer(idx)}
                    speed={layer.aci === 3 ? "100" : "300"}
                    pwr="100%"
                  />
                ))
              ) : (
                <div style={{ padding: 10, fontSize: "0.8rem", color: "#666" }}>
                  Nenhum layer detectado
                </div>
              )}
            </div>
          </div>

          <div style={{ ...styles.panelSection, flex: 1 }}>
            <div style={styles.panelHeader}>Console</div>
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
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// COMPONENTES AUXILIARES E ESTILOS
// ============================================================================

const RibbonButton: React.FC<RibbonButtonProps> = ({
  icon,
  label,
  onClick,
  highlight,
  danger,
  disabled,
}) => {
  const [isHovered, setIsHovered] = React.useState(false);
  const iconColor = danger
    ? isHovered
      ? "#ff6666"
      : "#ff4d4d"
    : isHovered || highlight
      ? "#fd7e14"
      : "#e0e0e0";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        ...styles.ribbonBtn,
        color: disabled ? "#666" : iconColor,
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        transform: isHovered && !disabled ? "scale(1.05)" : "scale(1)",
        transition: "all 0.2s ease",
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
      cursor: "pointer"
    }}
  >
    {/* QUADRADINHO DE COR - AQUI ESTÁ A CORREÇÃO */}
    <div
      style={{
        width: 14,
        height: 14,
        backgroundColor: color || "#fff", // Usa a cor detectada ou branco se falhar
        marginRight: 10,
        border: "1px solid #555",
        borderRadius: "2px"
      }}
    />
    <div style={{ flex: 1, fontSize: "0.85rem" }}>{name}</div>
    <div style={{ fontSize: "0.7rem", color: "#888", marginLeft: 8 }}>
      V:{speed} / P:{pwr}
    </div>
  </div>
);

const JogButton: React.FC<JogButtonProps> = ({ icon }) => (
  <button style={styles.jogBtn}>{icon}</button>
);

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
  windowControls: { display: "flex" },
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
  
  viewportStatus: {
    height: 25,
    backgroundColor: "#444",
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
