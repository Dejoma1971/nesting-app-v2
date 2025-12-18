import { useState, useCallback } from 'react';
import type { PlacedPart } from '../utils/nestingCore';

// Definição da Linha de Retalho
export interface CropLine {
  id: string;
  binId: number;      // A qual chapa ela pertence
  type: 'horizontal' | 'vertical';
  position: number;   // Coordenada X (se vertical) ou Y (se horizontal)
  isSelected?: boolean;
}

interface UseSheetManagerProps {
  initialBins?: number;
}

export const useSheetManager = ({ initialBins = 1 }: UseSheetManagerProps = {}) => {
  const [totalBins, setTotalBins] = useState(initialBins);
  const [currentBinIndex, setCurrentBinIndex] = useState(0);
  const [cropLines, setCropLines] = useState<CropLine[]>([]);

  // --- NAVEGAÇÃO E GESTÃO DE CHAPAS ---

  const handleAddBin = useCallback(() => {
    setTotalBins((prev) => {
      const newTotal = prev + 1;
      setCurrentBinIndex(newTotal - 1); // Vai para a nova chapa
      return newTotal;
    });
  }, []);

  const handlePreviousBin = useCallback(() => {
    setCurrentBinIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNextBin = useCallback(() => {
    setCurrentBinIndex((prev) => Math.min(totalBins - 1, prev + 1));
  }, [totalBins]);

  // Exclui a chapa atual e reorganiza os IDs
  const handleDeleteCurrentBin = useCallback((
    nestingResult: PlacedPart[], 
    setNestingResult: React.Dispatch<React.SetStateAction<PlacedPart[]>>
  ) => {
    if (totalBins <= 1) {
      alert("Não é possível excluir a única chapa restante.");
      return;
    }

    if (!window.confirm(`Tem certeza que deseja excluir a Chapa ${currentBinIndex + 1}? As peças voltarão para o banco.`)) {
      return;
    }

    // 1. Remove as peças desta chapa do resultado do nesting
    const newResult = nestingResult.filter(p => p.binId !== currentBinIndex);

    // 2. Ajusta o binId das peças que estavam em chapas superiores (move elas "para trás")
    const shiftedResult = newResult.map(p => {
      if (p.binId > currentBinIndex) {
        return { ...p, binId: p.binId - 1 };
      }
      return p;
    });

    // 3. Remove as linhas de corte desta chapa e ajusta as superiores
    setCropLines(prev => {
        return prev
            .filter(line => line.binId !== currentBinIndex)
            .map(line => line.binId > currentBinIndex ? { ...line, binId: line.binId - 1 } : line);
    });

    setNestingResult(shiftedResult);
    setTotalBins(prev => prev - 1);
    
    // Se estivesse na última, volta uma. Se não, mantém o índice (que agora é a próxima chapa que "caiu" pra cá)
    if (currentBinIndex >= totalBins - 1) {
        setCurrentBinIndex(Math.max(0, totalBins - 2));
    }
  }, [totalBins, currentBinIndex]);

  // --- GESTÃO DE LINHAS DE RETALHO (CROP LINES) ---

  const addCropLine = useCallback((type: 'horizontal' | 'vertical', position: number) => {
    const newLine: CropLine = {
      id: crypto.randomUUID(),
      binId: currentBinIndex,
      type,
      position,
      isSelected: false
    };
    setCropLines(prev => [...prev, newLine]);
  }, [currentBinIndex]);

  const removeSelectedCropLines = useCallback(() => {
    setCropLines(prev => prev.filter(line => !(line.binId === currentBinIndex && line.isSelected)));
  }, [currentBinIndex]);

  const selectCropLine = useCallback((lineId: string, multiSelect: boolean) => {
    setCropLines(prev => prev.map(line => {
      if (line.id === lineId) return { ...line, isSelected: true };
      return multiSelect ? line : { ...line, isSelected: false }; // Desmarca outros se não for multi
    }));
  }, []);

  const moveCropLine = useCallback((lineId: string, newPosition: number) => {
      setCropLines(prev => prev.map(line => 
          line.id === lineId ? { ...line, position: newPosition } : line
      ));
  }, []);

  // ADICIONE ESTA FUNÇÃO:
  const removeCropLine = useCallback((lineId: string) => {
    setCropLines(prev => prev.filter(l => l.id !== lineId));
  }, []);

  return {
    totalBins,
    setTotalBins,
    currentBinIndex,
    setCurrentBinIndex,
    cropLines: cropLines.filter(l => l.binId === currentBinIndex), // Retorna apenas as da chapa atual
    
    // Actions
    handleAddBin,
    handlePreviousBin,
    handleNextBin,
    handleDeleteCurrentBin,
    
    // Crop Actions
    addCropLine,
    removeSelectedCropLines,
    selectCropLine,
    moveCropLine,
    removeCropLine
  };
};