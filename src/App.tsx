import { useState } from 'react';
import { Home } from './components/Home';
import { DxfReader } from './components/DxfReader'; // Suponho que este seja o wrapper do Nesting ou similar
import { EngineeringScreen } from './components/EngineeringScreen';
import type { ImportedPart } from './components/types';

type ScreenType = 'home' | 'engineering' | 'nesting';

function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');
  
  // ESTADO ELEVADO: A lista principal agora vive aqui
  const [engineeringParts, setEngineeringParts] = useState<ImportedPart[]>([]);
  
  // Estado específico para o que vai ser cortado (pode ser um subconjunto ou a lista toda)
  const [partsForNesting, setPartsForNesting] = useState<ImportedPart[]>([]);

  const goHome = () => {
    setCurrentScreen('home');
    setPartsForNesting([]);
    // Opcional: Se quiser que ao voltar para HOME limpe a engenharia também, descomente abaixo.
    // Caso contrário, ao clicar em "Engenharia" na home, a lista antiga ainda estará lá.
    // setEngineeringParts([]); 
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
            // Passamos o estado e a função de atualização para o filho
            parts={engineeringParts}
            setParts={setEngineeringParts}
            onBack={goHome} 
            onSendToNesting={handleSendToNesting} 
        />
      )}

      {currentScreen === 'nesting' && (
        <DxfReader 
            preLoadedParts={partsForNesting} 
            onBack={() => setCurrentScreen('engineering')}
        />
      )}
    </>
  );
}

export default App;