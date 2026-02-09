// ARQUIVO: src/postProcessador/modals/leadTypes.ts

export type LeadType = "None" | "Line" | "Arc" | "Line + Arc";

export interface LeadConfig {
  type: LeadType;
  angle: number;   // Graus
  length: number;  // mm
  radius: number;  // mm
  useHole: boolean;
  holeRadius: number;
}

export interface LeadParams {
  leadIn: LeadConfig;
  leadOut: LeadConfig;
  positionMode: "Automatic" | "Manual" | "Keep";
  positionAutoType?: "Vertex" | "LongEdge";
  positionManualParam?: number; // 0 a 1
  onlyClosed: boolean;
  onlyOuter: boolean;
  onlyInner: boolean;
}

// Valores Padrão
export const DEFAULT_LEAD_PARAMS: LeadParams = {
  leadIn: { type: "Line", angle: 90, length: 5, radius: 2, useHole: false, holeRadius: 1 },
  leadOut: { type: "Line", angle: 90, length: 2, radius: 2, useHole: false, holeRadius: 0 },
  positionMode: "Automatic",
  positionAutoType: "Vertex",
  positionManualParam: 0.5,
  onlyClosed: false,
  onlyOuter: true,
  onlyInner: false,
};