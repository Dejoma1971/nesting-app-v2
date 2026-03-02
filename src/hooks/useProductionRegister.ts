import { useState, useCallback } from 'react';
import type { PlacedPart } from '../utils/nestingCore';
import type { ImportedPart } from '../components/types';
import type { EngineeringStatsData } from '../components/EngineeringStatsModal';

interface User {
  token?: string;
  empresa_id?: string;
  plano?: string;
  id?: string;
}

interface RegisterProps {
  nestingResult: PlacedPart[];
  currentBinIndex: number;
  parts: ImportedPart[];
  user: User;
  motor: string;
  stats: EngineeringStatsData; // <--- AGORA ELE RECEBE O PACOTE DE ENGENHARIA COMPLETO!
}

interface ExtendedPart extends ImportedPart {
  tipo_producao?: string;
}

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
    motor,
    stats
  }: RegisterProps): Promise<{ success: boolean; message: string; producaoId?: number }> => {
    
    const partsInBin = nestingResult.filter(p => p.binId === currentBinIndex);
    if (partsInBin.length === 0) return { success: false, message: "Mesa vazia." };

    setIsSaving(true);

    try {
      const itensParaSalvar = partsInBin.map(p => {
        const original = parts.find(op => op.id === p.partId);
        return {
          id: p.partId,
          qtd: 1,
          tipo_producao: (original as ExtendedPart)?.tipo_producao || 'NORMAL' 
        };
      });

      const itensAgrupados = Object.values(itensParaSalvar.reduce((acc, item) => {
        if (!acc[item.id]) acc[item.id] = { ...item, qtd: 0 };
        acc[item.id].qtd += 1;
        return acc;
      }, {} as Record<string, typeof itensParaSalvar[0]>));

      // Assinatura usando as áreas para garantir unicidade
      const signaturePayload = JSON.stringify({
        itens: itensAgrupados.map(i => `${i.id}-${i.qtd}`).sort(),
        motor,
        binIndex: currentBinIndex,
        empresa: user?.empresa_id,
        metrics: `${stats.netPartsArea}-${stats.effectiveArea}` 
      });
      
      const signature = await generateSignature(signaturePayload);

      if (signature === lastSavedSignature) {
        return { success: true, message: "Produção já registrada anteriormente." };
      }

      const response = await fetch('http://localhost:3001/api/producao/registrar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({
          chapaIndex: currentBinIndex,
          motor: motor,
          stats: stats, // <--- ENVIANDO TUDO PRO BACKEND
          itens: itensAgrupados,
          nestingSignature: signature 
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.error && data.error.includes("Duplicate")) {
             setLastSavedSignature(signature);
             return { success: true, message: "Produção já sincronizada.", producaoId: data.producaoId };
        }
        throw new Error(data.error || "Erro ao salvar");
      }

      setLastSavedSignature(signature);
      // ♻️ RETORNANDO O ID DE PRODUÇÃO COM SUCESSO!
      return { success: true, message: "Produção registrada com sucesso!", producaoId: data.producaoId };

    } catch (error) {
      console.error(error);
      return { success: false, message: "Erro de conexão ao salvar histórico." };
    } finally {
      setIsSaving(false);
    }
  }, [lastSavedSignature]);

  return { registerProduction, isSaving };
};