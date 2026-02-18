import { useState, useEffect, lazy, Suspense } from "react";

import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";

// Componentes
import { Home } from "./components/Home";

import { LoginScreen } from "./components/LoginScreen";
import { RegisterScreen } from "./components/RegisterScreen";
import { LandingPage } from "./components/LandingPage"; // <--- Novo
import { TeamManagementScreen } from "./components/TeamManagementScreen"; // <--- 1. IMPORTE O MODAL
// Tipos
import type { ImportedPart } from "./components/types";


// Contextos
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";

import { SuccessScreen } from "./components/SuccessScreen";

type ScreenType =
  | "home"
  | "engineering"
  | "nesting"
  | "dashboard"
  | "postprocessor";

  // --- COMPONENTE DE LOADING (Igual ao Splash Screen) ---
const AppLoader = () => (
  <div style={{
    height: "100vh",
    width: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    background: "#1e1e1e",
    color: "#e0e0e0"
  }}>
    <style>{`
      @keyframes rotate { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
      .app-loader-ring { animation: rotate 1s linear infinite; transform-origin: center; }
    `}</style>
    <svg width="60" height="60" viewBox="0 0 512 512" fill="none">
      <path d="M256 32L210 160H302L256 32Z" fill="#fd7e14" />
      <circle cx="256" cy="256" r="80" stroke="#fd7e14" strokeWidth="20" strokeDasharray="300" className="app-loader-ring" />
      <path d="M256 480L302 352H210L256 480Z" fill="#fd7e14" />
    </svg>
    <p style={{ marginTop: 20, fontSize: "0.9rem", opacity: 0.7 }}>Carregando módulo...</p>
  </div>
);

// --- IMPORTS LAZY (Carregamento sob demanda) ---
// Substitua os imports estáticos do topo por estes:

const EngineeringScreen = lazy(() => 
  import("./components/EngineeringScreen").then(module => ({ default: module.EngineeringScreen }))
);

const DxfReader = lazy(() => 
  import("./components/DxfReader").then(module => ({ default: module.DxfReader }))
);

const DashboardScreen = lazy(() => 
  import("./components/DashboardScreen").then(module => ({ default: module.DashboardScreen }))
);

const PostProcessorScreen = lazy(() => 
  import("./postProcessador/PostProcessorScreen").then(module => ({ default: module.PostProcessorScreen }))
);

// ---------------------------------------------------------

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
// Logo abaixo dos outros useState

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

  // ⬇️ --- [NOVO] FUNÇÃO PARA RECEBER PEÇAS PARA EDIÇÃO --- ⬇️
  // Esta função é chamada pelo NestingBoard quando o usuário clica no "Lápis"
  const handleEditOrder = (partsToEdit: ImportedPart[]) => {
    console.log("🔄 Recebendo pedido para edição na Engenharia:", partsToEdit.length, "peças");
    
    // 1. Carrega as peças no estado da Engenharia
    setEngineeringParts(partsToEdit);
    
    // 2. Limpa o estado do Nesting (opcional, mas bom para evitar confusão)
    setPartsForNesting([]); 
    
    // 3. Redireciona para a tela de Engenharia
    setCurrentScreen("engineering");
  };
  // ⬆️ ----------------------------------------------------- ⬆️

  // [App.tsx] - Dentro de ProtectedApp, no return:

  return (
    <>
      {/* A HOME CONTINUA FORA DO SUSPENSE (Carrega Instantaneamente) */}
      {currentScreen === "home" && (
        <Home
          onNavigate={(screen) => setCurrentScreen(screen)}
          onOpenTeam={() => setIsTeamModalOpen(true)}
        />
      )}

      {/* ⬇️ --- ENVOLVER AS OUTRAS TELAS COM SUSPENSE --- ⬇️ */}
      <Suspense fallback={<AppLoader />}>
        
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
            onEditOrder={handleEditOrder}
          />
        )}
        
        {currentScreen === "dashboard" && (
          <DashboardScreen
            onNavigate={(screen) => setCurrentScreen(screen)}
            onOpenTeam={() => setIsTeamModalOpen(true)}
          />
        )}

        {currentScreen === "postprocessor" && (
          <PostProcessorScreen 
            onBack={() => setCurrentScreen("home")} 
            placedParts={[]} 
            allParts={partsForNesting} 
          />
        )}

      </Suspense>
      {/* ⬆️ ---------------------------------------------- ⬆️ */}

      {/* 4. O MODAL FLUTUANTE */}
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
  
  // 2. O useEffect deve ficar logo no início da função App
  useEffect(() => {
    const splash = document.getElementById("splash-screen");
    if (splash) {
      const timer = setTimeout(() => {
        splash.classList.add("fade-out");
        setTimeout(() => splash.remove(), 600);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

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
