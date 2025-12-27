import type { ImportedPart } from "../types"; // Ajuste o caminho se necessário

const API_BASE = "http://localhost:3001/api";

export const EngineeringService = {
  // Verificar Status Trial
  getSubscriptionStatus: async (token: string) => {
    const response = await fetch(`${API_BASE}/subscription/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  },

  // Salvar Peças no Banco
  saveParts: async (token: string, parts: ImportedPart[]) => {
    const response = await fetch(`${API_BASE}/pecas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(parts),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Erro desconhecido no servidor");
    }
    return data;
  },
};