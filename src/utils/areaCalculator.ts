/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Calcula a área de um segmento circular criado por um "bulge" (curvatura em polilinha).
 */
const calculateArcSegmentArea = (p1: {x:number, y:number}, p2: {x:number, y:number}, bulge: number) => {
  if (bulge === 0) return 0;
  
  const chordDx = p2.x - p1.x;
  const chordDy = p2.y - p1.y;
  const chordLen = Math.sqrt(chordDx * chordDx + chordDy * chordDy);
  
  // Ângulo de varredura (Sweep Angle) = 4 * atan(|bulge|)
  const alpha = 4 * Math.atan(Math.abs(bulge));
  
  // Raio = (L * (1 + b^2)) / (4 * |b|)
  const radius = (chordLen * (1 + bulge * bulge)) / (4 * Math.abs(bulge));
  
  // Área do Setor - Área do Triângulo
  // Fórmula: (R^2 / 2) * (alpha - sin(alpha))
  const areaSegment = (radius * radius / 2) * (alpha - Math.sin(alpha));
  
  // Se bulge for negativo, a área é subtraída (curva para dentro), se positivo, somada.
  return bulge > 0 ? areaSegment : -areaSegment;
};

/**
 * Calcula a Área Líquida (True Shape) baseada nas entidades do DXF.
 * Usa a "Fórmula de Shoelace" (Laço) para polígonos e soma círculos.
 */
export const calculatePartNetArea = (entities: any[]): number => {
  if (!entities || entities.length === 0) return 0;
  
  let area = 0;

  entities.forEach(ent => {
    // 1. CÍRCULOS (pi * r²)
    if (ent.type === 'CIRCLE') {
      if (ent.radius) {
        area += Math.PI * (ent.radius * ent.radius);
      }
    } 
    // 2. POLILINHAS (Shoelace Formula + Ajuste de Arcos)
    else if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') {
        if (!ent.vertices || ent.vertices.length < 2) return;
        
        // Percorre os vértices aplicando a fórmula do laço
        for (let i = 0; i < ent.vertices.length; i++) {
            const p1 = ent.vertices[i];
            const p2 = ent.vertices[(i + 1) % ent.vertices.length]; // O último liga com o primeiro
            
            // Parte Linear (Trapézio)
            area += (p1.x * p2.y - p2.x * p1.y);

            // Parte Curva (Bulge), se houver
            if (p1.bulge) {
                area += 2 * calculateArcSegmentArea(p1, p2, p1.bulge);
            }
        }
    }
  });

  // A fórmula de Shoelace retorna 2x a área e pode ser negativa dependendo do sentido.
  // Dividimos por 2 e pegamos o valor absoluto.
  return Math.abs(area / 2);
};