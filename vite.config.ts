import { defineConfig, normalizePath } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    viteStaticCopy({
      targets: [
        {
          // Encontra qualquer arquivo .wasm dentro do pacote
          src: normalizePath(path.resolve(__dirname, 'node_modules/clipper2-wasm/**/*.wasm')),
          dest: '.', // Define o destino como a raiz
          // Esta função faz o papel do antigo "flatten: true"
          // Ela pega apenas o nome e a extensão, descartando as pastas do caminho original
          rename: (name, extension) => `${name}.${extension}`
        }
      ]
    })
  ],
  // ⬇️ --- ADICIONE ESTE BLOCO 'build' --- ⬇️
  build: {
    chunkSizeWarningLimit: 1000, // Aumenta o limite do aviso para 1MB (reduz ruído)
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Separa bibliotecas de node_modules em arquivos diferentes (vendor chunks)
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            if (id.includes('@dnd-kit')) {
              return 'vendor-dnd';
            }
            // O restante vai para um arquivo genérico
            return 'vendor';
          }
        }
      }
    }
  },
  // ⬆️ ----------------------------------- ⬆️
  worker: {
    format: 'es',
  }
})