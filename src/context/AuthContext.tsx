import React, { createContext, useState, useContext, type ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  plan: 'free' | 'pro' | 'enterprise';
  token: string;
}

interface AuthContextData {
  user: User | null;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Inicialização Lazy: Já carrega logado se tiver dados
  const [user, setUser] = useState<User | null>(() => {
    const storedUser = localStorage.getItem('@NestingApp:user');
    const storedToken = localStorage.getItem('@NestingApp:token');

    if (storedUser && storedToken) {
      return { ...JSON.parse(storedUser), token: storedToken };
    }
    return null;
  });

  const [loading] = useState(false);

  const signIn = async (email: string, password: string) => {
    try {
        // --- CONEXÃO REAL COM O BACKEND ---
        const response = await fetch('http://localhost:3001/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erro ao fazer login');
        }

        // Se chegou aqui, o login foi sucesso!
        const userWithToken = { ...data.user, token: data.token };

        setUser(userWithToken);
        
        // Salva para persistir se der F5
        localStorage.setItem('@NestingApp:user', JSON.stringify(data.user));
        localStorage.setItem('@NestingApp:token', data.token);

    } catch (error) {
        console.error("Erro de Auth:", error);
        throw error; // Repassa o erro para a tela de login mostrar o alerta
    }
  };

  const signOut = () => {
    localStorage.removeItem('@NestingApp:user');
    localStorage.removeItem('@NestingApp:token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, signIn, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  return context;
};