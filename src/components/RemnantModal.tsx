import React from "react";

// Mesma interface que você já usa no NestingBoard
interface DBRemnant {
  id: string;
  codigo: string;
  largura: number;
  altura: number;
  area_m2: number;
}

interface RemnantModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableRemnants: DBRemnant[];
  selectedDBRemnant: DBRemnant | null;
  onSelectRemnant: (remnant: DBRemnant) => void;
  onRemoveRemnant: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  theme: any;
}

export const RemnantModal: React.FC<RemnantModalProps> = ({
  isOpen,
  onClose,
  availableRemnants,
  selectedDBRemnant,
  onSelectRemnant,
  onRemoveRemnant,
  theme,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0,0,0,0.6)",
        zIndex: 9999,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: theme.panelBg,
          padding: "20px",
          borderRadius: "8px",
          width: "500px",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          border: `1px solid ${theme.border}`,
          boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()} // Evita fechar ao clicar dentro
      >
        {/* CABEÇALHO */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "15px",
          }}
        >
          <h3 style={{ margin: 0, color: theme.text, display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>♻️</span> Gestão de Retalhos (Eco-Smart)
          </h3>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: theme.text,
              fontSize: "20px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* ÁREA SE JÁ EXISTIR UM RETALHO SELECIONADO */}
        {selectedDBRemnant && (
          <div
            style={{
              background: "rgba(23, 162, 184, 0.1)",
              border: "1px solid #17a2b8",
              padding: "15px",
              borderRadius: "6px",
              marginBottom: "15px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ fontSize: "12px", color: theme.label, fontWeight: "bold" }}>RETALHO EM USO:</span>
              <div style={{ fontSize: "16px", color: theme.text, fontWeight: "bold" }}>
                {selectedDBRemnant.codigo} ({selectedDBRemnant.largura} x {selectedDBRemnant.altura} mm)
              </div>
            </div>
            <button
              onClick={onRemoveRemnant}
              style={{
                background: "#dc3545",
                color: "white",
                border: "none",
                padding: "8px 12px",
                borderRadius: "4px",
                cursor: "pointer",
                fontWeight: "bold",
                fontSize: "12px",
                transition: "background 0.2s"
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = "#c82333"}
              onMouseLeave={(e) => e.currentTarget.style.background = "#dc3545"}
            >
              Remover / Usar Chapa Padrão
            </button>
          </div>
        )}

        {/* LISTA DE RETALHOS DISPONÍVEIS */}
        <span style={{ fontSize: "12px", fontWeight: "bold", color: theme.label, marginBottom: "8px" }}>
          DISPONÍVEIS (Duplo clique para usar):
        </span>
        
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            background: theme.inputBg,
            border: `1px solid ${theme.border}`,
            borderRadius: "4px",
            padding: "5px",
          }}
        >
          {availableRemnants.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: theme.label, fontSize: "14px" }}>
              Nenhum retalho encontrado para este material/espessura.
            </div>
          ) : (
            availableRemnants.map((r) => (
              <div
                key={r.id}
                onDoubleClick={() => onSelectRemnant(r)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 15px",
                  borderBottom: `1px solid ${theme.border}`,
                  cursor: "pointer",
                  userSelect: "none",
                  background: selectedDBRemnant?.id === r.id ? "rgba(40, 167, 69, 0.2)" : "transparent",
                  transition: "background 0.2s"
                }}
                onMouseEnter={(e) => {
                  if (selectedDBRemnant?.id !== r.id) e.currentTarget.style.background = theme.hoverRow;
                }}
                onMouseLeave={(e) => {
                  if (selectedDBRemnant?.id !== r.id) e.currentTarget.style.background = "transparent";
                }}
                title="Dê um duplo clique para selecionar"
              >
                <div>
                  <div style={{ fontWeight: "bold", color: theme.text, fontSize: "14px" }}>{r.codigo}</div>
                  <div style={{ fontSize: "11px", color: theme.label }}>Área: {r.area_m2} m²</div>
                </div>
                <div style={{ fontWeight: "bold", color: "#28a745", fontSize: "14px" }}>
                  {Number(r.largura)} x {Number(r.altura)} mm
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};