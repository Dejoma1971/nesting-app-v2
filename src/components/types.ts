/* eslint-disable @typescript-eslint/no-explicit-any */

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
  espessura: number;
  autor: string;
  dataCadastro: string; // ISO String
  cliente?: string;     // Opcional, mas útil
}