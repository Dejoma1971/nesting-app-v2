import React, { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { SidebarMenu } from "./SidebarMenu";

// IMPORTAÇÃO QUE FALTAVA
import type { AppTheme } from "../styles/theme";

// --- INTERFACES ---

// Interface para os itens de dados dentro do Tooltip
interface TooltipPayloadItem {
  name: string;
  value: number | string;
  color: string;
}

// Interface para as props do componente CustomTooltip
interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

interface DashboardScreenProps {
  onNavigate: (
    screen: "home" | "engineering" | "nesting" | "dashboard",
  ) => void;
  onOpenTeam?: () => void;
}

interface DashboardData {
  kpis: {
    chapas: number;
    eficiencia: number;
    peso: number;
    area: number;
    pecas: number;
    pedidos: number;
  };
  breakdown: {
    materiais: { material: string; espessura: string; qtd_chapas: number }[];
    usuarios: { nome: string; chapas_processadas: number }[];
    listaPedidos: {
      pedido: string;
      chapas_envolvidas: number;
      ultima_producao: string;
    }[];
  };
  charts: {
    evolucao: { data: string; chapas: number; eficiencia: number }[];
  };
}

// --- COMPONENTE BOTÃO DE NAVEGAÇÃO ---
const NavButton: React.FC<{
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  theme: AppTheme;
}> = ({ onClick, icon, title, theme }) => {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: "transparent",
        border: `1px solid ${theme.border}`,
        color: theme.text,
        padding: "8px",
        borderRadius: "4px",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.2s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = theme.hoverRow)}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      {icon}
    </button>
  );
};

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onNavigate,
  onOpenTeam,
}) => {
  const { user } = useAuth();
  const { theme } = useTheme();

  // Datas Iniciais (Mês Atual)
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  // Ajuste de Fuso Horário Simples para Input Date
  const formatDateInput = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const [startDate, setStartDate] = useState(formatDateInput(firstDay));
  const [endDate, setEndDate] = useState(formatDateInput(lastDay));

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPedidosModalOpen, setIsPedidosModalOpen] = useState(false);

  useEffect(() => {
    const fetchDashboard = async () => {
      if (!user || !user.token) return;
      setLoading(true);
      try {
        const res = await fetch(
          `http://localhost:3001/api/dashboard/stats?startDate=${startDate}&endDate=${endDate}`,
          {
            headers: { Authorization: `Bearer ${user.token}` },
          },
        );
        if (!res.ok) throw new Error("Falha ao carregar dados");
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, [startDate, endDate, user]);

  // --- ESTILOS ---
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100%",
    background: theme.bg,
    color: theme.text,
    overflowY: "auto",
  };

  const headerStyle: React.CSSProperties = {
    padding: "15px 40px",
    background: theme.headerBg,
    borderBottom: `1px solid ${theme.border}`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px",
  };

  const cardContainerStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "20px",
    padding: "20px 40px",
  };

  const kpiCardStyle: React.CSSProperties = {
    background: theme.panelBg,
    border: `1px solid ${theme.border}`,
    borderRadius: "8px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "5px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
    position: "relative",
  };

  const sectionGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(400px, 1fr))",
    gap: "20px",
    padding: "0 40px 40px 40px",
  };

  const contentCardStyle: React.CSSProperties = {
    background: theme.panelBg,
    border: `1px solid ${theme.border}`,
    borderRadius: "12px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    minHeight: "350px",
    overflow: "hidden",
  };

  const inputDateStyle: React.CSSProperties = {
    padding: "6px",
    borderRadius: "4px",
    border: `1px solid ${theme.border}`,
    background: theme.inputBg,
    color: theme.text,
    fontSize: "13px",
  };

  const tableStyle: React.CSSProperties = {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: "10px",
    fontSize: "13px",
  };

  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "8px",
    borderBottom: `1px solid ${theme.border}`,
    color: theme.label,
  };

  const tdStyle: React.CSSProperties = {
    padding: "8px",
    borderBottom: `1px solid ${theme.border}`,
    color: theme.text,
  };

  // --- COMPONENTES VISUAIS AUXILIARES ---

  const KPICard = ({
    title,
    value,
    unit,
    icon,
    color,
    onClick,
  }: {
    title: string;
    value: string | number;
    unit?: string;
    icon: React.ReactNode;
    color: string;
    onClick?: () => void;
  }) => (
    <div style={kpiCardStyle}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <span style={{ fontSize: "14px", color: theme.label, fontWeight: 600 }}>
          {title}
        </span>
        <div
          style={{
            background: `${color}20`,
            color: color,
            padding: "8px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {icon}
        </div>
      </div>
      <div style={{ fontSize: "28px", fontWeight: "bold", color: theme.text }}>
        {value}
        {unit && (
          <span style={{ fontSize: "14px", color: theme.label, marginLeft: 4 }}>
            {unit}
          </span>
        )}
      </div>
      {onClick && (
        <button
          onClick={onClick}
          style={{
            marginTop: "10px",
            background: "transparent",
            border: `1px solid ${color}`,
            color: color,
            padding: "4px 8px",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "bold",
            alignSelf: "flex-start",
          }}
        >
          Ver Lista ➜
        </button>
      )}
    </div>
  );

  // Formatação customizada para o Tooltip do gráfico
  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            background: theme.panelBg,
            border: `1px solid ${theme.border}`,
            padding: "10px",
            borderRadius: "4px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
          }}
        >
          <p
            style={{ fontWeight: "bold", marginBottom: 5 }}
          >{`Data: ${label}`}</p>
          {payload.map((p) => (
            <p key={p.name} style={{ color: p.color, fontSize: 12 }}>
              {p.name}: {p.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div style={containerStyle}>
      {/* HEADER */}
      <div style={headerStyle}>
        <div>
          <h1 style={{ margin: 0, fontSize: "24px" }}>Dashboard</h1>
          <span style={{ fontSize: "13px", color: theme.label }}>
            Visão geral da produção
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* --- BOTÕES DE NAVEGAÇÃO --- */}
          <div
            style={{
              display: "flex",
              gap: "5px",
              paddingRight: "15px",
              marginRight: "5px",
              borderRight: `1px solid ${theme.border}`,
            }}
          >
            <NavButton
              onClick={() => onNavigate("home")}
              title="Ir para Home"
              theme={theme}
              icon={
                <svg
                  width="18"
                  height="18"
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
              }
            />
            <NavButton
              onClick={() => onNavigate("engineering")}
              title="Ir para Engenharia (Peças)"
              theme={theme}
              icon={
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                </svg>
              }
            />
            <NavButton
              onClick={() => onNavigate("nesting")}
              title="Ir para Nesting (Mesa de Corte)"
              theme={theme}
              icon={
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="7" height="7"></rect>
                  <rect x="14" y="3" width="7" height="7"></rect>
                  <rect x="14" y="14" width="7" height="7"></rect>
                  <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
              }
            />
          </div>
          {/* ----------------------------------- */}

          {/* Filtros de Data */}
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ fontSize: 12, fontWeight: "bold" }}>De:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={inputDateStyle}
            />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
            <span style={{ fontSize: 12, fontWeight: "bold" }}>Até:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={inputDateStyle}
            />
          </div>

          <div
            style={{
              width: 1,
              height: 24,
              background: theme.border,
              margin: "0 5px",
            }}
          />

          <SidebarMenu
            onNavigate={onNavigate}
            onOpenProfile={() => {}}
            onOpenTeam={onOpenTeam}
          />
        </div>
      </div>

      {loading ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <p>Carregando estatísticas...</p>
        </div>
      ) : (
        <>
          {/* KPI CARDS */}
          <div style={cardContainerStyle}>
            <KPICard
              title="Pedidos Processados"
              value={data?.kpis.pedidos || 0}
              unit="ped"
              color="#e83e8c"
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
              }
              onClick={() => setIsPedidosModalOpen(true)}
            />

            <KPICard
              title="Peso Total"
              value={
                data?.kpis.peso.toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                }) || "0"
              }
              unit="kg"
              color="#007bff"
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                </svg>
              }
            />
            <KPICard
              title="Área Cortada"
              value={
                data?.kpis.area.toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                }) || "0"
              }
              unit="m²"
              color="#28a745"
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                </svg>
              }
            />
            <KPICard
              title="Eficiência Global"
              value={data?.kpis.eficiencia.toFixed(1) || "0"}
              unit="%"
              color="#ffc107"
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
              }
            />
            <KPICard
              title="Peças Produzidas"
              value={data?.kpis.pecas || 0}
              unit="und"
              color="#6f42c1"
              icon={
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                  <line x1="7" y1="7" x2="7.01" y2="7"></line>
                </svg>
              }
            />
          </div>

          <div style={sectionGridStyle}>
            {/* GRÁFICO 1: EVOLUÇÃO */}
            <div style={contentCardStyle}>
              <h3 style={{ margin: "0 0 20px 0", fontSize: "16px" }}>
                📈 Evolução Diária (Eficiência vs Chapas)
              </h3>
              <div style={{ flex: 1, width: "100%", minHeight: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={data?.charts.evolucao}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="colorEficiencia"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#8884d8"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="#8884d8"
                          stopOpacity={0}
                        />
                      </linearGradient>
                      <linearGradient
                        id="colorChapas"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#82ca9d"
                          stopOpacity={0.8}
                        />
                        <stop
                          offset="95%"
                          stopColor="#82ca9d"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="data" stroke={theme.label} fontSize={12} />
                    <YAxis stroke={theme.label} fontSize={12} />
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={theme.border}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Area
                      type="monotone"
                      dataKey="eficiencia"
                      name="Eficiência (%)"
                      stroke="#8884d8"
                      fillOpacity={1}
                      fill="url(#colorEficiencia)"
                    />
                    <Area
                      type="monotone"
                      dataKey="chapas"
                      name="Qtd Chapas"
                      stroke="#82ca9d"
                      fillOpacity={1}
                      fill="url(#colorChapas)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* GRÁFICO 2: RANKING USUÁRIOS */}
            <div style={contentCardStyle}>
              <h3 style={{ margin: "0 0 20px 0", fontSize: "16px" }}>
                🏆 Produção por Usuário
              </h3>
              <div style={{ flex: 1, width: "100%", minHeight: "300px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data?.breakdown.usuarios}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={theme.border}
                    />
                    <XAxis type="number" stroke={theme.label} fontSize={12} />
                    <YAxis
                      dataKey="nome"
                      type="category"
                      stroke={theme.label}
                      fontSize={12}
                      width={100}
                    />
                    <Tooltip
                      cursor={{ fill: theme.hoverRow }}
                      contentStyle={{
                        background: theme.panelBg,
                        border: `1px solid ${theme.border}`,
                      }}
                    />
                    <Bar
                      dataKey="chapas_processadas"
                      name="Chapas"
                      fill="#007bff"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* TABELA DE MATERIAIS */}
          <div style={{ padding: "0 40px 40px 40px" }}>
            <div style={contentCardStyle}>
              <h3 style={{ margin: "0 0 10px 0", fontSize: "16px" }}>
                📦 Consumo de Chapas (Material x Espessura)
              </h3>
              <div style={{ overflowX: "auto" }}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Material</th>
                      <th style={thStyle}>Espessura</th>
                      <th style={thStyle}>Quantidade de Chapas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.breakdown.materiais.map((item, index) => (
                      <tr key={index}>
                        <td style={tdStyle}>{item.material}</td>
                        <td style={tdStyle}>{item.espessura}</td>
                        <td style={{ ...tdStyle, fontWeight: "bold" }}>
                          {item.qtd_chapas}
                        </td>
                      </tr>
                    ))}
                    {data?.breakdown.materiais.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          style={{
                            ...tdStyle,
                            textAlign: "center",
                            opacity: 0.6,
                            padding: "20px",
                          }}
                        >
                          Nenhum registro no período.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* MODAL DE LISTA DE PEDIDOS */}
          {isPedidosModalOpen && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                backgroundColor: "rgba(0,0,0,0.7)",
                zIndex: 9999,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
              onClick={() => setIsPedidosModalOpen(false)}
            >
              <div
                style={{
                  background: theme.panelBg,
                  width: "600px",
                  maxHeight: "80vh",
                  borderRadius: "8px",
                  display: "flex",
                  flexDirection: "column",
                  border: `1px solid ${theme.border}`,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    padding: "20px",
                    borderBottom: `1px solid ${theme.border}`,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: "18px" }}>
                    📋 Pedidos Processados
                  </h2>
                  <button
                    onClick={() => setIsPedidosModalOpen(false)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: theme.text,
                      fontSize: "20px",
                      cursor: "pointer",
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div style={{ overflowY: "auto", padding: "20px" }}>
                  <table style={tableStyle}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Pedido</th>
                        <th style={thStyle}>Chapas Geradas</th>
                        <th style={thStyle}>Último Processamento</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data?.breakdown.listaPedidos.map((ped, idx) => (
                        <tr key={idx}>
                          <td style={{ ...tdStyle, fontWeight: "bold" }}>
                            {ped.pedido}
                          </td>
                          <td style={tdStyle}>{ped.chapas_envolvidas}</td>
                          <td style={tdStyle}>
                            {new Date(ped.ultima_producao).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                      {(!data?.breakdown.listaPedidos ||
                        data.breakdown.listaPedidos.length === 0) && (
                        <tr>
                          <td
                            colSpan={3}
                            style={{ ...tdStyle, textAlign: "center" }}
                          >
                            Nenhum pedido encontrado.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
