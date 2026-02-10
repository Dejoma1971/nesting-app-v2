// src/utils/transformUtils.ts

import type { PlacedPart, ImportedPart } from "./nestingCore"; // Ajuste o caminho se necessário

// Função auxiliar para graus -> radianos
const toRad = (deg: number) => (deg * Math.PI) / 180;

// Função auxiliar (igual à do seu código atual) para calcular dimensões da Bounding Box
export const calculateRotatedDimensions = (
  width: number,
  height: number,
  rotationDeg: number,
) => {
  const rad = toRad(rotationDeg);
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));

  const occupiedW = width * cos + height * sin;
  const occupiedH = width * sin + height * cos;

  return { occupiedW, occupiedH };
};

/**
 * Rotaciona um grupo de peças em torno do centro geométrico da seleção.
 */
export const rotatePartsGroup = (
  allPlacedParts: PlacedPart[],
  selectedUUIDs: string[],
  allOriginalParts: ImportedPart[],
  angleDelta: number,
): PlacedPart[] => {
  // 1. Identificar as peças selecionadas
  const selectedParts = allPlacedParts.filter((p) =>
    selectedUUIDs.includes(p.uuid),
  );

  if (selectedParts.length === 0) return allPlacedParts;

  // Mapa rápido para buscar dados originais (largura/altura)
  const originalPartsMap = new Map<string, ImportedPart>();
  allOriginalParts.forEach((p) => originalPartsMap.set(p.id, p));

  // 2. Calcular o CENTRO ATUAL DE CADA PEÇA NO MUNDO
  // (Baseado na lógica do collisionCheck.ts que você forneceu)
  const partsWithCenters = selectedParts
    .map((placed) => {
      const original = originalPartsMap.get(placed.partId);
      if (!original) return null;

      // Se a peça estiver travada, ela não entra no cálculo de rotação,
      // mas precisamos saber onde ela está.
      // (Opcional: se quiser que peças travadas não girem nem de posição, filtre antes)

      const { occupiedW, occupiedH } = calculateRotatedDimensions(
        original.width,
        original.height,
        placed.rotation,
      );

      const worldCenterX = placed.x + occupiedW / 2;
      const worldCenterY = placed.y + occupiedH / 2;

      return {
        placed,
        original,
        worldCenterX,
        worldCenterY,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (partsWithCenters.length === 0) return allPlacedParts;

  // 3. Calcular o PIVÔ DO GRUPO (Centro da Bounding Box da Seleção)
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  partsWithCenters.forEach((p) => {
    if (p.worldCenterX < minX) minX = p.worldCenterX;
    if (p.worldCenterX > maxX) maxX = p.worldCenterX;
    if (p.worldCenterY < minY) minY = p.worldCenterY;
    if (p.worldCenterY > maxY) maxY = p.worldCenterY;
  });

  const pivotX = (minX + maxX) / 2;
  const pivotY = (minY + maxY) / 2;

  // Prepara seno e cosseno para a rotação do grupo
  const radDelta = toRad(angleDelta);
  const cos = Math.cos(radDelta);
  const sin = Math.sin(radDelta);

  // 4. Aplicar a Rotação Orbital
  const updatedSelectedParts = partsWithCenters.map(
    ({ placed, original, worldCenterX, worldCenterY }) => {
      // A. Verifica trava de rotação (Sentido Escovado)
      if (original.isRotationLocked) {
        // Só bloqueia se o ângulo NÃO for múltiplo de 180 (ex: 90, 45 bloqueia. 180 libera).
        if (Math.abs(angleDelta) % 180 !== 0) {
          return placed;
        }
        // Se for 180, o código ignora o return acima e segue para calcular a nova posição abaixo!
      }

      // B. Vetor do Pivô até o Centro da Peça
      const dx = worldCenterX - pivotX;
      const dy = worldCenterY - pivotY;

      // C. Rotacionar esse vetor (Matriz de Rotação 2D)
      const newDx = dx * cos - dy * sin;
      const newDy = dx * sin + dy * cos;

      // D. Novo Centro da Peça no Mundo
      const newWorldCenterX = pivotX + newDx;
      const newWorldCenterY = pivotY + newDy;

      // E. Nova Rotação da Peça
      // Normalizamos para 0-360
      const rawNewRotation = (placed.rotation + angleDelta) % 360;
      const newRotation =
        rawNewRotation < 0 ? rawNewRotation + 360 : rawNewRotation;

      // F. Recalcular 'placed.x' e 'placed.y' (Canto Superior Esquerdo da Bounding Box)
      // Precisamos das novas dimensões ocupadas com o novo ângulo
      const { occupiedW: newOccupiedW, occupiedH: newOccupiedH } =
        calculateRotatedDimensions(
          original.width,
          original.height,
          newRotation,
        );

      const newPlacedX = newWorldCenterX - newOccupiedW / 2;
      const newPlacedY = newWorldCenterY - newOccupiedH / 2;

      return {
        ...placed,
        x: newPlacedX,
        y: newPlacedY,
        rotation: newRotation,
      };
    },
  );

  // 5. Mesclar de volta na lista completa
  return allPlacedParts.map((p) => {
    const updated = updatedSelectedParts.find((u) => u.uuid === p.uuid);
    return updated || p;
  });
};
