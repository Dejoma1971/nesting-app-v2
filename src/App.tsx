import { useState } from 'react';
import { Home } from './components/Home';
import { DxfReader } from './components/DxfReader'; // Assumindo que este é o seu wrapper para o NestingBoard
import { EngineeringScreen } from './components/EngineeringScreen';
import type { ImportedPart } from './components/types';

// --- NOVOS IMPORTS DE AUTENTICAÇÃO ---
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';

type ScreenType = 'home' | 'engineering' | 'nesting';

// 1. Criamos um componente interno para poder usar o hook useAuth()
function AppContent() {
  const { isAuthenticated, loading } = useAuth(); // Verifica se está logado
  
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');
  
  // Lista global de peças (Engenharia)
  const [engineeringParts, setEngineeringParts] = useState<ImportedPart[]>([]);
  
  // --- ESTADOS PARA O NESTING ---
  const [partsForNesting, setPartsForNesting] = useState<ImportedPart[]>([]);
  const [initialSearchQuery, setInitialSearchQuery] = useState<string>('');

  const goHome = () => {
    setCurrentScreen('home');
    setPartsForNesting([]);
    setInitialSearchQuery('');
  };

  const handleSendToNesting = (parts: ImportedPart[], searchQuery?: string) => {
    setPartsForNesting(parts);
    setInitialSearchQuery(searchQuery || '');
    setCurrentScreen('nesting');
  };

  // --- LÓGICA DE PROTEÇÃO (LOGIN) ---
  
  // Se estiver carregando (verificando localStorage), mostra tela de load simples
  if (loading) {
    return (
      <div style={{
        height: '100vh', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        background: '#1e1e1e', 
        color: '#e0e0e0',
        fontFamily: 'sans-serif'
      }}>
        Carregando Sistema...
      </div>
    );
  }

  // Se NÃO estiver autenticado, mostra a tela de Login
  if (!isAuthenticated) {
    // Ao logar com sucesso, mandamos para a Home
    return <LoginScreen onLoginSuccess={() => setCurrentScreen('home')} />;
  }

  // Se estiver autenticado, mostra o fluxo normal do aplicativo
  return (
    <>
      {currentScreen === 'home' && (
        <Home onNavigate={(screen) => setCurrentScreen(screen)} />
      )}

      {currentScreen === 'engineering' && (
        <EngineeringScreen 
            parts={engineeringParts}
            setParts={setEngineeringParts}
            onBack={goHome} 
            onSendToNesting={handleSendToNesting} 
        />
      )}

      {currentScreen === 'nesting' && (
        <DxfReader 
            preLoadedParts={partsForNesting}
            autoSearchQuery={initialSearchQuery} 
            onBack={() => setCurrentScreen('engineering')}
        />
      )}
    </>
  );
}

// 2. O componente App principal apenas fornece o Contexto
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;