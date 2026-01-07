import axios from 'axios';

// Define o endereço do seu servidor Back-end
// Se estiver rodando localmente, geralmente é a porta 3001 ou 3000
const BASE_URL = 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: BASE_URL,
});

// --- INTERCEPTADOR DE SEGURANÇA ---
// Antes de cada requisição, ele verifica se existe um token salvo
// e o anexa automaticamente no cabeçalho.
api.interceptors.request.use((config) => {
  // ATENÇÃO: Verifique no seu LoginScreen.tsx ou AuthContext.tsx 
  // qual o nome da chave que você usa para salvar o token. 
  // Geralmente é 'token', 'nesting_token' ou 'auth_token'.
  // Vou usar 'token' como padrão, mas ajuste se necessário.
  const token = localStorage.getItem('token'); 

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  
  return config;
});