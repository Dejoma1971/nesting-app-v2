/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import DxfParser from "dxf-parser";
import { useAuth } from "../context/AuthContext";
import { flattenGeometry } from "../utils/geometryCore";
import { EngineeringService } from "../components/menus/engineeringService";
// Adicionado 'type' aqui para corrigir o erro 1 e 2
import type { BatchDefaults, EngineeringScreenProps, ImportedPart } from "../components/types";
import { processFileToParts, applyRotationToPart } from "../utils/engineeringUtil"; 

export const useEngineeringLogic = ({
  parts,
  setParts,
  onSendToNesting,
  // onBack, <--- REMOVIDO: Removemos daqui pois não é usado dentro do hook (Erro 3 e 4)
}: EngineeringScreenProps) => {
  const { user } = useAuth();
  
  // States
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
  });

  // Effects
  useEffect(() => {
    if (user && user.token) {
      EngineeringService.getSubscriptionStatus(user.token)
        .then((data) => {
          if (data.status === "trial") setIsTrial(true);
        })
        .catch((err) => console.error("Erro ao verificar status trial:", err));
    }
  }, [user]);

  // Handlers
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
    if (parts.length === 0) {
      if (!silent) alert("A lista está vazia. Importe peças primeiro.");
      return false;
    }

    if (!user || !user.token) {
      alert("Erro de Segurança: Você precisa estar logado para salvar no banco.");
      return false;
    }

    const nonBlocks = parts.filter((p) => p.entities.length > 1);
    if (nonBlocks.length > 0) {
      alert(
        `ATENÇÃO: Existem ${nonBlocks.length} peças que ainda não são Blocos.\n\nPor favor, clique em "📦 Insert/Block" antes de enviar.`
      );
      return false;
    }

    setLoading(true);
    if (!silent) setProcessingMsg("Salvando no Banco de Dados...");

    try {
      const data = await EngineeringService.saveParts(user.token, parts);
      
      console.log("Resposta do Servidor:", data);
      if (!silent)
        alert(
          `✅ SUCESSO!\n\n${
            data.count || parts.length
          } peças foram gravadas na conta de ${user.name}.`
        );
      return true;
    } catch (error: any) {
      console.error("Erro de conexão:", error);
      alert(
        `❌ ERRO DE CONEXÃO\n\nNão foi possível salvar.\nDetalhes: ${error.message}`
      );
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

      const subData = await EngineeringService.getSubscriptionStatus(user.token);
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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
    handleFileUpload
  };
};