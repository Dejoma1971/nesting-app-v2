// src/components/types.ts
/* eslint-disable @typescript-eslint/no-explicit-any */

// A linha acima desativa o erro de 'any' para este arquivo.

export interface ImportedPart {
  id: string;
  name: string;
  entities: any[]; // Agora o erro vai sumir
  blocks: any; // E aqui também
  // Novos campos para a Lista Técnica
  width: number;     // Largura (mm)
  height: number;    // Altura (mm)
  grossArea: number; // Área Bruta (mm²)
  netArea: number;   // Área Líquida (mm²)
}
