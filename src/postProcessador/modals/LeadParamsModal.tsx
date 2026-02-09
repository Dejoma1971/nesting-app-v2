import React, { useState } from "react";
// Import Type-Only para evitar erro de verbatism (Separando Valor de Tipo)
import { DEFAULT_LEAD_PARAMS } from "./leadTypes";
import type { LeadParams, LeadConfig, LeadType } from "./leadTypes";

interface LeadParamsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (params: LeadParams) => void;
  currentParams: LeadParams;
}

export const LeadParamsModal: React.FC<LeadParamsModalProps> = ({
  isOpen,
  onClose,
  onApply,
  currentParams,
}) => {
  const [localParams, setLocalParams] = useState<LeadParams>(currentParams);

  if (!isOpen) return null;

  // --- LÓGICA DE NEGÓCIO E ESTILO (LEAD IN) ---

  // 1. Regra do Raio (Radius)
  // Só habilita se for "Line + Arc".
  const isRadiusDisabled = (type: LeadType) => {
    return type !== "Line + Arc";
  };

  // 2. Regra do Checkbox (Furo Inicial)
  // Desabilita apenas se for "Arc".
  const isHoleCheckboxDisabled = (type: LeadType) => {
    return type === "Arc";
  };

  // 3. Regra do Input de Raio do Furo
  // Desabilita se o checkbox estiver inacessível OU desmarcado.
  const isHoleInputDisabled = (type: LeadType, isChecked: boolean) => {
    return isHoleCheckboxDisabled(type) || !isChecked;
  };

  // --- HANDLERS DE ATUALIZAÇÃO ---

  const updateLeadIn = (
    field: keyof LeadConfig,
    value: string | number | boolean,
  ) => {
    setLocalParams((prev) => ({
      ...prev,
      leadIn: { ...prev.leadIn, [field]: value },
    }));
  };

  const updateLeadOut = (
    field: keyof LeadConfig,
    value: string | number | boolean,
  ) => {
    setLocalParams((prev) => ({
      ...prev,
      leadOut: { ...prev.leadOut, [field]: value },
    }));
  };

  const handleReset = () => {
    if (window.confirm("Restaurar configurações padrão de entrada/saída?")) {
      setLocalParams(DEFAULT_LEAD_PARAMS);
    }
  };

  const handleSave = () => {
    onApply(localParams);
    onClose();
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        {/* HEADER */}
        <div style={styles.header}>
          <span>Lead Lines Params</span>
          <button onClick={onClose} style={styles.closeBtn}>
            ✕
          </button>
        </div>

        {/* BODY */}
        <div style={styles.body}>
          <p style={styles.description}>
            Configure as linhas de entrada (Lead In) e saída (Lead Out) para
            compensação de corte.
          </p>

          {/* 1. LEAD IN (Aplicando as regras visuais de opacidade) */}
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Lead In (Entrada)</legend>
            <div style={styles.row}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Type:</label>
                <select
                  style={styles.input}
                  value={localParams.leadIn.type}
                  onChange={(e) => updateLeadIn("type", e.target.value)}
                >
                  <option value="None">None</option>
                  <option value="Line">Line</option>
                  <option value="Arc">Arc</option>
                  <option value="Line + Arc">Line + Arc</option>
                </select>
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Length (mm):</label>
                <input
                  type="number"
                  style={styles.input}
                  value={localParams.leadIn.length}
                  onChange={(e) =>
                    updateLeadIn("length", Number(e.target.value))
                  }
                />
              </div>
            </div>

            <div style={styles.row}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Angle (°):</label>
                <input
                  type="number"
                  style={styles.input}
                  value={localParams.leadIn.angle}
                  onChange={(e) =>
                    updateLeadIn("angle", Number(e.target.value))
                  }
                />
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Radius (mm):</label>
                <input
                  type="number"
                  // APLICAÇÃO DE ESTILO DINÂMICO (OPACIDADE)
                  style={{
                    ...styles.input,
                    opacity: isRadiusDisabled(localParams.leadIn.type)
                      ? 0.3
                      : 1,
                  }}
                  value={localParams.leadIn.radius}
                  onChange={(e) =>
                    updateLeadIn("radius", Number(e.target.value))
                  }
                  disabled={isRadiusDisabled(localParams.leadIn.type)}
                />
              </div>
            </div>

            <div style={{ ...styles.row, marginTop: 10, alignItems: "center" }}>
              <label
                style={{
                  ...styles.label,
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                  // OPACIDADE NO LABEL DO CHECKBOX
                  opacity: isHoleCheckboxDisabled(localParams.leadIn.type)
                    ? 0.3
                    : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={localParams.leadIn.useHole}
                  onChange={(e) => updateLeadIn("useHole", e.target.checked)}
                  style={{ marginRight: 8 }}
                  disabled={isHoleCheckboxDisabled(localParams.leadIn.type)}
                />
                Add small hole at start point
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  marginLeft: 20,
                }}
              >
                <label style={{ ...styles.label, marginRight: 5 }}>
                  Hole R:
                </label>
                <input
                  type="number"
                  // OPACIDADE NO INPUT DO FURO
                  style={{
                    ...styles.input,
                    width: 60,
                    opacity: isHoleInputDisabled(
                      localParams.leadIn.type,
                      localParams.leadIn.useHole,
                    )
                      ? 0.3
                      : 1,
                  }}
                  value={localParams.leadIn.holeRadius}
                  onChange={(e) =>
                    updateLeadIn("holeRadius", Number(e.target.value))
                  }
                  disabled={isHoleInputDisabled(
                    localParams.leadIn.type,
                    localParams.leadIn.useHole,
                  )}
                />
              </div>
            </div>
          </fieldset>

          {/* 2. LEAD OUT */}
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Lead Out (Saída)</legend>
            <div style={styles.row}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Type:</label>
                <select
                  style={styles.input}
                  value={localParams.leadOut.type}
                  onChange={(e) => updateLeadOut("type", e.target.value)}
                >
                  <option value="None">None</option>
                  <option value="Line">Line</option>
                  <option value="Arc">Arc</option>
                  <option value="Line + Arc">Line + Arc</option>
                </select>
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Length (mm):</label>
                <input
                  type="number"
                  style={styles.input}
                  value={localParams.leadOut.length}
                  onChange={(e) =>
                    updateLeadOut("length", Number(e.target.value))
                  }
                />
              </div>
            </div>
            <div style={styles.row}>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Angle (°):</label>
                <input
                  type="number"
                  style={styles.input}
                  value={localParams.leadOut.angle}
                  onChange={(e) =>
                    updateLeadOut("angle", Number(e.target.value))
                  }
                />
              </div>
              <div style={styles.fieldGroup}>
                <label style={styles.label}>Radius (mm):</label>
                <input
                  type="number"
                  style={{
                    ...styles.input,
                    // Opaco se NÃO for "Line + Arc"
                    opacity:
                      localParams.leadOut.type !== "Line + Arc" ? 0.3 : 1,
                  }}
                  value={localParams.leadOut.radius}
                  onChange={(e) =>
                    updateLeadOut("radius", Number(e.target.value))
                  }
                  // Desabilitado se NÃO for "Line + Arc"
                  disabled={localParams.leadOut.type !== "Line + Arc"}
                />
              </div>
            </div>
          </fieldset>

          {/* 3. POSITION */}
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Lead Position</legend>

            <div style={styles.radioRow}>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name="posMode"
                  checked={localParams.positionMode === "Automatic"}
                  onChange={() =>
                    setLocalParams((p) => ({ ...p, positionMode: "Automatic" }))
                  }
                />
                Automatic Lead Position
              </label>
              <div
                style={{
                  marginLeft: 25,
                  display: "flex",
                  flexDirection: "column",
                  gap: 5,
                }}
              >
                <label
                  style={{
                    ...styles.label,
                    opacity: localParams.positionMode === "Automatic" ? 1 : 0.5,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={localParams.positionAutoType === "Vertex"}
                    onChange={() =>
                      setLocalParams((p) => ({
                        ...p,
                        positionAutoType: "Vertex",
                      }))
                    }
                    disabled={localParams.positionMode !== "Automatic"}
                  />{" "}
                  Introduce from vertex
                </label>
                <label
                  style={{
                    ...styles.label,
                    opacity: localParams.positionMode === "Automatic" ? 1 : 0.5,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={localParams.positionAutoType === "LongEdge"}
                    onChange={() =>
                      setLocalParams((p) => ({
                        ...p,
                        positionAutoType: "LongEdge",
                      }))
                    }
                    disabled={localParams.positionMode !== "Automatic"}
                  />{" "}
                  Introduce from long edge
                </label>
              </div>
            </div>

            <div style={{ ...styles.radioRow, marginTop: 10 }}>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name="posMode"
                  checked={localParams.positionMode === "Manual"}
                  onChange={() =>
                    setLocalParams((p) => ({ ...p, positionMode: "Manual" }))
                  }
                />
                Set by Universal (0~1) param
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                style={{ ...styles.input, width: 70, marginLeft: 10 }}
                value={localParams.positionManualParam}
                onChange={(e) =>
                  setLocalParams((p) => ({
                    ...p,
                    positionManualParam: Number(e.target.value),
                  }))
                }
              />
            </div>

            <div style={{ ...styles.radioRow, marginTop: 10 }}>
              <label style={styles.radioLabel}>
                <input
                  type="radio"
                  name="posMode"
                  checked={localParams.positionMode === "Keep"}
                  onChange={() =>
                    setLocalParams((p) => ({ ...p, positionMode: "Keep" }))
                  }
                />
                Change leads type, remain position
              </label>
            </div>
          </fieldset>

          {/* 4. OPTIONS */}
          <fieldset style={styles.fieldset}>
            <legend style={styles.legend}>Options</legend>
            <div style={{ display: "flex", gap: 20 }}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={localParams.onlyClosed}
                  onChange={(e) =>
                    setLocalParams((p) => ({
                      ...p,
                      onlyClosed: e.target.checked,
                    }))
                  }
                />{" "}
                Only for Closed Graph
              </label>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={localParams.onlyOuter}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    setLocalParams((p) => ({
                      ...p,
                      onlyOuter: isChecked,
                      // Se marcou Outer, desmarca Inner forçadamente
                      onlyInner: isChecked ? false : p.onlyInner,
                    }));
                  }}
                />{" "}
                Only applies to outer
              </label>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={localParams.onlyInner}
                  onChange={(e) => {
                    const isChecked = e.target.checked;
                    setLocalParams((p) => ({
                      ...p,
                      onlyInner: isChecked,
                      // Se marcou Inner, desmarca Outer forçadamente
                      onlyOuter: isChecked ? false : p.onlyOuter,
                    }));
                  }}
                />{" "}
                Only applies to inner
              </label>
            </div>
          </fieldset>
        </div>

        {/* FOOTER */}
        <div style={styles.footer}>
          <button onClick={handleReset} style={styles.resetBtn}>
            Reset to Default
          </button>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={styles.cancelBtn}>
              Cancel
            </button>
            <button onClick={handleSave} style={styles.okBtn}>
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- ESTILOS DARK THEME ---
const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    zIndex: 9999,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    width: "500px",
    maxHeight: "90vh",
    backgroundColor: "#252526",
    border: "1px solid #454545",
    boxShadow: "0 0 20px rgba(0,0,0,0.5)",
    display: "flex",
    flexDirection: "column",
    color: "#cccccc",
    fontFamily: "Segoe UI, sans-serif",
    fontSize: "13px",
  },
  header: {
    padding: "10px 15px",
    backgroundColor: "#2d2d2d",
    borderBottom: "1px solid #3e3e42",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontWeight: "bold",
    fontSize: "14px",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "#ccc",
    cursor: "pointer",
    fontSize: "16px",
  },
  body: {
    padding: "15px",
    overflowY: "auto",
    flex: 1,
  },
  description: {
    marginBottom: "15px",
    color: "#888",
    fontStyle: "italic",
  },
  fieldset: {
    border: "1px solid #3e3e42",
    borderRadius: "4px",
    padding: "10px",
    marginBottom: "15px",
  },
  legend: {
    padding: "0 5px",
    color: "#007acc",
    fontWeight: "600",
  },
  row: {
    display: "flex",
    gap: "15px",
    marginBottom: "8px",
  },
  fieldGroup: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  label: {
    color: "#aaa",
    fontSize: "12px",
  },
  input: {
    backgroundColor: "#333",
    border: "1px solid #444",
    color: "#fff",
    padding: "4px",
    borderRadius: "2px",
    width: "100%",
  },
  radioRow: {
    display: "flex",
    alignItems: "flex-start",
    marginBottom: 5,
  },
  radioLabel: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
  },
  checkboxLabel: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    cursor: "pointer",
    color: "#ccc",
  },
  footer: {
    padding: "15px",
    borderTop: "1px solid #3e3e42",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#2d2d2d",
  },
  okBtn: {
    padding: "6px 20px",
    backgroundColor: "#007acc",
    color: "white",
    border: "none",
    borderRadius: "2px",
    cursor: "pointer",
  },
  cancelBtn: {
    padding: "6px 20px",
    backgroundColor: "transparent",
    color: "#ccc",
    border: "1px solid #555",
    borderRadius: "2px",
    cursor: "pointer",
  },
  resetBtn: {
    padding: "6px 15px",
    backgroundColor: "transparent",
    color: "#d9534f",
    border: "1px solid #d9534f",
    borderRadius: "2px",
    cursor: "pointer",
    fontSize: "12px",
  },
};
