import React, { useState, useMemo, useRef } from "react";
import { RemnantHeader } from "./RemnantHeader";
import { RemnantSelectors } from "./RemnantSelectors";
import type { Material, Espessura, Classificacao } from "./RemnantSelectors";

interface ThemeProps {
  canvasBg: string;
  panelBg: string;
  headerBg: string;
  text: string;
  label: string;
  border: string;
  inputBg: string;
  hoverRow: string;
}

interface RemnantStockHMIProps {
  theme?: ThemeProps;
  onClose?: () => void;
  onOpenCadastro: () => void; // Para voltar à tela anterior
}

// 📦 MOCK DO BANCO DE DADOS (Vamos substituir por uma API real depois)
const MOCK_DB_RETALHOS = [
  {
    id: 1,
    codigo: "RET-2026-001",
    material: "Aço Carbono",
    espessura: 2.0,
    classificacao: "⭐ TIPO A (Perfeito)",
  },
  {
    id: 2,
    codigo: "RET-2026-002",
    material: "Aço Inox",
    espessura: 1.5,
    classificacao: "⚠️ TIPO B (Avarias)",
  },
  {
    id: 3,
    codigo: "RET-2026-003",
    material: "Alumínio",
    espessura: 3.0,
    classificacao: "⭐ TIPO A (Perfeito)",
  },
  {
    id: 4,
    codigo: "RET-2026-004",
    material: "Aço Carbono",
    espessura: 2.0,
    classificacao: "⚠️ TIPO B (Avarias)",
  },
  {
    id: 5,
    codigo: "RET-2026-005",
    material: "Galvanizado",
    espessura: 0.8,
    classificacao: "⭐ TIPO A (Perfeito)",
  },
  {
    id: 6,
    codigo: "RET-2026-006",
    material: "Aço Inox",
    espessura: 1.5,
    classificacao: "⭐ TIPO A (Perfeito)",
  },
  {
    id: 7,
    codigo: "RET-2026-007",
    material: "Aço Carbono",
    espessura: 12.5,
    classificacao: "⭐ TIPO A (Perfeito)",
  },
];

