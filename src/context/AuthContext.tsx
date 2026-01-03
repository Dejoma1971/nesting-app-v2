import React, { createContext, useState, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';

// Define a estrutura do Usuário
export interface User {
  id: string;
  name: string;
  email: string;
  token: string;
  empresa_id: string;
  plano: string;
  cargo: string;
}

// Define o que o Contexto disponibiliza
interface AuthContextType {
  user: User | null;
  login: (userData: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  
  // Inicialização: Lê o localStorage
  const [user, setUser] = useState<User | null>(() => {
    const storedUser = localStorage.getItem('autoNest_user');
    if (storedUser) {
      try {
        return JSON.parse(storedUser);
      } catch (error) {
        console.error("Sessão inválida limpa.", error);
        localStorage.removeItem('autoNest_user');
        return null;
      }
    }
    return null;
  });

  const [loading] = useState(false);

  // Função de Login
  const login = (userData: User) => {
    setUser(userData);
    localStorage.setItem('autoNest_user', JSON.stringify(userData));
  };

  // Função de Logout
  const logout = () => {
    setUser(null);
    localStorage.removeItem('autoNest_user');
    window.location.href = '/'; 
  };

  // --- NOVO: OUVINTE DE SESSÃO EXPIRADA ---
  useEffect(() => {
    const handleSessionExpired = () => {
      // 1. Avisa o usuário
      alert("Sua sessão expirou. Por favor, faça login novamente.");
      
      // 2. Executa o logout
      logout();
    };

    // Adiciona o ouvinte para o evento customizado
    window.addEventListener('auth:logout', handleSessionExpired);

    // Remove o ouvinte quando o componente desmontar (limpeza)
    return () => {
      window.removeEventListener('auth:logout', handleSessionExpired);
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// --- CORREÇÃO DO AVISO ---
// A linha abaixo diz ao ESLint para ignorar a regra de Fast Refresh apenas para o Hook
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};