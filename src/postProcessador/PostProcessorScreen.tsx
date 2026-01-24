/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { useTheme } from "../context/ThemeContext";
// Ajuste do caminho: voltando uma pasta para achar components
import { SidebarMenu } from "../components/SidebarMenu"; 
import { 
  FaMousePointer, FaDraftingCompass, FaCogs, 
  FaPlay, FaStop, FaSave, FaFileExport, FaArrowLeft 
} from "react-icons/fa";

type ActiveTab = "home" | "draw" | "technical" | "cnc";

export const PostProcessorScreen: React.FC<any> = ({ onBack, nestingResult, binSize, onNavigate }) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<ActiveTab>("home");
  const [simulationActive, setSimulationActive] = useState(false);

  const layoutStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100vw",
    background: "#0A0A0A",
    color: theme.text,
    overflow: "hidden",
  };

  return (
    <div style={layoutStyle}>
      {/* 1. RIBBON BAR */}
      <header style={{ background: theme.headerBg, borderBottom: `1px solid ${theme.border}`, display: "flex", flexDirection: "column" }}>
        
        {/* Abas e Botão Voltar */}
        <div style={{ display: "flex", padding: "4px 10px 0 10px", gap: "5px", alignItems: "center" }}>
          {/* BOTÃO VOLTAR (Resolve o erro do onBack) */}
          <button 
            onClick={onBack}
            style={{ background: "transparent", border: "none", color: theme.text, cursor: "pointer", padding: "0 10px", display: "flex", alignItems: "center" }}
            title="Sair do Pós-Processador"
          >
            <FaArrowLeft size={14} />
          </button>

          {["File", "Home", "Draw", "Technical", "CNC"].map((tab) => (
            <div
              key={tab}
              onClick={() => tab !== "File" && setActiveTab(tab.toLowerCase() as ActiveTab)}
              style={{
                padding: "4px 15px",
                fontSize: "12px",
                cursor: "pointer",
                borderRadius: "3px 3px 0 0",
                background: activeTab === tab.toLowerCase() ? theme.panelBg : "transparent",
                border: activeTab === tab.toLowerCase() ? `1px solid ${theme.border}` : "1px solid transparent",
                borderBottom: activeTab === tab.toLowerCase() ? `1px solid ${theme.panelBg}` : "none",
                marginBottom: "-1px",
                zIndex: 1,
              }}
            >
              {tab}
            </div>
          ))}

          {/* MENU DE USUÁRIO (Resolve o erro do SidebarMenu) */}
          <div style={{ marginLeft: "auto", paddingBottom: "4px" }}>
            <SidebarMenu 
               onNavigate={onNavigate} 
               onOpenProfile={() => {}} 
               onOpenTeam={() => {}} 
            />
          </div>
        </div>

        {/* Barra de Ferramentas */}
        <div style={{ 
          background: theme.panelBg, 
          padding: "10px 20px", 
          display: "flex", 
          gap: "20px",
          borderTop: `1px solid ${theme.border}`,
          height: "70px",
          alignItems: "center"
        }}>
          {activeTab === "home" && (
            <>
              <ToolButton icon={<FaMousePointer />} label="Select" />
              <ToolButton icon={<FaDraftingCompass />} label="Measure" />
              <ToolSeparator />
              <ToolButton icon={<FaFileExport />} label="Zoom Fit" />
            </>
          )}
          {activeTab === "technical" && (
            <>
              <ToolButton icon={<FaCogs />} label="Auto Lead-in" color="#007bff" />
              <ToolButton icon={<FaCogs />} label="Micro Joint" />
              <ToolSeparator />
              <ToolButton icon={<FaCogs />} label="Cooling Point" />
            </>
          )}
          {activeTab === "cnc" && (
            <>
              <ToolButton 
                icon={simulationActive ? <FaStop /> : <FaPlay />} 
                label={simulationActive ? "Stop Simu" : "Simulate"} 
                onClick={() => setSimulationActive(!simulationActive)}
                color={simulationActive ? "#dc3545" : "#28a745"}
              />
              <ToolSeparator />
              <ToolButton icon={<FaSave />} label="Export LXD" />
              <ToolButton icon={<FaSave />} label="Export G-Code" />
            </>
          )}
        </div>
      </header>

      {/* 2. ÁREA DE TRABALHO (Restante do código igual...) */}
      <main style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <aside style={{ width: "250px", borderRight: `1px solid ${theme.border}`, background: theme.panelBg }}>
           <PanelHeader title="Layer Manager" />
           <div style={{ padding: "10px" }}>
              <LayerRow color="#39FF14" name="Corte (2mm)" active />
              <LayerRow color="#FF00FF" name="Gravação" active />
           </div>
        </aside>

        <section style={{ flex: 1, position: "relative", background: "#0A0A0A" }}>
           <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", color: "#444" }}>
              [ Viewport CAD: {binSize?.width || 1200} x {binSize?.height || 3000} ]
           </div>
           
           <div style={{ position: "absolute", bottom: 0, width: "100%", background: "rgba(0,0,0,0.5)", padding: "2px 10px", fontSize: "11px", display: "flex", gap: "20px" }}>
              <span>X: 0.00</span> <span>Y: 0.00</span>
           </div>
        </section>

        <aside style={{ width: "300px", borderLeft: `1px solid ${theme.border}`, background: theme.panelBg }}>
           <PanelHeader title="NC Control" />
           <div style={{ padding: "15px" }}>
              <div style={{ background: "#000", padding: "10px", borderRadius: "4px", textAlign: "center", marginBottom: "15px" }}>
                 <div style={{ color: "#39FF14", fontSize: "20px", fontFamily: "monospace" }}>0.000, 0.000</div>
              </div>
              <button style={{ width: "100%", padding: "10px", marginBottom: "5px", background: "#007bff", border: "none", color: "#fff", fontWeight: "bold", cursor: "pointer" }}>Start *</button>
           </div>
        </aside>
      </main>

      <footer style={{ height: "25px", background: theme.headerBg, borderTop: `1px solid ${theme.border}`, display: "flex", alignItems: "center", padding: "0 15px", fontSize: "11px" }}>
         <span style={{ color: "#28a745" }}>● System Ready</span>
         <span style={{ marginLeft: "20px" }}>Parts: {nestingResult?.length || 0}</span>
      </footer>
    </div>
  );
};

// --- Sub-componentes auxiliares (ToolButton, ToolSeparator, PanelHeader, LayerRow) permanecem os mesmos ---
const ToolButton = ({ icon, label, onClick, color }: any) => (
  <div onClick={onClick} style={{ display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer", gap: "5px", minWidth: "50px" }}>
    <div style={{ fontSize: "20px", color: color || "inherit" }}>{icon}</div>
    <span style={{ fontSize: "10px", opacity: 0.8 }}>{label}</span>
  </div>
);

const ToolSeparator = () => (
  <div style={{ width: "1px", height: "40px", background: "#444", margin: "0 5px" }} />
);

const PanelHeader = ({ title }: any) => (
  <div style={{ padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid #333", fontSize: "11px", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.5px" }}>
    {title}
  </div>
);

const LayerRow = ({ color, name, active }: any) => (
  <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 5px", borderBottom: "1px solid #222" }}>
    <input type="checkbox" checked={active} readOnly />
    <div style={{ width: "15px", height: "15px", background: color, borderRadius: "2px" }} />
    <span style={{ fontSize: "12px" }}>{name}</span>
  </div>
);