import React from "react";
import { NestingBoard } from "./NestingBoard";
import type { ImportedPart } from "./types";

interface DxfReaderProps {
  preLoadedParts?: ImportedPart[];
  autoSearchQuery?: string;
  onBack: () => void;
  // 👇 ADICIONE "dashboard" NESTA LINHA:
  onNavigate?: (screen: "home" | "engineering" | "nesting" | "dashboard") => void;
  onOpenTeam?: () => void;
  onEditOrder?: (parts: ImportedPart[]) => void;
}

export const DxfReader: React.FC<DxfReaderProps> = ({
  preLoadedParts,
  autoSearchQuery,
  onBack,
  onNavigate,
  onOpenTeam,
  onEditOrder,
}) => {
  return (
    <NestingBoard
      initialParts={preLoadedParts || []}
      initialSearchQuery={autoSearchQuery}
      onBack={onBack}
      // 👇 O erro sumirá agora porque os tipos são compatíveis
      onNavigate={onNavigate} 
      onOpenTeam={onOpenTeam}
      onEditOrder={onEditOrder}
    />
  );
};