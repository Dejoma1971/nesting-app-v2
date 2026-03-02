import { useEffect, useRef } from "react";

interface UseKeyboardShortcutsProps {
  selectedPartIds: string[];
  moveStep: number;
  fineRotStep: number;
  onMove: (dx: number, dy: number) => void;
  onRotate: (angle: number) => void;
  onDelete: () => void;
}

export const useKeyboardShortcuts = ({
  selectedPartIds,
  moveStep,
  fineRotStep,
  onMove,
  onRotate,
  onDelete,
}: UseKeyboardShortcutsProps) => {
  const stateRef = useRef({
    selectedPartIds,
    moveStep,
    fineRotStep,
    onMove,
    onRotate,
    onDelete,
  });

  useEffect(() => {
    stateRef.current = {
      selectedPartIds,
      moveStep,
      fineRotStep,
      onMove,
      onRotate,
      onDelete,
    };
  }, [selectedPartIds, moveStep, fineRotStep, onMove, onRotate, onDelete]);

  const activeContinuousRef = useRef<{
    dx: number;
    dy: number;
    dRot: number;
  } | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. BLINDAGEM: Ignora se estiver digitando num input
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      const {
        selectedPartIds,
        moveStep,
        fineRotStep,
        onMove: moveFn,
        onRotate: rotFn,
        onDelete: delFn,
      } = stateRef.current;

      // 2. BLINDAGEM: Só ativa se houver peças selecionadas
      if (selectedPartIds.length === 0) return;

      const keyStr = e.key.toLowerCase();
      const codeStr = (e.code || "").toLowerCase();

      // 3. ATALHO: DEVOLVER PARA A LISTA (Delete ou Backspace) - Não exige Shift
      if (
        keyStr === "delete" ||
        keyStr === "backspace" ||
        codeStr === "delete" ||
        codeStr === "backspace"
      ) {
        e.preventDefault();
        delFn();
        return;
      }

      // 4. ATALHOS DE MANIPULAÇÃO: Todos exigem SHIFT
      if (!e.shiftKey) return;

      if (e.repeat) {
        e.preventDefault();
        return;
      }

      let dx = 0;
      let dy = 0;
      let dRot = 0;
      let isFixedRot = false;

      // Translação
      if (keyStr === "arrowup") dy = -moveStep;
      else if (keyStr === "arrowdown") dy = moveStep;
      else if (keyStr === "arrowleft") dx = -moveStep;
      else if (keyStr === "arrowright") dx = moveStep;
      
      // Rotação Fixa ABSOLUTA (Garante leitura de teclados BR e Americanos)
      else if (
        keyStr === "9" ||
        keyStr === ")" ||
        keyStr === "(" ||
        codeStr === "digit9" ||
        codeStr === "numpad9"
      ) {
        dRot = e.ctrlKey || e.metaKey ? -90 : 90;
        isFixedRot = true;
      } else if (
        keyStr === "4" ||
        keyStr === "$" ||
        codeStr === "digit4" ||
        codeStr === "numpad4"
      ) {
        dRot = e.ctrlKey || e.metaKey ? -45 : 45;
        isFixedRot = true;
      } 
      
      // Rotação Fina
      else if (codeStr === "keye") {
        dRot = fineRotStep; // 'E' Esquerda
      } else if (codeStr === "keyd") {
        dRot = -fineRotStep; // 'D' Direita
      }

      // === EXECUÇÃO ===
      if (dx !== 0 || dy !== 0 || dRot !== 0) {
        e.preventDefault();

        if (dx !== 0 || dy !== 0) moveFn(dx, dy);
        if (dRot !== 0) rotFn(dRot);

        // Inicia o motor contínuo
        if ((e.ctrlKey || e.metaKey) && !isFixedRot) {
          activeContinuousRef.current = { dx, dy, dRot };
          if (!intervalRef.current) {
            intervalRef.current = window.setInterval(() => {
              const currentAction = activeContinuousRef.current;
              if (currentAction) {
                const { onMove: loopMove, onRotate: loopRot } = stateRef.current;
                if (currentAction.dx !== 0 || currentAction.dy !== 0)
                  loopMove(currentAction.dx, currentAction.dy);
                if (currentAction.dRot !== 0) loopRot(currentAction.dRot);
              }
            }, 50);
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const keyStr = e.key.toLowerCase();
      const codeStr = (e.code || "").toLowerCase();
      
      if (
        keyStr === "arrowup" ||
        keyStr === "arrowdown" ||
        keyStr === "arrowleft" ||
        keyStr === "arrowright" ||
        codeStr === "keye" ||
        codeStr === "keyd" ||
        keyStr === "shift" ||
        keyStr === "control" ||
        keyStr === "meta"
      ) {
        if (intervalRef.current) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        activeContinuousRef.current = null;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, []);
};