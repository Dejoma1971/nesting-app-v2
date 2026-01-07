import React, { useState, useRef } from "react";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext"; // <--- 1. IMPORTAÇÃO NOVA
import { useNavigate } from "react-router-dom";
import { translations } from "./landingTranslations";
import type { Language } from "./landingTranslations";

import { CNCBackground } from "./CNCBackground";

import { handleSubscription } from "../services/paymentService";

export const LandingPage: React.FC = () => {
  const { theme, isDarkMode } = useTheme();
  const { isAuthenticated } = useAuth(); // <--- 2. VERIFICAÇÃO DE LOGIN
  const navigate = useNavigate();

  // Controle de Idioma
  const [lang, setLang] = useState<Language>("pt");
  const t = translations[lang];

  // Referência para o container principal
  const containerRef = useRef<HTMLDivElement>(null);

  // Estado para quantidade de usuários no plano corporativo
  const [corpQuantity, setCorpQuantity] = useState(3);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLang(e.target.value as Language);
  };

  // ========================================================
  // 3. LÓGICA DO TÚNEL DE VENDAS (ALTERADA)
  // ========================================================

  const buyPremium = () => {
    if (isAuthenticated) {
      // Se já está logado, vai direto para o pagamento
      handleSubscription("premium", 1);
    } else {
      // Se NÃO está logado, vai para o registro levando o plano na mala
      navigate("/register?plan=premium");
    }
  };

  const buyCorporate = () => {
    if (isAuthenticated) {
      handleSubscription("corporate", corpQuantity);
    } else {
      // Leva o plano E a quantidade escolhida
      navigate(`/register?plan=corporate&quantity=${corpQuantity}`);
    }
  };
  // ========================================================

  // --- ESTILOS GERAIS ---
  const sectionStyle: React.CSSProperties = {
    padding: "80px 20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    maxWidth: "1200px",
    margin: "0 auto",
    textAlign: "center",
  };

  const buttonPrimary: React.CSSProperties = {
    padding: "15px 40px",
    fontSize: "1.1rem",
    background: "linear-gradient(90deg, #007bff 0%, #0056b3 100%)",
    color: "white",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "bold",
    boxShadow: "0 4px 15px rgba(0,123,255,0.4)",
    transition: "transform 0.2s",
  };

  const navButtonStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: theme.text,
    cursor: "pointer",
    fontSize: "0.95rem",
    fontWeight: 500,
    padding: "8px 12px",
    transition: "color 0.2s",
  };

  const cardStyle: React.CSSProperties = {
    background: isDarkMode ? "#2d2d2d" : "#fff",
    border: `1px solid ${theme.border}`,
    borderRadius: "12px",
    padding: "30px",
    flex: 1,
    minWidth: "300px",
    textAlign: "left",
    boxShadow: isDarkMode
      ? "0 4px 20px rgba(0,0,0,0.4)"
      : "0 4px 20px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column",
  };

  // FUNÇÃO DE ROLAGEM SUAVE PERSONALIZADA
  const smoothScrollToTop = (duration: number = 1500) => {
    const container = containerRef.current;
    if (!container) return;

    const start = container.scrollTop;
    const startTime = performance.now();

    const animateScroll = (currentTime: number) => {
      const timeElapsed = currentTime - startTime;
      const progress = Math.min(timeElapsed / duration, 1);

      // Função de Easing (easeInOutQuad) - Começa devagar, acelera e termina devagar
      const ease =
        progress < 0.5
          ? 2 * progress * progress
          : -1 + (4 - 2 * progress) * progress;

      container.scrollTop = start * (1 - ease);

      if (timeElapsed < duration) {
        requestAnimationFrame(animateScroll);
      }
    };

    requestAnimationFrame(animateScroll);
  };

  return (
    <div
      ref={containerRef}
      style={{
        height: "100vh",
        width: "100vw",
        overflowY: "auto",
        overflowX: "hidden",
        background: theme.bg,
        color: theme.text,
        fontFamily: "'Segoe UI', Roboto, sans-serif",
        position: "relative",
      }}
    >
      <CNCBackground />

      {/* NAVBAR FIXA */}
      <nav
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "15px 40px",
          position: "sticky",
          top: 0,
          background: isDarkMode
            ? "rgba(30,30,30,0.95)"
            : "rgba(255,255,255,0.95)",
          backdropFilter: "blur(10px)",
          borderBottom: `1px solid ${theme.border}`,
          zIndex: 1000,
          boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
        }}
      >
        <div
          onClick={() => {
            if (containerRef.current)
              containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
          }}
          style={{
            fontSize: "1.5rem",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            gap: "10px",
            cursor: "pointer",
          }}
        >
          {/* LOGO IDÊNTICO AO FAVICON (ÍCONE MAXIMIZADO) */}
          <div
            onClick={() => smoothScrollToTop(2500)} // <--- Defina o tempo aqui (2000ms = 2 segundos)
            style={{
              width: "40px",
              height: "40px",
              background: "#007bff",
              borderRadius: "10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(0,123,255,0.4)",
              cursor: "pointer",
              transition: "transform 0.2s, box-shadow 0.2s",
              marginRight: "12px",
              // Adicionei um padding pequeno para o ícone não tocar nas bordas
              padding: "2px",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scale(1.05)";
              e.currentTarget.style.boxShadow =
                "0 6px 15px rgba(0,123,255,0.5)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow =
                "0 4px 12px rgba(0,123,255,0.4)";
            }}
          >
            {/* Usei width/height 100% para ocupar todo o quadrado azul */}
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 64 64"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* AJUSTE CRÍTICO AQUI: Aumentei a escala para 2.4 e ajustei a posição para (2,2) */}
              <g transform="translate(2, 2) scale(2.4)">
                {/* Linhas de Conexão */}
                <path
                  d="M4 4 L20 7"
                  stroke="white"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
                <path
                  d="M4 4 L11 11"
                  stroke="white"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
                <path
                  d="M4 4 L6 16"
                  stroke="white"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
                <path
                  d="M20 7 L11 11"
                  stroke="white"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
                <path
                  d="M20 7 L19 17"
                  stroke="white"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
                <path
                  d="M11 11 L6 16"
                  stroke="white"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
                <path
                  d="M11 11 L19 17"
                  stroke="white"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
                <path
                  d="M11 11 L12 21"
                  stroke="white"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
                <path
                  d="M6 16 L12 21"
                  stroke="white"
                  strokeWidth="1"
                  strokeLinecap="round"
                />
                <path
                  d="M19 17 L12 21"
                  stroke="white"
                  strokeWidth="1"
                  strokeLinecap="round"
                />

                {/* Nós (Círculos) */}
                <circle cx="4" cy="4" r="2" fill="white" />
                <circle cx="20" cy="7" r="2" stroke="white" strokeWidth="1" />
                <circle cx="11" cy="11" r="2" stroke="white" strokeWidth="1" />
                <circle cx="6" cy="16" r="2" fill="white" />
                <circle cx="19" cy="17" r="2" fill="white" />
                <circle cx="12" cy="21" r="2" stroke="white" strokeWidth="1" />
              </g>
            </svg>
          </div>

          {/* TEXTO DO LOGO */}
          <div
            onClick={() => smoothScrollToTop(2500)}
            style={{
              fontFamily: "'Inter', 'Segoe UI', sans-serif",
              letterSpacing: "-0.5px",
              fontWeight: 800,
              fontSize: "1.4rem",
              cursor: "pointer",
              color: theme.text,
            }}
          >
            AutoNest Hub
          </div>
        </div>

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div style={{ display: "flex", gap: "5px", marginRight: "20px" }}>
            <button
              onClick={() => scrollToSection("origin")}
              style={navButtonStyle}
            >
              {t.nav.origin}
            </button>
            <button
              onClick={() => scrollToSection("features")}
              style={navButtonStyle}
            >
              {t.nav.features}
            </button>
            <button
              onClick={() => scrollToSection("pricing")}
              style={navButtonStyle}
            >
              {t.nav.pricing}
            </button>
            <button
              onClick={() => scrollToSection("contact")}
              style={navButtonStyle}
            >
              {t.nav.contact}
            </button>
          </div>

          <select
            value={lang}
            onChange={handleLanguageChange}
            style={{
              // Fundo dinâmico: Escuro no Dark Mode, Claro no Light Mode
              background: isDarkMode ? "#333" : "#f0f2f5",
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: "6px",
              padding: "6px 12px", // Um pouco mais de espaço para ficar elegante
              cursor: "pointer",
              fontWeight: "600",
              fontSize: "0.9rem",
              marginRight: "15px",
              outline: "none", // Remove a borda de seleção azul padrão do browser
            }}
          >
            {/* Estilizando as opções internas para não ficarem brancas no tema escuro */}
            <option
              value="pt"
              style={{
                background: isDarkMode ? "#333" : "#fff",
                color: theme.text,
              }}
            >
              🇧🇷 PT
            </option>
            <option
              value="en"
              style={{
                background: isDarkMode ? "#333" : "#fff",
                color: theme.text,
              }}
            >
              🇺🇸 EN
            </option>
            <option
              value="es"
              style={{
                background: isDarkMode ? "#333" : "#fff",
                color: theme.text,
              }}
            >
              🇪🇸 ES
            </option>
          </select>

          <button
            onClick={() => navigate("/login")}
            style={{
              background: "transparent",
              border: `1px solid ${theme.border}`,
              color: theme.text,
              cursor: "pointer",
              padding: "8px 20px",
              borderRadius: "6px",
              fontWeight: "600",
              marginRight: "10px",
            }}
          >
            {t.nav.login}
          </button>
          <button
            onClick={() => navigate("/register")}
            style={{
              padding: "8px 20px",
              background: "#007bff",
              border: "none",
              color: "#fff",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "bold",
              boxShadow: "0 2px 5px rgba(0,123,255,0.3)",
            }}
          >
            {t.nav.trial}
          </button>
        </div>
      </nav>

      {/* HERO SECTION */}
      <header id="home" style={{ ...sectionStyle, padding: "120px 20px 80px" }}>
        <h1
          style={{
            fontSize: "3.5rem",
            marginBottom: "20px",
            background: "linear-gradient(90deg, #007bff 0%, #00d2ff 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            lineHeight: 1.2,
            whiteSpace: "pre-line",
            maxWidth: "900px",
          }}
        >
          {t.hero.title}
        </h1>
        <p
          style={{
            fontSize: "1.3rem",
            opacity: 0.8,
            maxWidth: "700px",
            marginBottom: "40px",
            lineHeight: 1.6,
          }}
        >
          {t.hero.subtitle}
        </p>
        <button
          style={buttonPrimary}
          onClick={() => navigate("/register")}
          onMouseEnter={(e) =>
            (e.currentTarget.style.transform = "scale(1.05)")
          }
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          {t.hero.cta}
        </button>
        <p style={{ fontSize: "0.9rem", marginTop: "15px", opacity: 0.6 }}>
          {t.hero.disclaimer}
        </p>
      </header>

      {/* ORIGEM */}
      <section
        id="origin"
        style={{
          ...sectionStyle,
          background: isDarkMode ? "rgba(255,255,255,0.02)" : "#f8f9fa",
          width: "100%",
          maxWidth: "100%",
        }}
      >
        <div style={{ maxWidth: "800px", textAlign: "left" }}>
          <h2
            style={{
              fontSize: "2.5rem",
              marginBottom: "40px",
              textAlign: "center",
              color: theme.text,
            }}
          >
            {t.origin.title}
          </h2>

          <p
            style={{
              fontSize: "1.15rem",
              lineHeight: 1.8,
              marginBottom: "25px",
              color: theme.text,
            }}
          >
            {t.origin.p1}
          </p>
          <p
            style={{
              fontSize: "1.15rem",
              lineHeight: 1.8,
              marginBottom: "25px",
              color: theme.text,
            }}
          >
            {t.origin.p2}
          </p>
          <p
            style={{
              fontSize: "1.15rem",
              lineHeight: 1.8,
              marginBottom: "25px",
              color: theme.text,
            }}
          >
            {t.origin.p3}
          </p>

          <div
            style={{
              marginTop: "40px",
              padding: "40px",
              background: isDarkMode ? "rgba(0, 123, 255, 0.1)" : "#e3f2fd",
              borderLeft: "5px solid #007bff",
              borderRadius: "8px",
              fontSize: "1.3rem",
              fontWeight: "500",
              fontStyle: "italic",
              textAlign: "center",
              lineHeight: 1.5,
            }}
          >
            "{t.origin.highlight}"
          </div>
        </div>
      </section>

      {/* SHOWCASE */}
      <section
        id="demo"
        style={{ padding: "80px 20px", width: "100%", background: theme.bg }}
      >
        <h2
          style={{
            textAlign: "center",
            fontSize: "2rem",
            marginBottom: "40px",
          }}
        >
          Veja na Prática
        </h2>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "20px",
            flexWrap: "wrap",
            maxWidth: "1200px",
            margin: "0 auto",
          }}
        >
          <div
            style={{
              flex: 2,
              minWidth: "300px",
              aspectRatio: "16/9",
              background: isDarkMode ? "#111" : "#000",
              borderRadius: "12px",
              border: `1px solid ${theme.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
              color: "#fff",
            }}
          >
            <div style={{ textAlign: "center", opacity: 0.7 }}>
              <span style={{ fontSize: "3rem" }}>▶️</span>
              <p style={{ marginTop: "10px" }}>Vídeo: Nesting Automático</p>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: "20px",
              minWidth: "250px",
            }}
          >
            <div
              style={{
                flex: 1,
                background: isDarkMode ? "#222" : "#eee",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <small>Clip: Importação</small>
            </div>
            <div
              style={{
                flex: 1,
                background: isDarkMode ? "#222" : "#eee",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <small>Clip: Relatórios</small>
            </div>
          </div>
        </div>
      </section>

      {/* FUNCIONALIDADES */}
      <section
        id="features"
        style={{
          ...sectionStyle,
          background: isDarkMode ? "rgba(255,255,255,0.03)" : "#f8f9fa",
          width: "100%",
          maxWidth: "100%",
        }}
      >
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <h2 style={{ fontSize: "2.5rem", marginBottom: "15px" }}>
            {t.features.title}
          </h2>
          <p style={{ fontSize: "1.1rem", opacity: 0.7, marginBottom: "60px" }}>
            {t.features.subtitle}
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
              gap: "30px",
              width: "100%",
            }}
          >
            {t.features.list.map((item, idx) => (
              <div
                key={idx}
                style={{
                  ...cardStyle,
                  textAlign: "left",
                  alignItems: "flex-start",
                  transition: "transform 0.2s, box-shadow 0.2s",
                  cursor: "default",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-5px)";
                  e.currentTarget.style.boxShadow = isDarkMode
                    ? "0 10px 30px rgba(0,0,0,0.5)"
                    : "0 10px 30px rgba(0,0,0,0.15)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                  e.currentTarget.style.border = `1px solid ${theme.border}`;
                }}
              >
                <div style={{ fontSize: "2.5rem", marginBottom: "15px" }}>
                  {item.icon}
                </div>
                <h3
                  style={{
                    fontSize: "1.25rem",
                    marginBottom: "10px",
                    color: isDarkMode ? "#66b2ff" : "#0056b3",
                  }}
                >
                  {item.title}
                </h3>
                <p
                  style={{ opacity: 0.8, lineHeight: 1.6, fontSize: "0.95rem" }}
                >
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PREÇOS */}
      <section id="pricing" style={sectionStyle}>
        <h2
          style={{
            fontSize: "2.5rem",
            marginBottom: "15px",
            color: theme.text,
          }}
        >
          {t.pricing.title}
        </h2>
        <p
          style={{
            fontSize: "1.1rem",
            opacity: 0.7,
            marginBottom: "60px",
            color: theme.text,
          }}
        >
          {t.pricing.subtitle}
        </p>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "30px",
            justifyContent: "center",
            alignItems: "flex-start",
          }}
        >
          {/* TRIAL */}
          <div
            style={{
              ...cardStyle,
              borderTop: "5px solid #6c757d",
              maxWidth: "350px",
              textAlign: "center",
              alignItems: "center",
            }}
          >
            <h3
              style={{
                fontSize: "1.5rem",
                opacity: 0.8,
                marginTop: "10px",
                color: theme.text,
              }}
            >
              {t.pricing.trial.name}
            </h3>
            <div
              style={{
                fontSize: "3rem",
                fontWeight: "bold",
                margin: "20px 0",
                color: theme.text,
              }}
            >
              {t.pricing.trial.price}
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                lineHeight: 2,
                marginBottom: "30px",
                flex: 1,
                textAlign: "left",
                width: "100%",
                color: theme.text,
              }}
            >
              {t.pricing.trial.features.map((feat, i) => (
                <li
                  key={i}
                  style={{
                    borderBottom: `1px dashed ${theme.border}`,
                    padding: "5px 0",
                  }}
                >
                  {feat}
                </li>
              ))}
            </ul>
            <button
              onClick={() => navigate("/register")}
              style={{
                ...buttonPrimary,
                background: "transparent",
                border: `2px solid ${theme.text}`,
                color: theme.text,
                width: "100%",
              }}
            >
              {t.pricing.trial.cta}
            </button>
          </div>

          {/* PREMIUM */}
          <div
            style={{
              ...cardStyle,
              borderTop: "5px solid #007bff",
              transform: "scale(1.05)",
              zIndex: 2,
              maxWidth: "350px",
              position: "relative",
              textAlign: "center",
              alignItems: "center",
              boxShadow: "0 10px 40px rgba(0,123,255,0.2)",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: -15,
                right: "50%",
                transform: "translateX(50%)",
                background: "#007bff",
                color: "white",
                padding: "5px 15px",
                borderRadius: "20px",
                fontSize: "0.8rem",
                fontWeight: "bold",
              }}
            >
              {t.pricing.premium.badge}
            </div>
            <h3
              style={{
                fontSize: "1.5rem",
                color: "#007bff",
                marginTop: "10px",
              }}
            >
              {t.pricing.premium.name}
            </h3>
            <div
              style={{
                fontSize: "3rem",
                fontWeight: "bold",
                margin: "20px 0",
                color: theme.text,
              }}
            >
              {t.pricing.premium.price}
              <span style={{ fontSize: "1rem", opacity: 0.5 }}>
                {t.pricing.month}
              </span>
            </div>
            <ul
              style={{
                listStyle: "none",
                padding: 0,
                lineHeight: 2,
                marginBottom: "30px",
                flex: 1,
                textAlign: "left",
                width: "100%",
                color: theme.text,
              }}
            >
              {t.pricing.premium.features.map((feat, i) => (
                <li
                  key={i}
                  style={{
                    borderBottom: `1px dashed ${theme.border}`,
                    padding: "5px 0",
                  }}
                >
                  {feat}
                </li>
              ))}
            </ul>
            {/* BOTÃO PREMIUM ATUALIZADO */}
            <button
              onClick={buyPremium}
              style={{ ...buttonPrimary, width: "100%" }}
            >
              {t.pricing.premium.cta}
            </button>
          </div>

          {/* CORPORATE */}
          <div
            style={{
              ...cardStyle,
              borderTop: "5px solid #28a745",
              maxWidth: "350px",
              textAlign: "center",
              alignItems: "center",
            }}
          >
            <h3
              style={{
                fontSize: "1.5rem",
                color: "#28a745",
                marginTop: "10px",
              }}
            >
              {t.pricing.corporate.name}
            </h3>

            <div
              style={{
                fontSize: "2.5rem",
                fontWeight: "bold",
                margin: "10px 0",
                color: theme.text,
              }}
            >
              $ {(24.9 + (corpQuantity - 1) * 12).toFixed(2)}
              <span
                style={{ fontSize: "1rem", opacity: 0.5, fontWeight: "normal" }}
              >
                /mês
              </span>
            </div>

            {/* SELETOR QUANTIDADE */}
            <div
              style={{
                marginBottom: "20px",
                width: "100%",
                background: isDarkMode ? "rgba(0,0,0,0.2)" : "#f1f1f1",
                padding: "10px",
                borderRadius: "8px",
              }}
            >
              <label
                style={{
                  display: "block",
                  fontSize: "0.9rem",
                  marginBottom: "5px",
                  color: theme.text,
                }}
              >
                Tamanho da Equipe (2 a 5)
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                }}
              >
                <button
                  onClick={() =>
                    setCorpQuantity((prev) => Math.max(2, prev - 1))
                  }
                  disabled={corpQuantity <= 2}
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    border: "none",
                    cursor: corpQuantity <= 2 ? "not-allowed" : "pointer",
                    fontWeight: "bold",
                    opacity: corpQuantity <= 2 ? 0.5 : 1,
                  }}
                >
                  -
                </button>

                <span
                  style={{
                    fontSize: "1.2rem",
                    fontWeight: "bold",
                    color: theme.text,
                  }}
                >
                  {corpQuantity}
                </span>

                <button
                  onClick={() =>
                    setCorpQuantity((prev) => Math.min(5, prev + 1))
                  }
                  disabled={corpQuantity >= 5}
                  style={{
                    width: "30px",
                    height: "30px",
                    borderRadius: "50%",
                    border: "none",
                    cursor: corpQuantity >= 5 ? "not-allowed" : "pointer",
                    fontWeight: "bold",
                    background: "#28a745",
                    color: "white",
                    opacity: corpQuantity >= 5 ? 0.5 : 1,
                  }}
                >
                  +
                </button>
              </div>
              <div
                style={{
                  fontSize: "0.8rem",
                  marginTop: "5px",
                  color: theme.text,
                  opacity: 0.7,
                }}
              >
                1 Admin + {corpQuantity - 1} Colaborador(es)
              </div>
            </div>

            <ul
              style={{
                listStyle: "none",
                padding: 0,
                lineHeight: 2,
                marginBottom: "30px",
                flex: 1,
                textAlign: "left",
                width: "100%",
                color: theme.text,
              }}
            >
              {t.pricing.corporate.features.map((feat, i) => (
                <li
                  key={i}
                  style={{
                    borderBottom: `1px dashed ${theme.border}`,
                    padding: "5px 0",
                  }}
                >
                  {feat}
                </li>
              ))}
            </ul>

            {/* BOTÃO CORPORATE ATUALIZADO */}
            <button
              onClick={buyCorporate}
              style={{
                ...buttonPrimary,
                background: "transparent",
                border: "2px solid #28a745",
                color: "#28a745",
                width: "100%",
              }}
            >
              {t.pricing.corporate.cta}
            </button>
          </div>
        </div>
      </section>

      {/* CONTATO */}
      <section
        id="contact"
        style={{
          ...sectionStyle,
          background: isDarkMode ? "rgba(0,0,0,0.3)" : "#eee",
          width: "100%",
          maxWidth: "100%",
          padding: "80px 20px",
        }}
      >
        <div style={{ maxWidth: "600px", width: "100%", textAlign: "center" }}>
          <h3
            style={{
              fontSize: "2rem",
              marginBottom: "20px",
              color: theme.text,
            }}
          >
            {t.contact.title}
          </h3>
          <p
            style={{
              lineHeight: 1.6,
              opacity: 0.8,
              marginBottom: "30px",
              fontSize: "1.1rem",
            }}
          >
            {t.contact.desc}
          </p>
          <button
            onClick={() =>
              (window.location.href = "mailto:contato@autonesthub.com")
            }
            style={{
              padding: "15px 30px",
              background: "#28a745",
              border: "none",
              color: "white",
              borderRadius: "6px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "1.1rem",
            }}
          >
            ✉️ {t.contact.cta}
          </button>
        </div>
      </section>

      <footer
        style={{
          padding: "40px 20px",
          textAlign: "center",
          opacity: 0.6,
          borderTop: `1px solid ${theme.border}`,
          background: theme.bg,
        }}
      >
        <p>
          &copy; {new Date().getFullYear()} AutoNest Hub. {t.footer.rights}
        </p>
        <div
          style={{
            marginTop: "10px",
            display: "flex",
            justifyContent: "center",
            gap: "20px",
          }}
        >
          <span style={{ cursor: "pointer" }}>{t.footer.terms}</span>
          <span style={{ cursor: "pointer" }}>{t.footer.privacy}</span>
          <span style={{ cursor: "pointer" }}>{t.footer.support}</span>
        </div>
      </footer>
    </div>
  );
};
