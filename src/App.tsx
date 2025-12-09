import { useState } from 'react';
import { Home } from './components/Home';
import { DxfReader } from './components/DxfReader';
import { EngineeringScreen } from './components/EngineeringScreen';
import type { ImportedPart } from './components/types';

type ScreenType = 'home' | 'engineering' | 'nesting';

function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');
  const [partsForNesting, setPartsForNesting] = useState<ImportedPart[]>([]);

  const goHome = () => {
    setCurrentScreen('home');
    setPartsForNesting([]);
  };

  const handleSendToNesting = (parts: ImportedPart[]) => {
    setPartsForNesting(parts);
    setCurrentScreen('nesting');
  };

  return (
    <>
      {currentScreen === 'home' && (
        <Home onNavigate={(screen) => setCurrentScreen(screen)} />
      )}

      {currentScreen === 'engineering' && (
        <EngineeringScreen 
            onBack={goHome} 
            onSendToNesting={handleSendToNesting} 
        />
      )}

      {currentScreen === 'nesting' && (
        <DxfReader 
            preLoadedParts={partsForNesting} 
            onBack={goHome} 
        />
      )}
    </>
  );
}

export default App;