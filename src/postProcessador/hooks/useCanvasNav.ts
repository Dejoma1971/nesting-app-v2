import { useState, useRef, useCallback, useEffect } from "react";

interface Transform {
  x: number;
  y: number;
  k: number;
}

export const useCanvasNav = (
  canvasRef: React.RefObject<HTMLCanvasElement | null>
) => {
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  
  // Estado visual apenas para o cursor (Mãozinha fechada/aberta)
  const [isDragging, setIsDragging] = useState(false);

  // Refs para a lógica matemática (não causam re-render)
  const isDraggingRef = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const resetView = useCallback(() => {
    setTransform({ x: 0, y: 0, k: 1 });
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const zoomIntensity = 0.1;
      const wheelDirection = e.deltaY < 0 ? 1 : -1;
      const scaleFactor = Math.exp(wheelDirection * zoomIntensity);

      setTransform((prev) => {
        const newK = Math.max(0.1, Math.min(prev.k * scaleFactor, 50));
        
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return prev;
        
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const newX = mouseX - (mouseX - prev.x) * (newK / prev.k);
        const newY = mouseY - (mouseY - prev.y) * (newK / prev.k);

        return { x: newX, y: newY, k: newK };
      });
    },
    [canvasRef]
  );

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 && e.button !== 1) return;
    
    // Atualiza lógica e visual
    isDraggingRef.current = true;
    setIsDragging(true); 
    
    lastPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Usa a REF para checagem rápida (performance)
    if (!isDraggingRef.current) return;

    const dx = e.clientX - lastPos.current.x;
    const dy = e.clientY - lastPos.current.y;

    lastPos.current = { x: e.clientX, y: e.clientY };

    setTransform((prev) => ({
      ...prev,
      x: prev.x + dx,
      y: prev.y + dy,
    }));
  }, []);

  const handleMouseUp = useCallback(() => {
    // Atualiza lógica e visual
    isDraggingRef.current = false;
    setIsDragging(false);
  }, []);

  useEffect(() => {
    const handleGlobalUp = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
    };
    window.addEventListener("mouseup", handleGlobalUp);
    return () => window.removeEventListener("mouseup", handleGlobalUp);
  }, []);

  return {
    transform,
    isDragging, // <--- Exportamos o estado visual
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