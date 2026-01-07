import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import type { AppTheme } from "../styles/theme";

interface SidebarMenuProps {
  onNavigate?: (screen: "home" | "engineering" | "nesting") => void;
  onOpenProfile?: () => void;
  onOpenTeam?: () => void;
}

const MenuButton: React.FC<{
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  theme: AppTheme;
  subText?: string;
  highlight?: boolean;
  disabled?: boolean;
}> = ({ onClick, icon, label, theme, subText, highlight, disabled }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={!disabled ? onClick : undefined}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        padding: "12px 15px",
        display: "flex",
        alignItems: "center",
        gap: "15px",
        cursor: disabled ? "default" : "pointer", // Cursor normal se desativado
        color: disabled ? theme.label : highlight ? "#007bff" : theme.text,
        opacity: disabled ? 0.6 : 1, // Um pouco transparente se desativado
        borderBottom: `1px solid ${theme.border}`,
        fontSize: "14px",
        transition: "all 0.2s",
        background:
          isHovered && !disabled
            ? theme.hoverRow
            : highlight && !disabled
            ? "rgba(0, 123, 255, 0.05)"
            : "transparent",
        width: "100%",
        border: "none",
        textAlign: "left",
        fontWeight: highlight ? "bold" : "normal",
      }}
      title={disabled ? "Já instalado ou navegador não suportado" : ""}
    >
      <span style={{ display: "flex", alignItems: "center" }}>{icon}</span>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span>{label}</span>
        {subText && (
          <span style={{ fontSize: "10px", opacity: 0.6 }}>{subText}</span>
        )}
      </div>
    </button>
  );
};

export const SidebarMenu: React.FC<SidebarMenuProps> = ({
  onNavigate,
  onOpenProfile,
  onOpenTeam,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { user, logout } = useAuth();
  const { theme, toggleTheme, isDarkMode } = useTheme();

  const navigate = useNavigate();
  const { isInstallable, handleInstallClick } = useInstallPrompt();

  const handleNavigation = (action: () => void) => {
    setIsOpen(false);
    setTimeout(action, 200);
  };

  // ÍCONES
  const Icons = {
    Menu: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      </svg>
    ),
    Close: (
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    ),
    User: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
      </svg>
    ),
    Users: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
      </svg>
    ),
    Moon: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
    ),
    Sun: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
    ),
    Logout: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
        <polyline points="16 17 21 12 16 7"></polyline>
        <line x1="21" y1="12" x2="9" y2="12"></line>
      </svg>
    ),
    Globe: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      </svg>
    ),
    Help: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
        <line x1="12" y1="17" x2="12.01" y2="17"></line>
      </svg>
    ),
    Home: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
        <polyline points="9 22 9 12 15 12 15 22"></polyline>
      </svg>
    ),
    Download: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
      </svg>
    ),
    CreditCard: (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
        <line x1="1" y1="10" x2="23" y2="10"></line>
      </svg>
    ),
  };

  // Normalização
  const userPlan = user?.plano?.toLowerCase() || "";
  const userRole = user?.cargo?.toLowerCase() || "";

  const isFree = userPlan === "free";
  const isPaid = ["premium", "corporativo", "premium dev"].includes(userPlan);
  const isCorporate = userPlan === "corporativo";
  const isAdmin = userRole === "admin";

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          color: theme.text,
          padding: "8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          transition: "background 0.3s",
        }}
        title="Menu Principal"
      >
        {Icons.Menu}
      </button>

      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            background: "rgba(0,0,0,0.5)",
            zIndex: 9998,
            backdropFilter: "blur(2px)",
          }}
        />
      )}

      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          width: "280px",
          height: "100%",
          background: theme.panelBg,
          boxShadow: "-4px 0 15px rgba(0,0,0,0.3)",
          zIndex: 9999,
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s ease-in-out",
          display: "flex",
          flexDirection: "column",
          borderLeft: `1px solid ${theme.border}`,
        }}
      >
        <div
          style={{
            padding: "20px",
            borderBottom: `1px solid ${theme.border}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            background: theme.headerBg,
          }}
        >
          <div>
            <div
              style={{
                fontWeight: "bold",
                fontSize: "16px",
                color: theme.text,
              }}
            >
              {user?.name || "Usuário"}
            </div>
            <div style={{ fontSize: "12px", opacity: 0.7, color: theme.text }}>
              {user?.email}
            </div>
            <div
              style={{
                fontSize: "10px",
                marginTop: "4px",
                color: isPaid ? "#28a745" : theme.label,
                fontWeight: "bold",
                textTransform: "uppercase",
              }}
            >
              {user?.plano || "Free"}
            </div>
          </div>
          <button
            onClick={() => setIsOpen(false)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: theme.text,
            }}
          >
            {Icons.Close}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto" }}>
          {/* ASSINAR (Só para FREE) */}
          {isFree && (
            <MenuButton
              label="Assinar Premium"
              subText="Faça o upgrade da sua conta"
              icon={Icons.CreditCard}
              onClick={() =>
                handleNavigation(() => navigate("/?scrollTo=pricing"))
              }
              theme={theme}
              highlight={true}
            />
          )}

          {/* INSTALAR APP (Sempre visível para pagos, desabilitado se já instalado/erro) */}
          {isPaid && (
            <MenuButton
              label="Instalar Aplicativo"
              subText={
                isInstallable
                  ? "Acesso rápido na área de trabalho"
                  : "Indisponível no momento"
              }
              icon={Icons.Download}
              onClick={() => {
                setIsOpen(false);
                handleInstallClick();
              }}
              theme={theme}
              highlight={isInstallable}
              disabled={!isInstallable}
            />
          )}

          <div
            style={{ height: "1px", background: theme.border, margin: "5px 0" }}
          ></div>

          <MenuButton
            label="Minha Conta"
            icon={Icons.User}
            onClick={() =>
              handleNavigation(() => onOpenProfile && onOpenProfile())
            }
            theme={theme}
          />

          {/* GERENCIAR EQUIPE (Admin e Corporativo) */}
          {onOpenTeam && isCorporate && isAdmin && (
            <MenuButton
              label="Gerenciar Equipe"
              icon={Icons.Users}
              onClick={() => handleNavigation(() => onOpenTeam())}
              theme={theme}
            />
          )}

          {isAdmin && onNavigate && (
            <MenuButton
              label="Dashboard (Admin)"
              icon={Icons.Home}
              onClick={() => handleNavigation(() => onNavigate("home"))}
              theme={theme}
            />
          )}

          <MenuButton
            label={isDarkMode ? "Modo Claro" : "Modo Escuro"}
            icon={isDarkMode ? Icons.Sun : Icons.Moon}
            onClick={toggleTheme}
            theme={theme}
          />
          <MenuButton
            label="Ajuda & Tutoriais"
            icon={Icons.Help}
            onClick={() => window.open("https://youtube.com", "_blank")}
            theme={theme}
          />
        </div>

        <div
          style={{ padding: "20px", borderTop: `1px solid ${theme.border}` }}
        >
          <button
            onClick={() => {
              if (window.confirm("Deseja realmente sair?")) logout();
            }}
            style={{
              width: "100%",
              padding: "10px",
              background: "#dc3545",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "10px",
              fontWeight: "bold",
            }}
          >
            {Icons.Logout} Sair
          </button>
          <div
            style={{
              textAlign: "center",
              fontSize: "10px",
              marginTop: "10px",
              opacity: 0.5,
              color: theme.text,
            }}
          >
            Versão 1.2.1
          </div>
        </div>
      </div>
    </>
  );
};
