import React, { createContext, useState, useContext, useEffect } from 'react';
// CORREÇÃO 1: Importar 'ReactNode' separadamente como tipo
import type { ReactNode } from 'react';

// Ajuste o caminho se necessário ('../theme' ou '../components/theme')
import { getTheme } from '../styles/theme';
// CORREÇÃO 2: Importar 'AppTheme' separadamente como tipo
import type { AppTheme } from '../styles/theme';

interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
  theme: AppTheme;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Inicializa lendo do LocalStorage ou usa Dark como padrão
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('autoNest_theme');
    return saved ? saved === 'dark' : true; 
  });

  useEffect(() => {
    localStorage.setItem('autoNest_theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(prev => !prev);

  // Gera o objeto de tema baseado no arquivo theme.ts
  const theme = getTheme(isDarkMode);

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme, theme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// CORREÇÃO 3: Adicionar comentário para ignorar o aviso do Fast Refresh nesta linha específica
// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme deve ser usado dentro de um ThemeProvider');
  }
  return context;
};