import { DxfReader } from './components/DxfReader';

function App() {
  return (
    // Removemos qualquer className="App" que pudesse ter estilos restritivos
    <div style={{ width: '100%', height: '100vh', margin: 0, padding: 0 }}>
      <DxfReader />
    </div>
  );
}

export default App;