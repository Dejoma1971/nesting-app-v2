import React, { useState, useRef } from "react";

// ==========================================
// MOCKS (DADOS FALSOS PARA A FASE 1)
// ==========================================
interface Material {
  id: string;
  nome: string;
  cor: string;
}
interface Espessura {
  id: string;
  valor_mm: number;
}
interface Classificacao {
  id: string;
  nome: string;
  cor: string;
}

const MOCK_MATERIAIS: Material[] = [
  { id: "1", nome: "Aço Carbono", cor: "#34495e" },
  { id: "2", nome: "Aço Inox", cor: "#7f8c8d" },
  { id: "3", nome: "Alumínio", cor: "#2980b9" },
  { id: "4", nome: "Galvanizado", cor: "#8e44ad" },
  { id: "5", nome: "Latão", cor: "#f39c12" },
  { id: "6", nome: "Cobre", cor: "#d35400" },
  { id: "7", nome: "Titânio", cor: "#95a5a6" },
  { id: "8", nome: "Bronze", cor: "#e67e22" },
];

const MOCK_ESPESSURAS: Espessura[] = [
  { id: "1", valor_mm: 0.8 },
  { id: "2", valor_mm: 1.2 },
  { id: "3", valor_mm: 1.5 },
  { id: "4", valor_mm: 2.0 },
  { id: "5", valor_mm: 3.0 },
  { id: "6", valor_mm: 4.75 },
  { id: "7", valor_mm: 6.35 },
  { id: "8", valor_mm: 8.0 },
  { id: "9", valor_mm: 10.0 },
  { id: "10", valor_mm: 12.5 },
];

const MOCK_CLASSIFICACAO: Classificacao[] = [
  { id: "A", nome: "⭐ TIPO A (Perfeito)", cor: "#28a745" },
  { id: "B", nome: "⚠️ TIPO B (Avarias)", cor: "#f39c12" },
  { id: "C", nome: "❌ SUCATA (Retalho Morto)", cor: "#dc3545" },
];

interface RemnantEntryHMIProps {
  theme?: {
    canvasBg: string;
    panelBg: string;
    headerBg: string;
    text: string;
    label: string;
    border: string;
    inputBg: string;
    hoverRow: string;
  };
  onClose?: () => void;
  onOpenStock?: () => void;
}

