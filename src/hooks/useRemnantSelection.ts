import { useState, useCallback } from 'react';

export interface DBRemnant {
  id: string;
  codigo: string;
  largura: number;
  altura: number;
  area_m2: number;
}

export function useRemnantSelection() {
  // O Estado agora é um Dicionário: A chave é o número da chapa (binIndex)
  const [selectedRemnants, setSelectedRemnants] = useState<Record<number, DBRemnant>>({});

  const setRemnantForBin = useCallback((binIndex: number, remnant: DBRemnant) => {
    setSelectedRemnants(prev => ({ ...prev, [binIndex]: remnant }));
  }, []);

  const removeRemnantFromBin = useCallback((binIndex: number) => {
    setSelectedRemnants(prev => {
      const newState = { ...prev };
      delete newState[binIndex]; // Remove apenas o retalho desta chapa
      return newState;
    });
  }, []);

  const clearAllRemnants = useCallback(() => {
    setSelectedRemnants({});
  }, []);

  const getRemnantForBin = useCallback((binIndex: number) => {
    return selectedRemnants[binIndex] || null;
  }, [selectedRemnants]);

  return {
    selectedRemnants,
    setRemnantForBin,
    removeRemnantFromBin,
    clearAllRemnants,
    getRemnantForBin
  };
}