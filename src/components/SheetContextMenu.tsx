import React from 'react';

interface SheetContextMenuProps {
  x: number;
  y: number;
  targetLineId?: string | null; // <--- NOVO: Saber se clicou numa linha
  onClose: () => void;
  onDeleteSheet: () => void;
  onAddCropLine: (type: 'horizontal' | 'vertical') => void;
  onDeleteLine: (lineId: string) => void; // <--- NOVO: Função de excluir linha
}

export const SheetContextMenu: React.FC<SheetContextMenuProps> = ({
  x,
  y,
  targetLineId,
  onClose,
  onDeleteSheet,
  onAddCropLine,
  onDeleteLine
}) => {
  
  const menuStyle: React.CSSProperties = {
    position: 'fixed', top: y, left: x, backgroundColor: '#2d2d2d',
    border: '1px solid #444', boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
    borderRadius: '6px', padding: '5px 0', zIndex: 9999, minWidth: '200px',
    display: 'flex', flexDirection: 'column',
  };

  const itemStyle: React.CSSProperties = {
    padding: '10px 15px', cursor: 'pointer', color: '#e0e0e0',
    fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px',
    border: 'none', background: 'transparent', textAlign: 'left', width: '100%',
  };

  return (
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 9998 }} 
        onClick={(e) => { e.stopPropagation(); onClose(); }} 
        onContextMenu={(e) => { e.preventDefault(); onClose(); }} 
      />
      
      <div style={menuStyle}>
        {/* SE CLICOU NUMA LINHA, MOSTRA OPÇÃO DE EXCLUIR */}
        {targetLineId ? (
            <>
                <div style={{ padding: '5px 15px', fontSize: '11px', fontWeight: 'bold', color: '#ff6b6b', textTransform: 'uppercase' }}>
                    Linha de Retalho
                </div>
                <button 
                    style={itemStyle} 
                    onClick={() => { 
    if (targetLineId) onDeleteLine(targetLineId); 
    onClose(); 
}}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(220, 53, 69, 0.2)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    <span style={{ fontSize: '14px' }}>🗑️</span> Excluir Linha
                </button>
            </>
        ) : (
            /* SE CLICOU NO FUNDO, MOSTRA OPÇÕES DA CHAPA */
            <>
                <div style={{ padding: '5px 15px', fontSize: '11px', fontWeight: 'bold', color: '#888', textTransform: 'uppercase' }}>
                    Ações da Chapa
                </div>
                <button 
                    style={itemStyle} onClick={() => { onAddCropLine('vertical'); onClose(); }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#3d3d3d'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    <span style={{ color: '#007bff', fontWeight:'bold' }}>│</span> Add Linha Vertical (X)
                </button>
                <button 
                    style={itemStyle} onClick={() => { onAddCropLine('horizontal'); onClose(); }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#3d3d3d'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    <span style={{ color: '#007bff', fontWeight:'bold' }}>—</span> Add Linha Horizontal (Y)
                </button>
                <div style={{ height: '1px', backgroundColor: '#444', margin: '5px 0' }} />
                <button 
                    style={itemStyle} onClick={() => { onDeleteSheet(); onClose(); }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(220, 53, 69, 0.2)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    <span style={{ fontSize: '14px' }}>🗑️</span> <span style={{ color: '#ff6b6b' }}>Excluir Chapa Atual</span>
                </button>
            </>
        )}
      </div>
    </>
  );
};