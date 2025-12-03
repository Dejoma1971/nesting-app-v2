import { useState } from "react";
import { Home } from "./components/Home";
import { DxfReader } from "./components/DxfReader";
import { EngineeringScreen } from "./components/EngineeringScreen"; // <--- Import Novo

type ScreenType = "home" | "engineering" | "nesting";

function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>("home");

  return (
    <>
      {currentScreen !== "home" && (
        <button
          onClick={() => setCurrentScreen("home")}
          title="Voltar ao Menu Principal"
          style={{
            position: "fixed",
            top: "15px",
            left: "15px",
            zIndex: 1000,
            background: "#333",
            color: "white",
            border: "1px solid #555",
            borderRadius: "50%",
            width: "40px",
            height: "40px",
            fontSize: "20px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 5px rgba(0,0,0,0.5)",
          }}
        >
          🏠
        </button>
      )}

      {currentScreen === "home" && (
        <Home onNavigate={(screen) => setCurrentScreen(screen)} />
      )}

      {currentScreen === "engineering" && <EngineeringScreen />}

      {currentScreen === "nesting" && <DxfReader />}
    </>
  );
}

export default App;
