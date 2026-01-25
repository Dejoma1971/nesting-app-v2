// src/services/paymentService.ts
// IMPORTANTE: Importamos a variável de texto, não a instância do axios, 
// já que você optou por usar 'fetch' neste serviço.
import { API_URL } from './api';

export const handleSubscription = async (
  planType: 'premium' | 'corporate', 
  quantity: number = 1,
  token?: string 
) => {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    // Agora o API_URL será reconhecido corretamente
    const response = await fetch(`${API_URL}/payment/checkout`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        planType,
        quantity, 
      }),
    });

    const data = await response.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      console.error("Erro Stripe:", data);
      alert("Erro ao iniciar pagamento. Tente novamente.");
    }

  } catch (error) {
    console.error("Erro na requisição:", error);
    alert("Não foi possível conectar ao servidor de pagamento.");
  }
};