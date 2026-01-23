/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import {
  calculateBoundingBox,
  detectOpenEndpoints,
  closeOpenPath,
} from "../utils/geometryCore";
import { SubscriptionPanel } from "./SubscriptionPanel";
import { useTheme } from "../context/ThemeContext";
import { SidebarMenu } from "../components/SidebarMenu";
import { MaterialConfigModal } from "../components/MaterialConfigModal";
import type { EngineeringScreenProps, ImportedPart } from "./types";
import { useEngineeringLogic } from "../hooks/useEngineeringLogic"; // Ajuste o caminho se necessário (ex: ../hooks/)
import { TeamManagementScreen } from "../components/TeamManagementScreen";
import { FaPuzzlePiece } from "react-icons/fa";

// Mapeamento amigável para o usuário vs Valor no Banco
const PRODUCTION_TYPES = [
  { label: "Normal", value: "NORMAL" },
  { label: "Peça Extraviada", value: "RETRABALHO_PERDA" },
  { label: "Erro de Processo", value: "RETRABALHO_PROCESSO" },
  { label: "Erro de Projeto", value: "ERRO_ENGENHARIA" },
  { label: "Erro Comercial", value: "ERRO_COMERCIAL" },
  { label: "Correção Cadastro", value: "EDITAR_CADASTRO" },
];

