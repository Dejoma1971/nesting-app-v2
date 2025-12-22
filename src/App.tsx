import { useState } from "react";
import { Home } from "./components/Home";
import { DxfReader } from "./components/DxfReader";
import { EngineeringScreen } from "./components/EngineeringScreen";
import type { ImportedPart } from "./components/types";

// --- IMPORTS DE CONTEXTO ---
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext"; // <--- 1. ADICIONADO O IMPORT AQUI

import { LoginScreen } from "./components/LoginScreen";
import { RegisterScreen } from "./components/RegisterScreen";

type ScreenType = "home" | "engineering" | "nesting";
type AuthMode = "login" | "register";

function AppContent() {
  const { isAuthenticated, loading } = useAuth();

  const [currentScreen, setCurrentScreen] = useState<ScreenType>("home");
  const [authMode, setAuthMode] = useState<AuthMode>("login");

  // Lista global de peças (Engenharia)
  const [engineeringParts, setEngineeringParts] = useState<ImportedPart[]>([]);

  // --- ESTADOS PARA O NESTING ---
  const [partsForNesting, setPartsForNesting] = useState<ImportedPart[]>([]);
  const [initialSearchQuery, setInitialSearchQuery] = useState<string>("");

  const goHome = () => {
    setCurrentScreen("home");
    setPartsForNesting([]);
    setInitialSearchQuery("");
  };

  const handleSendToNesting = (parts: ImportedPart[], searchQuery?: string) => {
    setPartsForNesting(parts);
    setInitialSearchQuery(searchQuery || "");
    setCurrentScreen("nesting");
  };

  // --- LÓGICA DE PROTEÇÃO (LOGIN) ---

  if (loading) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          background: "#1e1e1e",
          color: "#e0e0e0",
          fontFamily: "sans-serif",
        }}
      >
        Carregando Sistema...
      </div>
    );
  }

  // Se NÃO estiver autenticado, decide entre Login ou Registro
  if (!isAuthenticated) {
    if (authMode === "register") {
      return <RegisterScreen onNavigateToLogin={() => setAuthMode("login")} />;
    }

    return (
      <LoginScreen
        onLoginSuccess={() => setCurrentScreen("home")}
        onNavigateToRegister={() => setAuthMode("register")}
      />
    );
  }

  // Se estiver autenticado, mostra o fluxo normal do aplicativo
  return (
    <>
      {currentScreen === "home" && (
        <Home onNavigate={(screen) => setCurrentScreen(screen)} />
      )}

      {currentScreen === "engineering" && (
        <EngineeringScreen
          parts={engineeringParts}
          setParts={setEngineeringParts}
          onBack={goHome}
          onSendToNesting={handleSendToNesting}
        />
      )}

      {currentScreen === "nesting" && (
        <DxfReader
          preLoadedParts={partsForNesting}
          autoSearchQuery={initialSearchQuery}
          onBack={() => setCurrentScreen("engineering")}
        />
      )}
    </>
  );
}

// O componente App principal fornece TODOS os Contextos
function App() {
  return (
    <AuthProvider>
      {/* 2. ADICIONADO: O THEME PROVIDER DEVE ENVOLVER O CONTEÚDO */}
      <ThemeProvider>
        <AppContent />
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
