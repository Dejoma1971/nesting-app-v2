import React, { createContext, useState, useContext } from 'react';
// CORREÇÃO 1: Importação explícita de TIPO (resolve o erro TS 1484)
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
  
  // Inicialização Preguiçosa (Lazy): Lê o localStorage apenas na criação
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

  // CORREÇÃO 2: Removemos 'setLoading' pois ele não é usado
  // Como a leitura acima é síncrona, o loading é sempre false após o render inicial
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

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Ignora aviso do ESLint sobre exportação de componentes + hooks no mesmo arquivo
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};