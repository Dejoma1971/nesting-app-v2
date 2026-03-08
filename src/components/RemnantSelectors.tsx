import React, { useState, useRef } from "react";

// Exportamos as interfaces para que o componente pai possa usá-las
export interface Material { id: string; nome: string; cor: string }
export interface Espessura { id: string; valor_mm: number }
export interface Classificacao { id: string; nome: string; cor: string }

const MOCK_MATERIAIS: Material[] = [
  { id: '1', nome: 'Aço Carbono', cor: '#34495e' },
  { id: '2', nome: 'Aço Inox', cor: '#7f8c8d' },
  { id: '3', nome: 'Alumínio', cor: '#2980b9' },
  { id: '4', nome: 'Galvanizado', cor: '#8e44ad' },
  { id: '5', nome: 'Latão', cor: '#f39c12' },
  { id: '6', nome: 'Cobre', cor: '#d35400' },
  { id: '7', nome: 'Titânio', cor: '#95a5a6' },
  { id: '8', nome: 'Bronze', cor: '#e67e22' },
];

const MOCK_ESPESSURAS: Espessura[] = [
  { id: '1', valor_mm: 0.8 }, { id: '2', valor_mm: 1.2 },
  { id: '3', valor_mm: 1.5 }, { id: '4', valor_mm: 2.0 },
  { id: '5', valor_mm: 3.0 }, { id: '6', valor_mm: 4.75 },
  { id: '7', valor_mm: 6.35 }, { id: '8', valor_mm: 8.0 },
  { id: '9', valor_mm: 10.0 }, { id: '10', valor_mm: 12.5 }
];

// O mock atualizado apenas com A e B
const MOCK_CLASSIFICACAO: Classificacao[] = [
  { id: 'A', nome: '⭐ TIPO A (Perfeito)', cor: '#28a745' },
  { id: 'B', nome: '⚠️ TIPO B (Avarias)', cor: '#f39c12' }
];

interface ThemeProps {
  canvasBg: string; panelBg: string; headerBg: string;
  text: string; label: string; border: string;
  inputBg: string; hoverRow: string;
}

interface RemnantSelectorsProps {
  theme: ThemeProps;
  material: Material | null;
  espessura: Espessura | null;
  classificacao: Classificacao | null;
  onSelectMaterial: (m: Material | null) => void;
  onSelectEspessura: (e: Espessura | null) => void;
  onSelectClassificacao: (c: Classificacao | null) => void;
}

