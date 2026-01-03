import type { ImportedPart, CustomMaterial, CustomThickness } from "../types";

const API_BASE = "http://localhost:3001/api";

// --- FUNÇÃO AUXILIAR DE INTERCEPTAÇÃO ---
// Simplificada: Removemos o try/catch redundante.
// Se o fetch falhar (erro de rede), ele lança o erro automaticamente para quem chamou.
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(url, options);

  // SE O TOKEN FOR INVÁLIDO (403) OU AUSENTE (401)
  if (response.status === 401 || response.status === 403) {
    // 1. Dispara o evento global que o AuthContext está ouvindo
    window.dispatchEvent(new Event('auth:logout'));
    
    // 2. Lança erro para interromper o fluxo atual
    throw new Error("Sessão expirada.");
  }

  return response;
}

export const EngineeringService = {
  // ==========================================
  //  1. FUNCIONALIDADES ORIGINAIS
  // ==========================================

  getSubscriptionStatus: async (token: string) => {
    const response = await fetchWithAuth(`${API_BASE}/subscription/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  },

  saveParts: async (token: string, parts: ImportedPart[]) => {
    const response = await fetchWithAuth(`${API_BASE}/pecas`, {
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

  checkPartsExistence: async (token: string, items: { pedido: string; nome: string }[]) => {
    const response = await fetchWithAuth(`${API_BASE}/pecas/verificar-existencia`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}` 
      },
      body: JSON.stringify({ itens: items }),
    });

    if (!response.ok) return [];
    
    const data = await response.json();
    return data.duplicadas || [];
  },

  checkOrderExists: async (token: string, pedido: string): Promise<boolean> => {
    try {
      const response = await fetchWithAuth(`${API_BASE}/pedidos/verificar/${pedido}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return false;
      const data = await response.json();
      return data.exists;
    } catch (error) {
      console.error("Erro ao verificar pedido:", error);
      return false;
    }
  },

  // ==========================================
  //  2. GERENCIAMENTO DE MATERIAIS
  // ==========================================

  getCustomMaterials: async (token: string): Promise<CustomMaterial[]> => {
    try {
      const response = await fetchWithAuth(`${API_BASE}/materials`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return [];
      return await response.json();
    } catch (error) {
      console.error("Erro ao buscar materiais:", error);
      return [];
    }
  },

  addCustomMaterial: async (token: string, name: string, density: string) => {
    const response = await fetchWithAuth(`${API_BASE}/materials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, density }), 
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Erro ao criar material");
    }
    return response.json();
  },

  deleteCustomMaterial: async (token: string, id: number) => {
    await fetchWithAuth(`${API_BASE}/materials/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  // ==========================================
  //  3. GERENCIAMENTO DE ESPESSURAS
  // ==========================================

  getCustomThicknesses: async (token: string): Promise<CustomThickness[]> => {
    try {
      const response = await fetchWithAuth(`${API_BASE}/thicknesses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return [];
      return await response.json();
    } catch (error) {
      console.error("Erro ao buscar espessuras:", error);
      return [];
    }
  },

  addCustomThickness: async (token: string, value: string) => {
    const response = await fetchWithAuth(`${API_BASE}/thicknesses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ value }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Erro ao criar espessura");
    }
    return response.json();
  },

  deleteCustomThickness: async (token: string, id: number) => {
    await fetchWithAuth(`${API_BASE}/thicknesses/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  updateCustomMaterial: async (token: string, id: number, name: string, density: string) => {
    const response = await fetchWithAuth(`${API_BASE}/materials/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, density }),
    });

    if (!response.ok) throw new Error("Erro ao atualizar material");
    return response.json();
  },

  updateCustomThickness: async (token: string, id: number, value: string) => {
    const response = await fetchWithAuth(`${API_BASE}/thicknesses/${id}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ value }),
    });

    if (!response.ok) throw new Error("Erro ao atualizar espessura");
    return response.json();
  }
};