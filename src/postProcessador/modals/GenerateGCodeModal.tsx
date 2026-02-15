import React, { useState } from "react";

// CORREÇÃO 1: Separando a Classe do Tipo para satisfazer o TypeScript estrito
import { GCodeGenerator } from "../cam/GCodeGenerator";
import type { MachineConfig } from "../cam/GCodeGenerator";

// CORREÇÃO 2: Verifique se estes caminhos batem com sua estrutura
// Se este arquivo está em "src/postProcessador/modals", o "../../" volta para "src"
import type { PlacedPart } from "../../utils/nestingCore";
import type { ImportedPart } from "../../components/types";

interface GenerateGCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  placedParts: PlacedPart[];
  allParts: ImportedPart[];
}

export const GenerateGCodeModal: React.FC<GenerateGCodeModalProps> = ({
  isOpen,
  onClose,
  placedParts,
  allParts,
}) => {
  // Configuração Padrão da Máquina
  const [config, setConfig] = useState<MachineConfig>({
    kerf: 0.2,       // Compensação do raio da ferramenta (0.2mm diâmetro)
    feedRate: 2000,  // Velocidade de corte
    power: 80,       // Potência do laser
    safeHeight: 5,   // Altura segura Z
  });

  if (!isOpen) return null;

  const handleChange = (field: keyof MachineConfig, value: number) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleGenerate = () => {
    try {
      // 1. Instancia o Gerador
      const generator = new GCodeGenerator();

      // 2. Gera o Texto G-Code
      const gcodeContent = generator.generate(placedParts, allParts, config);

      // 3. Cria o arquivo para download
      const blob = new Blob([gcodeContent], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = url;
      link.download = `corte_${new Date().getTime()}.nc`; // Nome do arquivo com timestamp
      document.body.appendChild(link);
      link.click();
      
      // Limpeza
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      onClose();
      alert("Arquivo G-Code gerado com sucesso! Verifique sua pasta de Downloads.");
      
    } catch (error) {
      console.error("Erro ao gerar G-Code:", error);
      alert("Erro ao processar geometria. Verifique o console.");
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <span>Gerar G-Code (Post Process)</span>
          <button onClick={onClose} style={styles.closeBtn}>✕</button>
        </div>

        <div style={styles.body}>
          <p style={{marginBottom: 15, color: '#aaa'}}>
            Parâmetros de Corte:
          </p>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Diâmetro do Laser (Kerf) [mm]:</label>
            <input
              type="number"
              step="0.05"
              style={styles.input}
              value={config.kerf}
              onChange={(e) => handleChange("kerf", Number(e.target.value))}
            />
            <small style={{color: '#666', display: 'block', marginTop: 2}}>
              Offset aplicado: { (config.kerf / 2).toFixed(3) }mm
            </small>
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Velocidade (Feed) [mm/min]:</label>
            <input
              type="number"
              step="100"
              style={styles.input}
              value={config.feedRate}
              onChange={(e) => handleChange("feedRate", Number(e.target.value))}
            />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Potência (0-100%):</label>
            <input
              type="number"
              style={styles.input}
              value={config.power}
              onChange={(e) => handleChange("power", Number(e.target.value))}
            />
          </div>

          <div style={styles.fieldRow}>
            <label style={styles.label}>Altura Segura Z [mm]:</label>
            <input
              type="number"
              style={styles.input}
              value={config.safeHeight}
              onChange={(e) => handleChange("safeHeight", Number(e.target.value))}
            />
          </div>
        </div>

        <div style={styles.footer}>
          <button onClick={onClose} style={styles.cancelBtn}>Cancelar</button>
          <button onClick={handleGenerate} style={styles.generateBtn}>
            💾 Baixar Arquivo
          </button>
        </div>
      </div>
    </div>
  );
};

// Estilos Dark Theme
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed", top: 0, left: 0, width: "100%", height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.7)", zIndex: 9999,
    display: "flex", justifyContent: "center", alignItems: "center",
  },
  modal: {
    width: "400px", backgroundColor: "#252526", 
    border: "1px solid #454545", color: "#ccc",
    fontFamily: "Segoe UI, sans-serif", fontSize: "13px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.5)"
  },
  header: {
    padding: "10px 15px", backgroundColor: "#2d2d2d", fontWeight: "bold",
    display: "flex", justifyContent: "space-between", alignItems: "center",
    borderBottom: "1px solid #3e3e42"
  },
  closeBtn: {
    background: "transparent", border: "none", color: "#ccc", cursor: "pointer"
  },
  body: { padding: "20px" },
  fieldRow: { marginBottom: "12px" },
  label: { display: "block", marginBottom: "5px", color: "#ddd" },
  input: {
    width: "100%", padding: "6px", backgroundColor: "#333", 
    border: "1px solid #444", color: "#fff", borderRadius: "3px"
  },
  footer: {
    padding: "15px", backgroundColor: "#2d2d2d", 
    display: "flex", justifyContent: "flex-end", gap: "10px",
    borderTop: "1px solid #3e3e42"
  },
  cancelBtn: {
    padding: "6px 15px", background: "transparent", border: "1px solid #555",
    color: "#ccc", cursor: "pointer", borderRadius: "3px"
  },
  generateBtn: {
    padding: "6px 20px", backgroundColor: "#28a745", border: "none",
    color: "white", cursor: "pointer", borderRadius: "3px", fontWeight: "bold"
  }
};