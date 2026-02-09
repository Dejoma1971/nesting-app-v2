import { useRef, useCallback, useEffect } from "react";

interface Transform {
  x: number;
  y: number;
  k: number;
}

interface CanvasNavOptions {
  onVisualUpdate?: (t: Transform) => void;
  initTransform?: Transform;
}

export const useCanvasNav = (
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  options?: CanvasNavOptions
) => {
  // Estado mutável mantido fora do ciclo de renderização do React
  const transformRef = useRef<Transform>(options?.initTransform || { x: 0, y: 0, k: 1 });
  const isDraggingRef = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);

  // Helper para atualizar o cursor sem re-renderizar o React
  const updateCursor = useCallback(() => {
    if (!canvasRef.current) return;
    if (isDraggingRef.current) {
      canvasRef.current.style.cursor = "grabbing";
    } else if (transformRef.current.k > 1.01) {
      canvasRef.current.style.cursor = "grab";
    } else {
      canvasRef.current.style.cursor = "default";
    }
  }, [canvasRef]);

  const notifyUpdate = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      if (options?.onVisualUpdate) {
        options.onVisualUpdate(transformRef.current);
      }
      rafRef.current = null;
    });
  }, [options]);

  const resetView = useCallback(() => {
    transformRef.current = { x: 0, y: 0, k: 1 };
    updateCursor();
    notifyUpdate();
  }, [notifyUpdate, updateCursor]);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const zoomIntensity = 0.1;
      const wheelDirection = e.deltaY < 0 ? 1 : -1;
      const scaleFactor = Math.exp(wheelDirection * zoomIntensity);

      const current = transformRef.current;
      const newK = Math.max(0.1, Math.min(current.k * scaleFactor, 50));

      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const newX = mouseX - (mouseX - current.x) * (newK / current.k);
      const newY = mouseY - (mouseY - current.y) * (newK / current.k);

      transformRef.current = { x: newX, y: newY, k: newK };
      updateCursor(); // Atualiza cursor
      notifyUpdate();
    },
    [canvasRef, notifyUpdate, updateCursor]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    isDraggingRef.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    updateCursor(); // Atualiza cursor imediatamente
  }, [updateCursor]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDraggingRef.current) return;

    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;

    lastPos.current = { x: e.clientX, y: e.clientY };

    const current = transformRef.current;
    transformRef.current = {
      ...current,
      x: current.x + dx,
      y: current.y + dy,
    };
    
    notifyUpdate();
  }, [notifyUpdate]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    updateCursor(); // Restaura cursor de "grab" ou "default"
  }, [updateCursor]);

  useEffect(() => {
    const handleGlobalUp = () => {
      isDraggingRef.current = false;
      updateCursor();
    };
    window.addEventListener("mouseup", handleGlobalUp);
    return () => window.removeEventListener("mouseup", handleGlobalUp);
  }, [updateCursor]);

  return {
    transformRef,
    handlers: {
      onWheel: handleWheel,
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
      onDoubleClick: resetView
    },
    resetView
  };
};