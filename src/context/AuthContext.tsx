import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
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
  refreshProfile: () => Promise<void>; // <--- NOVA FUNÇÃO NO CONTRATO
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
  // Função de Logout (Estabilizada com useCallback)
  const logout = useCallback(async () => {
    // 1. TENTA LIBERAR OS PEDIDOS NO SERVIDOR ANTES DE SAIR
    if (user && user.token) {
      try {
        await fetch("http://localhost:3001/api/pedidos/unlock", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify({}),
        });
        console.log("🔓 Pedidos liberados com sucesso ao fazer logout.");
      } catch (error) {
        console.error("Erro silencioso ao tentar desbloquear no logout:", error);
      }
    }

    // 2. LIMPEZA LOCAL
    setUser(null);
    localStorage.removeItem('autoNest_user');
    window.location.href = '/'; 
  }, [user]); // <--- Dependência necessária para ler o token atual

  // --- NOVA FUNÇÃO: ATUALIZAR PERFIL SILENCIOSAMENTE ---
  const refreshProfile = async () => {
    if (!user?.token) return; // Se não tem token, não faz nada

    try {
      console.log("🔄 Atualizando perfil e permissões...");
      const response = await fetch('http://localhost:3001/api/auth/me', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}` // Usa o token atual para se identificar
        }
      });

      if (response.ok) {
        const data = await response.json();
        
        // O backend retorna { token: 'novo...', user: { ...dados } }
        // Precisamos montar o objeto completo para o frontend
        const updatedUser: User = {
          ...data.user,
          token: data.token // Atualiza com o Token NOVO (que tem o plano novo)
        };

        // Salva no estado e no localStorage
        login(updatedUser); 
        console.log("✅ Perfil atualizado com sucesso! Novo plano:", updatedUser.plano);
      } else {
        console.warn("Falha ao atualizar perfil. Status:", response.status);
      }
    } catch (error) {
      console.error("Erro ao tentar atualizar perfil:", error);
    }
  };
  // -----------------------------------------------------

  // Ouvinte de Sessão Expirada
  useEffect(() => {
    const handleSessionExpired = () => {
      alert("Sua sessão expirou. Por favor, faça login novamente.");
      logout();
    };
    window.addEventListener('auth:logout', handleSessionExpired);
    return () => {
      window.removeEventListener('auth:logout', handleSessionExpired);
    };
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, login, logout, refreshProfile, isAuthenticated: !!user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook Personalizado
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};