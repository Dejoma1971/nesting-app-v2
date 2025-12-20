import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.tsx';

interface LoginScreenProps {
  onLoginSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
  const { signIn } = useAuth();
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // --- TEMAS (Reaproveitando sua identidade visual) ---
  const theme = {
    bg: isDarkMode ? '#1e1e1e' : '#f0f2f5',
    text: isDarkMode ? '#e0e0e0' : '#333',
    cardBg: isDarkMode ? '#2d2d2d' : '#fff',
    cardBorder: isDarkMode ? '#444' : '#ddd',
    inputBg: isDarkMode ? '#1e1e1e' : '#fff',
    accent: '#007bff',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await signIn(email, password);
      onLoginSuccess();
    } catch (err) {
        console.error(err);
      setError('Falha no login. Verifique suas credenciais.');
    } finally {
      setIsLoading(false);
    }
  };

  const styles = {
    container: {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      background: theme.bg,
      color: theme.text,
      fontFamily: 'Segoe UI, Roboto, Helvetica, Arial, sans-serif',
      transition: '0.3s'
    },
    card: {
      background: theme.cardBg,
      border: `1px solid ${theme.cardBorder}`,
      borderRadius: '12px',
      padding: '40px',
      width: '100%',
      maxWidth: '400px',
      boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: '20px'
    },
    input: {
      width: '100%',
      padding: '12px',
      borderRadius: '6px',
      border: `1px solid ${theme.cardBorder}`,
      background: theme.inputBg,
      color: theme.text,
      fontSize: '16px',
      boxSizing: 'border-box' as const,
      outline: 'none'
    },
    button: {
      width: '100%',
      padding: '12px',
      borderRadius: '6px',
      border: 'none',
      background: theme.accent,
      color: '#fff',
      fontSize: '16px',
      fontWeight: 'bold',
      cursor: isLoading ? 'not-allowed' : 'pointer',
      opacity: isLoading ? 0.7 : 1,
      marginTop: '10px'
    },
    logo: {
      fontSize: '3rem',
      marginBottom: '10px',
      color: theme.accent,
      textAlign: 'center' as const
    }
  };

  return (
    <div style={styles.container}>
      <div style={{ position: 'absolute', top: 20, right: 20 }}>
        <button 
          onClick={() => setIsDarkMode(!isDarkMode)}
          style={{
            background: 'transparent',
            border: `1px solid ${theme.cardBorder}`,
            color: theme.text,
            padding: '8px 12px',
            borderRadius: '20px',
            cursor: 'pointer'
          }}
        >
          {isDarkMode ? '☀️' : '🌙'}
        </button>
      </div>

      <div style={styles.card}>
        <div style={{textAlign: 'center'}}>
            <div style={styles.logo}>⬡</div>
            <h1 style={{margin: 0, fontSize: '1.5rem'}}>Acesso ao Sistema</h1>
            <p style={{opacity: 0.7, fontSize: '0.9rem'}}>Faça login para acessar seus projetos</p>
        </div>

        <form onSubmit={handleSubmit} style={{display: 'flex', flexDirection: 'column', gap: '15px'}}>
            <div>
                <label style={{display: 'block', marginBottom: '5px', fontSize: '0.9rem', fontWeight: 'bold'}}>E-mail</label>
                <input 
                    type="email" 
                    required
                    style={styles.input}
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                />
            </div>
            <div>
                <label style={{display: 'block', marginBottom: '5px', fontSize: '0.9rem', fontWeight: 'bold'}}>Senha</label>
                <input 
                    type="password" 
                    required
                    style={styles.input}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                />
            </div>

            {error && <div style={{color: '#ff4d4d', fontSize: '0.9rem', textAlign: 'center'}}>{error}</div>}

            <button type="submit" style={styles.button}>
                {isLoading ? 'Entrando...' : 'Entrar'}
            </button>
        </form>

        <div style={{textAlign: 'center', fontSize: '0.85rem', opacity: 0.7, marginTop: '10px'}}>
            Ainda não tem conta? <a href="#" style={{color: theme.accent, textDecoration: 'none'}}>Crie uma grátis</a>
        </div>
      </div>
    </div>
  );
};