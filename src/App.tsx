import { useState } from 'react';
import { Home } from './components/Home';
import { DxfReader } from './components/DxfReader';
import { EngineeringScreen } from './components/EngineeringScreen';
import type { ImportedPart } from './components/types';

type ScreenType = 'home' | 'engineering' | 'nesting';

function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');
  
  // Lista global de peças (Engenharia)
  const [engineeringParts, setEngineeringParts] = useState<ImportedPart[]>([]);
  
  // --- NOVOS ESTADOS PARA O NESTING ---
  const [partsForNesting, setPartsForNesting] = useState<ImportedPart[]>([]);
  const [initialSearchQuery, setInitialSearchQuery] = useState<string>(''); // <--- NOVO

  const goHome = () => {
    setCurrentScreen('home');
    setPartsForNesting([]);
    setInitialSearchQuery('');
  };

  // Atualizado para aceitar query de busca
  const handleSendToNesting = (parts: ImportedPart[], searchQuery?: string) => {
    setPartsForNesting(parts);
    setInitialSearchQuery(searchQuery || ''); // Salva o pedido para busca automática
    setCurrentScreen('nesting');
  };

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
            autoSearchQuery={initialSearchQuery} // <--- Passando a query
            onBack={() => setCurrentScreen('engineering')}
        />
      )}
    </>
  );
}

export default App;