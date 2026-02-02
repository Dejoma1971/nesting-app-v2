/* eslint-disable @typescript-eslint/no-explicit-any */

// --- LISTA DE ENTIDADES PROIBIDAS (Se estiverem soltas no Model Space) ---
const FORBIDDEN_LOOSE_TYPES = [
  "LINE",
  "LWPOLYLINE",
  "POLYLINE",
  "ARC",
  "CIRCLE",
  "SPLINE",
  "ELLIPSE",
  "HATCH",
];

/**
 * O PORTEIRO (Gatekeeper) - Versão "Fail Fast" (Alta Performance)
 * * Função: Verifica se o arquivo contém geometria solta.
 * * Diferença: Para na PRIMEIRA entidade inválida encontrada.
 * Ação: Se encontrar 1 erro, aborta imediatamente. Não perde tempo contando.
 */
export const runGatekeeper = (rawEntities: any[]): any[] => {
  // Otimização: .find() para o loop assim que encontra true.
  // Em um arquivo de 50.000 linhas, se a primeira for linha solta,
  // ele executa 1 vez e para (antes executava 50.000 vezes).
  const firstInvalidEntity = rawEntities.find((ent) =>
    FORBIDDEN_LOOSE_TYPES.includes(ent.type),
  );

  // Se encontrou algo, bloqueia imediatamente
  if (firstInvalidEntity) {
    // MENSAGEM DE ERRO RÁPIDA
    // Não informamos a quantidade total, pois paramos de contar para não travar a tela.
    throw new Error(
      `VALIDATION_ERROR: Detectamos geometria solta (tipo: ${firstInvalidEntity.type}) fora de blocos. A análise foi interrompida imediatamente para economizar memória.`,
    );
  }

  // Se passou na validação (loop terminou sem achar nada), libera.
  return rawEntities;
};

