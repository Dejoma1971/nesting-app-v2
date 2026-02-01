import { api } from './api';

export const handleSubscription = async (
  planType: 'premium' | 'corporate', 
  quantity: number = 1,
  _token?: any // Aceita o token mas ignora, para não quebrar o TS
) => {
  try {
    // O axios já usa o token do localStorage via interceptor no api.ts
    const response = await api.post('/payment/checkout', {
      planType,
      quantity, 
    });

    if (response.data.url) {
      window.location.href = response.data.url;
    } else {
      alert("Erro ao iniciar pagamento.");
    }
  } catch (error) {
    console.error("Erro na requisição:", error);
    alert("Não foi possível conectar ao servidor de pagamento.");
  }
};
