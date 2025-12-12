import React from 'react';
import type { LabelContextMenuProps } from './LabelTypes'; // <--- CORRIGIDO: adicionado 'type'

export const LabelContextMenu: React.FC<LabelContextMenuProps> = ({
  visible, x, y, type, currentConfig, onClose, onUpdate, onToggleFlag
}) => {
  if (!visible) return null;

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: y,
    left: x,
    zIndex: 1000,
    backgroundColor: '#fff',
    border: '1px solid #ccc',
    borderRadius: '4px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
    padding: '5px 0',
    minWidth: '150px',
    color: '#333',
    fontSize: '13px',
    fontFamily: 'sans-serif'
  };

  const itemStyle: React.CSSProperties = {
    padding: '8px 15px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    // hover: removed (invalid property) - o efeito hover é tratado via onMouseEnter abaixo
  };

  const handleRotation = () => {
    const newRot = (currentConfig.rotation + 90) % 360;
    onUpdate({ rotation: newRot });
  };

  const handleSize = (delta: number) => {
    const newSize = Math.max(2, currentConfig.fontSize + delta); // Mínimo 2mm
    onUpdate({ fontSize: newSize });
  };

  const title = type === 'white' ? 'Identificação (Visual)' : 'Gravação (CNC)';
  const colorIndicator = type === 'white' ? '#000' : '#FF00FF';

  return (
    <>
      <div 
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} 
        onClick={onClose} 
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      />
      
      <div style={menuStyle}>
        <div style={{ ...itemStyle, borderBottom: '1px solid #eee', fontWeight: 'bold', cursor: 'default' }}>
          <span style={{ width: 8, height: 8, background: colorIndicator, borderRadius: '50%', marginRight: 8 }}/>
          {title}
        </div>

        {/* 1. Rotacionar */}
        <div style={itemStyle} onClick={handleRotation} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}>
          <span>🔄 Rotacionar (+90°)</span>
        </div>

        {/* 2. Tamanho */}
        <div style={{ ...itemStyle, cursor: 'default' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}>
          <span>📏 Tamanho: {currentConfig.fontSize}mm</span>
          <div style={{ display: 'flex', gap: 5 }}>
             <button onClick={() => handleSize(-1)} style={{width: 20}}>-</button>
             <button onClick={() => handleSize(1)} style={{width: 20}}>+</button>
          </div>
        </div>

        {/* 3. Mover */}
        <div style={itemStyle} onClick={() => alert("Modo de arrastar ativado (Lógica pendente)")} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}>
          <span>✥ Mover Texto</span>
        </div>

        <div style={{ height: 1, background: '#eee', margin: '5px 0' }} />

        {/* 4. Desligar Flag */}
        <div style={{ ...itemStyle, color: '#dc3545' }} onClick={() => { onToggleFlag(); onClose(); }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#ffeef0'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}>
          <span>🚫 Remover Texto</span>
        </div>
      </div>
    </>
  );
};