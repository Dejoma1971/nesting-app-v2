/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ImportedPart } from "../components/types";
import { textToVectorLines } from "./vectorFont";

export type LabelMode = 'none' | 'visual' | 'marking';

// Cores
const COLOR_VISUAL = "#FFFFFF"; // Branco
const COLOR_MARKING = "#FF00FF"; // Magenta (Gravação)
const TEXT_HEIGHT = 20; // Tamanho da letra em mm (Ajuste conforme necessidade da máquina)

/**
 * Remove etiquetas anteriores (busca pela flag isLabel)
 */
const removeLabels = (entities: any[]): any[] => {
    return entities.filter(ent => !ent.isLabel);
};

/**
 * Extrai apenas números de uma string
 * Ex: "PED-1234-A" -> "1234"
 */
const extractNumbers = (str: string): string => {
    if (!str) return "";
    // Mantém apenas dígitos e hífens. Remove letras e espaços.
    return str.replace(/[^0-9-]/g, '');
};

/**
 * Gera as linhas do texto
 */
const createVectorLabel = (part: ImportedPart, mode: 'visual' | 'marking'): any[] => {
    const centerX = part.width / 2;
    const centerY = part.height / 2;

    // Lógica de Prioridade: Pedido > OP > Nome
    let rawText = "";
    if (part.pedido) rawText = part.pedido;
    else if (part.op) rawText = part.op;
    else rawText = part.name;

    // Limpa o texto (Só números)
    const cleanText = extractNumbers(rawText);

    if (!cleanText) return [];

    const color = mode === 'visual' ? COLOR_VISUAL : COLOR_MARKING;

    // Gera as linhas vetoriais
    return textToVectorLines(cleanText, centerX, centerY, TEXT_HEIGHT, color);
};

export const applyLabelsToParts = (
    parts: ImportedPart[], 
    mode: LabelMode
): ImportedPart[] => {
    if (mode === 'none') {
        return parts.map(part => ({
            ...part,
            entities: removeLabels(part.entities)
        }));
    }

    return parts.map(part => {
        const cleanEntities = removeLabels(part.entities);
        const labelLines = createVectorLabel(part, mode);
        
        return {
            ...part,
            entities: [...cleanEntities, ...labelLines] // Adiciona as linhas do texto
        };
    });
};