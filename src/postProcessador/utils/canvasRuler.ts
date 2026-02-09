// src/postProcessador/utils/canvasRuler.ts

// --- CONFIGURAÇÕES VISUAIS ---
const RULER_SIZE = 20; // Altura/Largura total da régua
const FONT_SIZE = 9; // Fonte um pouco menor para caber melhor
const TICK_COLOR = "#888";
const TEXT_COLOR = "#ccc";
const BG_COLOR = "#2d2d2d";
const BORDER_COLOR = "#444";

// Alturas dos traços (Hierarquia)
const H_MAJOR = 18; // Traço Longo (com texto)
const H_MEDIUM = 12; // Traço Médio (meio do caminho)
const H_MINOR = 6; // Traço Curto

/**
 * Calcula o menor passo visível (Minor Step) baseado no zoom.
 * Garante que os traços não fiquem colados (min 6px de distância).
 */
const calculateMinorStep = (scale: number): number => {
  // Quantos milímetros cabem em ~8 pixels?
  // Se scale = 1 (1px=1mm), step deve ser pelo menos 8mm -> arredonda para 10mm.
  // Se scale = 10 (10px=1mm), step pode ser 1mm.

  const minPixelDist = 6; // Distância mínima visual entre traços menores
  const mmPerPixel = 1 / scale;
  const minMmDist = minPixelDist * mmPerPixel;

  // Encontra a potência de 10 ou múltiplo (1, 2, 5, 10, 20, 50...) mais próximo
  const magnitude = Math.pow(10, Math.floor(Math.log10(minMmDist)));
  const residual = minMmDist / magnitude;

  if (residual > 5) return magnitude * 10;
  if (residual > 2) return magnitude * 5;
  if (residual > 1) return magnitude * 2;
  return magnitude;
};

/**
 * Desenha réguas graduadas (Major, Medium, Minor) projetando coordenadas do mundo para a tela.
 */
export const drawRulersSmart = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  projectX: (x: number) => number,
  projectY: (y: number) => number,
  scale: number,
) => {
  ctx.save();

  // 1. Fundo e Estrutura
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, width, RULER_SIZE);
  ctx.fillRect(0, 0, RULER_SIZE, height);

  ctx.beginPath();
  ctx.strokeStyle = BORDER_COLOR;
  ctx.lineWidth = 1;
  ctx.moveTo(0, RULER_SIZE);
  ctx.lineTo(width, RULER_SIZE);
  ctx.moveTo(RULER_SIZE, 0);
  ctx.lineTo(RULER_SIZE, height);
  ctx.stroke();

  // Canto
  ctx.fillStyle = "#3e3e42";
  ctx.fillRect(0, 0, RULER_SIZE, RULER_SIZE);

  // 2. Configurações de Desenho
  ctx.fillStyle = TEXT_COLOR;
  ctx.strokeStyle = TICK_COLOR;
  ctx.font = `${FONT_SIZE}px monospace`;
  ctx.lineWidth = 1;

  // Calcula o passo menor (unidade base da régua atual)
  const minorStep = calculateMinorStep(scale);

  // Pequena margem de erro para comparações de float
  const epsilon = minorStep / 1000;

  // ==========================================================================
  // EIXO X (HORIZONTAL)
  // ==========================================================================
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.beginPath();

  const x0 = projectX(0);
  const xStepPixel = projectX(minorStep) - x0;

  if (Math.abs(xStepPixel) > 0.5) {
    // Evita loop infinito se step for zero
    const startK = Math.floor((0 - x0) / xStepPixel);
    const endK = Math.ceil((width - x0) / xStepPixel);

    for (let k = startK; k <= endK; k++) {
      const worldVal = k * minorStep;
      const screenX = x0 + k * xStepPixel;

      if (screenX > RULER_SIZE) {
        // Lógica Hierárquica
        // Verifica se é múltiplo de 10 (Major) ou 5 (Medium) do passo menor
        // Usamos Math.abs e epsilon para evitar erros tipo 99.99999 != 100

        const isMajor = Math.abs(worldVal % (minorStep * 10)) < epsilon;
        const isMedium =
          !isMajor && Math.abs(worldVal % (minorStep * 5)) < epsilon;

        let tickHeight = H_MINOR;
        if (isMajor) tickHeight = H_MAJOR;
        else if (isMedium) tickHeight = H_MEDIUM;

        // Desenha o traço (Alinhado à base da régua)
        ctx.moveTo(screenX, RULER_SIZE - tickHeight);
        ctx.lineTo(screenX, RULER_SIZE);

        // Desenha Texto apenas nos traços principais (Major)
        if (isMajor) {
          // Formatação limpa (sem casas decimais desnecessárias)
          const label = parseFloat(worldVal.toFixed(4)).toString();
          ctx.fillText(label, screenX, 2);
        }
      }
    }
  }
  ctx.stroke();

  // ==========================================================================
  // EIXO Y (VERTICAL)
  // ==========================================================================
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.beginPath();

  const y0 = projectY(0);
  const yStepPixel = projectY(minorStep) - y0;

  if (Math.abs(yStepPixel) > 0.5) {
    const startK = Math.floor((0 - y0) / yStepPixel);
    const endK = Math.ceil((height - y0) / yStepPixel);
    const minK = Math.min(startK, endK);
    const maxK = Math.max(startK, endK);

    for (let k = minK; k <= maxK; k++) {
      const worldVal = k * minorStep;
      const screenY = y0 + k * yStepPixel;

      if (screenY > RULER_SIZE) {
        const isMajor = Math.abs(worldVal % (minorStep * 10)) < epsilon;
        const isMedium =
          !isMajor && Math.abs(worldVal % (minorStep * 5)) < epsilon;

        let tickWidth = H_MINOR;
        if (isMajor) tickWidth = H_MAJOR;
        else if (isMedium) tickWidth = H_MEDIUM;

        // Desenha traço (Alinhado à direita da régua)
        ctx.moveTo(RULER_SIZE - tickWidth, screenY);
        ctx.lineTo(RULER_SIZE, screenY);

        if (isMajor) {
          // Texto vertical rotacionado para economizar espaço e ficar elegante
          ctx.save();
          ctx.translate(14, screenY); // Posição
          ctx.rotate(-Math.PI / 2); // Rotaciona 90 graus anti-horário
          const label = parseFloat(worldVal.toFixed(4)).toString();
          ctx.textAlign = "center";
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }
      }
    }
  }
  ctx.stroke();

  ctx.restore();
};
