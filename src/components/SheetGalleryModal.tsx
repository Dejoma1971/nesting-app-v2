import React from "react"; // <--- REMOVIDO { useMemo }
import { MiniatureCanvas } from "./MiniatureCanvas";
import type { ImportedPart } from "./types";
import type { PlacedPart } from "../utils/nestingCore";
import type { AppTheme } from "../styles/theme";

interface SheetGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  totalBins: number;
  currentBinIndex: number;
  onSelectBin: (index: number) => void;
  binWidth: number;
  binHeight: number;
  parts: ImportedPart[];
  nestingResult: PlacedPart[];
  theme: AppTheme;
}

// Helper para calcular a eficiência (CORRIGIDO PARA IGUALAR AO NESTINGBOARD)
const calculateEfficiency = (
  binId: number,
  placedParts: PlacedPart[],
  parts: ImportedPart[],
  binArea: number,
) => {
  const partsInBin = placedParts.filter((p) => p.binId === binId);
  if (partsInBin.length === 0) return 0;

  const usedArea = partsInBin.reduce((acc, p) => {
    const original = parts.find((op) => op.id === p.partId);
    // CORREÇÃO AQUI: Usa netArea (real) se disponível, senão usa grossArea.
    // Isso garante que o valor bata com o da tela principal.
    const area = original ? original.netArea || original.grossArea : 0;
    return acc + area;
  }, 0);

  return (usedArea / binArea) * 100;
};
export const SheetGalleryModal: React.FC<SheetGalleryModalProps> = ({
  isOpen,
  onClose,
  totalBins,
  currentBinIndex,
  onSelectBin,
  binWidth,
  binHeight,
  parts,
  nestingResult,
  theme,
}) => {
  if (!isOpen) return null;

  const binArea = binWidth * binHeight;

  // Estilos Inline baseados no Tema
  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    zIndex: 9999,
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backdropFilter: "blur(4px)",
  };

  const modalStyle: React.CSSProperties = {
    backgroundColor: theme.panelBg,
    color: theme.text,
    width: "90%",
    maxWidth: "1200px",
    height: "85%",
    borderRadius: "12px",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
    border: `1px solid ${theme.border}`,
    overflow: "hidden", // Importante para o header fixo
  };

  const headerStyle: React.CSSProperties = {
    padding: "20px",
    borderBottom: `1px solid ${theme.border}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.headerBg,
  };

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", // Responsivo
    gap: "20px",
    padding: "20px",
    overflowY: "auto",
    flex: 1,
  };

  const cardStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div style={headerStyle}>
          <div>
            <h2 style={{ margin: 0, fontSize: "20px" }}>Galeria de Chapas</h2>
            <span style={{ fontSize: "12px", opacity: 0.7 }}>
              {totalBins} chapa(s) gerada(s) • Clique para editar
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: theme.text,
              fontSize: "24px",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* GRID DE MINIATURAS */}
        <div style={gridStyle}>
          {Array.from({ length: totalBins }).map((_, index) => {
            const efficiency = calculateEfficiency(
              index,
              nestingResult,
              parts,
              binArea,
            ).toFixed(1);

            // Verifica se esta chapa tem poucas peças (potencial desperdício)
            const partsCount = nestingResult.filter(
              (p) => p.binId === index,
            ).length;
            const isLowEfficiency = Number(efficiency) < 50;

            return (
              <div key={index} style={cardStyle}>
                <div style={{ height: "180px", width: "100%" }}>
                  <MiniatureCanvas
                    binId={index}
                    binWidth={binWidth}
                    binHeight={binHeight}
                    parts={parts}
                    placedParts={nestingResult}
                    theme={theme}
                    isSelected={currentBinIndex === index}
                    onClick={() => {
                      onSelectBin(index);
                      onClose();
                    }}
                  />
                </div>

                {/* Rodapé do Card */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "12px",
                    fontWeight: "bold",
                    padding: "0 5px",
                  }}
                >
                  <span>Chapa {index + 1}</span>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <span style={{ color: theme.label }}>
                      {partsCount} peças
                    </span>
                    <span
                      style={{
                        color: isLowEfficiency ? "#dc3545" : "#28a745",
                      }}
                    >
                      {efficiency}% Efic.
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
