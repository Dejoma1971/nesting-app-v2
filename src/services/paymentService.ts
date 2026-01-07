// src/services/paymentService.ts

// Ajuste a URL se sua porta for diferente (ex: 3000 ou 3001)
const API_URL = "http://localhost:3001/api"; 

export const handleSubscription = async (
  planType: 'premium' | 'corporate', 
  quantity: number = 1,
  token?: string // Opcional, caso o usuário já esteja logado (upgrade)
) => {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

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
      // Redireciona para o Stripe
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