export const EngineeringScreen: React.FC<EngineeringScreenProps> = (props) => {
  const { isDarkMode, theme } = useTheme();
  // Estado para controlar o modal da equipe
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);

  // --- NOVO ESTADO PARA PONTOS ABERTOS ---
  const [openPoints, setOpenPoints] = useState<any[]>([]);

  // ⬇️ --- INSERIR AQUI (Cria o contador para o reset) --- ⬇️
  const [viewKey, setViewKey] = useState(0);
  // ⬆️ -------------------------------------------------- ⬆️
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- [INSERÇÃO 1] ESTADO DE CONFIRMAÇÕES DA SESSÃO ---
  const [sessionApprovals, setSessionApprovals] = useState({
    applyAll: false,
    convertBlock: false,
    bulkDelete: false,
    resetList: false,
  });
  // ----------------------------------------------------

  // 1. Desestruturando tudo do Hook (inclusive as novas listas)
  const {
    user,
    loading,
    processingMsg,
    selectedPartId,
    setSelectedPartId,
    viewingPartId,
    setViewingPartId,
    isTrial,
    isMaterialModalOpen,
    setIsMaterialModalOpen,
    batchDefaults,
    handleDefaultChange,
    applyToAll,
    handleRowChange,
    handleDeletePart,
    handleBulkDelete,
    handleReset,
    handleConvertAllToBlocks,
    handleStorageDB,
    handleDirectNesting,
    handleGoToNestingEmpty,
    handleRotatePart,
    handleMirrorPart,
    handleToggleRotationLock,
    handleFileUpload,
    materialList, // <--- AGORA VAMOS USAR
    thicknessList, // <--- AGORA VAMOS USAR
    refreshData,
    handleSaveLocalProject,
    handleLoadLocalProject,
  } = useEngineeringLogic(props);

  const { parts, onBack, onOpenTeam } = props as any;

  // --- NOVO: EFEITO PARA DETECTAR GEOMETRIA ABERTA NO MODAL ---
  // CORREÇÃO: Removemos 'props.' e usamos as variáveis locais 'parts' e 'viewingPartId'
  React.useEffect(() => {
    const currentPart = parts.find((p: any) => p.id === viewingPartId);

    if (currentPart) {
      const points = detectOpenEndpoints(currentPart.entities);
      setOpenPoints(points);
    } else {
      setOpenPoints([]);
    }
  }, [viewingPartId, parts]);

  // --- [INSERÇÃO 1] EFEITO DE SCROLL AUTOMÁTICO PARA A MINIATURA ---
  React.useEffect(() => {
    if (selectedPartId) {
      // Procura o elemento HTML do card pelo ID único
      const element = document.getElementById(`part-card-${selectedPartId}`);

      if (element) {
        // Rola suavemente até o elemento ficar no centro da visão
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [selectedPartId]);
  // -----------------------------------------------------------------

  // ⬇️ --- INSERIR AQUI (A função que o botão vai chamar) --- ⬇️
  const handleRefreshView = () => {
    setIsRefreshing(true);
    setViewKey((prev) => prev + 1);
    setTimeout(() => setIsRefreshing(false), 700);
    console.log("♻️ Interface da Engenharia recarregada.");
  };
  // ⬆️ ------------------------------------------------------ ⬆️

  // --- NOVO: FUNÇÃO PARA CORRIGIR ---
  // ... dentro do EngineeringScreen.tsx

  const handleFixOpenGeometry = () => {
    // Busca a peça usando viewingPartId diretamente
    const currentPart = parts.find((p: ImportedPart) => p.id === viewingPartId);

    if (!currentPart || openPoints.length < 2) return;

    // 1. Tenta gerar o fechamento inteligente
    const fixedEntities = closeOpenPath(currentPart.entities, openPoints);

    // 2. Verifica se o fechamento ocorreu ou foi abortado por segurança
    if (fixedEntities.length === currentPart.entities.length) {
      // CASO 1: Abertura muito grande (> 1mm). O sistema abortou a edição geométrica.
      alert(
        "Atenção: A abertura é maior que o limite de segurança (1mm).\n\n" +
          "O fechamento automático foi cancelado para evitar riscar a peça incorretamente.\n" +
          "O alerta visual será removido, mas lembre-se que a geometria continua aberta.",
      );
      // NOTA: Não fazemos 'return' aqui. O código segue abaixo para remover o alerta visual (Ignorar).
    } else {
      // CASO 2: Fechamento bem sucedido. Atualizamos a geometria.
      currentPart.entities = fixedEntities;
      // Feedback opcional (pode comentar se achar muito intrusivo)
      // alert("Geometria fechada com sucesso!");
    }

    // 3. Em AMBOS os casos (Corrigido ou Ignorado Automaticamente), removemos a flag de erro.
    // Isso faz a miniatura e a tabela pararem de piscar imediatamente.
    currentPart.hasOpenGeometry = false;

    // 4. Limpa o estado local do modal (some a barra amarela)
    setOpenPoints([]);

    // 5. Força a atualização da tela para refletir a mudança de cor/borda
    refreshData();
  };

  // --- [INSERÇÃO 2] FUNÇÃO INTELIGENTE DE CONFIRMAÇÃO ---
  const executeWithSessionConfirmation = (
    key: keyof typeof sessionApprovals,
    message: string,
    actionFn: () => void,
  ) => {
    if (sessionApprovals[key]) {
      // Já aprovou nesta sessão? Executa direto!
      actionFn();
    } else {
      // Primeira vez? Pede confirmação.
      if (
        window.confirm(
          `${message}\n\n(Esta confirmação não será exigida novamente nesta sessão)`,
        )
      ) {
        setSessionApprovals((prev) => ({ ...prev, [key]: true }));
        actionFn();
      }
    }
  };
  // ------------------------------------------------------

  // --- NOVO: Lógica do Aviso "Cortar Agora" ---
  const [showCutWarning, setShowCutWarning] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleCutNowClick = () => {
    // --- CORREÇÃO 2: Validação de mesa vazia ---
    if (parts.length === 0) {
      alert("Adicione peças antes de cortar!");
      return;
    }
    // -------------------------------------------

    const skip = localStorage.getItem("skipCutNowWarning");

    if (skip === "true") {
      handleDirectNesting();
    } else {
      setShowCutWarning(true);
    }
  };

  const confirmCutNow = () => {
    if (dontShowAgain) {
      localStorage.setItem("skipCutNowWarning", "true");
    }
    setShowCutWarning(false);
    handleDirectNesting();
  };
  // --- NOVO: LÓGICA DE SELEÇÃO MÚLTIPLA (CORRIGIDO) ---
  // Agora o estado aceita array de strings
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // Toggle Individual (Recebe string)
  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id],
    );
  };

  // Toggle Selecionar Tudo
  const toggleSelectAll = () => {
    if (selectedIds.length === parts.length) {
      setSelectedIds([]); // Desmarca tudo
    } else {
      // Agora o map retorna string[], que bate com o tipo do estado
      setSelectedIds(parts.map((p: ImportedPart) => p.id));
    }
  };

  // Executa a exclusão (ALTERADO)
  const executeBulkDelete = () => {
    executeWithSessionConfirmation(
      "bulkDelete",
      `Tem certeza que deseja excluir ${selectedIds.length} itens selecionados?`,
      () => {
        handleBulkDelete(selectedIds);
        setSelectedIds([]); // Limpa a seleção
      },
    );
  };

  // --- RENDER ENTITY FUNCTION ---
  const renderEntity = (
    entity: any,
    index: number,
    blocks?: any,
  ): React.ReactNode => {
    switch (entity.type) {
      case "INSERT": {
        if (!blocks || !blocks[entity.name]) return null;
        const block = blocks[entity.name];
        const bPos = entity.position || { x: 0, y: 0 };
        const bScale = entity.scale?.x || 1;
        const bRot = entity.rotation || 0;
        return (
          <g
            key={index}
            transform={`translate(${bPos.x}, ${bPos.y}) rotate(${bRot}) scale(${bScale})`}
          >
            {block.entities &&
              block.entities.map((child: any, i: number) =>
                renderEntity(child, i, blocks),
              )}
          </g>
        );
      }
      case "LINE":
        return (
          <line
            key={index}
            x1={entity.vertices[0].x}
            y1={entity.vertices[0].y}
            x2={entity.vertices[1].x}
            y2={entity.vertices[1].y}
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        );
      case "LWPOLYLINE":
      case "POLYLINE": {
        if (!entity.vertices) return null;
        const d = entity.vertices
          .map((v: any, i: number) => `${i === 0 ? "M" : "L"} ${v.x} ${v.y}`)
          .join(" ");
        return (
          <path
            key={index}
            d={entity.shape ? d + " Z" : d}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        );
      }
      case "CIRCLE":
        return (
          <circle
            key={index}
            cx={entity.center.x}
            cy={entity.center.y}
            r={entity.radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        );
      case "ARC": {
        const startAngle = entity.startAngle;
        const endAngle = entity.endAngle;
        const r = entity.radius;
        const x1 = entity.center.x + r * Math.cos(startAngle);
        const y1 = entity.center.y + r * Math.sin(startAngle);
        const x2 = entity.center.x + r * Math.cos(endAngle);
        const y2 = entity.center.y + r * Math.sin(endAngle);
        let da = endAngle - startAngle;
        if (da < 0) da += 2 * Math.PI;
        const largeArc = da > Math.PI ? 1 : 0;
        const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
        return (
          <path
            key={index}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        );
      }
      default:
        return null;
    }
  };

  // --- STYLES ---
  const containerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    background: theme.bg,
    color: theme.text,
    fontFamily: "Arial",
  };
  const batchContainerStyle: React.CSSProperties = {
    display: "flex",
    gap: "15px",
    alignItems: "flex-end",
    padding: "15px",
    background: theme.batchBg,
    borderBottom: `1px solid ${theme.border}`,
    flexWrap: "wrap",
  };
  const inputGroupStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "5px",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: theme.label,
    fontWeight: "bold",
  };
  const inputStyle: React.CSSProperties = {
    background: theme.inputBg,
    border: `1px solid ${theme.border}`,
    color: theme.text,
    padding: "5px",
    borderRadius: "4px",
    fontSize: "13px",
    width: "120px",
  };
  const applyButtonStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "#007bff",
    cursor: "pointer",
    fontSize: "10px",
    marginLeft: "5px",
    textDecoration: "underline",
  };
  const splitContainer: React.CSSProperties = {
    display: "flex",
    flex: 1,
    overflow: "hidden",
  };
  const leftPanel: React.CSSProperties = {
    flex: 0.92,
    borderRight: `1px solid ${theme.border}`,
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    background: theme.panelBg,
  };
  const rightPanel: React.CSSProperties = {
    flex: 3,
    display: "flex",
    flexDirection: "column",
    overflowY: "auto",
    background: theme.panelBg,
  };
  const cardStyle: React.CSSProperties = {
    width: "120px",
    height: "120px",
    border: `1px solid ${theme.border}`,
    margin: "10px",
    borderRadius: "4px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: theme.cardBg,
    flexDirection: "column",
    cursor: "pointer",
    transition: "0.2s",
    position: "relative",
    color: theme.text,
  };
  const tableHeaderStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "8px",
    borderBottom: `1px solid ${theme.border}`,
    color: theme.label,
    fontSize: "12px",
    whiteSpace: "nowrap",
  };
  const tableCellStyle: React.CSSProperties = {
    padding: "5px 8px",
    borderBottom: `1px solid ${theme.border}`,
    fontSize: "13px",
  };
  const cellInputStyle: React.CSSProperties = {
    width: "100%",
    background: "transparent",
    border: "none",
    color: "inherit",
    fontSize: "inherit",
    borderBottom: `1px solid ${theme.border}`,
  };

  const viewingPart = viewingPartId
    ? parts.find((p: ImportedPart) => p.id === viewingPartId)
    : null;

  return (
    <div style={containerStyle}>
      <div
        style={{
          padding: "5px 20px",
          borderBottom: `1px solid ${theme.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: theme.headerBg,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <button
            onClick={onBack}
            title="Voltar ao Menu Principal"
            style={{
              background: "transparent",
              border: "none",
              color: theme.text,
              cursor: "pointer",
              fontSize: "24px",
              display: "flex",
              alignItems: "center",
              padding: 0,
            }}
          >
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
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </button>

          {/* --- NOVO ÍCONE MESA DE CORTE --- */}
          <button
            onClick={isTrial ? undefined : handleGoToNestingEmpty}
            title={
              isTrial
                ? "Indisponível no modo Trial"
                : "Ir para a Mesa de Nesting (Buscar peças lá)"
            }
            style={{
              background: "transparent",
              border: "none",
              color: theme.text,
              cursor: isTrial ? "not-allowed" : "pointer",
              fontSize: "24px",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              borderRadius: "4px",
              transition: "background 0.2s",
              opacity: isTrial ? 0.5 : 1,
              marginLeft: "10px",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = theme.hoverRow)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
          >
            <FaPuzzlePiece size={24} />
          </button>
          {/* -------------------------------- */}

          <h2 style={{ margin: 5, fontSize: "20px", color: "#007bff" }}>
            Engenharia & Projetos
          </h2>
          {loading && (
            <span style={{ fontSize: "12px", color: "#007bff" }}>
              ⏳ {processingMsg}
            </span>
          )}
        </div>

        <div
          style={{
            flex: 1,
            margin: "0 40px",
            maxWidth: "500px",
            fontSize: "12px",
          }}
        >
          <SubscriptionPanel isDarkMode={isDarkMode} />
        </div>

        <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
          {/* ⬇️ --- INSERIR O BOTÃO AQUI --- ⬇️ */}
          <button
            onClick={handleRefreshView}
            disabled={isRefreshing}
            title="Recarregar visualização (Destravar interface)"
            style={{
              background: "transparent",
              color: theme.text,
              border: `1px solid ${theme.border}`,
              padding: "8px 10px",
              borderRadius: "4px",
              cursor: isRefreshing ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "16px",
            }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                // Adicionamos transformOrigin e transformBox
                transformOrigin: "center",
                transformBox: "fill-box",
                transition: "transform 0.7s ease",
                transform: isRefreshing ? "rotate(360deg)" : "rotate(0deg)",
              }}
            >
              <path d="M23 4v6h-6"></path>
              <path d="M1 20v-6h6"></path>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
            </svg>
          </button>

          <button
            onClick={() =>
              executeWithSessionConfirmation(
                "resetList",
                "Tem certeza que deseja limpar toda a lista e começar do zero?",
                handleReset,
              )
            }
            style={{
              background: "transparent",
              color: theme.text,
              border: `1px solid ${theme.border}`,
              padding: "8px 15px",
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            ✨ Nova Lista
          </button>
          <button
            onClick={isTrial ? undefined : handleStorageDB}
            title={
              isTrial
                ? "Indisponível no modo Trial"
                : "Salvar no Banco de Dados"
            }
            style={{
              background: "#28a745",
              color: "white",
              border: "none",
              padding: "8px 15px",
              borderRadius: "4px",
              cursor: isTrial ? "not-allowed" : "pointer",
              opacity: isTrial ? 0.5 : 1,
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            💾 Storage DB
          </button>
          <button
            onClick={handleCutNowClick}
            style={{
              background: "#6f42c1",
              color: "white",
              border: "none",
              padding: "8px 15px",
              borderRadius: "4px",
              cursor: "pointer",
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            <FaPuzzlePiece size={24} /> Nesting Now
          </button>
          <SidebarMenu
            onNavigate={(screen) => {
              // Se for "home", usa a função de voltar que já existe
              if (screen === "home" && onBack) {
                onBack();
              }
              // Se for "dashboard" (ou outra), usa a navegação global
              // Usamos (props as any) para evitar erro de TypeScript se você não alterou o types.ts ainda
              else if ((props as any).onNavigate) {
                (props as any).onNavigate(screen);
              }
            }}
            onOpenProfile={() => alert("Perfil do Usuário (Em breve)")}
            onOpenTeam={onOpenTeam}
          />
        </div>
      </div>

      <div style={batchContainerStyle}>
        {/* <div
          style={{
            color: theme.text,
            fontWeight: "bold",
            marginRight: "10px",
            fontSize: "10px",
          }}
        >
          PADRÃO DO LOTE:
        </div> */}
        <div style={inputGroupStyle}>
          <label style={labelStyle}>
            PEDIDO{" "}
            <button
              style={applyButtonStyle}
              // ALTERAÇÃO NO ONCLICK: Passamos 'selectedIds' como segundo parâmetro
              onClick={() =>
                executeWithSessionConfirmation(
                  "applyAll",
                  selectedIds.length > 0
                    ? `Deseja aplicar este PEDIDO nas ${selectedIds.length} peças selecionadas?`
                    : "Deseja aplicar este valor de PEDIDO a todas as peças?",
                  () => applyToAll("pedido", selectedIds), // <--- AQUI ESTÁ O SEGREDO
                )
              }
            >
              {/* ALTERAÇÃO NO TEXTO: Muda conforme a seleção */}
              {selectedIds.length > 0 ? "Aplicar Seleção" : "Aplicar Todos"}
            </button>
          </label>
          <input
            style={inputStyle}
            value={batchDefaults.pedido}
            onChange={(e) => handleDefaultChange("pedido", e.target.value)}
            placeholder="Ex: 35041"
          />
        </div>
        <div style={inputGroupStyle}>
          <label style={labelStyle}>
            OP{" "}
            <button
              style={applyButtonStyle}
              // ALTERAÇÃO NO ONCLICK: Passamos 'selectedIds' como segundo parâmetro
              onClick={() =>
                executeWithSessionConfirmation(
                  "applyAll",
                  selectedIds.length > 0
                    ? `Deseja aplicar este PEDIDO nas ${selectedIds.length} peças selecionadas?`
                    : "Deseja aplicar este valor de PEDIDO a todas as peças?",
                  () => applyToAll("op", selectedIds), // <--- AQUI ESTÁ O SEGREDO
                )
              }
            >
              {/* ALTERAÇÃO NO TEXTO: Muda conforme a seleção */}
              {selectedIds.length > 0 ? "Aplicar Seleção" : "Aplicar Todos"}
            </button>
          </label>
          <input
            style={inputStyle}
            value={batchDefaults.op}
            onChange={(e) => handleDefaultChange("op", e.target.value)}
            placeholder="Ex: 5020"
          />
        </div>

        {/* --- INSERÇÃO: TIPO DE PRODUÇÃO (BATCH) --- */}
        <div style={inputGroupStyle}>
          <label style={labelStyle}>
            TIPO PRODUÇÃO{" "}
            <button
              style={applyButtonStyle}
              // ALTERAÇÃO NO ONCLICK: Passamos 'selectedIds' como segundo parâmetro
              onClick={() =>
                executeWithSessionConfirmation(
                  "applyAll",
                  selectedIds.length > 0
                    ? `Deseja aplicar este PEDIDO nas ${selectedIds.length} peças selecionadas?`
                    : "Deseja aplicar este valor de PEDIDO a todas as peças?",
                  () => applyToAll("tipo_producao", selectedIds), // <--- AQUI ESTÁ O SEGREDO
                )
              }
            >
              {/* ALTERAÇÃO NO TEXTO: Muda conforme a seleção */}
              {selectedIds.length > 0 ? "Aplicar Seleção" : "Aplicar Todos"}
            </button>
          </label>
          <select
            style={{
              ...inputStyle,
              width: "160px",
              background: theme.inputBg,
              color: theme.text,
            }}
            value={batchDefaults.tipo_producao || "NORMAL"}
            onChange={(e) =>
              handleDefaultChange("tipo_producao", e.target.value)
            }
          >
            {PRODUCTION_TYPES.map((pt) => (
              <option key={pt.value} value={pt.value}>
                {pt.label}
              </option>
            ))}
          </select>
        </div>
        {/* ------------------------------------------ */}

        {/* --- SELECT DE MATERIAIS DO LOTE (DINÂMICO) --- */}
        <div style={inputGroupStyle}>
          <label style={labelStyle}>
            MATERIAL{" "}
            <button
              style={applyButtonStyle}
              // ALTERAÇÃO NO ONCLICK: Passamos 'selectedIds' como segundo parâmetro
              onClick={() =>
                executeWithSessionConfirmation(
                  "applyAll",
                  selectedIds.length > 0
                    ? `Deseja aplicar este PEDIDO nas ${selectedIds.length} peças selecionadas?`
                    : "Deseja aplicar este valor de PEDIDO a todas as peças?",
                  () => applyToAll("material", selectedIds), // <--- AQUI ESTÁ O SEGREDO
                )
              }
            >
              {/* ALTERAÇÃO NO TEXTO: Muda conforme a seleção */}
              {selectedIds.length > 0 ? "Aplicar Seleção" : "Aplicar Todos"}
            </button>
          </label>
          <select
            style={{
              ...inputStyle,
              background: theme.inputBg,
              color: theme.text,
            }}
            value={batchDefaults.material}
            onChange={(e) => handleDefaultChange("material", e.target.value)}
          >
            {/* --- INSERÇÃO AQUI --- */}
            <option value="">Selecione...</option>
            {/* --------------------- */}
            {materialList.map((mat) => (
              <option key={mat} value={mat}>
                {mat}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={isTrial ? undefined : () => setIsMaterialModalOpen(true)}
          title={
            isTrial
              ? "Recurso Premium: Cadastrar materiais personalizados"
              : "Configurar Materiais"
          }
          style={{
            background: theme.buttonBg || "transparent",
            border: `1px solid ${theme.border}`,
            color: theme.text,
            borderRadius: "4px",
            width: "30px",
            height: "30px",
            cursor: isTrial ? "not-allowed" : "pointer",
            opacity: isTrial ? 0.5 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "0px",
            marginLeft: "-25px",
            fontSize: "14px",
            fontWeight: "bold",
          }}
        >
          +
        </button>

        {/* --- SELECT DE ESPESSURAS DO LOTE (DINÂMICO) --- */}
        <div style={inputGroupStyle}>
          <label style={labelStyle}>
            ESPESSURA{" "}
            <button
              style={applyButtonStyle}
              // ALTERAÇÃO NO ONCLICK: Passamos 'selectedIds' como segundo parâmetro
              onClick={() =>
                executeWithSessionConfirmation(
                  "applyAll",
                  selectedIds.length > 0
                    ? `Deseja aplicar este PEDIDO nas ${selectedIds.length} peças selecionadas?`
                    : "Deseja aplicar este valor de PEDIDO a todas as peças?",
                  () => applyToAll("espessura", selectedIds), // <--- AQUI ESTÁ O SEGREDO
                )
              }
            >
              {/* ALTERAÇÃO NO TEXTO: Muda conforme a seleção */}
              {selectedIds.length > 0 ? "Aplicar Seleção" : "Aplicar Todos"}
            </button>
          </label>
          <select
            style={{
              ...inputStyle,
              width: "200px",
              background: theme.inputBg,
              color: theme.text,
            }}
            value={batchDefaults.espessura}
            onChange={(e) => handleDefaultChange("espessura", e.target.value)}
          >
            {/* --- INSERÇÃO AQUI --- */}
            <option value="">Selecione...</option>
            {/* --------------------- */}
            {thicknessList.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        <div style={inputGroupStyle}>
          <label style={labelStyle}>
            AUTOR{" "}
            {/* Botão removido, pois a aplicação agora é automática no salvamento */}
          </label>
          <input
            style={inputStyle}
            value={batchDefaults.autor}
            onChange={(e) => handleDefaultChange("autor", e.target.value)}
            placeholder="Ex: Gabriel"
          />
        </div>

        <button
          onClick={() =>
            executeWithSessionConfirmation(
              "convertBlock",
              "Deseja converter todas as geometrias complexas em Blocos/Inserts?",
              handleConvertAllToBlocks,
            )
          }
          title="Converte todas as peças complexas em blocos únicos"
          style={{
            background: "#ffc107",
            color: "#333",
            border: "none",
            padding: "10px 15px",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "bold",
            // --- ALTERAÇÃO AQUI ---
            marginLeft: "auto", // Empurra este botão (e o próximo) para a direita
            marginRight: "10px", // Espaço entre ele e o botão de Importar
            // ----------------------
          }}
        >
          📦 Insert/Block
        </button>
        <label
          style={{
            background: "#007bff",
            color: "white",
            padding: "10px 15px",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: "bold",
            // --- ALTERAÇÃO AQUI ---
            marginLeft: "0", // Removemos o "auto" daqui
            // ----------------------
          }}
        >
          Importar Peças
          <input
            type="file"
            accept=".dxf"
            multiple
            onChange={handleFileUpload}
            style={{ display: "none" }}
          />
        </label>
      </div>

      {/* --- AQUI É ONDE A MÁGICA ACONTECE --- */}
      <div key={viewKey} style={splitContainer}>
        {/* ------------------------------------- */}

        <div style={leftPanel}>
          <div
            style={{
              padding: "10px",
              borderBottom: `1px solid ${theme.border}`,
              fontWeight: "bold",
              fontSize: "11px",
              background: theme.headerBg,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              // --- ALTERAÇÃO: FIXAR NO TOPO ---
              position: "sticky",
              top: 0,
              zIndex: 10,
              // --------------------------------
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              {/* CHECKBOX MESTRE (Selecionar Tudo) */}
              <input
                type="checkbox"
                checked={
                  parts.length > 0 && selectedIds.length === parts.length
                }
                onChange={toggleSelectAll}
                disabled={parts.length === 0}
                style={{ cursor: "pointer" }}
              />
              <span>VISUALIZAÇÃO ({parts.length})</span>
            </div>

            {/* BOTÃO LIXEIRA (Só aparece se tiver seleção) */}
            {selectedIds.length > 0 && (
              <button
                onClick={executeBulkDelete}
                title={`Excluir ${selectedIds.length} itens selecionados`}
                style={{
                  background: "#ffebee",
                  border: "1px solid #ffcdd2",
                  color: "#d32f2f",
                  borderRadius: "4px",
                  padding: "4px 8px",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: "bold",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                }}
              >
                🗑️ Excluir ({selectedIds.length})
              </button>
            )}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              padding: "10px",
              alignContent: "flex-start",
            }}
          >
            {parts.map((part: ImportedPart, idx: number) => {
              const box = calculateBoundingBox(part.entities, part.blocks);
              const w = box.maxX - box.minX || 100;
              const h = box.maxY - box.minY || 100;
              const p = Math.max(w, h) * 0.1;
              const viewBox = `${box.minX - p} ${box.minY - p} ${w + p * 2} ${
                h + p * 2
              }`;
              const isSelected = part.id === selectedPartId;

              return (
                <div
                  // --- [INSERÇÃO 2] ADICIONE ESTA LINHA AQUI ---
                  id={`part-card-${part.id}`}
                  // ---------------------------------------------
                  key={part.id}
                  // ADICIONE ESTA LINHA (Aplica a classe de animação se tiver erro):
                  className={
                    part.hasOpenGeometry ? "open-geometry-warning" : ""
                  }
                  style={{
                    ...cardStyle,
                    // ALTERE A LÓGICA DA BORDA PARA INCLUIR O AMARELO:
                    borderColor: selectedIds.includes(part.id)
                      ? "#d32f2f" // Vermelho (Selecionado para excluir)
                      : isSelected
                        ? "#007bff" // Azul (Selecionado clicado)
                        : part.hasOpenGeometry
                          ? "#ffc107" // Amarelo (Aviso de Geometria) <--- NOVO
                          : theme.border, // Padrão

                    background: selectedIds.includes(part.id)
                      ? "rgba(220, 53, 69, 0.08)"
                      : theme.cardBg,
                    boxShadow: isSelected
                      ? "0 0 0 2px rgba(0,123,255,0.5)"
                      : "none",
                    transform: isSelected ? "scale(1.05)" : "scale(1)",
                    zIndex: isSelected ? 1 : 0,
                  }}
                  title={part.name}
                  onClick={() => setSelectedPartId(part.id)}
                >
                  {/* CHECKBOX INDIVIDUAL */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation(); // Não seleciona o card (azul)
                      toggleSelection(part.id);
                    }}
                    style={{
                      position: "absolute",
                      top: 12,
                      left: -1,
                      zIndex: 20,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(part.id)}
                      readOnly
                      style={{
                        cursor: "pointer",
                        width: "14px",
                        height: "14px",
                      }}
                    />
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      top: 2,
                      left: 2,
                      fontSize: "9px",
                      color: isSelected ? "#007bff" : theme.label,
                      fontWeight: "bold",
                    }}
                  >
                    #{idx + 1}
                  </div>
                  <div
                    style={{
                      position: "absolute",
                      top: 5,
                      right: 5,
                      display: "flex",
                      flexDirection: "column",
                      gap: 5,
                      zIndex: 10,
                    }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingPartId(part.id);
                      }}
                      style={{
                        background: "rgba(0,0,0,0.1)",
                        border: `1px solid ${theme.border}`,
                        color: "#007bff",
                        cursor: "pointer",
                        fontSize: "12px",
                        padding: "4px",
                        borderRadius: "3px",
                        width: "24px",
                        height: "24px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Visualizar"
                    >
                      {/* --- REMOVA O 👁️ E COLE ISTO NO LUGAR: --- */}
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                      </svg>
                      {/* ----------------------------------------- */}
                    </button>
                    <button
                      onClick={(e) => handleDeletePart(part.id, e)}
                      style={{
                        background: "rgba(0,0,0,0.1)",
                        border: `1px solid ${theme.border}`,
                        color: "#ff4d4d",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: "bold",
                        padding: "4px",
                        borderRadius: "3px",
                        width: "24px",
                        height: "24px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                      title="Excluir"
                    >
                      ✕
                    </button>
                  </div>
                  <div
                    style={{
                      flex: 1,
                      width: "100%",
                      padding: "5px",
                      boxSizing: "border-box",
                      overflow: "hidden",
                    }}
                  >
                    <svg
                      viewBox={viewBox}
                      style={{ width: "100%", height: "100%" }}
                      transform="scale(1, -1)"
                      preserveAspectRatio="xMidYMid meet"
                    >
                      {part.entities.map((ent: any, i: number) =>
                        renderEntity(ent, i, part.blocks),
                      )}
                    </svg>
                  </div>
                  {/* --- VISUALIZAÇÃO DO CADEADO (SE ESTIVER TRAVADO) --- */}
                  {part.isRotationLocked && (
                    <div
                      title="Rotação Travada (Sentido do Fio)"
                      style={{
                        position: "absolute",
                        bottom: "22px", // Logo acima da barra de dimensão
                        right: "5px",
                        background: "#dc3545", // Vermelho
                        color: "white",
                        borderRadius: "50%",
                        width: "18px",
                        height: "18px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "10px",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                        zIndex: 15,
                        pointerEvents: "none", // Deixa clicar no card através dele
                      }}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <rect
                          x="3"
                          y="11"
                          width="18"
                          height="11"
                          rx="2"
                          ry="2"
                        ></rect>
                        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                      </svg>
                    </div>
                  )}
                  {/* ---------------------------------------------------- */}
                  <div
                    style={{
                      width: "100%",
                      background: isSelected ? "#007bff" : "rgba(0,0,0,0.1)",
                      color: isSelected ? "#fff" : "inherit",
                      padding: "2px 5px",
                      fontSize: "9px",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      textAlign: "center",
                    }}
                  >
                    {part.width.toFixed(0)}x{part.height.toFixed(0)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={rightPanel}>
          <div
            style={{
              padding: "5px 10px",
              borderBottom: `1px solid ${theme.border}`,
              fontWeight: "bold",
              fontSize: "12px",
              background: theme.headerBg,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              // --- ALTERAÇÃO: FIXAR NO TOPO ---
              position: "sticky",
              top: 0,
              zIndex: 10,
              // --------------------------------
            }}
          >
            <span>CADASTRO TÉCNICO</span>

            {/* --- ÁREA DA DIREITA: LOADING + BOTÕES DE ARQUIVO --- */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {/* Mensagem de Carregamento (se houver) */}
              {loading && (
                <span
                  style={{
                    color: "#ffd700",
                    fontSize: "11px",
                    marginRight: "5px",
                  }}
                >
                  ⏳ {processingMsg}
                </span>
              )}

              {/* Botão SALVAR */}
              <button
                onClick={handleSaveLocalProject}
                title="Salvar projeto (Backup Local)"
                style={{
                  background: "transparent",
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                  borderRadius: "4px",
                  padding: "5px 8px",
                  cursor: "pointer",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = theme.hoverRow)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                💾 Salvar
              </button>

              {/* Botão ABRIR (Input Escondido) */}
              <label
                title="Abrir projeto do computador"
                style={{
                  background: "transparent",
                  border: `1px solid ${theme.border}`,
                  color: theme.text,
                  borderRadius: "4px",
                  padding: "5px 8px",
                  cursor: "pointer",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "5px",
                  marginBottom: 0, // Reset de estilo padrão de label
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = theme.hoverRow)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.background = "transparent")
                }
              >
                📂 Abrir
                <input
                  type="file"
                  accept=".json"
                  onChange={handleLoadLocalProject}
                  style={{ display: "none" }}
                />
              </label>
            </div>
            {/* ---------------------------------------------------- */}
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              {/* ------------------------------------------- */}
              <tr style={{ background: theme.hoverRow }}>
                {/* --- INSERÇÃO: CHECKBOX MESTRE NA TABELA --- */}
                <th
                  style={{
                    ...tableHeaderStyle,
                    width: "30px",
                    textAlign: "center",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      parts.length > 0 && selectedIds.length === parts.length
                    }
                    onChange={toggleSelectAll}
                    disabled={parts.length === 0}
                    style={{ cursor: "pointer" }}
                  />
                </th>
                <th style={tableHeaderStyle}>#</th>
                <th style={{ ...tableHeaderStyle, width: "150px" }}>
                  Nome Peça
                </th>
                <th style={{ ...tableHeaderStyle, width: "80px" }}>Pedido</th>
                <th style={{ ...tableHeaderStyle, width: "80px" }}>OP</th>
                {/* --- INSERIR ESTE TH --- */}
                <th style={{ ...tableHeaderStyle, width: "140px" }}>
                  Tipo Produção
                </th>
                {/* ----------------------- */}
                <th style={{ ...tableHeaderStyle, width: "180px" }}>
                  Material
                </th>
                <th style={{ ...tableHeaderStyle, width: "250px" }}>
                  Espessura.
                </th>
                <th
                  style={{
                    ...tableHeaderStyle,
                    width: "60px",
                    color: theme.text,
                  }}
                >
                  Qtd.
                </th>
                <th style={tableHeaderStyle}>Dimensões</th>
                <th style={tableHeaderStyle}>Área (m²)</th>
                <th style={tableHeaderStyle} title="Complexidade da peça">
                  Entity
                </th>
              </tr>
            </thead>
            <tbody>
              {parts.map((part: ImportedPart, i: number) => {
                const isSelected = part.id === selectedPartId;
                // --- INSERIR LOGICA DE COR ---
                const isRetrabalho =
                  part.tipo_producao && part.tipo_producao !== "NORMAL";
                const textColor = isRetrabalho ? "#f81010ff" : "inherit"; // Texto vermelho se retrabalho

                // Ajustar background para destacar retrabalho
                const rowBackground = isSelected
                  ? theme.selectedRow
                  : isRetrabalho
                    ? "rgba(220, 53, 69, 0.08)" // Fundo levemente avermelhado
                    : i % 2 === 0
                      ? "transparent"
                      : theme.hoverRow;
                // -----------------------------

                const entCount = part.entities.length;
                const entColor =
                  entCount === 1
                    ? "#28a745"
                    : entCount > 10
                      ? "#ff4d4d"
                      : theme.label;

                return (
                  <tr
                    key={part.id}
                    // ADICIONE ESTA LINHA (Aplica a classe na linha da tabela):
                    className={
                      part.hasOpenGeometry ? "open-geometry-warning" : ""
                    }
                    style={{ background: rowBackground, cursor: "pointer" }}
                    onClick={() => setSelectedPartId(part.id)}
                  >
                    {/* --- INSERÇÃO: CHECKBOX INDIVIDUAL NA LINHA --- */}
                    <td
                      style={{ ...tableCellStyle, textAlign: "center" }}
                      onClick={(e) => {
                        e.stopPropagation(); // Evita selecionar a linha (azul) ao clicar no checkbox
                        toggleSelection(part.id);
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(part.id)}
                        readOnly // O controle é feito pelo onClick do pai (td) ou div
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    {/* ---------------------------------------------- */}
                    <td
                      style={{
                        ...tableCellStyle,
                        fontSize: "11px",
                        opacity: 0.5,
                      }}
                    >
                      {i + 1}
                    </td>
                    <td style={tableCellStyle}>
                      <input
                        style={{
                          ...cellInputStyle,
                          fontSize: "10px", // <--- ADICIONE ESTA LINHA AQUI (pode testar 10px, 11px...)
                        }}
                        value={part.name}
                        onChange={(e) =>
                          handleRowChange(part.id, "name", e.target.value)
                        }
                      />
                    </td>
                    <td style={tableCellStyle}>
                      <input
                        style={cellInputStyle}
                        value={part.pedido || ""}
                        onChange={(e) =>
                          handleRowChange(part.id, "pedido", e.target.value)
                        }
                      />
                    </td>
                    <td style={tableCellStyle}>
                      <input
                        style={cellInputStyle}
                        value={part.op || ""}
                        onChange={(e) =>
                          handleRowChange(part.id, "op", e.target.value)
                        }
                      />
                    </td>

                    {/* --- INSERÇÃO: CÉLULA TIPO PRODUÇÃO --- */}
                    <td style={tableCellStyle}>
                      <select
                        style={{
                          ...cellInputStyle,
                          width: "100%",
                          border: "none",
                          background: "transparent",
                          color: textColor, // Usa a cor vermelha se necessário
                          fontWeight: isRetrabalho ? "bold" : "normal",
                          fontSize: "12px",
                        }}
                        value={part.tipo_producao || "NORMAL"}
                        onChange={(e) =>
                          handleRowChange(
                            part.id,
                            "tipo_producao",
                            e.target.value,
                          )
                        }
                      >
                        {PRODUCTION_TYPES.map((pt) => (
                          <option
                            key={pt.value}
                            value={pt.value}
                            style={{
                              background: theme.cardBg,
                              color: theme.text,
                            }}
                          >
                            {pt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    {/* -------------------------------------- */}

                    {/* --- TABELA: SELECT MATERIAL DINÂMICO --- */}
                    <td style={tableCellStyle}>
                      <select
                        style={{
                          ...cellInputStyle,
                          width: "100%",
                          border: "none",
                          background: "transparent",
                          color: theme.text,
                        }}
                        value={part.material}
                        onChange={(e) =>
                          handleRowChange(part.id, "material", e.target.value)
                        }
                      >
                        {/* --- INSERÇÃO AQUI --- */}
                        <option value="">Selecione...</option>
                        {/* --------------------- */}
                        {materialList.map((mat) => (
                          <option
                            key={mat}
                            value={mat}
                            style={{
                              background: theme.cardBg,
                              color: theme.text,
                            }}
                          >
                            {mat}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* --- TABELA: SELECT ESPESSURA DINÂMICO --- */}
                    <td style={tableCellStyle}>
                      <select
                        style={{
                          ...cellInputStyle,
                          background: "transparent",
                          color: theme.text,
                        }}
                        value={part.espessura}
                        onChange={(e) =>
                          handleRowChange(part.id, "espessura", e.target.value)
                        }
                      >
                        {/* --- INSERÇÃO AQUI --- */}
                        <option value="">Selecione...</option>
                        {/* --------------------- */}
                        {thicknessList.map((opt) => (
                          <option
                            key={opt}
                            value={opt}
                            style={{
                              background: theme.cardBg,
                              color: theme.text,
                            }}
                          >
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td style={tableCellStyle}>
                      <input
                        type="number"
                        min="1"
                        value={part.quantity || 1}
                        onChange={(e) =>
                          handleRowChange(
                            part.id,
                            "quantity",
                            Number(e.target.value),
                          )
                        }
                        style={{
                          ...cellInputStyle,
                          textAlign: "center",
                          fontWeight: "bold",
                          color: theme.text,
                          fontSize: "10px",
                        }}
                      />
                    </td>

                    <td
                      style={{
                        ...tableCellStyle,
                        fontSize: "10px",
                        opacity: 0.7,
                      }}
                    >
                      {part.width.toFixed(0)} x {part.height.toFixed(0)}
                    </td>
                    <td
                      style={{
                        ...tableCellStyle,
                        fontSize: "10px",
                        opacity: 0.7,
                      }}
                    >
                      {(part.grossArea / 1000000).toFixed(4)}
                    </td>
                    <td
                      style={{
                        ...tableCellStyle,
                        color: entColor,
                        fontWeight: "bold",
                        textAlign: "center",
                        fontSize: "11px",
                      }}
                    >
                      {entCount}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {viewingPart && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            background: theme.modalOverlay,
            zIndex: 9999,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <div
            style={{
              background: theme.modalBg,
              width: "80%",
              height: "80%",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 0 20px rgba(0,0,0,0.5)",
              border: `1px solid ${theme.border}`,
            }}
          >
            <div
              style={{
                padding: "15px",
                borderBottom: `1px solid ${theme.border}`,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <h3 style={{ margin: 0, color: theme.text }}>
                Visualização e Ajuste
              </h3>
              <button
                onClick={() => setViewingPartId(null)}
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

            {/* ------------------------------------------------------------------ */}
            {/* MUDANÇA 4: Inserir o Alerta de Corrente Quebrada AQUI              */}
            {/* ------------------------------------------------------------------ */}
            {openPoints.length > 0 && (
              <div
                style={{
                  background: "#fff3cd",
                  color: "#856404",
                  padding: "10px 15px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: "1px solid #ffeeba",
                  animation: "fadeIn 0.3s",
                }}
              >
                <div
                  style={{ display: "flex", alignItems: "center", gap: "10px" }}
                >
                  {/* Ícone de Corrente Quebrada */}
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#d9534f"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    <line
                      x1="11"
                      y1="13"
                      x2="13"
                      y2="11"
                      stroke="#fff"
                      strokeWidth="3"
                    />
                  </svg>

                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontWeight: "bold", fontSize: "13px" }}>
                      Atenção: Perímetro Aberto
                    </span>
                    <span style={{ fontSize: "11px" }}>
                      Detectadas {openPoints.length} pontas soltas.
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px" }}>
                  {/* <button
                    onClick={() => setOpenPoints([])}
                    style={{
                      background: "transparent",
                      border: "1px solid #856404",
                      color: "#856404",
                      padding: "5px 10px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      cursor: "pointer",
                      fontWeight: "bold",
                    }}
                  >
                    Ignorar
                  </button> */}
                  <button
                    onClick={handleFixOpenGeometry}
                    style={{
                      background: "#d9534f",
                      border: "none",
                      color: "white",
                      padding: "5px 10px",
                      borderRadius: "4px",
                      fontSize: "11px",
                      cursor: "pointer",
                      fontWeight: "bold",
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                    }}
                  >
                    Fechar Peça
                  </button>
                </div>
              </div>
            )}
            {/* ------------------------------------------------------------------ */}

            <div
              style={{
                flex: 1,
                position: "relative",
                background: theme.inputBg,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                padding: "20px",
                minHeight: 0,
                overflow: "hidden",
              }}
            >
              {(() => {
                const box = calculateBoundingBox(
                  viewingPart.entities,
                  viewingPart.blocks,
                );
                const w = box.maxX - box.minX || 100;
                const h = box.maxY - box.minY || 100;
                const p = Math.max(w, h) * 0.2;
                const viewBox = `${box.minX - p} ${box.minY - p} ${w + p * 2} ${
                  h + p * 2
                }`;
                return (
                  <svg
                    viewBox={viewBox}
                    style={{
                      width: "100%",
                      height: "100%",
                      maxWidth: "100%",
                      maxHeight: "100%",
                    }}
                    transform="scale(1, -1)"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    {viewingPart.entities.map((ent: any, i: number) =>
                      renderEntity(ent, i, viewingPart.blocks),
                    )}

                    {/* ------------------------------------------------------------------ */}
                    {/* MUDANÇA 5: Marcadores de erro (Bolinhas vermelhas)                 */}
                    {/* ------------------------------------------------------------------ */}
                    {openPoints.map((p, idx) => (
                      <circle
                        key={`open-${idx}`}
                        cx={p.x}
                        cy={p.y}
                        r={Math.max((viewingPart.width || 100) / 40, 3)}
                        fill="#d9534f"
                        stroke="white"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                      >
                        <title>Ponta Solta</title>
                        <animate
                          attributeName="r"
                          values="3;6;3"
                          dur="1.5s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    ))}
                    {/* ------------------------------------------------------------------ */}
                  </svg>
                );
              })()}
            </div>
            <div
              style={{
                padding: "20px",
                borderTop: `1px solid ${theme.border}`,
                display: "flex",
                justifyContent: "center",
                gap: "10px",
                background: theme.modalBg,
                flexShrink: 0,
                alignItems: "center",
              }}
            >
              {/* --- NOVO: BOTÃO CADEADO (SENTIDO DO FIO) --- */}
              <button
                onClick={() => handleToggleRotationLock(viewingPart.id)}
                title={
                  viewingPart.isRotationLocked
                    ? "Destravar Rotação"
                    : "Travar Rotação (Sentido do Fio)"
                }
                style={{
                  padding: "8px",
                  background: viewingPart.isRotationLocked
                    ? "#dc3545"
                    : "transparent",
                  color: viewingPart.isRotationLocked ? "#fff" : theme.text,
                  border: `1px solid ${
                    viewingPart.isRotationLocked ? "#dc3545" : theme.border
                  }`,
                  borderRadius: "4px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: "10px",
                  transition: "all 0.2s",
                }}
              >
                {viewingPart.isRotationLocked ? (
                  // CADEADO FECHADO
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
                    <rect
                      x="3"
                      y="11"
                      width="18"
                      height="11"
                      rx="2"
                      ry="2"
                    ></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                  </svg>
                ) : (
                  // CADEADO ABERTO
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
                    <rect
                      x="3"
                      y="11"
                      width="18"
                      height="11"
                      rx="2"
                      ry="2"
                    ></rect>
                    <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
                  </svg>
                )}
              </button>

              <button
                onClick={() =>
                  !viewingPart.isRotationLocked && handleRotatePart("ccw")
                }
                disabled={viewingPart.isRotationLocked}
                title="Girar Anti-Horário (90°)"
                style={{
                  padding: "10px 20px",
                  background: theme.inputBg,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: "4px",
                  cursor: viewingPart.isRotationLocked
                    ? "not-allowed"
                    : "pointer",
                  opacity: viewingPart.isRotationLocked ? 0.5 : 1,
                }}
              >
                ↺ Girar Anti-Horário
              </button>

              <button
                onClick={() =>
                  !viewingPart.isRotationLocked && handleRotatePart("cw")
                }
                disabled={viewingPart.isRotationLocked}
                title="Girar Horário (90°)"
                style={{
                  padding: "10px 20px",
                  background: theme.inputBg,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: "4px",
                  cursor: viewingPart.isRotationLocked
                    ? "not-allowed"
                    : "pointer",
                  opacity: viewingPart.isRotationLocked ? 0.5 : 1,
                }}
              >
                ↻ Girar Horário
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleMirrorPart(viewingPart.id);
                }}
                title="Espelhar (Flip Horizontal)"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "6px 12px",
                  marginLeft: "5px",
                  borderRadius: "4px",
                  border: `1px solid ${theme.border || "#ccc"}`,
                  backgroundColor: theme.buttonBg || "#f0f0f0",
                  color: theme.text || "#333",
                  cursor: "pointer",
                }}
              >
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
                  <path d="M7.5 12h9" />
                  <path d="M16.5 7.5L21 12l-4.5 4.5" />
                  <path d="M7.5 7.5L3 12l4.5 4.5" />
                  <line x1="12" y1="4" x2="12" y2="20" strokeDasharray="2 2" />
                </svg>
                <span style={{ marginLeft: "5px" }}>Espelhar</span>
              </button>

              <button
                onClick={() => setViewingPartId(null)}
                style={{
                  padding: "10px 20px",
                  background: "#007bff",
                  color: "#fff",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  marginLeft: "20px",
                }}
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL DE ALERTA: CORTAR AGORA --- */}
      {showCutWarning && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.6)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              backgroundColor: theme.modalBg || "#fff",
              color: theme.text || "#000",
              padding: "25px",
              borderRadius: "8px",
              maxWidth: "450px",
              width: "90%",
              boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
              border: `1px solid ${theme.border}`,
            }}
          >
            <h3 style={{ marginTop: 0, color: "#d9534f" }}>
              ⚠️ Modo Rápido (Sem Histórico)
            </h3>

            <p style={{ lineHeight: "1.5", fontSize: "14px", opacity: 0.9 }}>
              Você escolheu a opção <strong>"Cortar Agora"</strong>.
            </p>
            <p style={{ lineHeight: "1.5", fontSize: "14px", opacity: 0.9 }}>
              Neste modo, as peças <strong>NÃO serão salvas</strong> no Banco de
              Dados. Consequentemente, esta produção não aparecerá nos
              relatórios de custos, retrabalho ou rastreabilidade de pedidos.
            </p>
            <p style={{ lineHeight: "1.5", fontSize: "14px", opacity: 0.9 }}>
              Deseja prosseguir mesmo assim?
            </p>

            <div
              style={{
                margin: "20px 0",
                display: "flex",
                alignItems: "center",
              }}
            >
              <input
                type="checkbox"
                id="dontShowAgain"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                style={{
                  width: "18px",
                  height: "18px",
                  marginRight: "10px",
                  cursor: "pointer",
                }}
              />
              <label
                htmlFor="dontShowAgain"
                style={{
                  cursor: "pointer",
                  userSelect: "none",
                  fontSize: "13px",
                }}
              >
                Não mostrar esta mensagem novamente
              </label>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
              }}
            >
              <button
                onClick={() => setShowCutWarning(false)}
                style={{
                  padding: "10px 20px",
                  border: `1px solid ${theme.border}`,
                  borderRadius: "4px",
                  backgroundColor: theme.inputBg,
                  color: theme.text,
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmCutNow}
                style={{
                  padding: "10px 20px",
                  border: "none",
                  borderRadius: "4px",
                  backgroundColor: "#d9534f",
                  color: "#fff",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                Continuar sem Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- Fim do Modal --- */}

      {isMaterialModalOpen && (
        <MaterialConfigModal
          user={user}
          theme={theme}
          onClose={() => setIsMaterialModalOpen(false)}
          onUpdate={() => {
            console.log("Atualizando listas...");
            refreshData(); // <--- AGORA SIM: ATUALIZA SEM RECARREGAR
          }}
        />
      )}

      {/* SE O ESTADO FOR TRUE, MOSTRA O MODAL DE EQUIPE */}
      {isTeamModalOpen && (
        <TeamManagementScreen onClose={() => setIsTeamModalOpen(false)} />
      )}
    </div>
  );
};
