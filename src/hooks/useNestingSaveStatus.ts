import { useState, useCallback } from "react";
import type { PlacedPart } from "../utils/nestingCore";

export const useNestingSaveStatus = (allParts: PlacedPart[]) => {
  // Estado que mapeia: Bin ID -> Hash salvo
  // Ex: { 0: "hash_string_chapa_1", 1: "hash_string_chapa_2" }
  const [savedBins, setSavedBins] = useState<Record<number, string>>({});

  // 1. Gera o hash APENAS para as peças de uma chapa específica
  const generateBinHash = useCallback(
    (layout: PlacedPart[], binIndex: number) => {
      // Filtra apenas as peças da chapa solicitada
      const binParts = layout.filter((p) => p.binId === binIndex);

      if (binParts.length === 0) return "empty";

      // Cria a assinatura baseada em ID, Posição e Rotação
      const simplified = binParts
        .map((p) => ({
          id: p.uuid,
          x: p.x.toFixed(3),
          y: p.y.toFixed(3),
          r: p.rotation,
        }))
        // Ordena por ID para garantir consistência
        .sort((a, b) => a.id.localeCompare(b.id));

      return JSON.stringify(simplified);
    },
    []
  );

  // 2. Verifica se uma chapa específica está salva
  const isBinSaved = useCallback(
    (binIndex: number) => {
      // Calcula o hash atual da tela para essa chapa
      const currentHash = generateBinHash(allParts, binIndex);

      // Recupera o hash que estava salvo na memória
      const savedHash = savedBins[binIndex];

      // Se não tiver nada salvo, retorna false.
      if (!savedHash) return false;

      // Retorna true apenas se forem idênticos
      return currentHash === savedHash;
    },
    [allParts, savedBins, generateBinHash]
  );

  // 3. Marca uma chapa específica como salva
  const markBinAsSaved = useCallback(
    (binIndex: number) => {
      const currentHash = generateBinHash(allParts, binIndex);
      setSavedBins((prev) => ({
        ...prev,
        [binIndex]: currentHash,
      }));
    },
    [allParts, generateBinHash]
  );

  // 4. Reseta tudo (para novo cálculo ou limpar mesa)
  const resetAllSaveStatus = useCallback(() => {
    setSavedBins({});
  }, []);

  return {
    isBinSaved,
    markBinAsSaved,
    resetAllSaveStatus,
  };
};
