// src/utils/nestingAdapter.ts

// Fator de escala para manter precisão decimal (Clipper só aceita inteiros)
// Ex: 10.5mm * 10000 = 105000
const SCALE = 10000; 

export interface Point {
  x: number;
  y: number;
}

// Converte coordenadas do seu App para o formato do Clipper
export function toClipperPath(points: Point[]): { X: number; Y: number }[] {
  return points.map(p => ({
    X: Math.round(p.x * SCALE),
    Y: Math.round(p.y * SCALE)
  }));
}

// Converte coordenadas do Clipper de volta para o seu App
export function fromClipperPath(clipperPath: { X: number; Y: number }[]): Point[] {
  return clipperPath.map(p => ({
    x: p.X / SCALE,
    y: p.Y / SCALE
  }));
}

// Função auxiliar para calcular área (para checar se é buraco ou contorno externo)
export function calculateArea(points: Point[]): number {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
    }
    return area / 2;
}