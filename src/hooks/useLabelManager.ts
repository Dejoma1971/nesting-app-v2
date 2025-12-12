import { useState, useEffect, useCallback } from "react";
import type { ImportedPart } from "../components/types";
import type {
  LabelStateMap,
  LabelConfig,
} from "../components/labels/LabelTypes";

// Configurações Padrão
const DEFAULT_FONT_SIZE_WHITE = 20; // mm (Identificação Visual - Maior)
const DEFAULT_FONT_SIZE_PINK = 6; // mm (Gravação Técnica - Menor)

// --- AJUSTE DE POSIÇÃO PADRÃO (Para evitar sobreposição) ---
const DEFAULT_OFFSET_WHITE_Y = 15; // mm (Sobe um pouco)
const DEFAULT_OFFSET_PINK_Y = -15; // mm (Desce um pouco)

/**
 * Helper para extrair texto numérico inicial da peça
 * Ex: "PECA-1234-A" -> "1234"
 */
const extractInitialText = (part: ImportedPart): string => {
  // Prioridade: Pedido > OP > Nome
  const raw = part.pedido || part.op || part.name;
  if (!raw) return "???";
  // Extrai apenas números e hífens
  const numbers = raw.replace(/[^0-9-]/g, "");
  return numbers || raw; // Se não tiver números, devolve o nome original
};

export const useLabelManager = (parts: ImportedPart[]) => {
  // Estado Principal: Mapa de ID -> Configuração
  const [labelStates, setLabelStates] = useState<LabelStateMap>({});

  // Estados dos Checkboxes Globais (Visualmente apenas)
  const [globalWhiteEnabled, setGlobalWhiteEnabled] = useState(false);
  const [globalPinkEnabled, setGlobalPinkEnabled] = useState(false);

  // 1. Inicializa ou Sincroniza o estado quando novas peças chegam
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLabelStates((prev) => {
      const nextState = { ...prev };
      let hasChanges = false;

      parts.forEach((part) => {
        // Se essa peça ainda não tem configuração, cria a padrão
        if (!nextState[part.id]) {
          const defaultText = extractInitialText(part);

          nextState[part.id] = {
            white: {
              active: false, // Começa desligado
              text: defaultText,
              rotation: 0,
              fontSize: DEFAULT_FONT_SIZE_WHITE,
              offsetX: 0,
              offsetY: DEFAULT_OFFSET_WHITE_Y, // <--- APLICA O DESLOCAMENTO
            },
            pink: {
              active: false,
              text: defaultText,
              rotation: 0,
              fontSize: DEFAULT_FONT_SIZE_PINK,
              offsetX: 0,
              offsetY: DEFAULT_OFFSET_PINK_Y, // <--- APLICA O DESLOCAMENTO
            },
          };
          hasChanges = true;
        }
      });

      return hasChanges ? nextState : prev;
    });
  }, [parts]);

  // 2. Ação: Checkbox Global (Ligar/Desligar Tudo)
  const toggleGlobal = useCallback(
    (type: "white" | "pink", forceValue?: boolean) => {
      setLabelStates((prev) => {
        const next = { ...prev };
        // Determina o novo valor (se não passado forceValue, inverte o estado atual do botão)
        const isWhite = type === "white";
        const currentGlobal = isWhite ? globalWhiteEnabled : globalPinkEnabled;
        const newValue = forceValue !== undefined ? forceValue : !currentGlobal;

        // Atualiza os estados locais dos botões globais
        if (isWhite) setGlobalWhiteEnabled(newValue);
        else setGlobalPinkEnabled(newValue);

        // Aplica a TODAS as peças
        Object.keys(next).forEach((partId) => {
          if (next[partId][type]) {
            next[partId] = {
              ...next[partId],
              [type]: {
                ...next[partId][type],
                active: newValue,
              },
            };
          }
        });

        return next;
      });
    },
    [globalWhiteEnabled, globalPinkEnabled]
  );

  // 3. Ação: Toggle Individual (Click na Miniatura)
  const togglePartFlag = useCallback(
    (partId: string, type: "white" | "pink") => {
      setLabelStates((prev) => {
        const currentPartState = prev[partId];
        if (!currentPartState) return prev;

        return {
          ...prev,
          [partId]: {
            ...currentPartState,
            [type]: {
              ...currentPartState[type],
              active: !currentPartState[type].active, // Inverte só este
            },
          },
        };
      });
    },
    []
  );

  // 4. Ação: Atualização Fina (Menu de Contexto: Rotação, Tamanho, Texto)
  const updateLabelConfig = useCallback(
    (partId: string, type: "white" | "pink", changes: Partial<LabelConfig>) => {
      setLabelStates((prev) => {
        const currentPartState = prev[partId];
        if (!currentPartState) return prev;

        return {
          ...prev,
          [partId]: {
            ...currentPartState,
            [type]: {
              ...currentPartState[type],
              ...changes, // Aplica as mudanças (ex: { rotation: 90 })
            },
          },
        };
      });
    },
    []
  );

  return {
    labelStates,
    globalWhiteEnabled,
    globalPinkEnabled,
    toggleGlobal,
    togglePartFlag,
    updateLabelConfig,
  };
};
