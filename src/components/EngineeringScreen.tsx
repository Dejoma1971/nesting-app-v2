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

import { PartViewerModalOptimized } from "../components/PartViewerModalOptimized";

// ⬇️ --- 1. ADICIONE ESTES IMPORTS DO DND --- ⬇️
import {
  DndContext,
  closestCenter,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
// ⬆️ ---------------------------------------- ⬆️

// Mapeamento amigável para o usuário vs Valor no Banco
const PRODUCTION_TYPES = [
  { label: "Normal", value: "NORMAL" },
  { label: "Peça Extraviada", value: "RETRABALHO_PERDA" },
  { label: "Erro de Processo", value: "RETRABALHO_PROCESSO" },
  { label: "Erro de Projeto", value: "ERRO_ENGENHARIA" },
  { label: "Erro Comercial", value: "ERRO_COMERCIAL" },
  { label: "Edição Cadastro", value: "EDITAR_CADASTRO" },
];

// ⬇️ --- 2. ADICIONE ESTE COMPONENTE AUXILIAR (FORA DA FUNÇÃO PRINCIPAL) --- ⬇️
// Este componente cria o "envelope" arrastável mantendo seus estilos originais
const SortablePart = ({ id, style, className, children, ...props }: any) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const combinedStyle = {
    ...style, // Mantém o estilo original do seu Card
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1, // Fica meio transparente quando arrasta
    zIndex: isDragging ? 999 : style.zIndex, // Garante que a peça flutue por cima
    touchAction: "none", // Importante para evitar scroll enquanto arrasta no touch
  };

  return (
    <div
      ref={setNodeRef}
      style={combinedStyle}
      className={className}
      {...attributes}
      {...listeners}
      {...props}
    >
      {children}
    </div>
  );
};
// ⬆️ ----------------------------------------------------------------------- ⬆️

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
    handleDragEnd,
  } = useEngineeringLogic(props);

  // ⬇️ --- 3. CONFIGURAÇÃO DOS SENSORES (Logo após os hooks) --- ⬇️
  // Isso define que o arrasto só começa se mover 10px (evita clique acidental)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    }),
  );
  // ⬆️ --------------------------------------------------------- ⬆️

  const { parts, onBack, onOpenTeam } = props as any;

  // ⬇️ --- [INSERÇÃO CIRÚRGICA] PREENCHIMENTO AUTOMÁTICO DO AUTOR --- ⬇️
  React.useEffect(() => {
    // Se o usuário está logado (tem nome) e o campo autor está vazio...
    if (
      user &&
      user.name &&
      (!batchDefaults.autor || batchDefaults.autor === "")
    ) {
      console.log("👤 Definindo autor automático:", user.name);
      handleDefaultChange("autor", user.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  // ⬆️ --------------------------------------------------------------- ⬆️

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

  // ⬇️ --- SUBSTITUIR ESTA FUNÇÃO INTEIRA --- ⬇️
  const handleRefreshView = (e: React.MouseEvent) => {
    // 1. HARD RESET (Shift + Click)
    if (e.shiftKey) {
      const confirmHard = window.confirm(
        "⚠️ HARD RESET (Shift detectado):\n\nDeseja limpar completamente a lista de peças e reiniciar a tela?",
      );
      if (confirmHard) {
        handleReset(); // Chama a função que já limpa tudo
      }
      return;
    }

    // 2. SOFT RESET (Click Normal - Apenas Visual)
    setIsRefreshing(true);
    setViewKey((prev) => prev + 1);
    setTimeout(() => setIsRefreshing(false), 700);
    console.log("♻️ Interface da Engenharia recarregada (Visual).");
  };
  // ⬆️ -------------------------------------- ⬆️

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

  // --- [INSERÇÃO CIRÚRGICA 1] Lógica de Shift + Click ---

  // Guarda qual foi o último índice clicado (sem Shift)
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(
    null,
  );

  const handleSmartSelection = (
    id: string,
    index: number,
    event: React.MouseEvent,
  ) => {
    // Se Shift estiver pressionado E já houver um último item clicado
    if (event.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);

      // Pega todos os IDs no intervalo entre o último clique e o atual
      const idsInRange = parts
        .slice(start, end + 1)
        .map((p: ImportedPart) => p.id);

      // Adiciona à seleção existente (usando Set para evitar duplicatas)
      setSelectedIds((prev) => Array.from(new Set([...prev, ...idsInRange])));
    } else {
      // Comportamento normal (sem Shift): Alterna e memoriza este índice
      toggleSelection(id);
      setLastSelectedIndex(index);
    }
  };
  // -----------------------------------------------------

  // Executa a exclusão (ALTERADO)
  const executeBulkDelete = () => {
    executeWithSessionConfirmation(
      "bulkDelete",
      `Tem certeza que deseja excluir ${selectedIds.length} itens selecionados?`,
      () => {
        handleBulkDelete(selectedIds, true);
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

  // ⬇️ --- FUNÇÃO DE SALVAMENTO COM VALIDAÇÃO RIGOROSA (ENTITY = 1) --- ⬇️
  const handleSmartSave = async () => {
    // 1. Verificação básica
    if (!parts || parts.length === 0)
      return alert("A lista de peças está vazia!");
    if (!user || !user.token)
      return alert("Erro de autenticação. Faça login novamente.");

    // =================================================================
    // 2. VALIDAÇÃO RIGOROSA (Campos Vazios + Simplificação Obrigatória)
    // =================================================================
    const errorReport: string[] = [];

    parts.forEach((p: any, index: number) => {
      const issues: string[] = [];

      // A) Verifica Campos de Texto Obrigatórios
      if (!p.pedido || String(p.pedido).trim() === "") issues.push("Pedido");
      if (!p.material || String(p.material).trim() === "")
        issues.push("Material");
      if (!p.espessura || String(p.espessura).trim() === "")
        issues.push("Espessura");

      // B) Verifica a Geometria (A NOVA REGRA)
      const entityCount = p.entities ? p.entities.length : 0;

      if (entityCount === 0) {
        issues.push("Desenho Vazio (Sem geometria)");
      } else if (entityCount > 1) {
        // AQUI ESTÁ A TRAVA: Se for maior que 1, obriga a simplificar
        issues.push(`Não simplificada (Entity: ${entityCount})`);
      }

      // Se houver problemas nesta peça, adiciona ao relatório
      if (issues.length > 0) {
        errorReport.push(
          `• Linha ${index + 1} (${p.name}): ${issues.join(", ")}`,
        );
      }
    });

    // SE HOUVER QUALQUER ERRO, MOSTRA O ALERTA E CANCELA O SALVAMENTO
    if (errorReport.length > 0) {
      const maxErrorsToShow = 10;
      const shownErrors = errorReport.slice(0, maxErrorsToShow).join("\n");
      const remaining = errorReport.length - maxErrorsToShow;

      let msg = `⚠️ AÇÃO BLOQUEADA\n\nTodas as peças devem estar simplificadas (Entity = 1) e com os dados preenchidos.\n\nErros encontrados:\n${shownErrors}`;

      if (remaining > 0) {
        msg += `\n\n...e mais ${remaining} peças.`;
      }

      msg += `\n\nSOLUÇÃO:\n1. Clique no botão amarelo "📦 Insert/Block" para simplificar as geometrias.\n2. Preencha Pedido, Material e Espessura.`;

      alert(msg);
      return; // <--- O PULO DO GATO: Bloqueia totalmente o envio ao banco.
    }
    // =================================================================

    const originalText = document.title;
    document.title = "Salvando...";

    try {
      // 3. Verifica duplicidades no banco
      const itensParaVerificar = parts.map((p: any) => ({
        pedido: p.pedido,
        nome: p.name,
      }));

      const resVerify = await fetch(
        "http://localhost:3001/api/pecas/verificar-existencia",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify({ itens: itensParaVerificar }),
        },
      );
      const dataVerify = await resVerify.json();
      const duplicadasNoBanco = dataVerify.duplicadas || [];

      // 4. Prepara dados
      const partsToSave = JSON.parse(JSON.stringify(parts));
      const nameTracker: Record<string, number> = {};

      const partsFinal = partsToSave.map((part: any) => {
        // Garante padrão NORMAL se vazio
        if (!part.tipo_producao) part.tipo_producao = "NORMAL";

        const key = `${part.pedido}|${part.name}`;
        const existsInDb = duplicadasNoBanco.some(
          (d: any) => d.pedido === part.pedido && d.nome_arquivo === part.name,
        );

        // Se for NORMAL e já existir, prepara para renomear (Versionamento)
        // Se for RETRABALHO/EDIÇÃO, mantém o nome para substituir o antigo
        const isNormal = part.tipo_producao === "NORMAL";
        const shouldRenameDb = isNormal && existsInDb;
        const localCount = nameTracker[key] || 0;

        if (shouldRenameDb || localCount > 0) {
          const suffixIndex = (shouldRenameDb ? 1 : 0) + localCount;
          if (suffixIndex > 0) {
            const lastDotIndex = part.name.lastIndexOf(".");
            if (lastDotIndex !== -1) {
              const name = part.name.substring(0, lastDotIndex);
              const ext = part.name.substring(lastDotIndex);
              part.name = `${name} (${suffixIndex})${ext}`;
            } else {
              part.name = `${part.name} (${suffixIndex})`;
            }
          }
        }
        nameTracker[key] = localCount + 1;
        return part;
      });

      // 5. Envia para o servidor
      const resSave = await fetch("http://localhost:3001/api/pecas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`,
        },
        body: JSON.stringify(partsFinal),
      });

      if (!resSave.ok) {
        const errData = await resSave.json();
        if (resSave.status === 400 || resSave.status === 409) {
          alert(`⚠️ Atenção:\n${errData.message || errData.error}`);
        } else {
          throw new Error(errData.error || "Erro ao salvar");
        }
        return;
      }

      const dataSave = await resSave.json();
      alert(`✅ Sucesso! ${dataSave.count} peças salvas.`);
    } catch (error: any) {
      console.error("Erro no Smart Save:", error);
      alert("Erro ao salvar: " + error.message);
    } finally {
      document.title = originalText || "Nesting App";
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
    padding: "5px 15px",
    background: theme.batchBg,
    borderBottom: `1px solid ${theme.border}`,
    flexWrap: "wrap",
  };
  const inputGroupStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "1px",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: theme.label,
    fontWeight: "bold",
  };

  // Defina a altura aqui para controlar TODOS os inputs de uma vez
  const inputHeight = "22px";
  const headerBtnHeight = "32px"; //

  const inputStyle: React.CSSProperties = {
    background: theme.inputBg,
    border: `1px solid ${theme.border}`,
    color: theme.text,
    padding: "0 5px", // <--- Alterado: remove padding vertical para centrar texto
    borderRadius: "4px",
    fontSize: "13px",
    width: "120px",
    height: inputHeight, // <--- Altura Padronizada (30px)
    lineHeight: inputHeight, // <--- Garante que o texto fique no meio verticalmente
    boxSizing: "border-box", // <--- Garante que borda não aumente o tamanho total
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
    // --- [INSERÇÃO] Fixar Cabeçalho da Tabela ---
    position: "sticky",
    top: "36px", // Deslocamento para ficar logo abaixo da barra "CADASTRO TÉCNICO"
    zIndex: 9, // Garante que fique acima das linhas da tabela
    background: theme.panelBg, // Cor de fundo opaca (importante!)
    boxShadow: `0 1px 0 ${theme.border}`, // Garante a linha da borda visível
    // --------------------------------------------
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
          padding: "5px 18px",
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
                : "Ir para a Mesa de Nesting"
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
              // ⬇️ --- ALTERAÇÃO: ALTURA FIXA --- ⬇️
              height: headerBtnHeight,
              width: headerBtnHeight, // Opcional: Deixar quadrado se quiser
              padding: "0", // Remove padding vertical para centrar
              justifyContent: "center", // Garante centro se for quadrado
              // ⬆️ ------------------------------ ⬆️
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
              background: "#dc3545", // Vermelho "Danger" (Bootstrap padrão)
              color: "white", // Texto branco para contraste
              border: "none", // Remove a borda (igual aos outros)
              // ⬇️ --- ALTERAÇÃO: ALTURA FIXA --- ⬇️
              height: headerBtnHeight,
              padding: "0 15px", // Padding apenas lateral
              // ⬆️ ------------------------------ ⬆️
              borderRadius: "4px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              fontWeight: "bold", // Adicionado negrito para padronizar
            }}
            // ⬆️ ------------------------------------------ ⬆️
          >
            🗑️ Deletar Lista
          </button>
          <button
            onClick={isTrial ? undefined : handleSmartSave} // <--- Alterado para a nova função
            title={
              isTrial
                ? "Indisponível no modo Trial"
                : "Salvar no Banco de Dados"
            }
            style={{
              background: "#28a745",
              color: "white",
              border: "none",
              // ⬇️ --- ALTERAÇÃO: ALTURA FIXA --- ⬇️
              height: headerBtnHeight,
              padding: "0 15px",
              // ⬆️ ------------------------------ ⬆️
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
              // ⬇️ --- ALTERAÇÃO: ALTURA FIXA --- ⬇️
              height: headerBtnHeight,
              padding: "0 15px",
              // ⬆️ ------------------------------ ⬆️
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
                  () => applyToAll("pedido", selectedIds, true), // <--- AQUI ESTÁ O SEGREDO
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
                  () => applyToAll("op", selectedIds, true), // <--- AQUI ESTÁ O SEGREDO
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
                  () => applyToAll("tipo_producao", selectedIds, true), // <--- AQUI ESTÁ O SEGREDO
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
                  () => applyToAll("material", selectedIds, true), // <--- AQUI ESTÁ O SEGREDO
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
              width: "220px",
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
            height: inputHeight, // Segue a altura dos inputs
            cursor: isTrial ? "not-allowed" : "pointer",
            opacity: isTrial ? 0.5 : 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            // ⬇️ --- ALTERAÇÃO: ZERAR MARGENS PARA CENTRALIZAR PELO GAP --- ⬇️
            marginBottom: "0px", // Mantém alinhado na base
            marginLeft: "0px", // Remove empurrões manuais
            marginRight: "0px", // Garante que o gap da direita atue
            // ⬆️ -------------------------------------------------------- ⬆️
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
                  () => applyToAll("espessura", selectedIds, true), // <--- AQUI ESTÁ O SEGREDO
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
              width: "170px",
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

        <div
          style={{
            ...inputGroupStyle,
            // ⬇️ --- ALTERAÇÃO: CENTRALIZAR NO ESPAÇO LIVRE --- ⬇️
            marginLeft: "auto",
            marginRight: "auto",
            // ⬆️ ---------------------------------------------- ⬆️
          }}
        >
          <label style={labelStyle}>
            AUTOR{" "}
            {/* Botão removido, pois a aplicação agora é automática no salvamento */}
          </label>
          <input
            style={inputStyle}
            value={batchDefaults.autor}
            onChange={(e) => handleDefaultChange("autor", e.target.value)}
            placeholder="Ex: Matheus"
          />
        </div>

        <label
          style={{
            background: "#007bff",
            color: "white",
            padding: "6px 12px",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "17px",
            fontWeight: "bold",
            alignSelf: "center",
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

        {/* ⬇️ --- SUBSTITUA TUDO DENTRO DA DIV 'leftPanel' POR ISTO: --- ⬇️ */}
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
              position: "sticky",
              top: 0,
              zIndex: 10,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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

          {/* --- AQUI COMEÇA O DRAG AND DROP --- */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={parts} strategy={rectSortingStrategy}>
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
                  const viewBox = `${box.minX - p} ${box.minY - p} ${
                    w + p * 2
                  } ${h + p * 2}`;
                  const isSelected = part.id === selectedPartId;

                  return (
                    <SortablePart
                      key={part.id}
                      id={part.id} // ID Exigido pelo DND
                      // Passamos o ID visual (para o scroll) via prop style ou custom
                      // O SortablePart que criamos repassa props extras para a div
                      // Mas para garantir o scroll, vamos injetar o ID no HTML da div:
                      idHtml={`part-card-${part.id}`}
                      className={
                        part.hasOpenGeometry ? "open-geometry-warning" : ""
                      }
                      style={{
                        ...cardStyle,
                        borderColor: selectedIds.includes(part.id)
                          ? "#d32f2f"
                          : isSelected
                            ? "#007bff"
                            : part.hasOpenGeometry
                              ? "#ffc107"
                              : theme.border,
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
                      {/* CONTEÚDO DO CARD (Igual ao original) */}
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSmartSelection(part.id, idx, e);
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
                          style={{
                            width: "100%",
                            height: "100%",
                            maxWidth: "100%",
                            maxHeight: "100%",
                          }}
                          transform="scale(1, -1)"
                          preserveAspectRatio="xMidYMid meet"
                        >
                          {part.entities.map((ent: any, i: number) =>
                            renderEntity(ent, i, part.blocks),
                          )}
                        </svg>
                      </div>
                      {part.isRotationLocked && (
                        <div
                          title="Rotação Travada (Sentido do Fio)"
                          style={{
                            position: "absolute",
                            bottom: "22px",
                            right: "5px",
                            background: "#dc3545",
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
                            pointerEvents: "none",
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
                      <div
                        style={{
                          width: "100%",
                          background: isSelected
                            ? "#007bff"
                            : "rgba(0,0,0,0.1)",
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
                    </SortablePart>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
        {/* ⬆️ --- FIM DA SUBSTITUIÇÃO DO leftPanel --- ⬆️ */}

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

              <button
                onClick={() =>
                  executeWithSessionConfirmation(
                    "convertBlock",
                    "Deseja converter todas as geometrias complexas em Blocos/Inserts?",
                    () => handleConvertAllToBlocks(true),
                  )
                }
                title="Converte todas as peças complexas em blocos únicos"
                style={{
                  background: "#ffc107",
                  color: "#333",
                  border: "none",
                  padding: "5px 8px",
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
                // --- LOGICA DE COR ATUALIZADA ---
                // Agora consideramos "Retrabalho" apenas se não for NORMAL e não for EDITAR_CADASTRO
                const isRetrabalho =
                  part.tipo_producao &&
                  part.tipo_producao !== "NORMAL" &&
                  part.tipo_producao !== "EDITAR_CADASTRO"; // <--- ADICIONE ESTA LINHA

                const textColor = isRetrabalho ? "theme.text" : "inherit";

                // Ajustar background para destacar apenas retrabalhos reais
                const rowBackground = isSelected
                  ? theme.selectedRow
                  : isRetrabalho
                    ? "rgba(220, 53, 69, 0.08)"
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
                        e.stopPropagation();
                        // MUDANÇA: Passamos o ID, o Index (i) e o Evento (e)
                        handleSmartSelection(part.id, i, e);
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

      {/* --- MODAL DE VISUALIZAÇÃO OTIMIZADO (ISOLADO) --- */}
      {viewingPart && (
        <PartViewerModalOptimized
          part={viewingPart}
          openPoints={openPoints}
          theme={theme}
          onClose={() => setViewingPartId(null)}
          onRotate={handleRotatePart}
          onMirror={handleMirrorPart}
          onToggleLock={handleToggleRotationLock}
          onFixGeometry={handleFixOpenGeometry}
        />
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
