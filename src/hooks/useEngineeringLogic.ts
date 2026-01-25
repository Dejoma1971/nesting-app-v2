/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import DxfParser from "dxf-parser";
import { useAuth } from "../context/AuthContext";

import { EngineeringService } from "../components/menus/engineeringService";
import type {
  BatchDefaults,
  EngineeringScreenProps,
  ImportedPart,
  CustomMaterial,
  CustomThickness,
} from "../components/types";
import {
  processFileToParts,
  applyRotationToPart,
  applyMirrorToPart,
} from "../utils/engineeringUtil";

// LISTAS ESTÁTICAS (Fallback para modo Trial ou erro)
const STATIC_THICKNESS = [
  "28",
  "26",
  "24",
  "22",
  "20",
  "18",
  "16",
  "14",
  '1/8"',
  '3/16"',
  '1/4"',
  '5/16"',
];
const STATIC_MATERIALS = [
  "Inox 304",
  "Inox 430",
  "Aço Carbono",
  "Galvanizado",
  "Alumínio",
];

export const useEngineeringLogic = ({
  parts,
  setParts,
  onSendToNesting,
}: EngineeringScreenProps) => {
  const { user } = useAuth();

  // --- STATES ---
  const [loading, setLoading] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("");
  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [viewingPartId, setViewingPartId] = useState<string | null>(null);

  // Inicia como false (otimista) para evitar bloquear botões enquanto carrega
  const [isTrial, setIsTrial] = useState(false);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);

  const [batchDefaults, setBatchDefaults] = useState<BatchDefaults>({
    pedido: "",
    op: "",
    material: "",
    espessura: "",
    autor: "",
    tipo_producao: "NORMAL",
  });

  // CORREÇÃO: Inicia vazio para não mostrar dados de Trial (estáticos) enquanto carrega
  const [materialList, setMaterialList] = useState<string[]>([]);
  const [thicknessList, setThicknessList] = useState<string[]>([]);

  // --- NOVA FUNÇÃO: REFRESH DATA (Busca dados sem recarregar a página) ---
  const refreshData = useCallback(async () => {
    if (!user || !user.token) return;

    try {
      // 1. Verifica Status da Assinatura
      const subData = await EngineeringService.getSubscriptionStatus(
        user.token,
      );

      if (subData.status === "trial") {
        // MODO TRIAL: Carrega listas estáticas
        setIsTrial(true);
        setMaterialList(STATIC_MATERIALS);
        setThicknessList(STATIC_THICKNESS);
      } else {
        // MODO ASSINANTE: Busca do Banco
        setIsTrial(false);

        // Busca em paralelo para ser mais rápido
        const [mats, thicks] = await Promise.all([
          EngineeringService.getCustomMaterials(user.token),
          EngineeringService.getCustomThicknesses(user.token),
        ]);

        // Processa Materiais
        if (mats && (mats as CustomMaterial[]).length > 0) {
          const nomesUnicos = Array.from(
            new Set((mats as CustomMaterial[]).map((m) => m.nome)),
          );
          setMaterialList(nomesUnicos as string[]);
        } else {
          // Fallback: Se assinante não tiver nada cadastrado, usa estático para não quebrar
          setMaterialList(STATIC_MATERIALS);
        }

        // Processa Espessuras
        if (thicks && (thicks as CustomThickness[]).length > 0) {
          const valoresUnicos = Array.from(
            new Set((thicks as CustomThickness[]).map((t) => t.valor)),
          );
          setThicknessList(valoresUnicos as string[]);
        } else {
          // Fallback
          setThicknessList(STATIC_THICKNESS);
        }
      }
    } catch (err) {
      console.error("Erro ao atualizar dados:", err);
      // Em caso de erro de conexão, garante que as listas tenham algo
      // CORREÇÃO: Usamos 'prev' para não criar dependência e evitar loop infinito
      setMaterialList((prev) => (prev.length === 0 ? STATIC_MATERIALS : prev));
      setThicknessList((prev) => (prev.length === 0 ? STATIC_THICKNESS : prev));
    }
  }, [user]);

  // --- EFFECT: Carrega dados ao iniciar (ou mudar usuário) ---
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // --- HANDLERS ---

  const handleDefaultChange = (field: string, value: any) => {
    setBatchDefaults((prev) => ({ ...prev, [field]: value }));
  };

  // Alteração: Agora aceita um segundo argumento opcional 'idsToUpdate'
  const applyToAll = (field: keyof ImportedPart, idsToUpdate?: string[]) => {
    const value = batchDefaults[field as keyof BatchDefaults];
    if (value === undefined) return;

    // CENÁRIO 1: Aplicação Seletiva (Usuário marcou checkboxes)
    if (idsToUpdate && idsToUpdate.length > 0) {
      if (
        !window.confirm(
          `Confirma a aplicação de "${value}" em ${field.toUpperCase()} apenas para as ${
            idsToUpdate.length
          } peças selecionadas?`,
        )
      )
        return;

      setParts((prev) =>
        prev.map((p) =>
          idsToUpdate.includes(p.id) ? { ...p, [field]: value } : p,
        ),
      );
      return;
    }

    // CENÁRIO 2: Aplicação Total (Ninguém selecionado, comportamento padrão)
    if (
      !window.confirm(
        `Nenhuma seleção detectada.\n\nDeseja aplicar "${value}" em ${field.toUpperCase()} para TODAS as ${
          parts.length
        } peças da lista?`,
      )
    )
      return;

    setParts((prev) => prev.map((p) => ({ ...p, [field]: value })));
  };

  const handleRowChange = (id: string, field: string, value: any) => {
    setParts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );
  };

  const handleDeletePart = (id: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (window.confirm("Deseja realmente remover esta peça do inventário?")) {
      setParts((prev) => prev.filter((p) => p.id !== id));
      if (selectedPartId === id) setSelectedPartId(null);
      if (viewingPartId === id) setViewingPartId(null);
    }
  };

  // --- NOVO: EXCLUSÃO EM MASSA (CORRIGIDO) ---
  const handleBulkDelete = (idsToRemove: string[]) => {
    if (idsToRemove.length === 0) return;

    if (
      window.confirm(
        `Tem certeza que deseja excluir ${idsToRemove.length} peças selecionadas?`,
      )
    ) {
      const newParts = parts.filter((p) => !idsToRemove.includes(p.id));
      setParts(newParts);
    }
  };

  const handleReset = () => {
    if (
      parts.length > 0 &&
      !window.confirm("Isso irá limpar a lista atual. Deseja continuar?")
    ) {
      return;
    }
    setParts([]);
    setSelectedPartId(null);
    setBatchDefaults({
      pedido: "",
      op: "",
      material: "Inox 304",
      espessura: "20",
      autor: "",
      tipo_producao: "NORMAL",
    });
  };

  const handleConvertToBlock = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setParts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        if (p.entities.length === 1 && p.entities[0].type === "INSERT")
          return p;

        const blockName = `BLOCK_${p.id.substring(0, 8).toUpperCase()}`;
        const newBlocks = { ...p.blocks };
        newBlocks[blockName] = { entities: p.entities };

        const insertEntity = {
          type: "INSERT",
          name: blockName,
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1, z: 1 },
          rotation: 0,
        };

        return { ...p, entities: [insertEntity], blocks: newBlocks };
      }),
    );
  };

  const handleConvertAllToBlocks = () => {
    if (
      !window.confirm(
        `Isso irá converter TODAS as peças com múltiplas entidades em Blocos únicos. Deseja continuar?`,
      )
    )
      return;

    setParts((prev) =>
      prev.map((p) => {
        if (p.entities.length === 1 && p.entities[0].type === "INSERT")
          return p;

        const blockName = `BLOCK_${p.id.substring(0, 8).toUpperCase()}`;
        const newBlocks = { ...p.blocks };
        newBlocks[blockName] = { entities: p.entities };

        const insertEntity = {
          type: "INSERT",
          name: blockName,
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1, z: 1 },
          rotation: 0,
        };

        return { ...p, entities: [insertEntity], blocks: newBlocks };
      }),
    );
  };

  const savePartsToDB = async (silent: boolean = false): Promise<boolean> => {
    if (parts.length === 0) {
      if (!silent) alert("A lista está vazia. Importe peças primeiro.");
      return false;
    }

    if (!user || !user.token) {
      alert("Erro de Segurança: Você precisa estar logado para salvar.");
      return false;
    }

    const partsToProcess = parts.map((p) => ({
      ...p,
      tipo_producao: p.tipo_producao || "NORMAL",
      autor: p.autor || batchDefaults.autor || user.name,
    }));

    // 1. Identifica peças que não possuem Pedido, Material ou Espessura
    const invalidParts = partsToProcess.filter(
      (p) =>
        !p.pedido ||
        p.pedido.trim() === "" ||
        !p.material ||
        p.material.trim() === "" ||
        !p.espessura ||
        p.espessura.trim() === "",
    );

    if (invalidParts.length > 0) {
      // 2. Mensagem detalhada para o usuário saber o que falta
      alert(
        `⚠️ AÇÃO BLOQUEADA\n\n` +
          `Existem ${invalidParts.length} peças com informações incompletas.\n\n` +
          `Os campos 'Pedido', 'Material' e 'Espessura' são obrigatórios para salvar no banco de dados.`,
      );
      return false;
    }

    setLoading(true);
    if (!silent) setProcessingMsg("Verificando duplicidades...");

    try {
      const normalParts = partsToProcess.filter(
        (p) => p.tipo_producao === "NORMAL",
      );

      if (normalParts.length > 0) {
        const checkList = normalParts.map((p) => ({
          pedido: p.pedido!,
          nome: p.name,
        }));

        const duplicadas = await EngineeringService.checkPartsExistence(
          user.token,
          checkList,
        );

        if (duplicadas.length > 0) {
          setLoading(false);
          const nomesDuplicados = duplicadas
            .map((d: any) => d.nome_arquivo)
            .slice(0, 5)
            .join(", ");
          const mais =
            duplicadas.length > 5 ? `...e mais ${duplicadas.length - 5}` : "";

          alert(
            `⛔ BLOQUEIO DE DUPLICIDADE\n\n` +
              `Detectamos ${duplicadas.length} peças duplicadas no banco.\n\n` +
              `Peças afetadas: ${nomesDuplicados}${mais}\n\n` +
              `Altere para 'RETRABALHO' se for reposição.`,
          );
          return false;
        }
      }

      if (!silent) setProcessingMsg("Salvando no Banco de Dados...");

      const nonBlocks = partsToProcess.filter((p) => p.entities.length > 1);
      if (nonBlocks.length > 0) {
        setLoading(false);
        alert(
          `ATENÇÃO: Existem ${nonBlocks.length} peças que ainda não são Blocos. Use o botão 📦 Insert/Block.`,
        );
        return false;
      }

      const data = await EngineeringService.saveParts(
        user.token,
        partsToProcess,
      );

      if (!silent)
        alert(
          `✅ SUCESSO!\n\n${
            data.count || parts.length
          } peças registradas com sucesso.`,
        );

      return true;
    } catch (error: any) {
      console.error("Erro:", error);
      alert(`❌ ERRO: ${error.message}`);
      return false;
    } finally {
      setLoading(false);
      setProcessingMsg("");
    }
  };

  const handleStorageDB = () => {
    savePartsToDB(false);
  };

  const handleDirectNesting = async () => {
    if (parts.length === 0) {
      alert("Importe peças antes de cortar.");
      return;
    }

    const nonBlocks = parts.filter((p) => p.entities.length > 1);

    if (nonBlocks.length > 0) {
      alert(
        `⚠️ OTIMIZAÇÃO NECESSÁRIA\n\n` +
          `Detectamos ${nonBlocks.length} geometrias soltas.\n` +
          `Use "📦 Insert/Block" para corrigir.`,
      );
      return;
    }

    setLoading(true);

    try {
      if (!user || !user.token) {
        alert("Usuário não logado.");
        setLoading(false);
        return;
      }

      const subData = await EngineeringService.getSubscriptionStatus(
        user.token,
      );
      const status = subData.status ? subData.status.toLowerCase() : "";

      if (status === "trial" && parts.length > 10) {
        alert(
          `🔒 LIMITE DO TRIAL (MÁX 10 PEÇAS)\n\n` +
            `Você tem ${parts.length} peças na lista.\n` +
            `O modo gratuito permite apenas 10 peças.`,
        );
        setLoading(false);
        return;
      }

      const uniqueOrders = Array.from(
        new Set(parts.map((p) => p.pedido).filter(Boolean)),
      );
      const searchString = uniqueOrders.join(", ");

      onSendToNesting(parts, searchString);
    } catch (error) {
      console.error("Erro na verificação:", error);
      alert("Erro ao verificar permissões de corte.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoToNestingEmpty = () => {
    if (parts.length > 0) {
      if (
        !window.confirm(
          "Ir para o Nesting diretamente NÃO levará estas peças da lista.\n\nDeseja ir para o Nesting vazio?",
        )
      ) {
        return;
      }
    }
    onSendToNesting([], "");
  };

  const handleRotatePart = (direction: "cw" | "ccw") => {
    if (!viewingPartId) return;
    const angle = direction === "cw" ? -90 : 90;
    setParts((prev) =>
      prev.map((p) => {
        if (p.id === viewingPartId) return applyRotationToPart(p, angle);
        return p;
      }),
    );
  };

  const handleMirrorPart = (partId: string) => {
    setParts((prevParts) =>
      prevParts.map((part) => {
        if (part.id === partId) {
          return applyMirrorToPart(part);
        }
        return part;
      }),
    );
  };

  // --- NOVO: ALTERNAR BLOQUEIO DE ROTAÇÃO ---
  const handleToggleRotationLock = (partId: string) => {
    setParts((prev) =>
      prev.map((p) =>
        p.id === partId ? { ...p, isRotationLocked: !p.isRotationLocked } : p,
      ),
    );
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setProcessingMsg("Lendo arquivo...");

    const parser = new DxfParser();
    const newPartsGlobal: ImportedPart[] = [];

    const readers = Array.from(files).map((file) => {
      return new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const content = e.target?.result as string;
            setProcessingMsg(`Processando ${file.name}...`);
            const parsed = parser.parseSync(content);

            if (parsed) {
              // MUDANÇA: Passamos as entidades 'cruas' e os blocos separadamente
              // A função processFileToParts agora cuida de explodir e corrigir espelhamentos
              const partsFromFile = processFileToParts(
                (parsed as any).entities,
                file.name,
                batchDefaults,
                (parsed as any).blocks, // <--- O 4º ARGUMENTO QUE FALTAVA
              );
              newPartsGlobal.push(...partsFromFile);
            }
          } catch (err) {
            console.error(err);
          }
          resolve();
        };
        reader.readAsText(file);
      });
    });

    await Promise.all(readers);
    setParts((prev) => [...prev, ...newPartsGlobal]);
    setLoading(false);
    setProcessingMsg("");
  };

  // --- NOVO: SALVAR PROJETO LOCAL (COM SELEÇÃO DE PASTA) ---
  const handleSaveLocalProject = async () => {
    if (parts.length === 0) {
      alert("A lista está vazia. Nada para salvar.");
      return;
    }

    // Prepara os dados
    const date = new Date().toISOString().slice(0, 10);
    const suggestedName = `projeto_engenharia_${date}.json`;
    const dataStr = JSON.stringify(parts, null, 2);

    try {
      // Tenta usar a API moderna (Abre janela "Salvar Como")
      // Truque: Usamos (window as any) para o TypeScript aceitar a função nova sem reclamar
      const win = window as any;

      if (win.showSaveFilePicker) {
        const handle = await win.showSaveFilePicker({
          suggestedName: suggestedName,
          types: [
            {
              description: "Arquivo de Projeto JSON",
              accept: { "application/json": [".json"] },
            },
          ],
        });

        // Se o usuário escolher um local, escreve o arquivo
        const writable = await handle.createWritable();
        await writable.write(dataStr);
        await writable.close();

        // Sucesso: Sai da função aqui
        return;
      }
    } catch (err: any) {
      // Se o usuário clicar em "Cancelar" na janela, paramos tudo (não faz download)
      if (err.name === "AbortError") return;

      // Se der outro erro, o código segue para o método antigo abaixo (fallback)
      console.warn(
        "API de Salvar Como não suportada ou erro, usando método tradicional.",
      );
    }

    // --- MÉTODO TRADICIONAL (FALLBACK) ---
    // Caso o navegador não suporte a janela de escolha (ex: Firefox)
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = suggestedName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- NOVO: CARREGAR PROJETO LOCAL ---
  const handleLoadLocalProject = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (
      !window.confirm(
        "Isso irá substituir a lista atual pelo arquivo carregado. Deseja continuar?",
      )
    ) {
      event.target.value = ""; // Limpa o input
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const loadedParts = JSON.parse(content);

        // Validação simples para ver se é um arquivo válido do nosso sistema
        if (Array.isArray(loadedParts)) {
          setParts(loadedParts);
          alert("Projeto carregado com sucesso!");
        } else {
          alert("Arquivo inválido ou corrompido.");
        }
      } catch (err) {
        console.error(err);
        alert("Erro ao ler o arquivo.");
      }
    };
    reader.readAsText(file);
    // Limpa o input para permitir carregar o mesmo arquivo novamente se necessário
    event.target.value = "";
  };

  return {
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
    handleConvertToBlock,
    handleConvertAllToBlocks,
    handleStorageDB,
    handleDirectNesting,
    handleGoToNestingEmpty,
    handleRotatePart,
    handleFileUpload,
    materialList,
    thicknessList,
    refreshData,
    handleMirrorPart,
    handleToggleRotationLock,
    handleSaveLocalProject,
    handleLoadLocalProject,
  };
};
