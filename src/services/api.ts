import axios from "axios";

// Detecta automaticamente o ambiente:
// Se houver variável configurada, usa ela.
// Se for o build de produção (npm run build), usa a URL relativa '/api'.
// Se for desenvolvimento local (npm run dev), usa o 'localhost:3001/api'.
export const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "/api" : "http://localhost:3001/api");

export const api = axios.create({
  baseURL: API_URL,
});

// --- INTERCEPTADOR DE SEGURANÇA ---
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
