import React, { useState } from "react";
import { RemnantHeader } from "./RemnantHeader";
import { RemnantSelectors } from "./RemnantSelectors";
import type { Material, Espessura, Classificacao } from "./RemnantSelectors";

// Definimos o tema para evitar erros do TypeScript (no-explicit-any)
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

interface RemnantEntryHMIProps {
  theme?: ThemeProps; 
  onClose?: () => void;
  onOpenStock?: () => void; 
}

export const RemnantEntryHMI: React.FC<RemnantEntryHMIProps> = ({ 
  theme = { 
    canvasBg: '#0a0a0a', panelBg: '#1a1a1a', headerBg: '#111111', 
    text: '#ffffff', label: '#aaaaaa', border: '#333333', inputBg: '#222222', hoverRow: '#2c3e50' 
  },
  onClose,
  onOpenStock
}) => {
  // Estados dos seletores (Agora vêm do módulo RemnantSelectors)
  const [material, setMaterial] = useState<Material | null>(null);
  const [espessura, setEspessura] = useState<Espessura | null>(null);
  const [classificacao, setClassificacao] = useState<Classificacao | null>(null);
  
  // Estados de dimensão e teclado
  const [largura, setLargura] = useState<string>("");
  const [altura, setAltura] = useState<string>("");
  const [activeInput, setActiveInput] = useState<'LARGURA' | 'ALTURA' | null>(null);

  // Estado da animação do botão de reset
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Função para limpar tudo
  const handleReset = () => {
    setIsRefreshing(true);
    setTimeout(() => setIsRefreshing(false), 700);

    setMaterial(null);
    setEspessura(null);
    setClassificacao(null);
    setLargura("");
    setAltura("");
    setActiveInput(null);
  };

  // Lógica do teclado numérico
  const handleNumpad = (value: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Evita que o clique feche outras coisas
    if (!activeInput) return;
    
    if (value === 'C') {
      if (activeInput === 'LARGURA') setLargura("");
      if (activeInput === 'ALTURA') setAltura("");
      return;
    }

    if (value === 'OK') {
      setActiveInput(null); 
      return;
    }

    if (activeInput === 'LARGURA') setLargura(prev => prev + value);
    if (activeInput === 'ALTURA') setAltura(prev => prev + value);
  };

  // Renderiza o Teclado Flutuante Compacto
  const renderCompactNumpad = () => (
    <div style={{
      position: 'absolute', left: '15px', top: '50%', transform: 'translateY(-50%)',
      display: 'grid', gridTemplateColumns: 'repeat(3, 55px)', gap: '5px', padding: '10px',
      background: theme.panelBg, border: `2px solid ${theme.border}`, borderRadius: '12px',
      boxShadow: '0 10px 25px rgba(0,0,0,0.8)', zIndex: 10, animation: 'fadeIn 0.2s ease'
    }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(-50%) scale(0.9); } to { opacity: 1; transform: translateY(-50%) scale(1); } }`}</style>
      
      {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map(num => (
        <button key={num} onClick={(e) => handleNumpad(num, e)} style={{
          height: '50px', background: theme.inputBg, border: `1px solid ${theme.border}`, 
          borderRadius: '8px', color: theme.text, fontSize: '22px', fontWeight: 'bold', cursor: 'pointer',
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>{num}</button>
      ))}
      
      <button onClick={(e) => handleNumpad('C', e)} style={{
        height: '50px', background: '#dc3545', border: 'none', borderRadius: '8px', 
        color: '#fff', fontSize: '20px', fontWeight: 'bold', cursor: 'pointer',
        display: 'flex', justifyContent: 'center', alignItems: 'center'
      }}>C</button>
      
      <button onClick={(e) => handleNumpad('0', e)} style={{
        height: '50px', background: theme.inputBg, border: `1px solid ${theme.border}`, 
        borderRadius: '8px', color: theme.text, fontSize: '22px', fontWeight: 'bold', cursor: 'pointer',
        display: 'flex', justifyContent: 'center', alignItems: 'center'
      }}>0</button>
      
      <button onClick={(e) => handleNumpad('OK', e)} style={{
        height: '50px', background: '#28a745', border: 'none', borderRadius: '8px', 
        color: '#fff', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer',
        display: 'flex', justifyContent: 'center', alignItems: 'center'
      }}>OK</button>
    </div>
  );

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, 
      display: 'flex', flexDirection: 'column', background: theme.canvasBg || '#0a0a0a', 
      color: theme.text, fontFamily: 'system-ui, sans-serif', overflow: 'hidden' 
    }}>

      {/* CABEÇALHO MODULARIZADO */}
      <RemnantHeader 
        theme={theme}
        title="♻️ Cadastro de Retalho"
        actionLabel="Estoque de Retalhos"
        onActionClick={() => onOpenStock ? onOpenStock() : alert('Lista em breve')}
        onClose={onClose}
        onReset={handleReset}
        isRefreshing={isRefreshing}
      />

      {/* ÁREA DE TRABALHO */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '20px', gap: '20px' }}>
        
        {/* LINHA 1: OS SELETORES MODULARIZADOS */}
        <RemnantSelectors 
          theme={theme}
          material={material}
          espessura={espessura}
          classificacao={classificacao}
          onSelectMaterial={setMaterial}
          onSelectEspessura={setEspessura}
          onSelectClassificacao={setClassificacao}
        />

        {/* LINHA 2: DIMENSÕES (COM TECLADO FLUTUANTE) */}
        <div style={{ display: 'flex', gap: '20px', flex: 1 }}>
          
          <div 
            onClick={() => setActiveInput('LARGURA')}
            style={{
              flex: 1, background: activeInput === 'LARGURA' ? '#2c3e50' : '#2a2a2a', 
              border: activeInput === 'LARGURA' ? '3px solid #3498db' : `2px solid ${largura ? '#3498db' : theme.border}`, 
              borderRadius: '12px', display: 'flex', flexDirection: 'column', 
              justifyContent: 'center', alignItems: 'center', cursor: 'pointer',
              position: 'relative', boxShadow: activeInput === 'LARGURA' ? 'none' : 'inset 0 3px 6px rgba(0,0,0,0.25)' 
          }}>
            {activeInput === 'LARGURA' && renderCompactNumpad()}
            <span style={{ fontSize: '18px', color: theme.label }}>LARGURA (X) em mm</span>
            <span style={{ fontSize: '60px', fontWeight: 'bold', color: largura ? theme.text : theme.label }}>
              {largura || "0"}
            </span>
          </div>

          <div 
            onClick={() => setActiveInput('ALTURA')}
            style={{
              flex: 1, background: activeInput === 'ALTURA' ? '#2c3e50' : '#2a2a2a', 
              border: activeInput === 'ALTURA' ? '3px solid #3498db' : `2px solid ${altura ? '#3498db' : theme.border}`, 
              borderRadius: '12px', display: 'flex', flexDirection: 'column', 
              justifyContent: 'center', alignItems: 'center', cursor: 'pointer',
              position: 'relative', boxShadow: activeInput === 'ALTURA' ? 'none' : 'inset 0 3px 6px rgba(0,0,0,0.25)' 
          }}>
            {activeInput === 'ALTURA' && renderCompactNumpad()}
            <span style={{ fontSize: '18px', color: theme.label }}>ALTURA (Y) em mm</span>
            <span style={{ fontSize: '60px', fontWeight: 'bold', color: altura ? theme.text : theme.label }}>
              {altura || "0"}
            </span>
          </div>

        </div>

        {/* LINHA 3: AÇÕES FINAIS */}
        <div style={{ display: 'flex', gap: '20px', height: '100px' }}>
          <button onClick={() => alert("Função de Impressão (Em breve)")} style={{
            flex: 1, background: '#6f42c1', border: `2px solid #6f42c1`, borderRadius: '12px', 
            color: theme.text, fontSize: '24px', fontWeight: 'bold', cursor: 'pointer',
            boxShadow: '0 6px 0 #4002b3', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px'
          }}>
            🖨️ IMPRIMIR ETIQUETA
          </button>

          <button onClick={() => alert("Pronto para plugar o banco de dados!")} style={{
            flex: 2, background: '#28a745', border: 'none', borderRadius: '12px', 
            color: '#fff', fontSize: '28px', fontWeight: 'bold', cursor: 'pointer',
            boxShadow: '0 6px 0 #1e7e34', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px'
          }}>
            💾 GERAR RETALHO
          </button>
        </div>

      </div>
    </div>
  );
};