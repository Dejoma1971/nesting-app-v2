import { useEffect, useCallback } from 'react';
import type { PlacedPart } from '../utils/nestingCore';
import type { ImportedPart } from '../components/types';
import type { CropLine } from './useSheetManager';
import type { LabelStateMap } from '../components/labels/LabelTypes';

interface AutoSaveData {
  nestingResult: PlacedPart[];
  parts: ImportedPart[];
  quantities: { [key: string]: number };
  binSize: { width: number; height: number };
  totalBins: number;
  currentBinIndex: number;
  cropLines: CropLine[];
  calculationTime: number | null; // <--- NOVO CAMPO
  labelStates: LabelStateMap;
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
    cropLines: CropLine[];
    calculationTime: number | null; // <--- NOVO CAMPO
    labelStates: LabelStateMap;
  }
) => {
  // 1. Efeito de Salvamento
  useEffect(() => {
    if (isTrial) return;

    const timer = setTimeout(() => {
      // Só salva se houver dados relevantes
      if (currentState.parts.length === 0 && currentState.nestingResult.length === 0) return;

      const data: AutoSaveData = {
        ...currentState,
        timestamp: Date.now(),
      };
      
      localStorage.setItem('nesting_autosave', JSON.stringify(data));
    }, 1000);

    return () => clearTimeout(timer);
  }, [currentState, isTrial]);

  // 2. Carregamento
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

  // 3. Limpeza
  const clearSavedState = useCallback(() => {
    localStorage.removeItem('nesting_autosave');
  }, []);

  // --- NOVA IMPLEMENTAÇÃO: Limpeza no Reload/F5 ---
  useEffect(() => {
    const handleBeforeUnload = () => {
      // O navegador vai disparar isso no F5 ou ao fechar a aba.
      // Limpamos o storage para garantir que o reload comece zerado.
      localStorage.removeItem('nesting_autosave');
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  return { loadSavedState, clearSavedState };
};