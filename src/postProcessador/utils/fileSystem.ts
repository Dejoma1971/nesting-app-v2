// src/utils/fileSystem.ts

/**
 * Abre o seletor de arquivos nativo do sistema operacional.
 * @returns Uma Promise que resolve com o objeto File selecionado ou null se cancelado.
 */
export const selectDxfFile = (): Promise<File | null> => {
  return new Promise((resolve) => {
    // 1. Cria um elemento input invisível na memória
    const input = document.createElement('input');
    input.type = 'file';
    
    // 2. Define o filtro para aceitar apenas DXF
    input.accept = '.dxf'; 
    
    // 3. Escuta o evento de mudança (quando o usuário escolhe algo)
    input.onchange = (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      
      if (file) {
        resolve(file);
      } else {
        resolve(null);
      }
      
      // Limpa o input da memória após o uso
      input.remove();
    };

    // 4. Simula o clique para abrir a janela do Windows/OS
    input.click();
  });
};