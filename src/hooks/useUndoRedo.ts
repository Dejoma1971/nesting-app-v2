import { useState, useCallback } from "react";

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

export function useUndoRedo<T>(initialState: T) {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  // Função para checar se pode desfazer/refazer
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  // 1. DESFAZER (UNDO)
  const undo = useCallback(() => {
    setHistory((curr) => {
      if (curr.past.length === 0) return curr;

      const previous = curr.past[curr.past.length - 1];
      const newPast = curr.past.slice(0, curr.past.length - 1);

      return {
        past: newPast,
        present: previous,
        future: [curr.present, ...curr.future],
      };
    });
  }, []);

  // 2. REFAZER (REDO)
  const redo = useCallback(() => {
    setHistory((curr) => {
      if (curr.future.length === 0) return curr;

      const next = curr.future[0];
      const newFuture = curr.future.slice(1);

      return {
        past: [...curr.past, curr.present],
        present: next,
        future: newFuture,
      };
    });
  }, []);

  // 3. SETTER INTELIGENTE (Substitui o setState padrão)
  // Adiciona o estado atual ao passado antes de atualizar
  const set = useCallback((newPresent: T | ((curr: T) => T)) => {
    setHistory((curr) => {
      const resolvedPresent =
        typeof newPresent === "function"
          ? (newPresent as (curr: T) => T)(curr.present)
          : newPresent;

      // Se o novo estado for igual ao atual, ignora (evita histórico duplicado)
      if (JSON.stringify(curr.present) === JSON.stringify(resolvedPresent)) {
        return curr;
      }

      return {
        past: [...curr.past, curr.present],
        present: resolvedPresent,
        future: [], // Limpa o futuro quando uma nova ação é feita
      };
    });
  }, []);

  // 4. RESET (Para quando iniciar um novo cálculo automático)
  const reset = useCallback((newState: T) => {
    setHistory({
      past: [],
      present: newState,
      future: [],
    });
  }, []);

  return [history.present, set, undo, redo, reset, canUndo, canRedo] as const;
}