export const RemnantSelectors: React.FC<RemnantSelectorsProps> = ({
  theme, material, espessura, classificacao,
  onSelectMaterial, onSelectEspessura, onSelectClassificacao
}) => {
  const [activeDropdown, setActiveDropdown] = useState<'MATERIAL' | 'ESPESSURA' | 'CLASSIFICACAO' | null>(null);
  const [scrollPos, setScrollPos] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const scrollList = (direction: 'up' | 'down') => {
    if (listRef.current) {
      listRef.current.scrollBy({
        top: direction === 'down' ? 150 : -150,
        behavior: 'smooth'
      });
    }
  };

  const renderDropdown = () => {
    if (!activeDropdown) return null;

    let options: { id: string; label: string; color?: string; action: () => void }[] = [];

    if (activeDropdown === 'MATERIAL') {
      options = MOCK_MATERIAIS.map(m => ({
        id: m.id, label: m.nome, color: m.cor,
        action: () => { onSelectMaterial(m); setActiveDropdown(null); }
      }));
    } else if (activeDropdown === 'ESPESSURA') {
      options = MOCK_ESPESSURAS.map(e => ({
        id: e.id, label: `${e.valor_mm} mm`,
        action: () => { onSelectEspessura(e); setActiveDropdown(null); }
      }));
    } else if (activeDropdown === 'CLASSIFICACAO') {
      options = MOCK_CLASSIFICACAO.map(c => ({
        id: c.id, label: c.nome, color: c.cor,
        action: () => { onSelectClassificacao(c); setActiveDropdown(null); }
      }));
    }

    return (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000,
        display: 'flex', justifyContent: 'center', alignItems: 'center'
      }} onClick={() => setActiveDropdown(null)}>
        
        <div style={{
          display: 'flex', width: '80%', height: '70%', background: theme.panelBg, 
          borderRadius: '15px', border: `2px solid ${theme.border}`, overflow: 'hidden'
        }} onClick={e => e.stopPropagation()}>
          
          {activeDropdown !== 'CLASSIFICACAO' && (
            <div style={{
              width: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center',
              background: theme.inputBg, borderRight: `2px solid ${theme.border}`, padding: '15px 0'
            }}>
              <button onClick={() => scrollList('up')} style={{
                background: theme.panelBg, border: `2px solid ${theme.border}`, borderRadius: '12px', 
                color: theme.text, fontSize: '24px', cursor: 'pointer', width: '60px', height: '60px',
                display: 'flex', justifyContent: 'center', alignItems: 'center'
              }}>▲</button>
              
              <div style={{
                flex: 1, width: '6px', background: 'rgba(0,0,0,0.2)', borderRadius: '3px',
                margin: '15px 0', position: 'relative', border: `1px solid ${theme.border}`
              }}>
                <div style={{
                  position: 'absolute', top: `${scrollPos}%`, left: '50%', transform: `translate(-50%, -${scrollPos}%)`,
                  width: '12px', height: '40px', background: '#3498db', borderRadius: '6px',
                  transition: 'top 0.1s ease-out, transform 0.1s ease-out'
                }}></div>
              </div>

              <button onClick={() => scrollList('down')} style={{
                background: theme.panelBg, border: `2px solid ${theme.border}`, borderRadius: '12px', 
                color: theme.text, fontSize: '24px', cursor: 'pointer', width: '60px', height: '60px',
                display: 'flex', justifyContent: 'center', alignItems: 'center'
              }}>▼</button>
            </div>
          )}

          <div 
            ref={listRef} 
            className="no-scrollbar"
            onScroll={(e) => {
              const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
              const maxScroll = scrollHeight - clientHeight;
              setScrollPos(maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0);
            }}
            style={{
              flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', 
              flexDirection: 'column', gap: '15px', scrollbarWidth: 'none', msOverflowStyle: 'none',
              justifyContent: activeDropdown === 'CLASSIFICACAO' ? 'center' : 'flex-start',
              alignItems: activeDropdown === 'CLASSIFICACAO' ? 'center' : 'stretch'
            }}
          >
            <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
            <h2 style={{ 
              margin: '0 0 15px 0', color: theme.label, textAlign: activeDropdown === 'CLASSIFICACAO' ? 'center' : 'left', width: '100%'
            }}>
              Selecione uma opção:
            </h2>

            {options.map((opt, index) => (
              <button key={index} onClick={opt.action} style={{
                padding: '25px', fontSize: '24px', fontWeight: 'bold', 
                background: theme.inputBg, color: theme.text, border: `1px solid ${theme.border}`, 
                borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '15px',
                width: activeDropdown === 'CLASSIFICACAO' ? '80%' : '100%',
                justifyContent: activeDropdown === 'CLASSIFICACAO' ? 'center' : 'flex-start'
              }}>
                {opt.color && <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: opt.color, flexShrink: 0 }}></div>}
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderDropdown()}
      <div style={{ display: 'flex', gap: '20px', height: '120px' }}>
        <button onClick={() => setActiveDropdown('MATERIAL')} style={{
          flex: 1, background: theme.panelBg, border: `2px solid ${material ? '#3498db' : theme.border}`, 
          borderRadius: '12px', color: theme.text, fontSize: '22px', fontWeight: 'bold', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
        }}>
          <span style={{ fontSize: '14px', color: theme.label, marginBottom: '5px' }}>MATERIAL</span>
          {material ? material.nome : "CLIQUE PARA SELECIONAR"}
        </button>

        <button onClick={() => setActiveDropdown('ESPESSURA')} style={{
          flex: 1, background: theme.panelBg, border: `2px solid ${espessura ? '#3498db' : theme.border}`, 
          borderRadius: '12px', color: theme.text, fontSize: '22px', fontWeight: 'bold', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
        }}>
          <span style={{ fontSize: '14px', color: theme.label, marginBottom: '5px' }}>ESPESSURA (mm)</span>
          {espessura ? `${espessura.valor_mm} mm` : "CLIQUE PARA SELECIONAR"}
        </button>

        <button onClick={() => setActiveDropdown('CLASSIFICACAO')} style={{
          flex: 1, background: theme.panelBg, border: `2px solid ${classificacao ? classificacao.cor : theme.border}`, 
          borderRadius: '12px', color: theme.text, fontSize: '22px', fontWeight: 'bold', cursor: 'pointer',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'
        }}>
          <span style={{ fontSize: '14px', color: theme.label, marginBottom: '5px' }}>CLASSIFICAÇÃO</span>
          {classificacao ? classificacao.nome : "CLIQUE PARA SELECIONAR"}
        </button>
      </div>
    </>
  );
};