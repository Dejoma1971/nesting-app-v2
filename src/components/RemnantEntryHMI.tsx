import React, { useState } from "react";

// Interfaces provisórias (depois virão do banco de dados)
interface Material { id: string; nome: string }
interface Espessura { id: string; valor_mm: number }
interface RetalhoRecente { id: string; material: string; espessura: number; largura: number; altura: number; qualidade: 'A' | 'B'; hora: string }

// Mock de dados para testarmos o visual
const MOCK_MATERIAIS: Material[] = [
  { id: '1', nome: 'MDF Branco' }, { id: '2', nome: 'MDF Madeirado' },
  { id: '3', nome: 'Compensado' }, { id: '4', nome: 'Aço Inox' }
];
const MOCK_ESPESSURAS: Espessura[] = [
  { id: '1', valor_mm: 6 }, { id: '2', valor_mm: 15 },
  { id: '3', valor_mm: 18 }, { id: '4', valor_mm: 25 }
];

interface RemnantEntryHMIProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  theme?: any; // Usando o seu theme global
  onClose?: () => void;
}

export const RemnantEntryHMI: React.FC<RemnantEntryHMIProps> = ({ 
  theme = { panelBg: '#1e1e1e', text: '#fff', label: '#aaa', border: '#444', inputBg: '#2d2d2d' },
  onClose 
}) => {
  // Estados do Formulário
  const [material, setMaterial] = useState<string>("");
  const [espessura, setEspessura] = useState<number | null>(null);
  const [largura, setLargura] = useState<string>("");
  const [altura, setAltura] = useState<string>("");
  const [qualidade, setQualidade] = useState<'A' | 'B' | null>(null);

  // Lista de Retalhos salvos na sessão (Feedback visual)
  const [recentes, setRecentes] = useState<RetalhoRecente[]>([]);

  // Função para simular o salvamento
  const handleSave = () => {
    if (!material || !espessura || !largura || !altura || !qualidade) {
      alert("Preencha todos os campos antes de salvar!");
      return;
    }

    const novoRetalho: RetalhoRecente = {
      id: Math.random().toString(36).substr(2, 6),
      material: MOCK_MATERIAIS.find(m => m.id === material)?.nome || "Desconhecido",
      espessura: espessura,
      largura: Number(largura),
      altura: Number(altura),
      qualidade: qualidade,
      hora: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Adiciona no topo da lista
    setRecentes([novoRetalho, ...recentes]);

    // Limpa apenas as dimensões e qualidade para agilizar a próxima digitação
    setLargura("");
    setAltura("");
    setQualidade(null);
  };

  return (
    <div style={{
      display: 'flex', width: '100%', height: '100vh', background: theme.panelBg, color: theme.text, fontFamily: 'system-ui, sans-serif'
    }}>
      {/* ========================================== */}
      {/* LADO ESQUERDO: FORMULÁRIO IHM (TOUCH)      */}
      {/* ========================================== */}
      <div style={{ flex: 6, padding: '30px', display: 'flex', flexDirection: 'column', gap: '25px', overflowY: 'auto' }}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '28px', color: '#17a2b8' }}>♻️ Entrada de Retalhos</h1>
          {onClose && (
            <button onClick={onClose} style={{ background: '#dc3545', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '18px', cursor: 'pointer' }}>
              ✕ Fechar
            </button>
          )}
        </div>

        {/* LINHA 1: MATERIAL */}
        <div>
          <label style={{ fontSize: '16px', fontWeight: 'bold', color: theme.label, marginBottom: '10px', display: 'block' }}>1. MATERIAL</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {MOCK_MATERIAIS.map(m => (
              <button
                key={m.id}
                onClick={() => setMaterial(m.id)}
                style={{
                  padding: '15px 25px', fontSize: '18px', fontWeight: 'bold', borderRadius: '12px', cursor: 'pointer', transition: '0.2s',
                  background: material === m.id ? '#007bff' : theme.inputBg,
                  color: material === m.id ? '#fff' : theme.text,
                  border: `2px solid ${material === m.id ? '#007bff' : theme.border}`,
                }}
              >
                {m.nome}
              </button>
            ))}
          </div>
        </div>

        {/* LINHA 2: ESPESSURA */}
        <div>
          <label style={{ fontSize: '16px', fontWeight: 'bold', color: theme.label, marginBottom: '10px', display: 'block' }}>2. ESPESSURA (mm)</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {MOCK_ESPESSURAS.map(e => (
              <button
                key={e.id}
                onClick={() => setEspessura(e.valor_mm)}
                style={{
                  padding: '15px 25px', fontSize: '20px', fontWeight: 'bold', borderRadius: '12px', cursor: 'pointer', transition: '0.2s',
                  background: espessura === e.valor_mm ? '#ffc107' : theme.inputBg,
                  color: espessura === e.valor_mm ? '#000' : theme.text,
                  border: `2px solid ${espessura === e.valor_mm ? '#ffc107' : theme.border}`,
                }}
              >
                {e.valor_mm}
              </button>
            ))}
          </div>
        </div>

        {/* LINHA 3: DIMENSÕES */}
        <div>
          <label style={{ fontSize: '16px', fontWeight: 'bold', color: theme.label, marginBottom: '10px', display: 'block' }}>3. DIMENSÕES REAIS (mm)</label>
          <div style={{ display: 'flex', gap: '20px' }}>
            <div style={{ flex: 1 }}>
              <input
                type="number" inputMode="numeric" pattern="[0-9]*" placeholder="Largura (X)"
                value={largura} onChange={(e) => setLargura(e.target.value)}
                style={{ width: '100%', padding: '20px', fontSize: '24px', textAlign: 'center', background: theme.inputBg, color: theme.text, border: `2px solid ${theme.border}`, borderRadius: '12px' }}
              />
            </div>
            <div style={{ fontSize: '30px', color: theme.label, display: 'flex', alignItems: 'center' }}>X</div>
            <div style={{ flex: 1 }}>
              <input
                type="number" inputMode="numeric" pattern="[0-9]*" placeholder="Altura (Y)"
                value={altura} onChange={(e) => setAltura(e.target.value)}
                style={{ width: '100%', padding: '20px', fontSize: '24px', textAlign: 'center', background: theme.inputBg, color: theme.text, border: `2px solid ${theme.border}`, borderRadius: '12px' }}
              />
            </div>
          </div>
        </div>

        {/* LINHA 4: QUALIDADE */}
        <div>
          <label style={{ fontSize: '16px', fontWeight: 'bold', color: theme.label, marginBottom: '10px', display: 'block' }}>4. CONDIÇÃO / ACABAMENTO</label>
          <div style={{ display: 'flex', gap: '20px' }}>
            <button
              onClick={() => setQualidade('A')}
              style={{
                flex: 1, padding: '25px', fontSize: '20px', fontWeight: 'bold', borderRadius: '12px', cursor: 'pointer',
                background: qualidade === 'A' ? 'rgba(40, 167, 69, 0.2)' : theme.inputBg,
                color: qualidade === 'A' ? '#28a745' : theme.text,
                border: `3px solid ${qualidade === 'A' ? '#28a745' : theme.border}`,
              }}
            >
              ⭐ Tipo A (Perfeito)
            </button>
            <button
              onClick={() => setQualidade('B')}
              style={{
                flex: 1, padding: '25px', fontSize: '20px', fontWeight: 'bold', borderRadius: '12px', cursor: 'pointer',
                background: qualidade === 'B' ? 'rgba(220, 53, 69, 0.2)' : theme.inputBg,
                color: qualidade === 'B' ? '#dc3545' : theme.text,
                border: `3px solid ${qualidade === 'B' ? '#dc3545' : theme.border}`,
              }}
            >
              ⚠️ Tipo B (Com Avarias)
            </button>
          </div>
        </div>

        {/* LINHA 5: BOTÃO SALVAR */}
        <div style={{ marginTop: '10px' }}>
          <button
            onClick={handleSave}
            style={{
              width: '100%', padding: '25px', fontSize: '24px', fontWeight: 'bold', textTransform: 'uppercase',
              background: '#28a745', color: '#fff', border: 'none', borderRadius: '12px', cursor: 'pointer',
              boxShadow: '0 6px 0 #1e7e34'
            }}
            onMouseDown={(e) => { e.currentTarget.style.transform = 'translateY(4px)'; e.currentTarget.style.boxShadow = '0 2px 0 #1e7e34'; }}
            onMouseUp={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 0 #1e7e34'; }}
          >
            🖨️ Cadastrar e Imprimir Etiqueta
          </button>
        </div>
      </div>

      {/* ========================================== */}
      {/* LADO DIREITO: FEEDBACK / HISTÓRICO RÁPIDO  */}
      {/* ========================================== */}
      <div style={{ flex: 4, background: '#111', borderLeft: `2px solid ${theme.border}`, padding: '30px', display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '22px', color: theme.label, display: 'flex', alignItems: 'center', gap: '10px' }}>
          📋 Inserções Recentes
        </h2>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {recentes.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#555', marginTop: '50px', fontSize: '18px' }}>
              Nenhum retalho inserido nesta sessão.
            </div>
          ) : (
            recentes.map((r, i) => (
              <div key={i} style={{
                background: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '15px',
                borderLeft: `6px solid ${r.qualidade === 'A' ? '#28a745' : '#dc3545'}`
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold', fontSize: '18px' }}>{r.material} ({r.espessura}mm)</span>
                  <span style={{ color: theme.label, fontSize: '14px' }}>{r.hora}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '22px', color: '#17a2b8', fontWeight: 'bold' }}>
                    {r.largura} <span style={{ fontSize: '16px', color: theme.label }}>x</span> {r.altura}
                  </span>
                  <span style={{
                    background: r.qualidade === 'A' ? '#28a745' : '#dc3545', color: 'white', padding: '4px 10px', borderRadius: '6px', fontWeight: 'bold', fontSize: '14px'
                  }}>
                    Tipo {r.qualidade}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
};