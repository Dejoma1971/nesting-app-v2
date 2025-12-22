/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect } from "react";
import DxfParser from "dxf-parser";
import type { ImportedPart } from "./types";
import { useAuth } from "../context/AuthContext"; // <--- IMPORTANTE: Importamos o AuthContext
import {
  calculateBoundingBox,
  flattenGeometry,
  rotatePoint,
  calculatePartNetArea,
  UnionFind,
  entitiesTouch,
  isContained,
} from "../utils/geometryCore";

import { SubscriptionPanel } from "./SubscriptionPanel";
import { useTheme } from "../context/ThemeContext";

// --- CONSTANTES ---
const THICKNESS_OPTIONS = [
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

// --- PROPS ---
interface EngineeringScreenProps {
  onBack: () => void;
  onSendToNesting: (parts: ImportedPart[], searchQuery?: string) => void;
  parts: ImportedPart[];
  setParts: React.Dispatch<React.SetStateAction<ImportedPart[]>>;
}

// --- 1. FUNÇÕES AUXILIARES (Rotação e Processamento de Arquivo) ---

const applyRotationToPart = (
  part: ImportedPart,
  angle: number
): ImportedPart => {
  const flatEntities = flattenGeometry(part.entities, part.blocks);
  const transform = { x: 0, y: 0, rotation: angle, scale: 1 };

  const rotatedEntities = flatEntities.map((ent: any) => {
    const applyTrans = (x: number, y: number) =>
      rotatePoint(x, y, transform.rotation);

    if (ent.type === "LINE") {
      const p1 = applyTrans(ent.vertices[0].x, ent.vertices[0].y);
      const p2 = applyTrans(ent.vertices[1].x, ent.vertices[1].y);
      ent.vertices = [
        { x: p1.x, y: p1.y },
        { x: p2.x, y: p2.y },
      ];
    } else if (ent.type === "LWPOLYLINE" || ent.type === "POLYLINE") {
      ent.vertices = ent.vertices.map((v: any) => {
        const p = applyTrans(v.x, v.y);
        return { ...v, x: p.x, y: p.y };
      });
    } else if (ent.type === "CIRCLE" || ent.type === "ARC") {
      const c = applyTrans(ent.center.x, ent.center.y);
      ent.center = { x: c.x, y: c.y };
      if (ent.type === "ARC") {
        ent.startAngle += (angle * Math.PI) / 180;
        ent.endAngle += (angle * Math.PI) / 180;
      }
    }
    return ent;
  });

  const box = calculateBoundingBox(rotatedEntities);
  const minX = box.minX;
  const minY = box.minY;

  const newPart = JSON.parse(JSON.stringify(part));
  newPart.width = box.maxX - box.minX;
  newPart.height = box.maxY - box.minY;
  newPart.blocks = {};

  newPart.entities = rotatedEntities.map((ent: any) => {
    const move = (x: number, y: number) => ({ x: x - minX, y: y - minY });
    if (ent.vertices)
      ent.vertices = ent.vertices.map((v: any) => {
        const p = move(v.x, v.y);
        return { ...v, x: p.x, y: p.y };
      });
    else if (ent.center) {
      const c = move(ent.center.x, ent.center.y);
      ent.center = { x: c.x, y: c.y };
    }
    return ent;
  });

  newPart.grossArea = newPart.width * newPart.height;
  let net = calculatePartNetArea(newPart.entities);
  if (net < 0.1) net = newPart.grossArea;
  newPart.netArea = net;

  return newPart;
};

const processFileToParts = (
  flatEntities: any[],
  fileName: string,
  defaults: any
): ImportedPart[] => {
  const n = flatEntities.length;
  const uf = new UnionFind(n);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (entitiesTouch(flatEntities[i], flatEntities[j])) uf.union(i, j);
    }
  }
  const clusters = new Map<number, any[]>();
  flatEntities.forEach((ent, idx) => {
    const root = uf.find(idx);
    if (!clusters.has(root)) clusters.set(root, []);
    clusters.get(root)!.push(ent);
  });

  const candidateParts = Array.from(clusters.values()).map((ents) => ({
    entities: ents,
    box: calculateBoundingBox(ents),
    children: [] as any[],
    isHole: false,
  }));
  candidateParts.sort((a, b) => b.box.area - a.box.area);

  const finalParts: ImportedPart[] = [];
  for (let i = 0; i < candidateParts.length; i++) {
    const parent = candidateParts[i];
    if (parent.isHole) continue;

    const width = parent.box.maxX - parent.box.minX;
    const height = parent.box.maxY - parent.box.minY;

    if (width < 2 && height < 2) continue;

    for (let j = i + 1; j < candidateParts.length; j++) {
      const child = candidateParts[j];
      if (!child.isHole && isContained(child.box, parent.box)) {
        parent.entities = parent.entities.concat(child.entities);
        child.isHole = true;
      }
    }

    const finalBox = calculateBoundingBox(parent.entities);
    const finalW = finalBox.maxX - finalBox.minX;
    const finalH = finalBox.maxY - finalBox.minY;

    const normalizedEntities = parent.entities.map((ent: any) => {
      const clone = JSON.parse(JSON.stringify(ent));
      const move = (x: number, y: number) => ({
        x: x - finalBox.minX,
        y: y - finalBox.minY,
      });
      if (clone.vertices)
        clone.vertices = clone.vertices.map((v: any) => {
          const p = move(v.x, v.y);
          return { ...v, x: p.x, y: p.y };
        });
      else if (clone.center) {
        const c = move(clone.center.x, clone.center.y);
        clone.center = { x: c.x, y: c.y };
      }
      return clone;
    });

    const grossArea = finalW * finalH;
    let netArea = calculatePartNetArea(normalizedEntities);
    if (netArea < 0.1) netArea = grossArea;

    finalParts.push({
      id: crypto.randomUUID(),
      name: `${fileName} - Item ${finalParts.length + 1}`,
      entities: normalizedEntities,
      blocks: {},
      width: finalW,
      height: finalH,
      grossArea,
      netArea,
      quantity: 1,
      pedido: defaults.pedido,
      op: defaults.op,
      material: defaults.material,
      espessura: defaults.espessura,
      autor: defaults.autor,
      dataCadastro: new Date().toISOString(),
    });
  }
  return finalParts;
};

