import React from 'react';

interface SheetContextMenuProps {
  x: number;
  y: number;
  targetLineId?: string | null;
  onClose: () => void;
  onDeleteSheet: () => void;
  // ATUALIZADO: Agora aceita a posição onde a linha deve ser criada
  onAddCropLine: (type: 'horizontal' | 'vertical', position: number) => void;
  onDeleteLine: (lineId: string) => void;
  // --- INSERÇÃO: Propriedade para a função de corte ---
  onTrim?: () => void; 
  // ---------------------------------------------------
  onDefineRemnants: () => void;
  hasPlacedParts: boolean;
  // --- NOVAS PROPS DA TRAVA DE RETALHO ---
  canDefineRemnants: boolean;
  remnantTooltip: string;
}

export const SheetContextMenu: React.FC<SheetContextMenuProps> = ({
  x,
  y,
  targetLineId,
  onClose,
  onDeleteSheet,
  onAddCropLine,
  onDeleteLine,
  // --- INSERÇÃO: Recebendo a função ---
  onTrim,
  onDefineRemnants,
  hasPlacedParts,
  canDefineRemnants, 
  remnantTooltip
  // ------------------------------------
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
                {/* --- INSERÇÃO: BOTÃO TRIM --- */}
                <button 
                    style={itemStyle} 
                    onClick={() => { 
                        if (onTrim) onTrim(); 
                        onClose(); 
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#3d3d3d'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    title="Corta a linha na interseção mais próxima do clique"
                >
                    <span style={{ fontSize: '14px' }}>✂️</span> Aparar (Trim)
                </button>
                {/* --------------------------- */}
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
                
                {/* LINHA VERTICAL: Passamos a coordenada X do mouse */}
                <button 
                    style={itemStyle} 
                    onClick={() => { onAddCropLine('vertical', x); onClose(); }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#3d3d3d'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    <span style={{ color: '#007bff', fontWeight:'bold' }}>│</span> Add Linha Vertical (X)
                </button>
                
                {/* LINHA HORIZONTAL: Passamos a coordenada Y do mouse */}
                <button 
                    style={itemStyle} 
                    onClick={() => { onAddCropLine('horizontal', y); onClose(); }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#3d3d3d'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                    <span style={{ color: '#007bff', fontWeight:'bold' }}>—</span> Add Linha Horizontal (Y)
                </button>

               {/* --- INSERÇÃO: BOTÃO DEFINIR RETALHOS (BLINDADO) --- */}
                {hasPlacedParts && (
                  <button 
                      style={{
                          ...itemStyle,
                          opacity: canDefineRemnants ? 1 : 0.4,
                          cursor: canDefineRemnants ? 'pointer' : 'not-allowed'
                      }} 
                      onClick={() => { 
                          if (canDefineRemnants) {
                              onDefineRemnants(); 
                              onClose(); 
                          }
                      }}
                      onMouseEnter={(e) => {
                          if (canDefineRemnants) e.currentTarget.style.background = 'rgba(40, 167, 69, 0.2)';
                      }}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      title={remnantTooltip}
                  >
                      <span style={{ fontSize: '14px' }}>🟩</span> Definir Retalhos
                  </button>
                )}
                {/* ------------------------------------------------------ */}

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