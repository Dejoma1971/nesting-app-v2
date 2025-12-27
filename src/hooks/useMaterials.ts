//* eslint-disable react-hooks/exhaustive-deps */
import { useState, useEffect, useCallback } from "react";

// --- TIPOS ---
export interface IEspessura {
  id: number;
  milimetros: number | string;
  polegadas?: string;
  bitola?: string;
  material_id?: number;
  empresa_id?: string | null; // Novo campo para identificar o dono
}

export interface IMaterial {
  id: number;
  Material: string;
  espessuras: IEspessura[];
  isGlobal?: boolean;
}

// --- DADOS ESTÁTICOS (Apenas para Trial) ---
const STATIC_MATERIALS = ["Inox 304", "Inox 430", "Aço Carbono", "Galvanizado", "Alumínio"];
const STATIC_THICKNESSES = ["28", "26", "24", "22", "20", "18", "16", "14", '1/8"', '3/16"', '1/4"', '5/16"'];

export const useMaterials = (isTrial: boolean, token?: string) => {
  const [dbMaterials, setDbMaterials] = useState<IMaterial[]>([]);
  const [loading, setLoading] = useState(!isTrial && !!token);

  // 1. Busca da Lista Mestra (Comum + Privada)
  const fetchFromAPI = useCallback(async () => {
    if (isTrial || !token) return null;

    try {
      const res = await fetch(`http://localhost:3001/api/materiais?t=${Date.now()}`, {
        headers: { 
            Authorization: `Bearer ${token}`,
            'Cache-Control': 'no-cache'
        },
      });

      // Proteção contra Token Expirado
      if (res.status === 401 || res.status === 403) {
          alert("Sessão Expirada! Faça login novamente.");
          localStorage.removeItem('user'); 
          window.location.href = "/login"; 
          return null;
      }

      if (res.ok) {
          const data = await res.json();
          setDbMaterials(data); // Carrega a lista inicial do banco
          return data;
      }
    } catch (error) {
      console.error("Erro ao buscar materiais:", error);
    }
    return null;
  }, [isTrial, token]);

  // 2. Carga Inicial
  useEffect(() => {
    let isMounted = true;
    if (!isTrial && token) {
        setLoading(true);
        fetchFromAPI().then(() => {
            if (isMounted) setLoading(false);
        });
    }
    return () => { isMounted = false; };
  }, [fetchFromAPI, isTrial, token]);

  // --- ATUALIZAÇÃO OTIMISTA (A Mágica Acontece Aqui) ---

  // Injeta um novo material na lista local sem ir ao banco
  const addOptimisticMaterial = useCallback((newMaterial: IMaterial) => {
      setDbMaterials((prev) => {
          // Evita duplicatas visuais se o usuário clicar rápido demais
          if (prev.find(m => m.id === newMaterial.id)) return prev;
          // Adiciona e ordena alfabeticamente para ficar bonito na lista
          const updated = [...prev, newMaterial].sort((a, b) => a.Material.localeCompare(b.Material));
          return updated;
      });
  }, []);

  // Injeta uma nova espessura em um material existente na memória
  const addOptimisticEspessura = useCallback((materialId: number, newEspessura: IEspessura) => {
      setDbMaterials((prev) => prev.map(mat => {
          if (mat.id === materialId) {
              // Cria uma nova versão do material com a nova espessura adicionada
              const novasEspessuras = [...mat.espessuras, newEspessura]
                  .sort((a, b) => Number(a.milimetros) - Number(b.milimetros)); // Mantém ordenado por espessura
              
              return { ...mat, espessuras: novasEspessuras };
          }
          return mat;
      }));
  }, []);

  // --- GETTERS (Leitura para a Interface) ---

  const availableMaterials = isTrial 
    ? STATIC_MATERIALS 
    : dbMaterials.map((m) => m.Material);

  const getThicknessOptions = useCallback((materialName: string): string[] => {
      if (isTrial) return STATIC_THICKNESSES;
      if (!materialName) return [];

      const foundMat = dbMaterials.find((m) => m.Material === materialName);
      if (!foundMat || !foundMat.espessuras) return [];

      return foundMat.espessuras.map((e) => {
        const val = Number(e.milimetros);
        let label = `${val.toFixed(2)}mm`;
        if (e.bitola) label += ` (${e.bitola})`;
        else if (e.polegadas) label += ` (${e.polegadas})`;
        return label;
      });
    }, [isTrial, dbMaterials]);

  // Função auxiliar para pegar o ID do material pelo nome (útil para o Modal saber onde adicionar espessura)
  const getMaterialIdByName = useCallback((name: string) => {
      const m = dbMaterials.find(mat => mat.Material === name);
      return m ? m.id : null;
  }, [dbMaterials]);

  return {
    availableMaterials,
    getThicknessOptions,
    getMaterialIdByName, // Exportamos para ajudar o modal
    loadingMaterials: loading,
    addOptimisticMaterial,  // <--- Exportado para usar no Modal
    addOptimisticEspessura  // <--- Exportado para usar no Modal
  };
};