/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react'; // Necessário para os tipos do React
export interface ImportedPart {
  id: string;
  name: string;
  entities: any[];
  blocks: any;
  
  // Geometria
  width: number;
  height: number;
  grossArea: number;
  netArea: number;

  // Novos Campos Administrativos (Banco de Dados)
  pedido: string;
  op: string;
  material: string;
  espessura: string;
  autor: string;
  dataCadastro: string; // ISO String
  cliente?: string;     // Opcional, mas útil
  quantity: number;
}

// --- ADICIONE DAQUI PARA BAIXO ---

export const THICKNESS_OPTIONS = [
  "28", "26", "24", "22", "20", "18", "16", "14", '1/8"', '3/16"', '1/4"', '5/16"',
];

export interface BatchDefaults {
  pedido: string;
  op: string;
  material: string;
  espessura: string;
  autor: string;
}

export interface EngineeringScreenProps {
  onBack: () => void;
  onSendToNesting: (parts: ImportedPart[], searchQuery?: string) => void;
  parts: ImportedPart[];
  setParts: React.Dispatch<React.SetStateAction<ImportedPart[]>>;
}
