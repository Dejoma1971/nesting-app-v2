import { useState } from 'react';
import { Home } from './components/Home';
import { DxfReader } from './components/DxfReader';

// --- TIPO DE TELAS ---
type ScreenType = 'home' | 'engineering' | 'nesting';

// --- COMPONENTE PROVISÓRIO (AGORA DEFINIDO FORA) ---
const EngineeringScreen = () => (
  <div style={{ 
    height: '100vh', 
    display: 'flex', 
    flexDirection: 'column', 
    alignItems: 'center', 
    justifyContent: 'center', 
    background: '#1e1e1e', 
    color: '#fff' 
  }}>
    <h1 style={{ color: '#007bff' }}>Módulo de Engenharia</h1>
    <p>Em construção...</p>
    <p style={{ opacity: 0.6 }}>Aqui será feita a importação e cadastro de peças no Banco de Dados.</p>
  </div>
);

// --- COMPONENTE PRINCIPAL ---
function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');

  return (
    <>
      {/* Botão Flutuante de Voltar (Só aparece se não estiver na Home) */}
      {currentScreen !== 'home' && (
        <button 
          onClick={() => setCurrentScreen('home')}
          title="Voltar ao Menu Principal"
          style={{
            position: 'fixed',
            top: '15px',
            left: '15px',
            zIndex: 1000,
            background: '#333',
            color: 'white',
            border: '1px solid #555',
            borderRadius: '50%',
            width: '40px',
            height: '40px',
            fontSize: '20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 2px 5px rgba(0,0,0,0.5)'
          }}
        >
          🏠
        </button>
      )}

      {/* Gerenciador de Telas */}
      {currentScreen === 'home' && (
        <Home onNavigate={(screen) => setCurrentScreen(screen)} />
      )}

      {currentScreen === 'engineering' && (
        <EngineeringScreen />
      )}

      {currentScreen === 'nesting' && (
        <DxfReader />
      )}
    </>
  );
}

export default App;


// import { DxfReader } from './components/DxfReader';

// function App() {
//   return (
//     // Removemos qualquer className="App" que pudesse ter estilos restritivos
//     <div style={{ width: '100%', height: '100vh', margin: 0, padding: 0 }}>
//       <DxfReader />
//     </div>
//   );
// }

// export default App;