import type { ImportedPart, CustomMaterial, CustomThickness } from "../types";
import { api } from "../../services/api";

export const EngineeringService = {
  getSubscriptionStatus: async (_token?: any) => {
    const response = await api.get('/subscription/status');
    return response.data;
  },

  saveParts: async (_token?: any, parts?: ImportedPart[]) => {
    // Caso o componente envie (token, parts), pegamos o segundo argumento
    const data = Array.isArray(_token) ? _token : parts;
    const response = await api.post('/pecas', data);
    return response.data;
  },

  checkPartsExistence: async (_token?: any, items?: any[]) => {
    const data = Array.isArray(_token) ? _token : items;
    const response = await api.post('/pecas/verificar-existencia', { itens: data });
    return response.data.duplicadas || [];
  },

  checkOrderExists: async (_token?: any, pedido?: string): Promise<boolean> => {
    const id = typeof _token === 'string' && _token.length < 50 ? _token : pedido;
    try {
      const response = await api.get(`/pedidos/verificar/${id}`);
      return response.data.exists;
    } catch {
      return false;
    }
  },

  // MATERIAIS
  getCustomMaterials: async (_token?: any): Promise<CustomMaterial[]> => {
    const response = await api.get('/materials');
    return response.data;
  },

  addCustomMaterial: async (_token?: any, name?: string, density?: string) => {
    const payload = typeof _token === 'object' ? _token : { name, density };
    const response = await api.post('/materials', payload);
    return response.data;
  },

  updateCustomMaterial: async (_token?: any, id?: number, name?: string, density?: string) => {
    // Lógica para aceitar (token, id, name, density) ou (id, name, density)
    const args = typeof _token === 'number' ? [_token, name, density] : [id, name, density];
    const response = await api.put(`/materials/${args[0]}`, { name: args[1], density: args[2] });
    return response.data;
  },

  deleteCustomMaterial: async (_token?: any, id?: number) => {
    const targetId = typeof _token === 'number' ? _token : id;
    await api.delete(`/materials/${targetId}`);
  },

  // ESPESSURAS
  getCustomThicknesses: async (_token?: any): Promise<CustomThickness[]> => {
    const response = await api.get('/thicknesses');
    return response.data;
  },

  addCustomThickness: async (_token?: any, value?: string) => {
    const payload = typeof _token === 'object' ? _token : { value };
    const response = await api.post('/thicknesses', payload);
    return response.data;
  },

  updateCustomThickness: async (_token?: any, id?: number, value?: string) => {
    const args = typeof _token === 'number' ? [_token, id] : [id, value];
    const response = await api.put(`/thicknesses/${args[0]}`, { value: args[1] });
    return response.data;
  },

  deleteCustomThickness: async (_token?: any, id?: number) => {
    const targetId = typeof _token === 'number' ? _token : id;
    await api.delete(`/thicknesses/${targetId}`);
  }
};
