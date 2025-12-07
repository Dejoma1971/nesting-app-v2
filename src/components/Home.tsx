import React from 'react';

interface HomeProps {
  onNavigate: (screen: 'engineering' | 'nesting') => void;
}

export const Home: React.FC<HomeProps> = ({ onNavigate }) => {
  const cardStyle: React.CSSProperties = {
    background: '#2d2d2d',
    border: '1px solid #444',
    borderRadius: '8px',
    padding: '40px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    width: '300px',
    height: '250px',
    transition: 'all 0.2s ease',
    gap: '20px',
    textAlign: 'center',
    boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
  };

  const hoverStyle = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = 'translateY(-5px)';
    e.currentTarget.style.borderColor = '#007bff';
    e.currentTarget.style.boxShadow = '0 8px 15px rgba(0,123,255,0.2)';
  };

  const leaveStyle = (e: React.MouseEvent<HTMLDivElement>) => {
    e.currentTarget.style.transform = 'translateY(0)';
    e.currentTarget.style.borderColor = '#444';
    e.currentTarget.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
  };

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100vh', 
      width: '100vw',
      background: '#1e1e1e', 
      color: '#e0e0e0',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1 style={{ marginBottom: '60px', fontSize: '28px', fontWeight: '300', opacity: 0.9 }}>
        Sistema Integrado de Manufatura
      </h1>
      
      <div style={{ display: 'flex', gap: '40px', flexWrap: 'wrap', justifyContent: 'center' }}>
        
        {/* BOTÃO ÚNICO: ENGENHARIA & PROJETOS */}
        <div 
          style={cardStyle} 
          onClick={() => onNavigate('engineering')}
          onMouseEnter={hoverStyle}
          onMouseLeave={leaveStyle}
        >
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#007bff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 22h20" />
            <path d="M12 2l-2.5 2.5a5 5 0 0 0 0 7.07l.5.5-8 8H22v-3l-8-8 .5-.5a5 5 0 0 0 7.07 0L22 6 12 2z" />
            <path d="M10 5l4 4" />
          </svg>
          <div>
            <h2 style={{ fontSize: '20px', margin: '0 0 10px 0' }}>Engenharia & Projetos</h2>
            <p style={{ fontSize: '14px', color: '#aaa', margin: 0 }}>
              Central de Importação, Tratamento e Cadastro de Peças.
            </p>
          </div>
        </div>

      </div>
      
      <div style={{ marginTop: '80px', color: '#555', fontSize: '12px' }}>
        v1.1.0 - Fluxo Centralizado
      </div>
    </div>
  );
};