// --- 2. COMPONENTE PRINCIPAL ---

export const EngineeringScreen: React.FC<EngineeringScreenProps> = ({
  onBack,
  onSendToNesting,
  parts,
  setParts,
}) => {
  const { user } = useAuth(); // <--- Hook de Autenticação

  const [loading, setLoading] = useState(false);
  const [processingMsg, setProcessingMsg] = useState("");

  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [viewingPartId, setViewingPartId] = useState<string | null>(null);
  const { isDarkMode, toggleTheme, theme } = useTheme();
  //   const [isDarkMode, setIsDarkMode] = useState(true);

  // --- NOVO: Estado para verificar se é Trial e bloquear botões ---
  const [isTrial, setIsTrial] = useState(false);

  useEffect(() => {
    if (user && user.token) {
      fetch("http://localhost:3001/api/subscription/status", {
        headers: { Authorization: `Bearer ${user.token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.status === "trial") setIsTrial(true);
        })
        .catch((err) => console.error("Erro ao verificar status trial:", err));
    }
  }, [user]);

  const [batchDefaults, setBatchDefaults] = useState({
    pedido: "",
    op: "",
    material: "Inox 304",
    espessura: "20",
    autor: "",
  });

  //   const theme = {
  //       bg: isDarkMode ? '#1e1e1e' : '#f5f5f5',
  //       panelBg: isDarkMode ? '#1e1e1e' : '#ffffff',
  //       headerBg: isDarkMode ? '#252526' : '#e0e0e0',
  //       batchBg: isDarkMode ? '#2d2d2d' : '#eeeeee',
  //       text: isDarkMode ? '#e0e0e0' : '#333333',
  //       border: isDarkMode ? '#444' : '#ccc',
  //       cardBg: isDarkMode ? '#2d2d2d' : '#ffffff',
  //       inputBg: isDarkMode ? '#1e1e1e' : '#ffffff',
  //       hoverRow: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
  //       selectedRow: isDarkMode ? 'rgba(0, 123, 255, 0.15)' : 'rgba(0, 123, 255, 0.1)',
  //       label: isDarkMode ? '#aaa' : '#666',
  //       modalBg: isDarkMode ? '#252526' : '#fff',
  //       modalOverlay: isDarkMode ? 'rgba(0,0,0,0.85)' : 'rgba(0,0,0,0.5)'
  //   };

  const handleDefaultChange = (field: string, value: any) => {
    setBatchDefaults((prev) => ({ ...prev, [field]: value }));
  };

  const applyToAll = (field: keyof ImportedPart) => {
    const value = batchDefaults[field as keyof typeof batchDefaults];
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

  // --- FUNÇÃO DE SALVAR NO BANCO (ATUALIZADA COM TOKEN) ---
  const savePartsToDB = async (silent: boolean = false): Promise<boolean> => {
    // 1. Validação básica de lista vazia
    if (parts.length === 0) {
      if (!silent) alert("A lista está vazia. Importe peças primeiro.");
      return false;
    }

    // 2. Validação de Segurança (Login)
    if (!user || !user.token) {
      alert(
        "Erro de Segurança: Você precisa estar logado para salvar no banco."
      );
      return false;
    }

    // 3. Validação estrutural (Blocos)
    const nonBlocks = parts.filter((p) => p.entities.length > 1);
    if (nonBlocks.length > 0) {
      alert(
        `ATENÇÃO: Existem ${nonBlocks.length} peças que ainda não são Blocos.\n\nPor favor, clique em "📦 Insert/Block" antes de enviar.`
      );
      return false;
    }

    // 4. Preparação para salvar
    setLoading(true);
    if (!silent) setProcessingMsg("Salvando no Banco de Dados...");

    try {
      const response = await fetch("http://localhost:3001/api/pecas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.token}`, // <--- Token enviado aqui!
        },
        body: JSON.stringify(parts),
      });

      const data = await response.json();

      if (response.ok) {
        console.log("Resposta do Servidor:", data);
        if (!silent)
          alert(
            `✅ SUCESSO!\n\n${
              data.count || parts.length
            } peças foram gravadas na conta de ${user.name}.`
          );
        return true;
      } else {
        throw new Error(data.error || "Erro desconhecido no servidor");
      }
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

  // --- LÓGICA DO BOTÃO "CORTAR AGORA" (COM OTIMIZAÇÃO OBRIGATÓRIA) ---
  const handleDirectNesting = async () => {
    // 1. Validação: Lista Vazia
    if (parts.length === 0) {
      alert("Importe peças antes de cortar.");
      return;
    }

    // 2. Validação: OTIMIZAÇÃO DE ARQUIVO (Insert/Block) OBRIGATÓRIA
    // Se a peça tiver mais de 1 entidade na raiz, significa que não é um Bloco encapsulado.
    const nonBlocks = parts.filter((p) => p.entities.length > 1);

    if (nonBlocks.length > 0) {
      alert(
        `⚠️ OTIMIZAÇÃO NECESSÁRIA\n\n` +
          `Detectamos ${nonBlocks.length} peças contendo geometrias soltas (linhas/arcos).\n` +
          `Para garantir a velocidade e segurança do Nesting, o arquivo deve ser simplificado.\n\n` +
          `👉 Por favor, clique no botão amarelo "📦 Insert/Block" acima da lista para corrigir isso automaticamente.`
      );
      return; // <--- TRAVA O PROCESSO AQUI
    }

    setLoading(true);

    try {
      if (!user || !user.token) {
        alert("Usuário não logado.");
        setLoading(false);
        return;
      }

      const response = await fetch(
        "http://localhost:3001/api/subscription/status",
        {
          headers: { Authorization: `Bearer ${user.token}` },
        }
      );

      const subData = await response.json();
      const status = subData.status ? subData.status.toLowerCase() : "";

      // 3. Validação: REGRA DO TRIAL (MÁX 10 PEÇAS)
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

      // Se passou por todas as travas, envia para o Nesting
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

  const renderEntity = (
    entity: any,
    index: number,
    blocks?: any
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
                renderEntity(child, i, blocks)
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
    flex: 1,
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
  const deleteBtnStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "14px",
  };
  const blockBtnStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "14px",
  };

  const viewingPart = viewingPartId
    ? parts.find((p) => p.id === viewingPartId)
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
          <h2 style={{ margin: 0, fontSize: "18px", color: "#007bff" }}>
            Engenharia & Projetos
          </h2>
          {loading && (
            <span style={{ fontSize: "12px", color: "#ffd700" }}>
              ⏳ {processingMsg}
            </span>
          )}
        </div>

        {/* --- AQUI: INSERÇÃO DO PAINEL DE ASSINATURA --- */}
        {/* Criamos uma div centralizada para o painel não esticar demais */}
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
        {/* ------------------------------------------------ */}

        <div style={{ display: "flex", gap: "15px", alignItems: "center" }}>
          <button
            onClick={isTrial ? undefined : handleGoToNestingEmpty}
            title={
              isTrial
                ? "Indisponível no modo Trial"
                : "Ir para a Mesa de Nesting (Buscar peças lá)"
            }
            style={{
              background: "transparent",
              color: theme.text,
              border: `1px solid ${theme.border}`,
              padding: "8px 12px",
              borderRadius: "4px",
              cursor: isTrial ? "not-allowed" : "pointer", // Cursor de proibido
              opacity: isTrial ? 0.5 : 1, // Meio transparente
              display: "flex",
              alignItems: "center",
              gap: "5px",
              marginRight: "10px",
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
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
            <span style={{ fontSize: "13px" }}>Mesa de Corte</span>
          </button>
          <button
            onClick={handleReset}
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
          {/* BOTÃO STORAGE DB - TRAVADO SE FOR TRIAL */}
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
              cursor: isTrial ? "not-allowed" : "pointer", // Cursor de proibido
              opacity: isTrial ? 0.5 : 1, // Meio transparente
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              gap: "5px",
            }}
          >
            💾 Storage DB
          </button>
          <button
            onClick={handleDirectNesting}
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
            🚀 Cortar Agora
          </button>
          <button
            onClick={toggleTheme}
            style={{
              background: "transparent",
              border: `1px solid ${theme.border}`,
              color: theme.text,
              padding: "5px 10px",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            {isDarkMode ? "☀️" : "🌙"}
          </button>
        </div>
      </div>

      <div style={batchContainerStyle}>
        <div
          style={{
            color: theme.text,
            fontWeight: "bold",
            marginRight: "20px",
            fontSize: "14px",
          }}
        >
          PADRÃO DO LOTE:
        </div>
        <div style={inputGroupStyle}>
          <label style={labelStyle}>
            PEDIDO{" "}
            <button
              style={applyButtonStyle}
              onClick={() => applyToAll("pedido")}
            >
              Aplicar Todos
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
            <button style={applyButtonStyle} onClick={() => applyToAll("op")}>
              Aplicar Todos
            </button>
          </label>
          <input
            style={inputStyle}
            value={batchDefaults.op}
            onChange={(e) => handleDefaultChange("op", e.target.value)}
            placeholder="Ex: 5020"
          />
        </div>
        <div style={inputGroupStyle}>
          <label style={labelStyle}>
            MATERIAL{" "}
            <button
              style={applyButtonStyle}
              onClick={() => applyToAll("material")}
            >
              Aplicar Todos
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
            <option value="Inox 304">Inox 304</option>
            <option value="Inox 430">Inox 430</option>
            <option value="Aço Carbono">Aço Carbono</option>
            <option value="Galvanizado">Galvanizado</option>
            <option value="Alumínio">Alumínio</option>
          </select>
        </div>
        <div style={inputGroupStyle}>
          <label style={labelStyle}>
            ESPESSURA{" "}
            <button
              style={applyButtonStyle}
              onClick={() => applyToAll("espessura")}
            >
              Aplicar Todos
            </button>
          </label>
          <select
            style={{
              ...inputStyle,
              width: "80px",
              background: theme.inputBg,
              color: theme.text,
            }}
            value={batchDefaults.espessura}
            onChange={(e) => handleDefaultChange("espessura", e.target.value)}
          >
            {THICKNESS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
        <div style={inputGroupStyle}>
          <label style={labelStyle}>
            AUTOR{" "}
            <button
              style={applyButtonStyle}
              onClick={() => applyToAll("autor")}
            >
              Aplicar Todos
            </button>
          </label>
          <input
            style={inputStyle}
            value={batchDefaults.autor}
            onChange={(e) => handleDefaultChange("autor", e.target.value)}
            placeholder="Ex: Gabriel"
          />
        </div>

        <button
          onClick={handleConvertAllToBlocks}
          title="Converte todas as peças complexas em blocos únicos"
          style={{
            background: "#ffc107",
            color: "#333",
            border: "none",
            padding: "10px 15px",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: "bold",
            marginLeft: "15px",
          }}
        >
          📦 Insert/Block
        </button>
        <label
          style={{
            background: "#007bff",
            color: "white",
            padding: "10px 20px",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "13px",
            fontWeight: "bold",
            marginLeft: "auto",
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

      <div style={splitContainer}>
        <div style={leftPanel}>
          <div
            style={{
              padding: "10px",
              borderBottom: `1px solid ${theme.border}`,
              fontWeight: "bold",
              fontSize: "12px",
              background: theme.headerBg,
            }}
          >
            VISUALIZAÇÃO ({parts.length})
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              padding: "10px",
              alignContent: "flex-start",
            }}
          >
            {parts.map((part, idx) => {
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
                  key={part.id}
                  style={{
                    ...cardStyle,
                    borderColor: isSelected ? "#007bff" : theme.border,
                    boxShadow: isSelected
                      ? "0 0 0 2px rgba(0,123,255,0.5)"
                      : "none",
                    transform: isSelected ? "scale(1.05)" : "scale(1)",
                    zIndex: isSelected ? 1 : 0,
                  }}
                  title={part.name}
                  onClick={() => setSelectedPartId(part.id)}
                >
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
                      👁️
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
                        renderEntity(ent, i, part.blocks)
                      )}
                    </svg>
                  </div>
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
              padding: "10px",
              borderBottom: `1px solid ${theme.border}`,
              fontWeight: "bold",
              fontSize: "12px",
              background: theme.headerBg,
              display: "flex",
              justifyContent: "space-between",
            }}
          >
            <span>CADASTRO TÉCNICO</span>
            {loading && (
              <span style={{ color: "#ffd700" }}>⏳ {processingMsg}</span>
            )}
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: theme.hoverRow }}>
                <th style={tableHeaderStyle}>#</th>
                <th style={{ ...tableHeaderStyle, width: "200px" }}>Nome</th>
                <th style={{ ...tableHeaderStyle, width: "80px" }}>Pedido</th>
                <th style={{ ...tableHeaderStyle, width: "80px" }}>OP</th>
                <th style={tableHeaderStyle}>Material</th>
                <th style={{ ...tableHeaderStyle, width: "60px" }}>Esp.</th>
                <th style={tableHeaderStyle}>Autor</th>
                <th style={tableHeaderStyle}>Dimensões</th>
                <th style={tableHeaderStyle}>Área (m²)</th>
                <th style={tableHeaderStyle} title="Complexidade da peça">
                  Entidades
                </th>
                <th
                  style={{
                    ...tableHeaderStyle,
                    width: "60px",
                    color: "#007bff",
                  }}
                >
                  Qtd.
                </th>
                <th style={tableHeaderStyle}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {parts.map((part, i) => {
                const isSelected = part.id === selectedPartId;
                const rowBackground = isSelected
                  ? theme.selectedRow
                  : i % 2 === 0
                  ? "transparent"
                  : theme.hoverRow;
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
                    style={{ background: rowBackground, cursor: "pointer" }}
                    onClick={() => setSelectedPartId(part.id)}
                  >
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
                        style={cellInputStyle}
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
                        <option
                          style={{
                            background: theme.cardBg,
                            color: theme.text,
                          }}
                          value="Inox 304"
                        >
                          Inox 304
                        </option>
                        <option
                          style={{
                            background: theme.cardBg,
                            color: theme.text,
                          }}
                          value="Inox 430"
                        >
                          Inox 430
                        </option>
                        <option
                          style={{
                            background: theme.cardBg,
                            color: theme.text,
                          }}
                          value="Aço Carbono"
                        >
                          Aço Carbono
                        </option>
                        <option
                          style={{
                            background: theme.cardBg,
                            color: theme.text,
                          }}
                          value="Galvanizado"
                        >
                          Galvanizado
                        </option>
                        <option
                          style={{
                            background: theme.cardBg,
                            color: theme.text,
                          }}
                          value="Alumínio"
                        >
                          Alumínio
                        </option>
                      </select>
                    </td>
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
                        {THICKNESS_OPTIONS.map((opt) => (
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
                        style={cellInputStyle}
                        value={part.autor || ""}
                        onChange={(e) =>
                          handleRowChange(part.id, "autor", e.target.value)
                        }
                      />
                    </td>
                    <td
                      style={{
                        ...tableCellStyle,
                        fontSize: "11px",
                        opacity: 0.7,
                      }}
                    >
                      {part.width.toFixed(0)} x {part.height.toFixed(0)}
                    </td>
                    <td
                      style={{
                        ...tableCellStyle,
                        fontSize: "11px",
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
                      }}
                    >
                      {entCount}
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
                            Number(e.target.value)
                          )
                        }
                        style={{
                          ...cellInputStyle,
                          textAlign: "center",
                          fontWeight: "bold",
                          color: "#007bff",
                        }}
                      />
                    </td>
                    <td style={tableCellStyle}>
                      <div style={{ display: "flex", gap: "10px" }}>
                        {entCount > 1 && (
                          <button
                            style={blockBtnStyle}
                            onClick={(e) => handleConvertToBlock(part.id, e)}
                            title="Converter para Bloco Único"
                          >
                            📦
                          </button>
                        )}
                        <button
                          style={deleteBtnStyle}
                          onClick={(e) => handleDeletePart(part.id, e)}
                          title="Excluir peça"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE VISUALIZAÇÃO/ROTAÇÃO */}
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
                  viewingPart.blocks
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
                      renderEntity(ent, i, viewingPart.blocks)
                    )}
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
                gap: "20px",
                background: theme.modalBg,
                flexShrink: 0,
              }}
            >
              <button
                onClick={() => handleRotatePart("ccw")}
                style={{
                  padding: "10px 20px",
                  background: theme.inputBg,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                ↺ Girar Anti-Horário
              </button>
              <button
                onClick={() => handleRotatePart("cw")}
                style={{
                  padding: "10px 20px",
                  background: theme.inputBg,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: "4px",
                  cursor: "pointer",
                }}
              >
                ↻ Girar Horário
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
    </div>
  );
};
