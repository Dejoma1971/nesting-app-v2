import axios from 'axios';

// Usamos a variável de ambiente ou o fallback do localhost
// O sufixo /api é importante se o seu backend estiver configurado assim
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: API_URL, // Trocamos BASE_URL por API_URL aqui
});

// --- INTERCEPTADOR DE SEGURANÇA ---
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token'); 

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
});

