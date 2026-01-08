import { useState, useEffect } from "react";

// 1. SOLUÇÃO DO ERRO 'ANY': Definimos a tipagem exata do evento
interface IBeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    // Agora o TypeScript sabe o formato, não é mais 'any'
    deferredPrompt: IBeforeInstallPromptEvent | null;
  }
}

export const useInstallPrompt = () => {
  // 2. SOLUÇÃO DO ERRO 'SETSTATE':
  // Inicializamos o estado já verificando se o valor existe (Lazy Initialization).
  // Assim, não precisamos fazer isso dentro do useEffect, evitando o render duplo.
  const [isInstallable, setIsInstallable] = useState<boolean>(() => {
    return typeof window !== "undefined" && !!window.deferredPrompt;
  });

  useEffect(() => {
    // Escuta eventos que possam acontecer DEPOIS que a página carregou
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      // O 'as' garante ao TS que é o evento correto
      window.deferredPrompt = e as IBeforeInstallPromptEvent;
      setIsInstallable(true);
      console.log("Hook: Evento capturado em tempo real!");
    };

    const handleAppInstalled = () => {
      console.log("Hook: App instalado com sucesso!");
      setIsInstallable(false);
      window.deferredPrompt = null;
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = () => {
    const promptEvent = window.deferredPrompt;
    if (!promptEvent) {
      return;
    }

    promptEvent.prompt();

    promptEvent.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === "accepted") {
        console.log("Usuário aceitou a instalação");
        setIsInstallable(false);
      } else {
        console.log("Usuário recusou a instalação");
      }
      window.deferredPrompt = null;
    });
  };

  return { isInstallable, handleInstallClick };
};
