import React, { useMemo, useState, useRef, useEffect } from 'react';
import type { ImportedPart } from './types';
import type { AppTheme } from '../styles/theme';

// --- TIPAGEM DO ESTADO DO FILTRO ---
export interface FilterState {
  pedido: string[];     // Array (Múltipla escolha)
  op: string[];         // Array (Múltipla escolha)
  material: string;     // String (Única escolha)
  espessura: string;    // String (Única escolha)
}

interface PartFilterProps {
  allParts: ImportedPart[];
  filters: FilterState;
  onFilterChange: (newFilters: FilterState) => void;
  theme: AppTheme;
}

// --- SUBCOMPONENTE: MULTI-SELECT (COM CHECKBOX) ---
const MultiSelect = ({ 
  label, 
  options, 
  selectedValues, 
  onChange, 
  theme 
}: { 
  label: string, 
  options: string[], 
  selectedValues: string[], 
  onChange: (vals: string[]) => void, 
  theme: AppTheme 
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (opt: string) => {
    if (selectedValues.includes(opt)) {
      onChange(selectedValues.filter(v => v !== opt));
    } else {
      onChange([...selectedValues, opt]);
    }
  };

  const labelText = selectedValues.length === 0 
    ? "Todos" 
    : `${selectedValues.length} selecionado(s)`;

  return (
    <div style={{ flex: 1, minWidth: '110px', position: 'relative' }} ref={containerRef}>
      <span style={{ fontSize: '10px', color: theme.label, fontWeight: 'bold', display: 'block', marginBottom: 2 }}>{label}</span>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          background: theme.inputBg, color: theme.text, border: `1px solid ${theme.border}`,
          borderRadius: '4px', padding: '4px 8px', fontSize: '12px', cursor: 'pointer',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '26px', boxSizing: 'border-box'
        }}
      >
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80px' }}>{labelText}</span>
        <span style={{ fontSize: '10px', opacity: 0.7 }}>▼</span>
      </div>

      {isOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: theme.panelBg, border: `1px solid ${theme.border}`, borderRadius: '4px',
          maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 8px rgba(0,0,0,0.2)', marginTop: '2px'
        }}>
          <div 
            onClick={() => onChange(selectedValues.length > 0 ? [] : options)}
            style={{ padding: '6px 8px', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', color: theme.text }}
          >
            {selectedValues.length > 0 ? "(Limpar Seleção)" : "(Selecionar Todos)"}
          </div>
          
          {options.map(opt => (
            <div 
              key={opt} 
              onClick={() => toggleOption(opt)}
              style={{ 
                padding: '5px 8px', cursor: 'pointer', fontSize: '12px', display: 'flex', gap: '8px', alignItems: 'center',
                background: selectedValues.includes(opt) ? theme.selectedRow : 'transparent', color: theme.text
              }}
            >
              <input type="checkbox" checked={selectedValues.includes(opt)} readOnly style={{ cursor: 'pointer' }} />
              {opt}
            </div>
          ))}
          {options.length === 0 && <div style={{ padding: '8px', fontSize: '11px', color: '#888' }}>Vazio</div>}
        </div>
      )}
    </div>
  );
};

// --- COMPONENTE PRINCIPAL ---
export const PartFilter: React.FC<PartFilterProps> = ({ allParts, filters, onFilterChange, theme }) => {
  
  const options = useMemo(() => {
    const getOptions = (key: keyof ImportedPart) => 
      Array.from(new Set(allParts.map(p => String(p[key] || '').trim()).filter(Boolean))).sort();

    return {
      pedidos: getOptions('pedido'),
      ops: getOptions('op'),
      materiais: getOptions('material'),
      espessuras: getOptions('espessura'),
    };
  }, [allParts]);

  const handleChangeSingle = (field: 'material' | 'espessura', value: string) => {
    onFilterChange({ ...filters, [field]: value });
  };

  const handleChangeMulti = (field: 'pedido' | 'op', values: string[]) => {
    onFilterChange({ ...filters, [field]: values });
  };

  // Contagem dinâmica
  const filteredCount = allParts.filter(p => {
    const matchPedido = filters.pedido.length === 0 || filters.pedido.includes(p.pedido);
    const matchOp = filters.op.length === 0 || filters.op.includes(p.op);
    const matchMaterial = !filters.material || p.material === filters.material;
    const matchEspessura = !filters.espessura || p.espessura === filters.espessura;

    return matchPedido && matchOp && matchMaterial && matchEspessura;
  }).length;

  const selectStyle: React.CSSProperties = {
    background: theme.inputBg, color: theme.text, border: `1px solid ${theme.border}`,
    borderRadius: '4px', padding: '4px 8px', fontSize: '12px', width: '100%', height: '26px'
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '10px', color: theme.label, marginBottom: '2px', display: 'block', fontWeight: 'bold'
  };

  return (
    <div style={{ padding: '10px', borderBottom: `1px solid ${theme.border}`, background: theme.batchBg, display: 'flex', flexDirection: 'column', gap: '10px' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', fontWeight: 'bold', color: theme.text }}>🔍 Filtros de Produção</span>
        <span style={{ fontSize: '11px', background: theme.selectedRow, padding: '2px 8px', borderRadius: '10px', color: theme.text, border: `1px solid ${theme.border}` }}>
           Disponíveis: <strong>{filteredCount}</strong> / {allParts.length}
        </span>
      </div>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        
        {/* 1. PEDIDO (Múltiplo) */}
        <MultiSelect 
            label="PEDIDOS" 
            options={options.pedidos} 
            selectedValues={filters.pedido} 
            onChange={(vals) => handleChangeMulti('pedido', vals)} 
            theme={theme}
        />

        {/* 2. OP (Múltiplo) */}
        <MultiSelect 
            label="ORDENS (OP)" 
            options={options.ops} 
            selectedValues={filters.op} 
            onChange={(vals) => handleChangeMulti('op', vals)} 
            theme={theme}
        />

        {/* 3. MATERIAL (Único) */}
        <div style={{ flex: 1, minWidth: '110px' }}>
          <label style={labelStyle}>MATERIAL</label>
          <select value={filters.material} onChange={e => handleChangeSingle('material', e.target.value)} style={selectStyle}>
            <option value="">Todos</option>
            {options.materiais.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* 4. ESPESSURA (Único) */}
        <div style={{ flex: 1, minWidth: '80px' }}>
          <label style={labelStyle}>ESPESSURA</label>
          <select value={filters.espessura} onChange={e => handleChangeSingle('espessura', e.target.value)} style={selectStyle}>
            <option value="">Todas</option>
            {options.espessuras.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </div>

      </div>
      
      {(filters.pedido.length > 0 || filters.op.length > 0 || filters.material || filters.espessura) && (
        <button 
          onClick={() => onFilterChange({ pedido: [], op: [], material: '', espessura: '' })}
          style={{
            background: 'transparent', border: 'none', color: '#007bff', 
            fontSize: '11px', cursor: 'pointer', textAlign: 'right', 
            textDecoration: 'underline', alignSelf: 'flex-end', marginTop: '-5px'
          }}
        >
          Limpar Filtros
        </button>
      )}
    </div>
  );
};