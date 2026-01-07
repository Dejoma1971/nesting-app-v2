import { useState, useEffect } from 'react';

// 1. Criamos uma interface para ensinar ao TypeScript o que é esse evento
interface IBeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const useInstallPrompt = () => {
  // 2. Agora usamos o tipo correto em vez de 'any'
  const [deferredPrompt, setDeferredPrompt] = useState<IBeforeInstallPromptEvent | null>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    // Aqui usamos 'Event' genérico e fazemos a conversão (cast) dentro
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      // "Asserção de tipo" para dizer que esse evento é o de instalação
      setDeferredPrompt(e as IBeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Mostra o prompt nativo
    deferredPrompt.prompt();

    // 3. Removemos a extração do 'outcome' para corrigir o erro de variável não usada.
    // Apenas aguardamos a escolha do usuário.
    await deferredPrompt.userChoice;
    
    // Se quiser saber o resultado no futuro, use:
    // const { outcome } = await deferredPrompt.userChoice;
    // console.log("Usuário escolheu:", outcome);

    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  return { isInstallable, handleInstallClick };
};