// src/hooks/useCanvasPan.ts
import { useState, useRef, useCallback, type RefObject } from "react";

interface Transform {
  x: number;
  y: number;
  k: number;
}

export const useCanvasPan = (
  transform: Transform,
  onPan: (newT: Transform) => void,
  onPanEnd: (finalT: Transform) => void,
  containerRef: RefObject<HTMLDivElement | null>,
  transformRefGetter: RefObject<Transform>
) => {
  const [isPanning, setIsPanning] = useState(false);
  
  // Refs para controle de movimento e estado inicial
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, initialX: 0, initialY: 0 });
  const hasMovedRef = useRef(false); // Flag para saber se houve arraste real
  const rafRef = useRef<number | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // ALTERAÇÃO: Agora usamos o Botão Direito (button === 2) ou Botão do Meio (button === 1)
    // Isso libera o Botão Esquerdo (0) para o Retângulo de Seleção.
    if (e.button !== 2 && e.button !== 1) return;

    // Se transformRefGetter não estiver pronto, usa o state (fallback)
    const currentT = transformRefGetter.current || transform;

    setIsPanning(true);
    hasMovedRef.current = false; // Resetamos a flag de movimento
    
    dragStartRef.current = { 
      mouseX: e.clientX, 
      mouseY: e.clientY,
      initialX: currentT.x,
      initialY: currentT.y
    };
  }, [transform, transformRefGetter]);

  const onMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isPanning) return;

      e.preventDefault();

      // Verifica se moveu mais que um limiar mínimo (ex: 5px) para considerar "Arrasto"
      // Isso evita bloquear o menu de contexto se a mão tremer levemente no clique.
      const moveThreshold = 3;
      if (!hasMovedRef.current) {
         const dist = Math.hypot(e.clientX - dragStartRef.current.mouseX, e.clientY - dragStartRef.current.mouseY);
         if (dist > moveThreshold) {
            hasMovedRef.current = true;
         }
      }

      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      rafRef.current = requestAnimationFrame(() => {
        const rawDx = e.clientX - dragStartRef.current.mouseX;
        const rawDy = e.clientY - dragStartRef.current.mouseY;

        let scaleFactor = 1;
        const svgEl = containerRef.current?.querySelector("svg");
        
        if (svgEl) {
          const ctm = svgEl.getScreenCTM();
          if (ctm && ctm.a !== 0) {
            scaleFactor = ctm.a;
          }
        }

        const adjustedDx = rawDx / scaleFactor;
        const adjustedDy = rawDy / scaleFactor;

        const newTransform = {
          ...transform,
          k: transformRefGetter.current?.k || transform.k,
          x: dragStartRef.current.initialX + adjustedDx,
          y: dragStartRef.current.initialY + adjustedDy,
        };

        onPan(newTransform);
      });
    },
    [isPanning, transform, onPan, containerRef, transformRefGetter]
  );

  const onMouseUp = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    
    setIsPanning(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    // Se não houve movimento real, não salvamos nada (foi apenas um clique direito para abrir menu)
    if (!hasMovedRef.current) return;

    const rawDx = e.clientX - dragStartRef.current.mouseX;
    const rawDy = e.clientY - dragStartRef.current.mouseY;
    
    let scaleFactor = 1;
    const svgEl = containerRef.current?.querySelector("svg");
    if (svgEl) {
       const ctm = svgEl.getScreenCTM();
       if (ctm && ctm.a !== 0) scaleFactor = ctm.a;
    }
    
    const adjustedDx = rawDx / scaleFactor;
    const adjustedDy = rawDy / scaleFactor;
    const currentK = transformRefGetter.current?.k || transform.k;

    const finalTransform = {
      x: dragStartRef.current.initialX + adjustedDx,
      y: dragStartRef.current.initialY + adjustedDy,
      k: currentK
    };

    onPanEnd(finalTransform);

  }, [isPanning, transform, onPanEnd, containerRef, transformRefGetter]);

  const onMouseLeave = useCallback((e: React.MouseEvent) => {
    if (isPanning) onMouseUp(e);
  }, [isPanning, onMouseUp]);

  // NOVO: Handler para bloquear o menu de contexto SOMENTE se houve arraste
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    if (hasMovedRef.current) {
      e.preventDefault(); // Bloqueia o menu nativo/customizado pois foi um Pan
      e.stopPropagation();
      hasMovedRef.current = false; // Reset
    }
    // Se hasMovedRef for false, deixa o evento passar para abrir o Menu da Chapa
  }, []);

  return {
    isPanning,
    panHandlers: {
      onMouseDown,
      onMouseMove,
      onMouseUp,
      onMouseLeave,
      onContextMenu // Precisamos ligar este novo handler na div principal
    },
  };
};