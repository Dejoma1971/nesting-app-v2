/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback } from 'react';
import type { ImportedPart } from '../components/types';
import type { PlacedPart } from '../utils/nestingCore';
import { generateDxfContent } from '../utils/dxfWriter';
import type { CropLine } from '../hooks/useSheetManager';

interface ProductionState {
  producedQuantities: Record<string, number>;
  lockedBins: number[]; 
  isSaving: boolean;
}

export const useProductionManager = (
  binSize: { width: number; height: number }
) => {
  const [state, setState] = useState<ProductionState>({
    producedQuantities: {},
    lockedBins: [],
    isSaving: false
  });

  const getPartStatus = useCallback((partId: string, totalRequested: number) => {
    const produced = state.producedQuantities[partId] || 0;
    const remaining = Math.max(0, totalRequested - produced);
    const isFullyProduced = remaining === 0;
    return { produced, remaining, isFullyProduced };
  }, [state.producedQuantities]);

  const handleProductionDownload = useCallback(async (
    nestingResult: PlacedPart[],
    currentBinIndex: number,
    displayedParts: ImportedPart[],
    cropLines: CropLine[] = [],
    user: any = null,
    densityValue: number = 0 // <--- Recebe a densidade calculada na tela
  ) => {
    
    // Validação
    if (state.lockedBins.includes(currentBinIndex)) {
      if (!window.confirm("Esta chapa já foi processada. Baixar novamente?")) {
        return;
      }
    }

    const currentBinParts = nestingResult.filter(p => p.binId === currentBinIndex);
    if (currentBinParts.length === 0 && cropLines.length === 0) {
      alert("Esta chapa está vazia.");
      return;
    }

    // Contagem e Área para DXF
    const partsCount: Record<string, number> = {};
    let usedArea = 0;

    currentBinParts.forEach(p => {
      partsCount[p.partId] = (partsCount[p.partId] || 0) + 1;
      const original = displayedParts.find(dp => dp.id === p.partId);
      if (original) usedArea += original.netArea;
    });

    const totalBinArea = binSize.width * binSize.height;
    const efficiency = totalBinArea > 0 ? Number(((usedArea / totalBinArea) * 100).toFixed(2)) : 0;
    
    // Usamos o valor que veio da tela, ou o aproveitamento se for zero (fallback)
    const finalDensity = densityValue > 0 ? densityValue : efficiency;

    // Confirmação
    let confirmMessage = `Confirma a produção desta chapa?\n`;
    confirmMessage += `📊 Aprov. Real: ${efficiency}%\n`;
    confirmMessage += `📦 Densidade: ${finalDensity}%\n`; 
    
    if (cropLines.length > 0) confirmMessage += `✂️ Linhas de Retalho: ${cropLines.length}\n\n`;
    else confirmMessage += `\n`;
    
    Object.entries(partsCount).forEach(([pId, qty]) => {
      const partName = displayedParts.find(dp => dp.id === pId)?.name || "Item";
      confirmMessage += `- ${partName}: ${qty} un.\n`;
    });

    const isFirstTime = !state.lockedBins.includes(currentBinIndex);

    if (isFirstTime) {
        const confirm = window.confirm(confirmMessage);
        if (!confirm) return;
    }

    // Gera DXF
    const dxfString = generateDxfContent(
        currentBinParts, 
        displayedParts, 
        binSize, 
        cropLines 
    );
    
    const blob = new Blob([dxfString], { type: "application/dxf" });
    const suggestedName = `Nesting_Chapa_${currentBinIndex + 1}_${new Date().toISOString().slice(0, 10)}.dxf`;

    // Salvar
    setState(prev => ({ ...prev, isSaving: true }));
    let dbSuccess = false;

    try {
        // --- ETAPA A: Registrar no Banco ---
        if (isFirstTime) {
            if (user && user.plano === 'Premium Dev' && user.token) {
                const itensPayload = Object.entries(partsCount).map(([id, qtd]) => ({ id, qtd }));
                
                if (itensPayload.length > 0) {
                    try {
                        const response = await fetch('http://localhost:3001/api/producao/registrar', {
                            method: 'POST',
                            headers: { 
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${user.token}`
                            },
                            body: JSON.stringify({
                                chapaIndex: currentBinIndex,
                                aproveitamento: efficiency,
                                densidade: finalDensity, // <--- Envia o valor correto
                                itens: itensPayload
                            })
                        });

                        if (response.ok) {
                            dbSuccess = true;
                        } else {
                            console.warn("Banco recusou registro.");
                        }
                    } catch (dbErr) {
                        console.warn("Erro ao conectar com o banco.", dbErr);
                    }
                }
            }
            
            // Atualiza estado local
            setState(prev => {
                const newQuantities = { ...prev.producedQuantities };
                Object.entries(partsCount).forEach(([id, qty]) => {
                  newQuantities[id] = (newQuantities[id] || 0) + qty;
                });
                return {
                  ...prev,
                  producedQuantities: newQuantities,
                  lockedBins: [...prev.lockedBins, currentBinIndex]
                };
            });
        }

        // --- ETAPA B: Salvar Arquivo ---
        let fileHandle: any = null;
        let fileSaved = false;

        if ('showSaveFilePicker' in window) {
            try {
                fileHandle = await (window as any).showSaveFilePicker({
                    suggestedName: suggestedName,
                    types: [{ description: 'Arquivo DXF AutoCAD', accept: { 'application/dxf': ['.dxf'] } }],
                });
                if (fileHandle) {
                    const writable = await fileHandle.createWritable();
                    await writable.write(blob);
                    await writable.close();
                    fileSaved = true;
                }
            } catch (err: any) {
                // CORREÇÃO DO ESLINT: Tratamos o erro aqui
                if (err.name !== 'AbortError') {
                    console.error("Erro ou cancelamento na API nativa:", err);
                }
            }
        }

        if (!fileSaved && !fileHandle) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = suggestedName;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
            fileSaved = true;
        }

        if (fileSaved) {
            if (dbSuccess) {
                alert("✅ Arquivo Salvo e Produção Registrada no Banco!");
            } else {
                alert("⚠️ Arquivo DXF gerado com sucesso!\n\n(Nota: O registro no banco de dados não foi realizado. Disponível apenas no plano Premium).");
            }
        }

    } catch (error) {
        console.error("Erro fatal:", error);
        alert("❌ Erro ao gerar o arquivo.");
    } finally {
        setState(prev => ({ ...prev, isSaving: false }));
    }

  }, [binSize, state.lockedBins]); 

  const resetProduction = useCallback(() => {
      setState({ producedQuantities: {}, lockedBins: [], isSaving: false });
  }, []);

  return {
    producedQuantities: state.producedQuantities,
    lockedBins: state.lockedBins,
    isSaving: state.isSaving,
    handleProductionDownload,
    getPartStatus,
    resetProduction
  };
};