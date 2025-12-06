import { useState } from 'react';
import { Home } from './components/Home';
import { DxfReader } from './components/DxfReader';
import { EngineeringScreen } from './components/EngineeringScreen';
import type { ImportedPart } from './components/types';

type ScreenType = 'home' | 'engineering' | 'nesting';

function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');
  
  // Estado para transferir peças da Engenharia para o Nesting
  const [partsForNesting, setPartsForNesting] = useState<ImportedPart[]>([]);

  const goHome = () => {
    setCurrentScreen('home');
    setPartsForNesting([]); // Limpa a memória ao voltar para o menu
  };

  // Função chamada pela Engenharia para ir direto ao corte
  const handleSendToNesting = (parts: ImportedPart[]) => {
    setPartsForNesting(parts); // Guarda as peças processadas
    setCurrentScreen('nesting'); // Troca a tela
  };

  return (
    <>
      {currentScreen === 'nesting' && (
        <button 
          onClick={goHome}
          title="Voltar ao Menu Principal"
          style={{
            position: 'fixed', top: '15px', left: '15px', zIndex: 1000,
            background: '#333', color: 'white', border: '1px solid #555',
            borderRadius: '50%', width: '40px', height: '40px', fontSize: '20px',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          🏠
        </button>
      )}

      {currentScreen === 'home' && (
        <Home onNavigate={(screen) => setCurrentScreen(screen)} />
      )}

      {currentScreen === 'engineering' && (
        <EngineeringScreen 
            onBack={goHome} 
            onSendToNesting={handleSendToNesting} // Passamos a nova função
        />
      )}

      {currentScreen === 'nesting' && (
        // Passamos as peças recebidas para o leitor
        <DxfReader preLoadedParts={partsForNesting} />
      )}
    </>
  );
}

export default App;