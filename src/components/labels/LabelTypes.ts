// Definição de uma etiqueta individual (Branca ou Rosa)
export interface LabelConfig {
  active: boolean;      // A flag está ligada?
  text: string;         // O conteúdo do texto
  rotation: number;     // 0, 90, 180, 270
  fontSize: number;     // Tamanho da fonte (mm)
  offsetX: number;      // Posição X relativa ao centro da peça
  offsetY: number;      // Posição Y relativa ao centro da peça
}

// O estado de etiquetas de UMA peça
export interface PartLabelState {
  white: LabelConfig;   // Identificação (Visual)
  pink: LabelConfig;    // Gravação (CNC)
}

// Mapa global: ID da Peça -> Estado das Etiquetas
export type LabelStateMap = Record<string, PartLabelState>;

// Props para o Menu de Contexto
export interface LabelContextMenuProps {
  visible: boolean;
  x: number;
  y: number;
  type: 'white' | 'pink';
  partId: string;
  currentConfig: LabelConfig;
  onClose: () => void;
  onUpdate: (updates: Partial<LabelConfig>) => void; // Para salvar rotação/tamanho
  onToggleFlag: () => void; // Para desligar a flag
}