export const RemnantEntryHMI: React.FC<RemnantEntryHMIProps> = ({
  theme = {
    canvasBg: "#0a0a0a",
    panelBg: "#1a1a1a",
    headerBg: "#111111",
    text: "#ffffff",
    label: "#aaaaaa",
    border: "#333333",
    inputBg: "#222222",
    hoverRow: "#2c3e50",
  },
  onClose,
  onOpenStock,
}) => {
  const [material, setMaterial] = useState<Material | null>(null);
  const [espessura, setEspessura] = useState<Espessura | null>(null);
  const [classificacao, setClassificacao] = useState<Classificacao | null>(
    null,
  );

  const [largura, setLargura] = useState<string>("");
  const [altura, setAltura] = useState<string>("");

  const [activeDropdown, setActiveDropdown] = useState<
    "MATERIAL" | "ESPESSURA" | "CLASSIFICACAO" | null
  >(null);
  const [activeInput, setActiveInput] = useState<"LARGURA" | "ALTURA" | null>(
    null,
  );

  const listRef = useRef<HTMLDivElement>(null);

  const scrollList = (direction: "up" | "down") => {
    if (listRef.current) {
      listRef.current.scrollBy({
        top: direction === "down" ? 150 : -150,
        behavior: "smooth",
      });
    }
  };

  const handleNumpad = (value: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Evita que o clique feche o teclado
    if (!activeInput) return;

    if (value === "C") {
      if (activeInput === "LARGURA") setLargura("");
      if (activeInput === "ALTURA") setAltura("");
      return;
    }

    if (value === "OK") {
      setActiveInput(null);
      return;
    }

    if (activeInput === "LARGURA") setLargura((prev) => prev + value);
    if (activeInput === "ALTURA") setAltura((prev) => prev + value);
  };

  const renderDropdown = () => {
    if (!activeDropdown) return null;

    let options: {
      id: string;
      label: string;
      color?: string;
      action: () => void;
    }[] = [];

    if (activeDropdown === "MATERIAL") {
      options = MOCK_MATERIAIS.map((m) => ({
        id: m.id,
        label: m.nome,
        color: m.cor,
        action: () => {
          setMaterial(m);
          setActiveDropdown(null);
        },
      }));
    } else if (activeDropdown === "ESPESSURA") {
      options = MOCK_ESPESSURAS.map((e) => ({
        id: e.id,
        label: `${e.valor_mm} mm`,
        action: () => {
          setEspessura(e);
          setActiveDropdown(null);
        },
      }));
    } else if (activeDropdown === "CLASSIFICACAO") {
      options = MOCK_CLASSIFICACAO.map((c) => ({
        id: c.id,
        label: c.nome,
        color: c.cor,
        action: () => {
          setClassificacao(c);
          setActiveDropdown(null);
        },
      }));
    }

    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0,0,0,0.8)",
          zIndex: 1000,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
        onClick={() => setActiveDropdown(null)}
      >
        <div
          style={{
            display: "flex",
            width: "80%",
            height: "70%",
            background: theme.panelBg,
            borderRadius: "15px",
            border: `2px solid ${theme.border}`,
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            style={{
              width: "120px",
              display: "flex",
              flexDirection: "column",
              background: theme.inputBg,
              borderRight: `2px solid ${theme.border}`,
            }}
          >
            <button
              onClick={() => scrollList("up")}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: theme.text,
                fontSize: "40px",
                cursor: "pointer",
                borderBottom: `2px solid ${theme.border}`,
              }}
            >
              ▲
            </button>
            <button
              onClick={() => scrollList("down")}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: theme.text,
                fontSize: "40px",
                cursor: "pointer",
              }}
            >
              ▼
            </button>
          </div>

          <div
            ref={listRef}
            style={{
              flex: 1,
              padding: "20px",
              overflowY: "hidden",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <h2 style={{ margin: "0 0 15px 0", color: theme.label }}>
              Selecione uma opção:
            </h2>
            {options.map((opt, index) => (
              <button
                key={index}
                onClick={opt.action}
                style={{
                  padding: "25px",
                  fontSize: "24px",
                  fontWeight: "bold",
                  textAlign: "left",
                  background: theme.inputBg,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: "10px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "15px",
                }}
              >
                {opt.color && (
                  <div
                    style={{
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      background: opt.color,
                    }}
                  ></div>
                )}
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Renderiza o Teclado Flutuante (Compacto e não quebra o layout)
  const renderCompactNumpad = () => (
    <div
      style={{
        position: "absolute",
        left: "15px", // Fica fixo no lado esquerdo dentro do input
        top: "50%",
        transform: "translateY(-50%)",
        display: "grid",
        gridTemplateColumns: "repeat(3, 55px)",
        gap: "5px",
        padding: "10px",
        background: theme.panelBg,
        border: `2px solid ${theme.border}`,
        borderRadius: "12px",
        boxShadow: "0 10px 25px rgba(0,0,0,0.8)",
        zIndex: 10,
        animation: "fadeIn 0.2s ease",
      }}
    >
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-50%) scale(0.9); } to { opacity: 1; transform: translateY(-50%) scale(1); } }`}</style>

      {["7", "8", "9", "4", "5", "6", "1", "2", "3"].map((num) => (
        <button
          key={num}
          onClick={(e) => handleNumpad(num, e)}
          style={{
            height: "50px",
            background: theme.inputBg,
            border: `1px solid ${theme.border}`,
            borderRadius: "8px",
            color: theme.text,
            fontSize: "22px",
            fontWeight: "bold",
            cursor: "pointer",
            display: "flex",
            justifyContent: "center",
            alignItems: "center", // 👈 ALINHAMENTO AQUI
          }}
        >
          {num}
        </button>
      ))}

      <button
        onClick={(e) => handleNumpad("C", e)}
        style={{
          height: "50px",
          background: "#dc3545",
          border: "none",
          borderRadius: "8px",
          color: "#fff",
          fontSize: "20px",
          fontWeight: "bold",
          cursor: "pointer",
          display: "flex",
          justifyContent: "center",
          alignItems: "center", // 👈 ALINHAMENTO AQUI
        }}
      >
        C
      </button>

      <button
        onClick={(e) => handleNumpad("0", e)}
        style={{
          height: "50px",
          background: theme.inputBg,
          border: `1px solid ${theme.border}`,
          borderRadius: "8px",
          color: theme.text,
          fontSize: "22px",
          fontWeight: "bold",
          cursor: "pointer",
          display: "flex",
          justifyContent: "center",
          alignItems: "center", // 👈 ALINHAMENTO AQUI
        }}
      >
        0
      </button>

      <button
        onClick={(e) => handleNumpad("OK", e)}
        style={{
          height: "50px",
          background: "#28a745",
          border: "none",
          borderRadius: "8px",
          color: "#fff",
          fontSize: "18px",
          fontWeight: "bold",
          cursor: "pointer",
          display: 'flex', justifyContent: 'center', alignItems: 'center' // 👈 ALINHAMENTO AQUI
        }}
      >
        OK
      </button>
    </div>
  );

  return (
    <div
      style={{
        position: "fixed", // <-- GARANTE QUE CUBRA A HOME PAGE
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999, // <-- OPACIDADE E SOBREPOSIÇÃO
        display: "flex",
        flexDirection: "column",
        background: theme.canvasBg || "#0a0a0a", // <-- FUNDO SÓLIDO GARANTIDO
        color: theme.text,
        fontFamily: "system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      {renderDropdown()}

      {/* CABEÇALHO SUPERIOR */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: theme.headerBg,
          padding: "15px 30px",
          borderBottom: `2px solid ${theme.border}`,
        }}
      >
        {/* Lado Esquerdo: Título */}
        <h1
          style={{
            margin: 0,
            fontSize: "28px",
            color: "#28a745",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            whiteSpace: "nowrap",
          }}
        >
          ♻️ Cadastro de Retalho
        </h1>

        {/* 👇 INSERÇÃO CIRÚRGICA: OBLONGO VERDE (Padrão EngineeringScreen) 👇 */}
        <div
          style={{
            flex: 1,
            margin: "0 40px",
            maxWidth: "500px",
            fontSize: "12px",
          }}
        >
          {/* Arte visual simulando o SubscriptionPanel */}
          <div
            style={{
              background:
                theme.canvasBg === "#0a0a0a"
                  ? "rgba(255, 255, 255, 0.05)"
                  : "rgba(0, 0, 0, 0.05)",
              border: "1px solid #28a745", // Cor verde de status ativo
              borderRadius: "20px", // O formato oblongo/pílula
              padding: "5px 15px",
              display: "flex",
              alignItems: "center",
              gap: "15px",
              color: theme.text,
              fontSize: "12px",
              whiteSpace: "nowrap",
              transition: "all 0.3s ease",
            }}
          >
            <span style={{ fontWeight: "bold", color: theme.text }}>
              Nome do Operador
            </span>

            <div
              style={{
                width: "1px",
                height: "14px",
                background:
                  theme.canvasBg === "#0a0a0a"
                    ? "rgba(255,255,255,0.3)"
                    : "rgba(0,0,0,0.2)",
              }}
            ></div>

            <span style={{ color: "#28a745", fontWeight: "bold" }}>
              Ativo - PLANO PRO
            </span>
          </div>
        </div>
        {/* 👆 FIM DA INSERÇÃO 👆 */}

        {/* Lado Direito: Botões de Ação */}
        <div style={{ display: "flex", gap: "15px" }}>
          <button
            onClick={() =>
              onOpenStock ? onOpenStock() : alert("Lista em breve")
            }
            style={{
              background: "transparent",
              color: theme.text,
              border: `2px solid ${theme.border}`,
              padding: "10px 20px",
              borderRadius: "8px",
              fontSize: "18px",
              cursor: "pointer",
              fontWeight: "bold",
              whiteSpace: "nowrap",
            }}
          >
            📊 Lista de Retalhos
          </button>
          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                color: "#dc3545",
                border: "2px solid #dc3545",
                padding: "10px 20px",
                borderRadius: "8px",
                fontSize: "18px",
                cursor: "pointer",
                fontWeight: "bold",
              }}
            >
              Sair ✕
            </button>
          )}
        </div>
      </div>

      {/* ÁREA DE TRABALHO */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "20px",
          gap: "20px",
        }}
      >
        {/* LINHA 1: OS SELETORES */}
        <div style={{ display: "flex", gap: "20px", height: "120px" }}>
          <button
            onClick={() => setActiveDropdown("MATERIAL")}
            style={{
              flex: 1,
              background: theme.panelBg,
              border: `2px solid ${material ? material.cor : theme.border}`,
              borderRadius: "12px",
              color: theme.text,
              fontSize: "22px",
              fontWeight: "bold",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                color: theme.label,
                marginBottom: "5px",
              }}
            >
              MATERIAL
            </span>
            {material ? material.nome : "CLIQUE PARA SELECIONAR"}
          </button>

          <button
            onClick={() => setActiveDropdown("ESPESSURA")}
            style={{
              flex: 1,
              background: theme.panelBg,
              border: `2px solid ${espessura ? "#3498db" : theme.border}`,
              borderRadius: "12px",
              color: theme.text,
              fontSize: "22px",
              fontWeight: "bold",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                color: theme.label,
                marginBottom: "5px",
              }}
            >
              ESPESSURA (mm)
            </span>
            {espessura ? `${espessura.valor_mm} mm` : "CLIQUE PARA SELECIONAR"}
          </button>

          <button
            onClick={() => setActiveDropdown("CLASSIFICACAO")}
            style={{
              flex: 1,
              background: theme.panelBg,
              border: `2px solid ${classificacao ? classificacao.cor : theme.border}`,
              borderRadius: "12px",
              color: theme.text,
              fontSize: "22px",
              fontWeight: "bold",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <span
              style={{
                fontSize: "14px",
                color: theme.label,
                marginBottom: "5px",
              }}
            >
              CLASSIFICAÇÃO
            </span>
            {classificacao ? classificacao.nome : "CLIQUE PARA SELECIONAR"}
          </button>
        </div>

        {/* LINHA 2: DIMENSÕES (COM TECLADO FLUTUANTE) */}
        <div style={{ display: "flex", gap: "20px", flex: 1 }}>
          <div
            onClick={() => setActiveInput("LARGURA")}
            style={{
              flex: 1,
              // 👇 Fundo padrão de input (theme.inputBg) vs Fundo ativo (#2c3e50)
              background: activeInput === "LARGURA" ? "#2c3e50" : "#2a2a2a",
              border:
                activeInput === "LARGURA"
                  ? "3px solid #3498db"
                  : `2px solid ${theme.border}`,
              borderRadius: "12px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              cursor: "pointer",
              position: "relative",
              // 👇 Efeito sombreado interno que faz parecer um input real "cavado" na tela
              boxShadow:
                activeInput === "LARGURA"
                  ? "none"
                  : "inset 0 4px 10px rgba(0,0,0,0.5)",
            }}
          >
            {activeInput === "LARGURA" && renderCompactNumpad()}
            <span style={{ fontSize: "18px", color: theme.label }}>
              LARGURA (X) em mm
            </span>
            <span
              style={{
                fontSize: "60px",
                fontWeight: "bold",
                color: largura ? theme.text : theme.label,
              }}
            >
              {largura || "0"}
            </span>
          </div>

          <div
            onClick={() => setActiveInput("ALTURA")}
            style={{
              flex: 1,
              // 👇 Fundo padrão de input (theme.inputBg) vs Fundo ativo (#2c3e50)
              background: activeInput === "ALTURA" ? "#2c3e50" : "#2a2a2a",
              border:
                activeInput === "ALTURA"
                  ? "3px solid #3498db"
                  : `2px solid ${theme.border}`,
              borderRadius: "12px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              cursor: "pointer",
              position: "relative",
              // 👇 Efeito sombreado interno que faz parecer um input real "cavado" na tela
              boxShadow:
                activeInput === "ALTURA"
                  ? "none"
                  : "inset 0 4px 10px rgba(0,0,0,0.5)",
            }}
          >
            {activeInput === "ALTURA" && renderCompactNumpad()}
            <span style={{ fontSize: "18px", color: theme.label }}>
              ALTURA (Y) em mm
            </span>
            <span
              style={{
                fontSize: "60px",
                fontWeight: "bold",
                color: altura ? theme.text : theme.label,
              }}
            >
              {altura || "0"}
            </span>
          </div>
        </div>

        {/* LINHA 3: AÇÕES FINAIS */}
        <div style={{ display: "flex", gap: "20px", height: "100px" }}>
          <button
            onClick={() => alert("Função de Impressão (Em breve)")}
            style={{
              flex: 1,
              background: theme.inputBg,
              border: `2px solid ${theme.border}`,
              borderRadius: "12px",
              color: theme.text,
              fontSize: "24px",
              fontWeight: "bold",
              cursor: "pointer",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "15px",
            }}
          >
            🖨️ IMPRIMIR ETIQUETA
          </button>

          <button
            onClick={() => alert("Pronto para plugar o banco de dados!")}
            style={{
              flex: 2,
              background: "#28a745",
              border: "none",
              borderRadius: "12px",
              color: "#fff",
              fontSize: "28px",
              fontWeight: "bold",
              cursor: "pointer",
              boxShadow: "0 6px 0 #1e7e34",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "15px",
            }}
          >
            💾 GERAR RETALHO
          </button>
        </div>
      </div>
    </div>
  );
};
