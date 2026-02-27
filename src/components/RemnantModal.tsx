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
  selectedRemnants: Record<number, DBRemnant>; // A Fila Inteira (Dicionário)
  onAddRemnant: (remnant: DBRemnant) => void;
  onRemoveRemnant: (binIndex: number) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  theme: any;
}

export const RemnantModal: React.FC<RemnantModalProps> = ({
  isOpen,
  onClose,
  availableRemnants,
  selectedRemnants,
  onAddRemnant,
  onRemoveRemnant,
  theme,
}) => {
  if (!isOpen) return null;

  // 1. Converte o dicionário num array para renderizar a Fila de Corte
  const queueList = Object.entries(selectedRemnants).map(([index, rem]) => ({
    binIndex: Number(index),
    remnant: rem,
  }));

  // 2. Filtra o estoque para esconder os retalhos que já foram colocados na Fila
  const idsNoCarrinho = queueList.map((q) => q.remnant.id);
  const estoqueFiltrado = availableRemnants.filter(
    (r) => !idsNoCarrinho.includes(r.id)
  );

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
          width: "550px",
          height: "85vh", // Mais alto para acomodar as duas listas confortavelmente
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
            <span style={{ fontSize: "20px" }}>♻️</span> Gestão de Retalhos (Fila Múltipla)
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

        {/* ========================================================= */}
        {/* SESSÃO 1: FILA DE CORTE (CARRINHO)                        */}
        {/* ========================================================= */}
        <div style={{ marginBottom: "20px" }}>
          <span style={{ fontSize: "12px", color: theme.label, fontWeight: "bold" }}>
            RETALHOS NA FILA DE CORTE:
          </span>
          <div
            style={{
              background: "rgba(23, 162, 184, 0.05)",
              border: "1px dashed #17a2b8",
              padding: "10px",
              borderRadius: "6px",
              marginTop: "5px",
              minHeight: "70px",
              maxHeight: "200px",
              overflowY: "auto",
            }}
          >
            {queueList.length === 0 ? (
              <div style={{ textAlign: "center", color: theme.label, fontSize: "13px", marginTop: "15px" }}>
                Nenhum retalho na fila. Dê um duplo clique abaixo para adicionar.
              </div>
            ) : (
              queueList.map(({ binIndex, remnant }) => (
                <div
                  key={binIndex}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    background: theme.panelBg,
                    border: `1px solid ${theme.border}`,
                    padding: "8px 12px",
                    borderRadius: "4px",
                    marginBottom: "6px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{
                      background: "#17a2b8", color: "white", padding: "2px 6px",
                      borderRadius: "4px", fontSize: "11px", fontWeight: "bold"
                    }}>
                      Chapa {binIndex + 1}
                    </div>
                    <span style={{ fontSize: "14px", color: theme.text, fontWeight: "bold" }}>
                      {remnant.codigo}
                    </span>
                    <span style={{ fontSize: "12px", color: theme.label }}>
                      ({Number(remnant.largura)} x {Number(remnant.altura)} mm)
                    </span>
                  </div>
                  <button
                    onClick={() => onRemoveRemnant(binIndex)}
                    style={{
                      background: "transparent", color: "#dc3545", border: "none",
                      cursor: "pointer", fontWeight: "bold", fontSize: "14px", padding: "0 5px"
                    }}
                    title="Remover da fila e voltar para o estoque"
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* SESSÃO 2: ESTOQUE DISPONÍVEL                              */}
        {/* ========================================================= */}
        <span style={{ fontSize: "12px", fontWeight: "bold", color: theme.label, marginBottom: "8px" }}>
          ESTOQUE DISPONÍVEL (Duplo clique para adicionar à fila):
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
          {estoqueFiltrado.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: theme.label, fontSize: "14px" }}>
              {availableRemnants.length > 0
                ? "Todos os retalhos disponíveis já estão na Fila de Corte."
                : "Nenhum retalho encontrado para este material/espessura."}
            </div>
          ) : (
            estoqueFiltrado.map((r) => (
              <div
                key={r.id}
                onDoubleClick={() => onAddRemnant(r)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 15px",
                  borderBottom: `1px solid ${theme.border}`,
                  cursor: "pointer",
                  userSelect: "none",
                  background: "transparent",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = theme.hoverRow)}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                title="Dê um duplo clique para enviar à fila de corte"
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