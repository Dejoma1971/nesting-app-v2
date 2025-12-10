import React, { useState, useRef, useEffect } from 'react';
import type { LabelConfig } from './LabelTypes';

// CORREÇÃO: Definindo a interface do Theme
interface ThemeProps {
  border: string;
  headerBg: string;
  panelBg: string; // Adicionado panelBg que é usado neste componente
  text: string;
}

interface FloatingLabelEditorProps {
  partName: string;
  whiteConfig: LabelConfig;
  pinkConfig: LabelConfig;
  onUpdate: (type: 'white' | 'pink', changes: Partial<LabelConfig>) => void;
  onClose: () => void;
  theme: ThemeProps; // <--- CORREÇÃO: Tipo específico
}

export const FloatingLabelEditor: React.FC<FloatingLabelEditorProps> = ({
  partName, whiteConfig, pinkConfig, onUpdate, onClose, theme
}) => {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStart.current = { x: e.clientX - position.x, y: e.clientY - position.y };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragStart.current.x,
          y: e.clientY - dragStart.current.y
        });
      }
    };
    const handleMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const renderControls = (type: 'white' | 'pink', config: LabelConfig, title: string, color: string) => {
    if (!config.active) return <div style={{padding: 10, opacity: 0.5}}>🚫 {title} desativada na peça</div>;

    const move = (dx: number, dy: number) => {
        onUpdate(type, { offsetX: config.offsetX + dx, offsetY: config.offsetY + dy });
    };

    return (
      <div style={{ padding: '10px', borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ fontWeight: 'bold', marginBottom: 5, color: color, display: 'flex', alignItems: 'center' }}>
            <span style={{width: 8, height: 8, background: color, borderRadius: '50%', marginRight: 5, border: '1px solid #ccc'}}></span>
            {title}
        </div>
        
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, fontSize: 12 }}>
            <label>
                Tam: 
                <input 
                    type="number" 
                    value={config.fontSize} 
                    onChange={(e) => onUpdate(type, { fontSize: Number(e.target.value) })}
                    style={{ width: 40, marginLeft: 5, background: theme.panelBg, color: theme.text, border: `1px solid ${theme.border}` }}
                />
            </label>
            <button onClick={() => onUpdate(type, { rotation: (config.rotation + 90) % 360 })} style={{cursor:'pointer', background:'transparent', border: `1px solid ${theme.border}`, borderRadius:4, color: theme.text}}>
                🔄 {config.rotation}°
            </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '30px 30px 30px', gap: 2, justifyContent: 'center' }}>
            <div></div>
            <button onClick={() => move(0, 1)} style={{cursor:'pointer'}}>▲</button>
            <div></div>
            <button onClick={() => move(-1, 0)} style={{cursor:'pointer'}}>◄</button>
            <div style={{textAlign: 'center', fontSize: 10}}>┼</div>
            <button onClick={() => move(1, 0)} style={{cursor:'pointer'}}>►</button>
            <div></div>
            <button onClick={() => move(0, -1)} style={{cursor:'pointer'}}>▼</button>
            <div></div>
        </div>
      </div>
    );
  };

  return (
    <div style={{
      position: 'fixed',
      left: position.x,
      top: position.y,
      width: '200px',
      backgroundColor: theme.panelBg,
      border: `1px solid ${theme.border}`,
      boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
      zIndex: 1000,
      borderRadius: '8px',
      overflow: 'hidden',
      color: theme.text
    }}>
      <div 
        onMouseDown={handleMouseDown}
        style={{
          padding: '8px 10px',
          background: theme.headerBg,
          cursor: 'grab',
          fontWeight: 'bold',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: `1px solid ${theme.border}`
        }}
      >
        <span>✏️ {partName}</span>
        <button onClick={onClose} style={{background:'none', border:'none', cursor:'pointer', color: theme.text}}>✕</button>
      </div>

      {renderControls('white', whiteConfig, 'Visual', '#000')}
      {renderControls('pink', pinkConfig, 'Gravação', '#FF00FF')}
    </div>
  );
};