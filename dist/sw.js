// public/sw.js
self.addEventListener('install', (e) => {
  console.log('[Service Worker] Instalado');
  // Força o SW a ativar imediatamente
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  console.log('[Service Worker] Ativado');
  // Assume o controle de todas as abas abertas imediatamente
  return self.clients.claim();
});

// O Chrome EXIGE um "fetch handler" para considerar o app instalável
self.addEventListener('fetch', (e) => {
  // Por enquanto, apenas repassa a requisição para a internet (não faz cache offline real ainda)
  e.respondWith(fetch(e.request));
});