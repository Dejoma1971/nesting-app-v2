import React from "react";
import { useTheme } from "../context/ThemeContext";

export const CNCBackground: React.FC = () => {
 const { isDarkMode } = useTheme();

  // Se não estiver no modo escuro, não renderiza nada.
  if (!isDarkMode) return null;

  // Cor das linhas (um azul/cinza bem sutil baseado no tema)
  // Se quiser mais discreto, diminua o "0.15" para "0.08" ou "0.1"
  const strokeColor = isDarkMode ? "hsla(209, 84%, 83%, 0.12)" : "transparent";

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        overflow: "hidden",
        zIndex: 0, // Fica atrás de tudo
        pointerEvents: "none", // Não interfere no clique do mouse
        opacity: 1, // Controle geral de sutileza
      }}
    >
      {/* Injetamos o estilo da animação aqui */}
      <style>
        {`
          @keyframes drawPath {
            from { stroke-dashoffset: 3000; }
            to { stroke-dashoffset: 0; }
          }
          .cnc-path {
            stroke-dasharray: 3000;
            stroke-dashoffset: 3000;
            animation: drawPath 20s linear infinite forwards;
          }
          /* Atrasa o início de algumas linhas para não começarem juntas */
          .delay-1 { animation-delay: 0s; }
          .delay-2 { animation-delay: 5s; }
          .delay-3 { animation-delay: 10s; }
          .delay-4 { animation-delay: 2s; animation-duration: 35s; }
        `}
      </style>

      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1440 2000" // Viewbox alto para cobrir o scroll
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMin slice" // Garante que cubra a tela sem distorcer
      >
        <g stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" fill="none">
          {/* Caminho 1: Zigue-zague de corte grande */}
          <path
            className="cnc-path delay-1"
            d="M100,-100 L100,300 L500,300 L500,600 L200,600 L200,900 L800,900 L800,1200 L400,1200 L400,1600 L1000,1600 L1000,2100"
          />

          {/* Caminho 2: Peças curvas e círculos (Nesting True Shape) */}
          <path
            className="cnc-path delay-2"
            d="M1200,-200 C1200,100 900,100 900,400 C900,700 1300,700 1300,1000 L1300,1400 C1300,1600 1100,1600 1100,1800 L1100,2200 M950,450 A 50 50 0 1 1 950 550 A 50 50 0 1 1 950 450 M1250,1100 A 80 80 0 1 0 1250 1260 A 80 80 0 1 0 1250 1100"
          />

          {/* Caminho 3: Movimentos rápidos (linhas longas e tracejadas) */}
          <path
            className="cnc-path delay-3"
            strokeDasharray="20, 30" // Linha tracejada para simular movimento rápido
            strokeOpacity="0.5"
            d="M-100,100 L1500,800 M-100,500 L1500,1200 M-100,1500 L1500,2200"
          />

           {/* Caminho 4: Outro padrão de corte descendo pelo meio */}
           <path
            className="cnc-path delay-4"
            d="M600,-50 L600,200 A 100 100 0 0 1 700 300 L1000,300 L1000,500 L700,500 A 50 50 0 0 0 650 550 L650,1300 L300,1300 L300,1800 L800,1800 L800,2300"
          />
        </g>
      </svg>
    </div>
  );
};