export const RemnantStockHMI: React.FC<RemnantStockHMIProps> = ({
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
  onOpenCadastro,
}) => {
  // Estados para os filtros
  const [filterMaterial, setFilterMaterial] = useState<Material | null>(null);
  const [filterEspessura, setFilterEspessura] = useState<Espessura | null>(
    null,
  );
  const [filterClassificacao, setFilterClassificacao] =
    useState<Classificacao | null>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);

  const [scrollPos, setScrollPos] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollList = (direction: 'up' | 'down') => {
    if (listRef.current) {
      // Rola 250px por clique, ideal para uma lista de itens
      listRef.current.scrollBy({ top: direction === 'down' ? 250 : -250, behavior: 'smooth' });
    }
  };

  // Função de Reset (Limpa os filtros)
  const handleResetFilters = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 700);
    setFilterMaterial(null);
    setFilterEspessura(null);
    setFilterClassificacao(null);
  };

  // 🧠 Lógica de Filtragem (Reage em tempo real)
  const filteredStock = useMemo(() => {
    return MOCK_DB_RETALHOS.filter((item) => {
      if (filterMaterial && item.material !== filterMaterial.nome) return false;
      if (filterEspessura && item.espessura !== filterEspessura.valor_mm)
        return false;
      if (
        filterClassificacao &&
        item.classificacao !== filterClassificacao.nome
      )
        return false;
      return true;
    });
  }, [filterMaterial, filterEspessura, filterClassificacao]);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        background: theme.canvasBg,
        color: theme.text,
        fontFamily: "system-ui, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* 1. CABEÇALHO REUTILIZADO */}
      <RemnantHeader
        theme={theme}
        title="♻️ Estoque de Retalho"
        actionLabel="Cadastro de Retalho"
        onActionClick={onOpenCadastro}
        onClose={onClose}
        onReset={handleResetFilters}
        isRefreshing={isRefreshing}
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "20px",
          gap: "20px",
          overflow: "hidden",
        }}
      >
        {/* 2. SELETORES REUTILIZADOS (AGORA AGEM COMO FILTROS) */}
        <RemnantSelectors
          theme={theme}
          material={filterMaterial}
          espessura={filterEspessura}
          classificacao={filterClassificacao}
          onSelectMaterial={setFilterMaterial}
          onSelectEspessura={setFilterEspessura}
          onSelectClassificacao={setFilterClassificacao}
        />

       {/* 3. ÁREA DA LISTA COM SCROLL CUSTOMIZADO */}
        <div style={{ 
          flex: 1, background: theme.panelBg, border: `2px solid ${theme.border}`, 
          borderRadius: '12px', overflow: 'hidden', 
          display: 'flex', flexDirection: 'row' // 👈 Agora é 'row' para colocar a barra ao lado
        }}>
          
          {/* --- LADO ESQUERDO: A TABELA DE DADOS --- */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            
            {/* Cabeçalho da Tabela */}
            <div style={{ 
              display: 'grid', gridTemplateColumns: '80px 150px 1fr 150px 1fr', gap: '15px', 
              padding: '15px 25px', background: theme.inputBg, borderBottom: `2px solid ${theme.border}`,
              fontWeight: 'bold', color: theme.label, fontSize: '14px'
            }}>
              <div>ID</div>
              <div>CÓDIGO</div>
              <div>MATERIAL</div>
              <div>ESPESSURA</div>
              <div>CLASSIFICAÇÃO</div>
            </div>

            {/* Corpo da Tabela (Ligado ao rastreador de scroll) */}
            <div 
              ref={listRef}
              className="no-scrollbar"
              onScroll={(e) => {
                const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                const maxScroll = scrollHeight - clientHeight;
                setScrollPos(maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0);
              }}
              style={{ flex: 1, overflowY: 'auto', padding: '10px', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
              
              {filteredStock.length > 0 ? (
                filteredStock.map((item) => (
                  <div key={item.id} style={{ 
                    display: 'grid', gridTemplateColumns: '80px 150px 1fr 150px 1fr', gap: '15px', 
                    padding: '15px', borderBottom: `1px solid ${theme.border}`,
                    alignItems: 'center', fontSize: '18px', cursor: 'pointer', transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = theme.hoverRow}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ color: theme.label }}>#{item.id}</div>
                    <div style={{ fontWeight: 'bold', color: '#3498db' }}>{item.codigo}</div>
                    <div>{item.material}</div>
                    <div>{item.espessura.toFixed(1)} mm</div>
                    <div style={{ color: item.classificacao.includes('TIPO A') ? '#28a745' : '#f39c12', fontWeight: 'bold' }}>
                      {item.classificacao}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', color: theme.label, fontSize: '20px', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '40px' }}>📭</span>
                  Nenhum retalho encontrado com estes filtros.
                </div>
              )}
            </div>
          </div>

          {/* --- LADO DIREITO: BARRA DE SCROLL CUSTOMIZADA (ESTILO MIX) --- */}
          <div style={{
            width: '80px', display: 'flex', flexDirection: 'column', alignItems: 'center',
            background: theme.inputBg, borderLeft: `2px solid ${theme.border}`, padding: '10px 0'
          }}>
            <button onClick={() => scrollList('up')} style={{
              background: theme.panelBg, border: `2px solid ${theme.border}`, borderRadius: '10px', 
              color: theme.text, fontSize: '20px', cursor: 'pointer', width: '50px', height: '50px',
              display: 'flex', justifyContent: 'center', alignItems: 'center'
            }}>▲</button>
            
            <div style={{
              flex: 1, width: '6px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px',
              margin: '10px 0', position: 'relative', border: `1px solid ${theme.border}`
            }}>
              <div style={{
                position: 'absolute', top: `${scrollPos}%`, left: '50%', transform: `translate(-50%, -${scrollPos}%)`,
                width: '10px', height: '35px', background: '#3498db', borderRadius: '5px',
                transition: 'top 0.1s ease-out, transform 0.1s ease-out'
              }}></div>
            </div>

            <button onClick={() => scrollList('down')} style={{
              background: theme.panelBg, border: `2px solid ${theme.border}`, borderRadius: '10px', 
              color: theme.text, fontSize: '20px', cursor: 'pointer', width: '50px', height: '50px',
              display: 'flex', justifyContent: 'center', alignItems: 'center'
            }}>▼</button>
          </div>

        </div>
        
      </div>
    </div>
  );
};