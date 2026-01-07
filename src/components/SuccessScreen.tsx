import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
// Importe o hook novo
import { useInstallPrompt } from '../hooks/useInstallPrompt';

interface SuccessScreenProps {
  onBack: () => void;
}

export const SuccessScreen: React.FC<SuccessScreenProps> = ({ onBack }) => {
  const { refreshProfile } = useAuth();
  // Chama a lógica de instalação
  const { isInstallable, handleInstallClick } = useInstallPrompt();

  useEffect(() => {
    refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#121212', color: 'white', textAlign: 'center', padding: '20px'
    }}>
      <h1 style={{ fontSize: '3rem', color: '#28a745', marginBottom: '10px' }}>Pagamento Aprovado! 🚀</h1>
      <p style={{ fontSize: '1.2rem', opacity: 0.8 }}>Seu plano foi atualizado com sucesso.</p>
      
      {/* --- BLOCO DE INSTALAÇÃO (SÓ APARECE SE DISPONÍVEL) --- */}
      {isInstallable && (
        <div style={{
          marginTop: '30px',
          padding: '20px',
          background: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '12px',
          border: '1px solid #333',
          maxWidth: '400px'
        }}>
          <p style={{ margin: '0 0 15px 0', fontSize: '1rem', color: '#ccc' }}>
            Tenha o <strong>AutoNest Hub</strong> na sua área de trabalho para acesso rápido:
          </p>
          <button 
            onClick={handleInstallClick}
            style={{
              padding: '12px 25px', 
              fontSize: '1rem',
              background: '#007bff', // Azul para destacar
              color: 'white', 
              border: 'none', 
              borderRadius: '8px', 
              cursor: 'pointer',
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              width: '100%'
            }}
          >
            📲 Instalar Aplicativo
          </button>
        </div>
      )}

      {/* BOTÃO VOLTAR */}
      <button 
        onClick={onBack}
        style={{
          marginTop: '30px', 
          padding: '15px 30px', 
          fontSize: '1rem',
          background: 'transparent', 
          color: '#28a745', 
          border: '2px solid #28a745', 
          borderRadius: '8px', 
          cursor: 'pointer',
          transition: '0.2s'
        }}
        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(40, 167, 69, 0.1)'}
        onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
      >
        Ir para o Sistema
      </button>
    </div>
  );
};