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
          src: normalizePath(path.resolve(__dirname, 'node_modules/clipper2-wasm/**/*.wasm')),
          dest: '.',
          rename: (name, extension) => `${name}.${extension}`
        }
      ]
    })
  ],
  resolve: {
    // Garante que apenas uma instância do React seja usada no build
    dedupe: ['react', 'react-dom'],
  },
  build: {
    chunkSizeWarningLimit: 1000,
    commonjsOptions: {
      // Essencial para o Rollup traduzir bibliotecas que misturam CommonJS e ESM (ex: @dnd-kit)
      transformMixedEsModules: true,
    },
    // ⬇️ TEMPORARIAMENTE COMENTADO para permitir que o Vite gerencie a ordem correta ⬇️
    /*
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
              return 'vendor-react';
            }
            if (id.includes('@dnd-kit')) {
              return 'vendor-dnd';
            }
            return 'vendor';
          }
        }
      }
    }
    */
  },
  worker: {
    format: 'es',
  }
})