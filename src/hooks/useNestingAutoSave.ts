import { useEffect, useCallback } from 'react';
import type { PlacedPart } from '../utils/nestingCore';
import type { ImportedPart } from '../components/types';
// CORREÇÃO 1: Importar o tipo CropLine corretamente
import type { CropLine } from './useSheetManager';

interface AutoSaveData {
  nestingResult: PlacedPart[];
  parts: ImportedPart[];
  quantities: { [key: string]: number };
  binSize: { width: number; height: number };
  totalBins: number;
  currentBinIndex: number;
  cropLines: CropLine[]; // CORREÇÃO 2: Tipo específico em vez de 'any[]'
  timestamp: number;
}

export const useNestingAutoSave = (
  isTrial: boolean,
  currentState: {
    nestingResult: PlacedPart[];
    parts: ImportedPart[];
    quantities: { [key: string]: number };
    binSize: { width: number; height: number };
    totalBins: number;
    currentBinIndex: number;
    cropLines: CropLine[]; // CORREÇÃO 3: Tipo específico aqui também
  }
) => {
  // 1. Efeito de Salvamento Automático (Auto-Save)
  useEffect(() => {
    // Se for Trial, não salva nada (Recurso Premium)
    if (isTrial) return;

    const timer = setTimeout(() => {
      // Só salva se houver alguma peça carregada ou posicionada
      if (currentState.parts.length === 0 && currentState.nestingResult.length === 0) return;

      const data: AutoSaveData = {
        ...currentState,
        timestamp: Date.now(),
      };
      
      localStorage.setItem('nesting_autosave', JSON.stringify(data));
    }, 1000); // Debounce de 1 segundo

    return () => clearTimeout(timer);
  }, [currentState, isTrial]);

  // 2. Função de Carregamento (Restore)
  const loadSavedState = useCallback((): AutoSaveData | null => {
    const saved = localStorage.getItem('nesting_autosave');
    if (!saved) return null;
    try {
      return JSON.parse(saved) as AutoSaveData;
    } catch (e) {
      console.error("Erro ao ler auto-save:", e);
      return null;
    }
  }, []);

  // 3. Função de Limpeza (Clear)
  const clearSavedState = useCallback(() => {
    localStorage.removeItem('nesting_autosave');
  }, []);

  return { loadSavedState, clearSavedState };
};