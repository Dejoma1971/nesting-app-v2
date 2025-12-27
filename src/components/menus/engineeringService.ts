//* eslint-disable @typescript-eslint/no-explicit-any */
import type { ImportedPart, CustomMaterial, CustomThickness } from "../types";

const API_BASE = "http://localhost:3001/api";

export const EngineeringService = {
  // ==========================================
  //  1. FUNCIONALIDADES ORIGINAIS
  // ==========================================

  // Verificar se o usuário é Trial
  getSubscriptionStatus: async (token: string) => {
    const response = await fetch(`${API_BASE}/subscription/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.json();
  },

  // Salvar peças no banco de dados (Storage DB)
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

  // ==========================================
  //  2. GERENCIAMENTO DE MATERIAIS
  // ==========================================

  // Buscar materiais personalizados do usuário
  getCustomMaterials: async (token: string): Promise<CustomMaterial[]> => {
    try {
      const response = await fetch(`${API_BASE}/materials`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return [];
      return await response.json();
    } catch (error) {
      console.error("Erro ao buscar materiais:", error);
      return [];
    }
  },

 // AQUI ESTAVA O ERRO: Adicione 'density' como argumento opcional ou obrigatório string
  addCustomMaterial: async (token: string, name: string, density: string) => {
    const response = await fetch(`${API_BASE}/materials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      // Agora enviamos a densidade junto
      body: JSON.stringify({ name, density }), 
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Erro ao criar material");
    }
    return response.json();
  },

  // Deletar material
  deleteCustomMaterial: async (token: string, id: number) => {
    await fetch(`${API_BASE}/materials/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  // ==========================================
  //  3. GERENCIAMENTO DE ESPESSURAS
  // ==========================================

  // Buscar espessuras personalizadas
  getCustomThicknesses: async (token: string): Promise<CustomThickness[]> => {
    try {
      const response = await fetch(`${API_BASE}/thicknesses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return [];
      return await response.json();
    } catch (error) {
      console.error("Erro ao buscar espessuras:", error);
      return [];
    }
  },

  // Adicionar nova espessura
  addCustomThickness: async (token: string, value: string) => {
    // Nota: O backend espera "value" no body, mas salva como "valor" no banco
    const response = await fetch(`${API_BASE}/thicknesses`, {
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

  // Deletar espessura
  deleteCustomThickness: async (token: string, id: number) => {
    await fetch(`${API_BASE}/thicknesses/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  updateCustomMaterial: async (token: string, id: number, name: string, density: string) => {
    const response = await fetch(`${API_BASE}/materials/${id}`, {
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
    const response = await fetch(`${API_BASE}/thicknesses/${id}`, {
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