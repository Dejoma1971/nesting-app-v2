/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import DxfParser from "dxf-parser";
import { useAuth } from "../context/AuthContext";
import { flattenGeometry } from "../utils/geometryCore";
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
  const [isTrial, setIsTrial] = useState(false);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);

  const [batchDefaults, setBatchDefaults] = useState<BatchDefaults>({
    pedido: "",
    op: "",
    material: "Inox 304",
    espessura: "20",
    autor: "",
    tipo_producao: "NORMAL",
  });

  // Estados das Listas Dinâmicas
  const [materialList, setMaterialList] = useState<string[]>(STATIC_MATERIALS);
  const [thicknessList, setThicknessList] =
    useState<string[]>(STATIC_THICKNESS);

  // --- NOVA FUNÇÃO: REFRESH DATA (Busca dados sem recarregar a página) ---
  const refreshData = useCallback(async () => {
    if (!user || !user.token) return;

    try {
      // 1. Verifica Status da Assinatura
      const subData = await EngineeringService.getSubscriptionStatus(
        user.token
      );

      if (subData.status === "trial") {
        // MODO TRIAL: Usa listas estáticas
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
            new Set((mats as CustomMaterial[]).map((m) => m.nome))
          );
          setMaterialList(nomesUnicos as string[]);
        }

        // Processa Espessuras
        if (thicks && (thicks as CustomThickness[]).length > 0) {
          const valoresUnicos = Array.from(
            new Set((thicks as CustomThickness[]).map((t) => t.valor))
          );
          setThicknessList(valoresUnicos as string[]);
        }
      }
    } catch (err) {
      console.error("Erro ao atualizar dados:", err);
      // Em caso de erro crítico, mantém o que tem ou fallback
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

  const applyToAll = (field: keyof ImportedPart) => {
    const value = batchDefaults[field as keyof BatchDefaults];
    if (value === undefined) return;
    if (
      !window.confirm(
        `Deseja aplicar "${value}" em ${field.toUpperCase()} para TODAS as ${
          parts.length
        } peças?`
      )
    )
      return;
    setParts((prev) => prev.map((p) => ({ ...p, [field]: value })));
  };

  const handleRowChange = (id: string, field: string, value: any) => {
    setParts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
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
      })
    );
  };

  const handleConvertAllToBlocks = () => {
    if (
      !window.confirm(
        `Isso irá converter TODAS as peças com múltiplas entidades em Blocos únicos. Deseja continuar?`
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
      })
    );
  };

  const savePartsToDB = async (silent: boolean = false): Promise<boolean> => {
    // 1. VALIDAÇÃO BÁSICA
    if (parts.length === 0) {
      if (!silent) alert("A lista está vazia. Importe peças primeiro.");
      return false;
    }

    if (!user || !user.token) {
      alert("Erro de Segurança: Você precisa estar logado para salvar.");
      return false;
    }

    // 2. NORMALIZAÇÃO DE DADOS
    // Garante que campos vazios recebam o padrão antes de validar
    const partsToProcess = parts.map((p) => ({
      ...p,
      tipo_producao: p.tipo_producao || "NORMAL",
      autor: p.autor || batchDefaults.autor || user.name,
    }));

    // 3. VALIDAÇÃO DE CAMPOS OBRIGATÓRIOS (Pedido)
    const invalidParts = partsToProcess.filter(
      (p) => !p.pedido || p.pedido.trim() === ""
    );
    if (invalidParts.length > 0) {
      alert(
        `⚠️ AÇÃO BLOQUEADA\n\nExistem ${invalidParts.length} peças sem o número do 'Pedido'.\nEste campo é obrigatório.`
      );
      return false;
    }

    setLoading(true);
    if (!silent) setProcessingMsg("Verificando duplicidades...");

    try {
      // 4. VALIDAÇÃO INTELIGENTE (PEDIDO + NOME)

      // Filtra apenas as peças marcadas como 'NORMAL'
      // (Se já estiver como Retrabalho, a gente confia no usuário e deixa passar)
      const normalParts = partsToProcess.filter(
        (p) => p.tipo_producao === "NORMAL"
      );

      if (normalParts.length > 0) {
        // Monta lista simples para enviar ao backend
        const checkList = normalParts.map((p) => ({
          pedido: p.pedido!,
          nome: p.name,
        }));

        // Pergunta ao servidor: "Quais destas peças já existem?"
        const duplicadas = await EngineeringService.checkPartsExistence(
          user.token,
          checkList
        );

        if (duplicadas.length > 0) {
          setLoading(false);

          // Formata mensagem de erro amigável
          const nomesDuplicados = duplicadas
            .map((d: any) => d.nome_arquivo)
            .slice(0, 5)
            .join(", ");
          const mais =
            duplicadas.length > 5 ? `...e mais ${duplicadas.length - 5}` : "";

          alert(
            `⛔ BLOQUEIO DE DUPLICIDADE\n\n` +
              `Detectamos ${duplicadas.length} peças que JÁ EXISTEM no banco de dados para os pedidos informados e estão marcadas como 'NORMAL'.\n\n` +
              `Peças afetadas: ${nomesDuplicados}${mais}\n\n` +
              `REGRA:\n` +
              `Você não pode salvar a mesma peça (mesmo nome) no mesmo pedido como produção Normal.\n\n` +
              `SOLUÇÃO:\n` +
              `1. Se for peça de reposição: Mude o Tipo para 'RETRABALHO'.\n` +
              `2. Se for uma peça nova com nome igual: Renomeie o arquivo ou o nome na lista.`
          );
          return false;
        }
      }

      // 5. SALVAR NO BANCO
      if (!silent) setProcessingMsg("Salvando no Banco de Dados...");

      // Verificação de Blocos (Legado)
      const nonBlocks = partsToProcess.filter((p) => p.entities.length > 1);
      if (nonBlocks.length > 0) {
        setLoading(false);
        alert(
          `ATENÇÃO: Existem ${nonBlocks.length} peças que ainda não são Blocos. Use o botão 📦 Insert/Block.`
        );
        return false;
      }

      const data = await EngineeringService.saveParts(
        user.token,
        partsToProcess
      );

      if (!silent)
        alert(
          `✅ SUCESSO!\n\n${
            data.count || parts.length
          } peças registradas com sucesso.`
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
          `Detectamos ${nonBlocks.length} peças contendo geometrias soltas (linhas/arcos).\n` +
          `Para garantir a velocidade e segurança do Nesting, o arquivo deve ser simplificado.\n\n` +
          `👉 Por favor, clique no botão amarelo "📦 Insert/Block" acima da lista para corrigir isso automaticamente.`
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
        user.token
      );
      const status = subData.status ? subData.status.toLowerCase() : "";

      if (status === "trial" && parts.length > 10) {
        alert(
          `🔒 LIMITE DO TRIAL (MÁX 10 PEÇAS)\n\n` +
            `Você tem ${parts.length} peças na lista.\n` +
            `O modo gratuito permite enviar apenas 10 peças por vez para o corte.\n\n` +
            `Remova algumas peças ou assine o plano.`
        );
        setLoading(false);
        return;
      }

      const uniqueOrders = Array.from(
        new Set(parts.map((p) => p.pedido).filter(Boolean))
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
          "Você tem peças na lista de engenharia. Ir para o Nesting diretamente NÃO levará estas peças.\n\nDeseja ir para o Nesting vazio?"
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
      })
    );
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
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
              const flatEnts = flattenGeometry(
                (parsed as any).entities,
                (parsed as any).blocks
              );
              const partsFromFile = processFileToParts(
                flatEnts,
                file.name,
                batchDefaults
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
    handleReset,
    handleConvertToBlock,
    handleConvertAllToBlocks,
    handleStorageDB,
    handleDirectNesting,
    handleGoToNestingEmpty,
    handleRotatePart,
    handleFileUpload,
    // EXPORTANDO AS LISTAS E A FUNÇÃO DE REFRESH
    materialList,
    thicknessList,
    refreshData,
  };
};
