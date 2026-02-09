import type { ImportedPart, CustomMaterial, CustomThickness } from "../types";
import { api } from "../../services/api";

// 1. Tipagem explícita: token é string ou undefined
const getConfig = (token?: string) => {
  if (token && token.length > 20) {
    return {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }
  return {};
};

export const EngineeringService = {
  // STATUS DA ASSINATURA
  getSubscriptionStatus: async (token?: string) => {
    const config = getConfig(token);
    const response = await api.get("/subscription/status", config);
    return response.data;
  },

  // SALVAR PEÇAS
  // Aceita (token: string, parts: Array) OU (parts: Array)
  saveParts: async (
    tokenOrParts?: string | ImportedPart[],
    parts?: ImportedPart[]
  ) => {
    const isToken = typeof tokenOrParts === "string";
    // Se for token, o data está no 2º argumento. Se não, está no 1º.
    const data = isToken ? parts : tokenOrParts;
    const token = isToken ? (tokenOrParts as string) : undefined;

    const response = await api.post("/pecas", data, getConfig(token));
    return response.data;
  },

  // VERIFICAR EXISTÊNCIA
  // Aceita (token: string, items: Array) OU (items: Array)
  // Usamos 'unknown[]' ou 'Record<string, unknown>[]' para evitar 'any' genérico
  checkPartsExistence: async (
    tokenOrItems?: string | unknown[],
    items?: unknown[]
  ) => {
    const isToken = typeof tokenOrItems === "string";
    const data = isToken ? items : tokenOrItems;
    const token = isToken ? (tokenOrItems as string) : undefined;

    const response = await api.post(
      "/pecas/verificar-existencia",
      { itens: data },
      getConfig(token)
    );
    return response.data.duplicadas || [];
  },

  // VERIFICAR PEDIDO
  checkOrderExists: async (
    tokenOrPedido?: string,
    pedido?: string
  ): Promise<boolean> => {
    // Lógica: Tokens JWT são longos (>50 chars), Pedidos são curtos
    const isToken =
      typeof tokenOrPedido === "string" && tokenOrPedido.length > 50;
    const id = isToken ? pedido : tokenOrPedido;
    const token = isToken ? tokenOrPedido : undefined;

    try {
      const response = await api.get(
        `/pedidos/verificar/${id}`,
        getConfig(token)
      );
      return response.data.exists;
    } catch {
      return false;
    }
  },

  // MATERIAIS
  getCustomMaterials: async (token?: string): Promise<CustomMaterial[]> => {
    const response = await api.get("/materials", getConfig(token));
    return response.data;
  },

  addCustomMaterial: async (
    tokenOrName?: string | { name?: string; density?: string },
    name?: string,
    density?: string
  ) => {
    const isToken = typeof tokenOrName === "string" && tokenOrName.length > 50;
    const payload = isToken
      ? { name, density }
      : (tokenOrName as { name?: string; density?: string });
    const token = isToken ? (tokenOrName as string) : undefined;

    const response = await api.post("/materials", payload, getConfig(token));
    return response.data;
  },

  // Update Híbrido: (token, id, name, density) ou (id, name, density)
  updateCustomMaterial: async (
    tokenOrId?: string | number,
    idOrName?: number | string,
    nameOrDensity?: string,
    density?: string
  ) => {
    let token: string | undefined;
    let id: number;
    let payloadName: string | undefined;
    let payloadDensity: string | undefined;

    if (typeof tokenOrId === "number") {
      id = tokenOrId;
      payloadName = idOrName as string;
      payloadDensity = nameOrDensity;
    } else {
      token = tokenOrId as string;
      id = idOrName as number;
      payloadName = nameOrDensity;
      payloadDensity = density;
    }

    const response = await api.put(
      `/materials/${id}`,
      { name: payloadName, density: payloadDensity },
      getConfig(token)
    );
    return response.data;
  },

  deleteCustomMaterial: async (tokenOrId?: string | number, id?: number) => {
    const isToken = typeof tokenOrId === "string";
    const targetId = isToken ? id : tokenOrId;
    const token = isToken ? (tokenOrId as string) : undefined;

    await api.delete(`/materials/${targetId}`, getConfig(token));
  },

  // ESPESSURAS
  getCustomThicknesses: async (token?: string): Promise<CustomThickness[]> => {
    const response = await api.get("/thicknesses", getConfig(token));
    return response.data;
  },

  addCustomThickness: async (
    tokenOrValue?: string | { value?: string },
    value?: string
  ) => {
    const isToken =
      typeof tokenOrValue === "string" && tokenOrValue.length > 50;
    const payload = isToken
      ? { value }
      : (tokenOrValue as { value?: string });
    const token = isToken ? (tokenOrValue as string) : undefined;

    const response = await api.post("/thicknesses", payload, getConfig(token));
    return response.data;
  },

  updateCustomThickness: async (
    tokenOrId?: string | number,
    idOrValue?: number | string,
    value?: string
  ) => {
    let token: string | undefined;
    let id: number;
    let payloadValue: string | undefined;

    if (typeof tokenOrId === "number") {
      id = tokenOrId;
      payloadValue = idOrValue as string;
    } else {
      token = tokenOrId as string;
      id = idOrValue as number;
      payloadValue = value;
    }

    const response = await api.put(
      `/thicknesses/${id}`,
      { value: payloadValue },
      getConfig(token)
    );
    return response.data;
  },

  deleteCustomThickness: async (tokenOrId?: string | number, id?: number) => {
    const isToken = typeof tokenOrId === "string";
    const targetId = isToken ? id : tokenOrId;
    const token = isToken ? (tokenOrId as string) : undefined;

    await api.delete(`/thicknesses/${targetId}`, getConfig(token));
  },
};