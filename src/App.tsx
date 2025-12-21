import { useState } from 'react';
import { Home } from './components/Home';
import { DxfReader } from './components/DxfReader';
import { EngineeringScreen } from './components/EngineeringScreen';
import type { ImportedPart } from './components/types';

// --- IMPORTS DE AUTENTICAÇÃO ---
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginScreen } from './components/LoginScreen';
import { RegisterScreen } from './components/RegisterScreen'; // <--- 1. Importar a tela de registro

type ScreenType = 'home' | 'engineering' | 'nesting';
type AuthMode = 'login' | 'register'; // <--- 2. Tipo para controlar qual tela de auth mostrar

function AppContent() {
  const { isAuthenticated, loading } = useAuth(); 
  
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');
  const [authMode, setAuthMode] = useState<AuthMode>('login'); // <--- 3. Estado de controle (Login vs Cadastro)
  
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

  // Se NÃO estiver autenticado, decide entre Login ou Registro
  if (!isAuthenticated) {
    if (authMode === 'register') {
       // Se o modo for registro, mostra a RegisterScreen
       return <RegisterScreen onNavigateToLogin={() => setAuthMode('login')} />;
    }
    
    // Caso contrário, mostra LoginScreen (passando a função para ir pro cadastro)
    // OBS: Você precisará atualizar o seu LoginScreen para aceitar a prop 'onNavigateToRegister'
    return (
        <LoginScreen 
            onLoginSuccess={() => setCurrentScreen('home')} 
            onNavigateToRegister={() => setAuthMode('register')} // <--- Nova prop
        />
    );
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

// O componente App principal apenas fornece o Contexto
function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;