import React, { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ComposedChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { SidebarMenu } from "./SidebarMenu";

// --- INTERFACES ---
interface DashboardData {
  resumo: {
    totalEntrada: number;
    totalSaida: number;
    saldo: number;
  };
  engenharia: {
    usuario: string;
    qtd_pedidos_entrada: number;
    qtd_pecas_entrada: number;
  }[];
  producao: {
    usuario: string;
    qtd_pedidos_processados: number;
    qtd_chapas_geradas: number;
    eficiencia_media: number;
    consumo_medio: number;
  }[];
  // --- ATUALIZADO PARA O NOVO RELATÓRIO DETALHADO ---
  estudoConsumo: {
    material: string;
    espessura: string;
    largura_chapa: number; // NOVO
    altura_chapa: number; // NOVO
    total_chapas: number;
    avg_aproveitamento: number;
    avg_consumo: number; // NOVO
    total_retalho_m2: number;
  }[];
}

interface DashboardScreenProps {
  onNavigate: (
    screen: "home" | "engineering" | "nesting" | "dashboard",
  ) => void;
  onOpenTeam?: () => void;
}

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884d8"];

export const DashboardScreen: React.FC<DashboardScreenProps> = ({
  onNavigate,
  onOpenTeam,
}) => {
  const { user } = useAuth();
  const { theme } = useTheme();

  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      if (!user?.token) return;
      setLoading(true);
      try {
        const res = await fetch(
          `http://localhost:3001/api/dashboard/stats?startDate=${startDate}&endDate=${endDate}`,
          {
            headers: { Authorization: `Bearer ${user.token}` },
          },
        );
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Erro ao buscar dados:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [startDate, endDate, user]);

  // --- ESTILOS ---
  const mainContainerStyle: React.CSSProperties = {
    background: theme.bg,
    color: theme.text,
    height: "100vh",
    width: "100%",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  };

  const scrollableContentStyle: React.CSSProperties = {
    flex: 1,
    overflowY: "auto",
    padding: "30px 40px 80px 40px",
  };

  const cardStyle: React.CSSProperties = {
    background: theme.panelBg,
    border: `1px solid ${theme.border}`,
    borderRadius: "12px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    height: "420px",
    boxShadow: "0 4px 6px rgba(0,0,0,0.1)",
  };

  const kpiCardStyle: React.CSSProperties = {
    background: theme.panelBg,
    border: `1px solid ${theme.border}`,
    borderRadius: "12px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
  };

  const navButtonStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: theme.text,
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "bold",
    padding: "8px 12px",
    borderRadius: "6px",
  };

 // Função auxiliar para converter espessura em "Gauge" aproximado
  const getGaugeLabel = (thickness: string | number) => {
    // 1. Garante que é string, troca vírgula por ponto para o cálculo matemático
    const safeThickness = String(thickness).replace(",", ".");
    const t = parseFloat(safeThickness);

    // Se não for um número válido após a conversão, retorna o texto original
    if (isNaN(t)) return thickness;

    // Tabela aproximada de bitolas MSG para mm
    if (t >= 0.55 && t <= 0.65) return `#24 (${thickness}mm)`;
    if (t >= 0.70 && t <= 0.80) return `#22 (${thickness}mm)`;
    if (t >= 0.85 && t <= 0.95) return `#20 (${thickness}mm)`;
    if (t >= 1.15 && t <= 1.25) return `#18 (${thickness}mm)`;
    if (t >= 1.45 && t <= 1.55) return `#16 (${thickness}mm)`;
    if (t >= 1.85 && t <= 2.05) return `#14 (${thickness}mm)`;
    if (t >= 2.60 && t <= 2.70) return `#12 (${thickness}mm)`;
    
    return `${thickness}mm`;
  };

  return (
    <div style={mainContainerStyle}>
      {/* HEADER FIXO */}
      <div
        style={{
          padding: "15px 40px",
          background: theme.headerBg,
          borderBottom: `1px solid ${theme.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "22px" }}>Dashboard</h1>
            <p style={{ color: theme.label, margin: 0, fontSize: "12px" }}>
              Visão Geral
            </p>
          </div>

          <div style={{ display: "flex", gap: "5px", marginLeft: "20px", borderLeft: `1px solid ${theme.border}`, paddingLeft: "20px" }}>
             <button onClick={() => onNavigate("home")} style={{...navButtonStyle, color: "#007bff"}}>🏠 Home</button>
             <button onClick={() => onNavigate("engineering")} style={navButtonStyle}>🛠️ Engenharia</button>
             <button onClick={() => onNavigate("nesting")} style={navButtonStyle}>🧩 Nesting</button>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <div style={{ display: "flex", gap: "10px" }}>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={{ padding: "6px", borderRadius: "4px", background: theme.inputBg, color: theme.text, border: `1px solid ${theme.border}` }}
            />
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              style={{ padding: "6px", borderRadius: "4px", background: theme.inputBg, color: theme.text, border: `1px solid ${theme.border}` }}
            />
          </div>
          <SidebarMenu onNavigate={onNavigate} onOpenProfile={() => {}} onOpenTeam={onOpenTeam} />
        </div>
      </div>

      {/* CORPO COM SCROLL */}
      <div style={scrollableContentStyle}>
        {loading ? (
          <div style={{ padding: "100px", textAlign: "center" }}>Carregando estatísticas...</div>
        ) : (
          data && (
            <>
              {/* KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))", gap: "20px", marginBottom: "30px" }}>
                <div style={{ ...kpiCardStyle, borderLeft: "6px solid #007bff" }}>
                  <span style={{ fontSize: "14px", color: theme.label }}>Entrada (Engenharia)</span>
                  <h2 style={{ fontSize: "32px", margin: "5px 0" }}>{data.resumo.totalEntrada} <small style={{ fontSize: "14px", fontWeight: "normal" }}>pedidos</small></h2>
                </div>
                <div style={{ ...kpiCardStyle, borderLeft: "6px solid #28a745" }}>
                  <span style={{ fontSize: "14px", color: theme.label }}>Saída (Nesting)</span>
                  <h2 style={{ fontSize: "32px", margin: "5px 0" }}>{data.resumo.totalSaida} <small style={{ fontSize: "14px", fontWeight: "normal" }}>pedidos</small></h2>
                </div>
                <div style={{ ...kpiCardStyle, borderLeft: `6px solid ${data.resumo.saldo >= 0 ? "#ffc107" : "#dc3545"}` }}>
                  <span style={{ fontSize: "14px", color: theme.label }}>Saldo em Aberto</span>
                  <h2 style={{ fontSize: "32px", margin: "5px 0" }}>{data.resumo.saldo}</h2>
                </div>
              </div>

              {/* GRÁFICOS */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(450px, 1fr))", gap: "20px", marginBottom: "30px" }}>
                <div style={cardStyle}>
                  <h3 style={{ marginBottom: "20px", fontSize: "16px" }}>Produtividade: Entrada por Usuário</h3>
                  <div style={{ width: "100%", height: "300px" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.engenharia}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.border} />
                        <XAxis dataKey="usuario" stroke={theme.text} fontSize={11} />
                        <YAxis stroke={theme.text} fontSize={11} />
                        <Tooltip contentStyle={{ background: theme.panelBg, border: `1px solid ${theme.border}` }} />
                        <Bar dataKey="qtd_pedidos_entrada" name="Pedidos" fill="#007bff" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div style={cardStyle}>
                  <h3 style={{ marginBottom: "20px", fontSize: "16px" }}>Produtividade: Nesting por Usuário</h3>
                  <div style={{ width: "100%", height: "300px" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={data.producao}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme.border} />
                        <XAxis dataKey="usuario" stroke={theme.text} fontSize={11} />
                        <YAxis yAxisId="left" stroke={theme.text} fontSize={11} />
                        <YAxis yAxisId="right" orientation="right" stroke="#ffc107" fontSize={11} />
                        <Tooltip contentStyle={{ background: theme.panelBg, border: `1px solid ${theme.border}` }} />
                        <Legend wrapperStyle={{ fontSize: "12px" }} />
                        <Bar yAxisId="left" dataKey="qtd_pedidos_processados" name="Pedidos" fill="#28a745" radius={[4, 4, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="eficiencia_media" name="Efic. %" stroke="#ffc107" strokeWidth={3} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* BLOCO 3: RELATÓRIO DE CHAPAS CONSUMIDAS (ATUALIZADO) */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "20px", marginBottom: "30px" }}>
                
                {/* GRÁFICO DE PIZZA (RESUMO POR MATERIAL) */}
                <div style={cardStyle}>
                  <h3 style={{ fontSize: "16px", marginBottom: "10px" }}>Materiais mais Usados (Qtd Chapas)</h3>
                  <div style={{ width: "100%", height: "300px" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.estudoConsumo}
                          dataKey="total_chapas"
                          nameKey="material"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          label={({ payload }) => payload.material}
                        >
                          {data.estudoConsumo.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* TABELA DETALHADA */}
                <div style={{ ...cardStyle, height: "auto", minHeight: "420px" }}>
                  <h3 style={{ fontSize: "16px", marginBottom: "15px" }}>Relação de Chapas Consumidas</h3>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                      <thead>
                        <tr style={{ textAlign: "left", color: theme.label, borderBottom: `1px solid ${theme.border}` }}>
                          <th style={{ padding: "10px" }}>Material / Bitola</th>
                          <th style={{ padding: "10px" }}>Dimensão (mm)</th>
                          <th style={{ padding: "10px" }}>Qtd</th>
                          <th style={{ padding: "10px" }}>Aprov.</th>
                          <th style={{ padding: "10px" }}>Consumo</th>
                          <th style={{ padding: "10px" }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.estudoConsumo.map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            {/* Material e Espessura */}
                            <td style={{ padding: "12px" }}>
                              <div style={{ fontWeight: "bold" }}>{item.material}</div>
                              <small style={{ opacity: 0.7 }}>{getGaugeLabel(item.espessura)}</small>
                            </td>

                            {/* Dimensão da Chapa (Novo) */}
                            <td style={{ padding: "12px" }}>
                               {item.largura_chapa} x {item.altura_chapa}
                            </td>

                            {/* Quantidade */}
                            <td style={{ padding: "12px", fontWeight: "bold" }}>
                                {item.total_chapas}
                            </td>

                            {/* Aproveitamento Global */}
                            <td style={{ fontWeight: "bold", color: item.avg_aproveitamento > 80 ? "#28a745" : "#ffc107" }}>
                              {Number(item.avg_aproveitamento).toFixed(1)}%
                            </td>

                            {/* Consumo da Chapa (Novo) */}
                            <td style={{ fontWeight: "bold", color: theme.text }}>
                               {item.avg_consumo ? Number(item.avg_consumo).toFixed(1) + "%" : "-"}
                            </td>

                            {/* Barra Visual */}
                            <td>
                              <div style={{ width: "60px", height: "6px", background: theme.border, borderRadius: "3px", overflow: "hidden" }}>
                                <div style={{ width: `${Math.min(item.avg_aproveitamento, 100)}%`, height: "100%", background: item.avg_aproveitamento > 80 ? "#28a745" : "#ffc107" }} />
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </>
          )
        )}
      </div>
    </div>
  );
};