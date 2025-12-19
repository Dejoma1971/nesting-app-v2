/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback } from 'react';
import type { ImportedPart } from '../components/types';
import type { PlacedPart } from '../utils/nestingCore';
import { generateDxfContent } from '../utils/dxfWriter';
import type { CropLine } from '../hooks/useSheetManager'; // <--- IMPORTADO

interface ProductionState {
  producedQuantities: Record<string, number>; // ID -> Qtd acumulada na sessão
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
    cropLines: CropLine[] = [] // <--- NOVO PARÂMETRO (Opcional para compatibilidade)
  ) => {
    // 1. Validação se já foi baixado
    if (state.lockedBins.includes(currentBinIndex)) {
      if (!window.confirm("Esta chapa já foi processada. Baixar novamente? (Não duplicará o registro no banco).")) {
        return;
      }
    }

    const currentBinParts = nestingResult.filter(p => p.binId === currentBinIndex);
    if (currentBinParts.length === 0 && cropLines.length === 0) { // Permite salvar se tiver apenas linhas de corte
      alert("Esta chapa está vazia.");
      return;
    }

    // 2. Contagem e Cálculo de Eficiência
    const partsCount: Record<string, number> = {};
    let usedArea = 0;

    currentBinParts.forEach(p => {
      // Contagem
      partsCount[p.partId] = (partsCount[p.partId] || 0) + 1;
      
      // Área (buscar a área bruta da peça original para precisão)
      const original = displayedParts.find(dp => dp.id === p.partId);
      if (original) {
          usedArea += original.netArea;
      }
    });

    const totalBinArea = binSize.width * binSize.height;
    const efficiency = totalBinArea > 0 ? Number(((usedArea / totalBinArea) * 100).toFixed(2)) : 0;

    // 3. Montar Mensagem de Confirmação
    let confirmMessage = `Confirma a produção desta chapa?\n`;
    confirmMessage += `📊 Aproveitamento: ${efficiency}%\n`;
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

    // 4. Preparar Arquivo DXF (PASSANDO AS LINHAS AQUI)
    const dxfString = generateDxfContent(
        currentBinParts, 
        displayedParts, 
        binSize, 
        cropLines // <--- INTEGRADO AQUI
    );
    
    const blob = new Blob([dxfString], { type: "application/dxf" });
    const suggestedName = `Nesting_Chapa_${currentBinIndex + 1}_${new Date().toISOString().slice(0, 10)}.dxf`;

    // 5. Salvar Arquivo (File System Access API)
    let fileHandle: any = null;
    if ('showSaveFilePicker' in window) {
      try {
        fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: suggestedName,
          types: [{ description: 'Arquivo DXF AutoCAD', accept: { 'application/dxf': ['.dxf'] } }],
        });
      } catch (err: any) {
        if (err.name === 'AbortError') return; 
        console.error(err);
      }
    }

    // 6. Enviar para o Banco
    setState(prev => ({ ...prev, isSaving: true }));

    try {
      if (isFirstTime) {
          const itensPayload = Object.entries(partsCount).map(([id, qtd]) => ({ id, qtd }));
          
          // Se tiver peças, registra. Se for só chapa de retalho, talvez não precise registrar produção, mas o código aceita array vazio.
          if (itensPayload.length > 0) {
              const response = await fetch('http://localhost:3001/api/producao/registrar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chapaIndex: currentBinIndex,
                    aproveitamento: efficiency,
                    itens: itensPayload
                })
              });

              if (!response.ok) throw new Error("Erro ao registrar no banco.");
          }
          
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

      // 7. Escrever o Arquivo Fisicamente
      if (fileHandle) {
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        alert("✅ Produção Registrada e Arquivo Salvo!");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = suggestedName;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
        alert("✅ Download iniciado (Modo Compatibilidade).");
      }

    } catch (error) {
      console.error(error);
      alert("❌ O arquivo NÃO foi salvo pois houve erro ao registrar no banco.");
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