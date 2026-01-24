import { useState, useEffect } from "react";
import { DashboardScreen } from "./components/DashboardScreen";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";

// Componentes
import { Home } from "./components/Home";
import { DxfReader } from "./components/DxfReader";
import { EngineeringScreen } from "./components/EngineeringScreen";
import { LoginScreen } from "./components/LoginScreen";
import { RegisterScreen } from "./components/RegisterScreen";
import { LandingPage } from "./components/LandingPage"; // <--- Novo
import { TeamManagementScreen } from "./components/TeamManagementScreen"; // <--- 1. IMPORTE O MODAL
import { PostProcessorScreen } from "./postProcessador/PostProcessorScreen";

// Tipos
import type { ImportedPart } from "./components/types";

// Contextos
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";

import { SuccessScreen } from "./components/SuccessScreen";

type ScreenType = "home" | "engineering" | "nesting" | "dashboard" | "postprocessor";

// =================================================================
// 1. COMPONENTE DO SISTEMA INTERNO (PROTEGIDO)
// Mantivemos a lógica original de navegação interna aqui
// =================================================================
function ProtectedApp() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  const [currentScreen, setCurrentScreen] = useState<ScreenType>("home");

  // --- 2. NOVO ESTADO PARA O MODAL ---
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);

  // Estados globais do App
  const [engineeringParts, setEngineeringParts] = useState<ImportedPart[]>([]);
  const [partsForNesting, setPartsForNesting] = useState<ImportedPart[]>([]);
  const [initialSearchQuery, setInitialSearchQuery] = useState<string>("");

  // Efeito de segurança: Se não estiver logado, chuta para o login
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isAuthenticated, loading, navigate]);

  if (loading) return <div>Carregando...</div>;
  if (!isAuthenticated) return null; // O useEffect acima vai redirecionar

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

  return (
    <>
      {currentScreen === "home" && (
        <Home
          onNavigate={(screen) => setCurrentScreen(screen)}
          onOpenTeam={() => setIsTeamModalOpen(true)} // <--- CONECTADO
        />
      )}

      {currentScreen === "engineering" && (
        <EngineeringScreen
          parts={engineeringParts}
          setParts={setEngineeringParts}
          onBack={goHome}
          onSendToNesting={handleSendToNesting}
          onOpenTeam={() => setIsTeamModalOpen(true)}
          onNavigate={(screen) => setCurrentScreen(screen)}
        />
      )}

      {currentScreen === "nesting" && (
        <DxfReader
          preLoadedParts={partsForNesting}
          autoSearchQuery={initialSearchQuery}
          onNavigate={(screen) => setCurrentScreen(screen)}
          onBack={() => setCurrentScreen("engineering")}
          onOpenTeam={() => setIsTeamModalOpen(true)}
        />
      )}
      {currentScreen === "dashboard" && (
        <DashboardScreen
          onNavigate={(screen) => setCurrentScreen(screen)}
          onOpenTeam={() => setIsTeamModalOpen(true)}
        />
      )}

      {/* --- ADICIONE ESTE BLOCO AQUI --- */}
{/* AQUI ESTÁ A MUDANÇA: O componente real agora é chamado */}
      {currentScreen === "postprocessor" && (
        <PostProcessorScreen 
          onBack={() => setCurrentScreen("home")} 
        />
      )}

      {/* 4. O MODAL FLUTUANTE (Renderiza em cima de tudo se estiver true) */}
      {isTeamModalOpen && (
        <TeamManagementScreen onClose={() => setIsTeamModalOpen(false)} />
      )}
    </>
  );
}

// =================================================================
// 2. COMPONENTE PRINCIPAL COM ROTEAMENTO
// =================================================================
function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <BrowserRouter>
          <Routes>
            {/* ROTA PÚBLICA: Landing Page */}
            <Route path="/" element={<LandingPage />} />

            {/* ROTAS DE AUTENTICAÇÃO */}
            <Route path="/login" element={<AuthRoute mode="login" />} />
            <Route path="/register" element={<AuthRoute mode="register" />} />
            {/* --- 2. NOVA ROTA DE SUCESSO DO PAGAMENTO --- */}
            {/* Esta rota precisa existir para o Stripe encontrar o usuário na volta */}
            <Route
              path="/payment-success"
              element={
                <SuccessScreen onBack={() => (window.location.href = "/app")} />
              }
            />
            {/* ADICIONE ESTA ROTA PARA O FRONTEND RECONHECER O RETORNO DO STRIPE */}
            <Route
              path="/payment-success"
              element={
                <SuccessScreen onBack={() => (window.location.href = "/app")} />
              }
            />

            {/* ROTA PRIVADA: O Sistema (Redireciona qualquer subrota /app/* para o ProtectedApp) */}
            <Route path="/app/*" element={<ProtectedApp />} />

            {/* Fallback: Qualquer rota desconhecida vai para a Landing Page */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </AuthProvider>
  );
}

// Wrapper auxiliar para Login/Registro com redirecionamento automático
// Se o usuário já estiver logado e tentar acessar /login, manda ele para /app
function AuthRoute({ mode }: { mode: "login" | "register" }) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  if (isAuthenticated) {
    return <Navigate to="/app" replace />;
  }

  if (mode === "register") {
    return <RegisterScreen onNavigateToLogin={() => navigate("/login")} />;
  }

  return (
    <LoginScreen
      onLoginSuccess={() => navigate("/app")}
      onNavigateToRegister={() => navigate("/register")}
    />
  );
}

export default App;
