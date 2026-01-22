import { useState, useCallback } from 'react';
import type { PlacedPart } from '../utils/nestingCore';
import type { ImportedPart } from '../components/types';

interface User {
  token?: string;
  empresa_id?: string;
  plano?: string;
  id?: string;
}

// Interface para as métricas calculadas no NestingBoard (currentEfficiencies)
interface MetricasEficiencia {
  real: string;        // "59,1"
  consumption: string; // "85,7"
  remnantHeight: string; // "1500"
  remnantArea: string;   // "1.50"
}

interface RegisterProps {
  nestingResult: PlacedPart[];
  currentBinIndex: number;
  parts: ImportedPart[];
  cropLines: unknown[]; 
  user: User;
  motor: "guillotine" | "true-shape" | "wise" | "true-shape-v2"; // Atualizei os motores
  binWidth: number;   // Necessário para salvar dimensões
  binHeight: number;  // Necessário para salvar dimensões
  metricas: MetricasEficiencia; // <--- NOVO: Recebe os dados do rodapé
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
    binWidth,
    binHeight,
    metricas
  }: RegisterProps) => {
    
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
        if (!acc[item.id]) {
          acc[item.id] = { ...item, qtd: 0 };
        }
        acc[item.id].qtd += 1;
        return acc;
      }, {} as Record<string, typeof itensParaSalvar[0]>));

      // Conversão de String "59,1" para Number 59.1
      const aproveitamentoNum = parseFloat(metricas.real.replace(',', '.')) || 0;
      const consumoNum = parseFloat(metricas.consumption.replace(',', '.')) || 0;
      const retalhoLinearNum = parseInt(metricas.remnantHeight) || 0;
      const areaRetalhoNum = parseFloat(metricas.remnantArea.replace(',', '.')) || 0;

      const signaturePayload = JSON.stringify({
        itens: itensAgrupados.map(i => `${i.id}-${i.qtd}`).sort(),
        motor,
        binIndex: currentBinIndex,
        empresa: user?.empresa_id,
        // Adicionamos as métricas na assinatura para evitar salvar 2x se os valores mudarem
        metrics: `${aproveitamentoNum}-${consumoNum}` 
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
          aproveitamento: aproveitamentoNum, // GLOBAL
          consumo: consumoNum,               // CONSUMO
          retalhoLinear: retalhoLinearNum,   // SOBRA Y
          areaRetalho: areaRetalhoNum,       // SOBRA M2
          larguraChapa: binWidth,
          alturaChapa: binHeight,
          itens: itensAgrupados,
          motor: motor,
          nestingSignature: signature 
        })
      });

      const data = await response.json();

      if (!response.ok) {
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