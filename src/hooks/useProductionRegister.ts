import { useState, useCallback } from 'react';
// CORREÇÃO 1: Importação de tipo explícita
import type { PlacedPart } from '../utils/nestingCore';
import type { ImportedPart } from '../components/types';

// Removemos a linha "[key: string]: unknown;"
// Agora ele aceita o objeto User do AuthContext sem reclamar do Index Signature
interface User {
  token?: string;
  empresa_id?: string;
  plano?: string; // Adicionei plano pois usamos ele na validação
  id?: string;
}

interface RegisterProps {
  nestingResult: PlacedPart[];
  currentBinIndex: number;
  parts: ImportedPart[];
  cropLines: unknown[]; // Mudado de 'any' para 'unknown' (seguro)
  user: User;           // Mudado de 'any' para interface User
  densidadeNumerica: number;
  motor: "guillotine" | "true-shape" | "wise";
}

// Interface auxiliar para acessar propriedades estendidas da peça (como tipo_producao)
interface ExtendedPart extends ImportedPart {
  tipo_producao?: string;
}

// Função auxiliar para gerar Hash SHA-256 (Assinatura Única)
async function generateSignature(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const useProductionRegister = () => {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedSignature, setLastSavedSignature] = useState<string | null>(null);

  const registerProduction = useCallback(async ({
    nestingResult,
    currentBinIndex,
    parts,
    user,
    densidadeNumerica,
    motor
  }: RegisterProps) => {
    
    // 1. Filtrar apenas peças da chapa atual
    const partsInBin = nestingResult.filter(p => p.binId === currentBinIndex);
    if (partsInBin.length === 0) return { success: false, message: "Mesa vazia." };

    setIsSaving(true);

    try {
      // 2. Montar Lista de Itens para o Backend
      const itensParaSalvar = partsInBin.map(p => {
        const original = parts.find(op => op.id === p.partId);
        return {
          id: p.partId,
          qtd: 1,
          // CORREÇÃO 4: Cast seguro para acessar propriedade opcional do banco
          tipo_producao: (original as ExtendedPart)?.tipo_producao || 'NORMAL' 
        };
      });

      // 3. Agrupar quantidades
      const itensAgrupados = Object.values(itensParaSalvar.reduce((acc, item) => {
        if (!acc[item.id]) {
          acc[item.id] = { ...item, qtd: 0 };
        }
        acc[item.id].qtd += 1;
        return acc;
      }, {} as Record<string, typeof itensParaSalvar[0]>));

      // CORREÇÃO 3: Variáveis binWidth/binHeight removidas pois não eram usadas

      // 5. GERAR ASSINATURA ÚNICA (IDEMPOTÊNCIA)
      const signaturePayload = JSON.stringify({
        itens: itensAgrupados.map(i => `${i.id}-${i.qtd}`).sort(),
        motor,
        binIndex: currentBinIndex,
        empresa: user?.empresa_id
      });
      
      const signature = await generateSignature(signaturePayload);

      // Bloqueio Otimista (Client-side)
      if (signature === lastSavedSignature) {
        console.log("Produção já registrada (bloqueio client-side).");
        return { success: true, message: "Produção já registrada anteriormente." };
      }

      // 6. Enviar para API
      const response = await fetch('http://localhost:3001/api/producao/registrar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({
          chapaIndex: currentBinIndex,
          aproveitamento: densidadeNumerica, 
          densidade: null, 
          itens: itensAgrupados,
          motor: motor,
          nestingSignature: signature 
        })
      });

      const data = await response.json();

      if (!response.ok) {
        // Se já existe, consideramos sucesso para não travar o fluxo
        if (data.error && data.error.includes("Duplicate")) {
             setLastSavedSignature(signature);
             return { success: true, message: "Produção já sincronizada." };
        }
        throw new Error(data.error || "Erro ao salvar");
      }

      setLastSavedSignature(signature);
      return { success: true, message: "Produção registrada com sucesso!" };

    } catch (error) {
      console.error(error);
      return { success: false, message: "Erro de conexão ao salvar histórico." };
    } finally {
      setIsSaving(false);
    }
  }, [lastSavedSignature]);

  return {
    registerProduction,
    isSaving
  };
};