/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback } from "react";
import type { ImportedPart } from "../components/types";
import type { PlacedPart } from "../utils/nestingCore";
import { generateDxfContent } from "../utils/dxfWriter";
import type { CropLine } from "../hooks/useSheetManager";

interface ProductionState {
  producedQuantities: Record<string, number>;
  lockedBins: number[];
  isSaving: boolean;
}

export const useProductionManager = (binSize: {
  width: number;
  height: number;
}) => {
  const [state, setState] = useState<ProductionState>({
    producedQuantities: {},
    lockedBins: [],
    isSaving: false,
  });

  const getPartStatus = useCallback(
    (partId: string, totalRequested: number) => {
      const produced = state.producedQuantities[partId] || 0;
      const remaining = Math.max(0, totalRequested - produced);
      const isFullyProduced = remaining === 0;
      return { produced, remaining, isFullyProduced };
    },
    [state.producedQuantities],
  );

  const handleProductionDownload = useCallback(
    async (
      nestingResult: PlacedPart[],
      currentBinIndex: number,
      displayedParts: ImportedPart[],
      cropLines: CropLine[] = [],
      user: any = null,
      densityValue: number = 0,
      externalDbSuccess: boolean = false, // <--- Indica se já salvou no banco pelo hook novo
    ) => {
      // 1. VALIDAÇÃO INICIAL
      const currentBinParts = nestingResult.filter(
        (p) => p.binId === currentBinIndex,
      );
      if (currentBinParts.length === 0 && cropLines.length === 0) {
        alert("Esta chapa está vazia.");
        return;
      }

      if (state.lockedBins.includes(currentBinIndex)) {
        if (
          !window.confirm(
            "Esta chapa já foi baixada anteriormente. Deseja baixar o arquivo novamente?",
          )
        ) {
          return;
        }
      }

      // 2. CÁLCULOS (Área e Eficiência)
      const partsCount: Record<string, number> = {};
      let usedArea = 0;

      currentBinParts.forEach((p) => {
        partsCount[p.partId] = (partsCount[p.partId] || 0) + 1;
        const original = displayedParts.find((dp) => dp.id === p.partId);
        if (original) usedArea += original.netArea;
      });

      const totalBinArea = binSize.width * binSize.height;
      const efficiency =
        totalBinArea > 0
          ? Number(((usedArea / totalBinArea) * 100).toFixed(2))
          : 0;
      const finalDensity = densityValue > 0 ? densityValue : efficiency;

      // 3. CONFIRMAÇÃO VISUAL (Se ainda não foi salvo no banco)
      if (!state.lockedBins.includes(currentBinIndex) && !externalDbSuccess) {
        let confirmMessage = `Confirma a produção desta chapa?\n`;
        confirmMessage += `📊 Aprov. Real: ${efficiency}%\n`;
        confirmMessage += `📦 Densidade: ${finalDensity}%\n\n`;

        if (!window.confirm(confirmMessage)) return;
      }

      // 4. GERAÇÃO DO CONTEÚDO DXF
      const dxfString = generateDxfContent(
        currentBinParts,
        displayedParts,
        binSize,
        cropLines,
      );

      const blob = new Blob([dxfString], { type: "application/dxf" });
      const suggestedName = `Nesting_Chapa_${currentBinIndex + 1}_${new Date().toISOString().slice(0, 10)}.dxf`;

      setState((prev) => ({ ...prev, isSaving: true }));

      // Define sucesso do banco (se veio de fora, já é true)
      let dbSuccess = externalDbSuccess;

      try {
        // --- ETAPA A: TENTATIVA DE SALVAR NO BANCO (Fallback legado) ---
        // Só executa se NÃO veio sucesso externo E temos usuário/token
        if (!externalDbSuccess && user && user.token) {
          const validPlans = ["Premium Dev", "Premium", "Corporativo"];
          if (validPlans.includes(user.plano)) {
            const itensPayload = Object.entries(partsCount).map(
              ([id, qtd]) => ({ id, qtd }),
            );
            if (itensPayload.length > 0) {
              try {
                const response = await fetch(
                  "http://localhost:3001/api/producao/registrar",
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${user.token}`,
                    },
                    body: JSON.stringify({
                      chapaIndex: currentBinIndex,
                      aproveitamento: efficiency,
                      densidade: finalDensity,
                      itens: itensPayload,
                    }),
                  },
                );
                if (response.ok) dbSuccess = true;
              } catch (dbErr) {
                console.warn("Falha no registro legado:", dbErr);
              }
            }
          }
        }

        // --- ETAPA B: ABRIR JANELA "SALVAR COMO" (File System Access API) ---
        let fileSaved = false;

        if ("showSaveFilePicker" in window) {
          try {
            // CORREÇÃO AQUI: (window as any) garante que o TS aceite a função
            const fileHandle = await (window as any).showSaveFilePicker({
              suggestedName: suggestedName,
              types: [
                {
                  description: "Arquivo DXF AutoCAD",
                  accept: { "application/dxf": [".dxf"] },
                },
              ],
            });

            // Se chegou aqui, o usuário escolheu a pasta e clicou em "Salvar"
            // fileHandle também pode vir sem tipo, então garantimos o acesso com 'any' se necessário
            const writable = await (fileHandle as any).createWritable();
            await writable.write(blob);
            await writable.close();
            fileSaved = true;
          } catch (err: any) {
            if (err.name === "AbortError") {
              console.log("Usuário cancelou o salvamento.");
              return;
            }
            console.error("Erro na API de arquivos:", err);
          }
        }

        // --- ETAPA C: FALLBACK (Download Clássico) ---
        // Só executa se o método moderno falhou (e não foi cancelado) ou não é suportado
        if (!fileSaved) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = suggestedName;
          document.body.appendChild(a);
          a.click(); // Dispara o download (pode ir para Downloads ou perguntar, depende do browser)
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          fileSaved = true;
        }

        // --- ATUALIZAÇÃO DE ESTADO FINAL ---
        if (fileSaved) {
          // Atualiza estado local de quantidades produzidas
          setState((prev) => {
            const newQuantities = { ...prev.producedQuantities };
            Object.entries(partsCount).forEach(([id, qty]) => {
              newQuantities[id] = (newQuantities[id] || 0) + qty;
            });
            return {
              ...prev,
              producedQuantities: newQuantities,
              // Adiciona aos travados apenas se não estava
              lockedBins: prev.lockedBins.includes(currentBinIndex)
                ? prev.lockedBins
                : [...prev.lockedBins, currentBinIndex],
            };
          });

          // Mensagem Final ao Usuário
          if (dbSuccess) {
            alert("✅ Arquivo Salvo e Produção Registrada no Banco!");
          } else {
            alert(
              "⚠️ Arquivo DXF salvo localmente!\n\n(Aviso: O registro no banco de dados não foi confirmado. Verifique sua conexão ou plano).",
            );
          }
        }
      } catch (error) {
        console.error("Erro fatal no processo de download:", error);
        alert("❌ Erro ao processar o arquivo.");
      } finally {
        setState((prev) => ({ ...prev, isSaving: false }));
      }
    },
    [binSize, state.lockedBins],
  );

  const resetProduction = useCallback(() => {
    setState({ producedQuantities: {}, lockedBins: [], isSaving: false });
  }, []);

  return {
    producedQuantities: state.producedQuantities,
    lockedBins: state.lockedBins,
    isSaving: state.isSaving,
    handleProductionDownload,
    getPartStatus,
    resetProduction,
  };
};
