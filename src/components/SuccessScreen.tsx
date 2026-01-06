import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext'; // Importe o hook

interface SuccessScreenProps {
  onBack: () => void;
}

export const SuccessScreen: React.FC<SuccessScreenProps> = ({ onBack }) => {
  const { refreshProfile } = useAuth(); // Pega a nova função

  // Assim que a tela carrega, atualiza o token
  useEffect(() => {
    refreshProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: '#121212', color: 'white', textAlign: 'center'
    }}>
      <h1 style={{ fontSize: '3rem', color: '#28a745' }}>Pagamento Aprovado! 🚀</h1>
      <p style={{ fontSize: '1.2rem', marginTop: '10px' }}>Seu plano foi atualizado com sucesso.</p>
      
      <button 
        onClick={onBack}
        style={{
          marginTop: '30px', padding: '15px 30px', fontSize: '1rem',
          background: '#28a745', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer'
        }}
      >
        Voltar para o Sistema
      </button>
    </div>
  );
};