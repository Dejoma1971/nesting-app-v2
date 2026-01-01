import React from "react";
import { NestingBoard } from "./NestingBoard";
import type { ImportedPart } from "./types";

interface DxfReaderProps {
  preLoadedParts?: ImportedPart[];
  autoSearchQuery?: string; // <--- NOVO PROP
  onBack: () => void;
  onNavigate?: (screen: "home" | "engineering" | "nesting") => void;
}

// CORREÇÃO 1: Adicionar 'onNavigate' na desestruturação das props
export const DxfReader: React.FC<DxfReaderProps> = ({
  preLoadedParts,
  autoSearchQuery,
  onBack,
  onNavigate, // <--- ADICIONE AQUI
}) => {
  return (
    <NestingBoard
      initialParts={preLoadedParts || []}
      initialSearchQuery={autoSearchQuery}
      onBack={onBack}
      onNavigate={onNavigate} // <--- CORREÇÃO 2: Repassar para o componente filho
    />
  );
};
