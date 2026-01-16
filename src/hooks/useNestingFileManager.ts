import { useCallback, useRef } from "react";
import type { ImportedPart } from "../components/types";
import type { PlacedPart } from "../utils/nestingCore";
import type { CropLine } from "./useSheetManager";
import type { LabelStateMap } from "../components/labels/LabelTypes";

// --- DEFINIÇÕES DE TIPAGEM PARA FILE SYSTEM ACCESS API ---
// Como essa API é nova, definimos manualmente para evitar o uso de 'any'
interface FileSystemWritableFileStream {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
}

interface FileSystemFileHandle {
  createWritable: () => Promise<FileSystemWritableFileStream>;
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description: string;
    accept: Record<string, string[]>;
  }>;
}

// Estendemos a interface Window localmente
interface WindowWithFS extends Window {
  showSaveFilePicker?: (
    options?: SaveFilePickerOptions
  ) => Promise<FileSystemFileHandle>;
}

// --- DEFINIÇÃO DA ESTRUTURA DO ARQUIVO (SCHEMA) ---
export interface NestingProjectData {
  version: string;
  timestamp: number;
  parts: ImportedPart[];
  quantities: { [key: string]: number };
  nestingResult: PlacedPart[];
  binSize: { width: number; height: number };
  totalBins: number;
  currentBinIndex: number;
  cropLines: CropLine[];
  settings: {
    gap: number;
    margin: number;
    strategy: "guillotine" | "true-shape" | "wise";
    direction: "auto" | "vertical" | "horizontal";
  };
  labelStates: LabelStateMap;
  disabledNestingIds: string[];
}

interface UseNestingFileManagerProps {
  currentState: {
    parts: ImportedPart[];
    quantities: { [key: string]: number };
    nestingResult: PlacedPart[];
    binSize: { width: number; height: number };
    totalBins: number;
    currentBinIndex: number;
    cropLines: CropLine[];
    gap: number;
    margin: number;
    strategy: "guillotine" | "true-shape" | "wise";
    direction: "auto" | "vertical" | "horizontal";
    labelStates: LabelStateMap;
    disabledNestingIds: Set<string>;
  };
  setters: {
    setParts: (parts: ImportedPart[]) => void;
    setQuantities: (q: { [key: string]: number }) => void;
    setNestingResult: (res: PlacedPart[]) => void;
    setBinSize: (size: { width: number; height: number }) => void;
    setTotalBins: (n: number) => void;
    setCurrentBinIndex: (n: number) => void;
    setCropLines: (lines: CropLine[]) => void;
    setGap: (n: number) => void;
    setMargin: (n: number) => void;
    setStrategy: (s: "guillotine" | "true-shape" | "wise") => void;
    setDirection: (d: "auto" | "vertical" | "horizontal") => void;
    setLabelStates: (states: LabelStateMap) => void;
    setDisabledNestingIds: (ids: Set<string>) => void;
    resetProduction?: () => void;
    resetAllSaveStatus?: () => void;
  };
}

export const useNestingFileManager = ({
  currentState,
  setters,
}: UseNestingFileManagerProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // --- FUNÇÃO DE SALVAR (Com Janela 'Salvar Como') ---
  const handleSaveProject = useCallback(async () => {
    // 1. Validação
    if (
      currentState.parts.length === 0 &&
      currentState.nestingResult.length === 0
    ) {
      alert("O projeto está vazio. Adicione peças antes de salvar.");
      return;
    }

    // 2. Preparar Dados
    const projectData: NestingProjectData = {
      version: "1.0",
      timestamp: Date.now(),
      parts: currentState.parts,
      quantities: currentState.quantities,
      nestingResult: currentState.nestingResult,
      binSize: currentState.binSize,
      totalBins: currentState.totalBins,
      currentBinIndex: currentState.currentBinIndex,
      cropLines: currentState.cropLines,
      settings: {
        gap: currentState.gap,
        margin: currentState.margin,
        strategy: currentState.strategy,
        direction: currentState.direction,
      },
      labelStates: currentState.labelStates,
      disabledNestingIds: Array.from(currentState.disabledNestingIds),
    };

    try {
      const jsonString = JSON.stringify(projectData, null, 2);

      const dateStr = new Date().toISOString().split("T")[0];
      const suggestedName = `projeto_nesting_${dateStr}.json`;

      // 3. Tenta usar a API nativa (Show Save File Picker)
      // Usamos a interface WindowWithFS para o TypeScript reconhecer a função
      const win = window as WindowWithFS;

      if (win.showSaveFilePicker) {
        try {
          const handle = await win.showSaveFilePicker({
            suggestedName: suggestedName,
            types: [
              {
                description: "Arquivo de Projeto Nesting",
                accept: { "application/json": [".json"] },
              },
            ],
          });

          const writable = await handle.createWritable();
          await writable.write(jsonString);
          await writable.close();
          return;
        } catch (err: unknown) {
          // Correção do erro 'catch (err: any)'
          // Verificamos se é uma instância de Error antes de acessar .name
          if (err instanceof Error && err.name === "AbortError") return;

          console.error("Erro no FilePicker:", err);
          // Se der erro técnico, cai no fallback abaixo
        }
      }

      // 4. Fallback (Método antigo)
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = suggestedName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Erro ao salvar projeto:", error);
      alert("Erro ao gerar arquivo de salvamento.");
    }
  }, [currentState]);

  // --- FUNÇÃO DE CARREGAR (Mantida igual) ---
  const handleLoadProject = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();

      reader.onload = (event) => {
        try {
          const content = event.target?.result as string;
          if (!content) return;

          const data = JSON.parse(content) as NestingProjectData;

          if (!data.parts || !Array.isArray(data.parts)) {
            throw new Error("Formato inválido.");
          }

          if (
            currentState.parts.length > 0 &&
            !window.confirm("Isso substituirá o trabalho atual. Continuar?")
          ) {
            if (e.target) e.target.value = "";
            return;
          }

          // Aplicação dos Estados
          setters.setParts(data.parts);
          setters.setQuantities(data.quantities || {});
          setters.setNestingResult(data.nestingResult || []);

          if (data.binSize) setters.setBinSize(data.binSize);
          if (data.totalBins) setters.setTotalBins(data.totalBins);
          if (typeof data.currentBinIndex === "number")
            setters.setCurrentBinIndex(data.currentBinIndex);
          if (data.cropLines) setters.setCropLines(data.cropLines);

          if (data.settings) {
            if (data.settings.gap !== undefined)
              setters.setGap(data.settings.gap);
            if (data.settings.margin !== undefined)
              setters.setMargin(data.settings.margin);
            if (data.settings.strategy)
              setters.setStrategy(data.settings.strategy);
            if (data.settings.direction)
              setters.setDirection(data.settings.direction);
          }

          if (data.labelStates) setters.setLabelStates(data.labelStates);

          if (
            data.disabledNestingIds &&
            Array.isArray(data.disabledNestingIds)
          ) {
            setters.setDisabledNestingIds(new Set(data.disabledNestingIds));
          } else {
            setters.setDisabledNestingIds(new Set());
          }

          if (setters.resetProduction) setters.resetProduction();
          if (setters.resetAllSaveStatus) setters.resetAllSaveStatus();

          alert("Projeto carregado com sucesso!");
        } catch (error) {
          console.error("Erro ao ler arquivo:", error);
          alert("Erro ao carregar projeto.");
        } finally {
          if (e.target) e.target.value = "";
        }
      };

      reader.readAsText(file);
    },
    [currentState.parts.length, setters]
  );

  return {
    handleSaveProject,
    handleLoadProject,
    fileInputRef,
  };
};
