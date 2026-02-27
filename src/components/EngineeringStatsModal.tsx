import React from "react";
import type { AppTheme } from "../styles/theme";

// --- INTERFACE DE DADOS ESPERADOS (ATUALIZADA COM DIMENSÕES) ---
export interface EngineeringStatsData {
  material: string;
  espessura: number;
  densidade: number; // em g/cm³

  // Áreas brutas em mm²
  totalBinArea: number;
  effectiveArea: number;
  netPartsArea: number;
  sucataArea: number;
  retalhoArea: number;

  // --- INSERÇÃO: NOVOS CAMPOS DE DIMENSÕES ---
  binWidth: number;
  binHeight: number;
  effectiveWidth: number;
  effectiveHeight: number;
  remnants: { id: string; width: number; height: number; type: string }[];
  // -------------------------------------------

  // Dados de Produção e Rastreabilidade
  pedidos: string[];
  ops: string[];
  tiposProducao: string[];
  quantidadePecas: number;
}

interface EngineeringStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: AppTheme;
  stats: EngineeringStatsData | null;
}

export const EngineeringStatsModal: React.FC<EngineeringStatsModalProps> = ({
  isOpen,
  onClose,
  theme,
  stats,
}) => {
  if (!isOpen || !stats) return null;

  // --- FUNÇÕES MATEMÁTICAS ---
  const getAreaM2 = (areaMm2: number) => areaMm2 / 1_000_000;

  const getWeightKg = (areaMm2: number) => {
    const areaM2 = getAreaM2(areaMm2);
    return areaM2 * stats.espessura * stats.densidade;
  };

  const formatArea = (areaMm2: number) =>
    `${getAreaM2(areaMm2).toFixed(3).replace(".", ",")} m²`;
  const formatWeight = (areaMm2: number) =>
    `${getWeightKg(areaMm2).toFixed(2).replace(".", ",")} kg`;

  // Função para formatar Dimensões (Largura x Altura)
  const formatDims = (w: number, h: number) =>
    `${w.toFixed(0)} x ${h.toFixed(0)}`;

  const renderTags = (items: string[], fallback: string) => {
    if (!items || items.length === 0) {
      return <span style={{ opacity: 0.5, fontSize: "12px" }}>{fallback}</span>;
    }
    return items.map((item, idx) => (
      <span
        key={idx}
        style={{
          background: theme.hoverRow,
          padding: "2px 8px",
          borderRadius: "12px",
          border: `1px solid ${theme.border}`,
          fontSize: "11px",
          fontWeight: "bold",
          marginRight: "4px",
          display: "inline-block",
          marginBottom: "4px",
          color: theme.text,
        }}
      >
        {item}
      </span>
    ));
  };

  // Prepara o texto de dimensões dos retalhos (pode haver mais de 1)
  const remnantsDimsText =
    stats.remnants && stats.remnants.length > 0
      ? stats.remnants.map((r) => formatDims(r.width, r.height)).join(" e ")
      : "-";

  // Estrutura das linhas da tabela (Agora com a propriedade 'dims')
  const tableRows = [
    {
      label: "Mesa Total (Chapa)",
      dims: formatDims(stats.binWidth, stats.binHeight),
      area: stats.totalBinArea,
      color: theme.text,
      isBold: true,
    },
    {
      label: "Área de Corte (Efetiva)",
      // Se houver retalho (formato irregular), oculta a dimensão para não causar confusão matemática
      dims:
        stats.retalhoArea > 0
          ? "-"
          : formatDims(stats.effectiveWidth, stats.effectiveHeight),
      area: stats.effectiveArea,
      color: "#007bff",
      isBold: false,
    },
    {
      label: "Área Líquida (Peças)",
      dims: "-",
      area: stats.netPartsArea,
      color: "#28a745",
      isBold: true,
    },
    {
      label: "Sucata (Perda)",
      dims: "-",
      area: stats.sucataArea,
      color: "#dc3545",
      isBold: true,
    },
    {
      label: "Retalho Útil (Estoque)",
      dims: remnantsDimsText,
      area: stats.retalhoArea,
      color: "#17a2b8",
      isBold: true,
    },
  ];

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        backgroundColor: theme.modalOverlay,
        zIndex: 9999,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: theme.modalBg,
          padding: "25px",
          borderRadius: "8px",
          width: "750px", // Aumentei um pouco a largura para acomodar a nova coluna
          maxWidth: "95vw",
          border: `1px solid ${theme.border}`,
          boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
          display: "flex",
          flexDirection: "column",
          color: theme.text,
          animation: "fadeIn 0.2s ease-out",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }`}</style>

        {/* CABEÇALHO */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "20px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            📊 Relatório de Engenharia e Custos
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: theme.text,
              fontSize: "20px",
              cursor: "pointer",
            }}
            title="Fechar"
          >
            ✕
          </button>
        </div>

        {/* BLOCOS DE INFORMAÇÃO (MATERIAL E PCP) */}
        <div style={{ display: "flex", gap: "15px", marginBottom: "20px" }}>
          <div
            style={{
              flex: 1,
              background: theme.inputBg,
              border: `1px solid ${theme.border}`,
              borderRadius: "6px",
              padding: "12px",
            }}
          >
            <h4
              style={{
                margin: "0 0 10px 0",
                fontSize: "12px",
                color: theme.label,
                textTransform: "uppercase",
              }}
            >
              Especificação do Material
            </h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
                fontSize: "13px",
              }}
            >
              <div>
                <strong>Material:</strong>
                <br />
                {stats.material}
              </div>
              <div>
                <strong>Espessura:</strong>
                <br />
                {stats.espessura > 0 ? `${stats.espessura} mm` : "N/A"}
              </div>
              <div style={{ gridColumn: "span 2" }}>
                <strong>Densidade Considerada:</strong>
                <br />
                {stats.densidade} g/cm³
              </div>
            </div>
          </div>

          <div
            style={{
              flex: 1.2,
              background: theme.inputBg,
              border: `1px solid ${theme.border}`,
              borderRadius: "6px",
              padding: "12px",
            }}
          >
            <h4
              style={{
                margin: "0 0 10px 0",
                fontSize: "12px",
                color: theme.label,
                textTransform: "uppercase",
              }}
            >
              Rastreabilidade (PCP)
            </h4>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                fontSize: "13px",
              }}
            >
              <div>
                <strong>Peças no Arranjo:</strong> {stats.quantidadePecas} un.
              </div>
              <div>
                <strong>Pedidos:</strong>
                <br />
                {renderTags(stats.pedidos, "Nenhum pedido")}
              </div>
              <div>
                <strong>OPs:</strong>
                <br />
                {renderTags(stats.ops, "Nenhuma OP")}
              </div>
              <div>
                <strong>Tipos de Produção:</strong>
                <br />
                {renderTags(stats.tiposProducao, "Normal")}
              </div>
            </div>
          </div>
        </div>

        {/* TABELA DE PESOS E MEDIDAS */}
        <h4
          style={{
            margin: "0 0 10px 0",
            fontSize: "12px",
            color: theme.label,
            textTransform: "uppercase",
          }}
        >
          Análise de Consumo da Chapa
        </h4>
        <div
          style={{
            border: `1px solid ${theme.border}`,
            borderRadius: "6px",
            overflow: "hidden",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              textAlign: "left",
              fontSize: "14px",
            }}
          >
            <thead style={{ background: theme.headerBg }}>
              <tr>
                <th
                  style={{
                    padding: "10px",
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  Parâmetro
                </th>
                <th
                  style={{
                    padding: "10px",
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  Dimensões (mm)
                </th>
                <th
                  style={{
                    padding: "10px",
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  Área Física (m²)
                </th>
                <th
                  style={{
                    padding: "10px",
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  Peso Estimado (KG)
                </th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row, index) => (
                <tr
                  key={index}
                  style={{
                    background:
                      index % 2 === 0 ? "transparent" : theme.hoverRow,
                  }}
                >
                  <td
                    style={{
                      padding: "10px",
                      borderBottom: `1px solid ${theme.border}`,
                      color: row.color,
                      fontWeight: row.isBold ? "bold" : "normal",
                    }}
                  >
                    {row.label}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderBottom: `1px solid ${theme.border}`,
                      fontWeight: row.isBold ? "bold" : "normal",
                    }}
                  >
                    {row.dims}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderBottom: `1px solid ${theme.border}`,
                      fontWeight: row.isBold ? "bold" : "normal",
                    }}
                  >
                    {formatArea(row.area)}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderBottom: `1px solid ${theme.border}`,
                      fontWeight: row.isBold ? "bold" : "normal",
                    }}
                  >
                    {formatWeight(row.area)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* AVISO DE RODAPÉ */}
        <div
          style={{
            marginTop: "15px",
            fontSize: "11px",
            color: theme.label,
            textAlign: "center",
            fontStyle: "italic",
          }}
        >
          * Os pesos são calculados com base na área bruta dos vetores. Peças
          com muitos recortes internos podem apresentar variações no peso real
          em balança.
        </div>
      </div>
    </div>
  );
};
