📄 dxfWriter.ts
Este módulo é responsável pela geração de arquivos DXF (Drawing Exchange Format) diretamente via código TypeScript/JavaScript.Ele foi otimizado para máxima compatibilidade com softwares de visualização (AutoCAD, Autodesk Viewer, QCAD) e, especificamente, para o pós-processamento em máquinas de corte a laser que utilizam o software CypCut.

🛠 Especificações TécnicasVersão do DXF: AC1009 (AutoCAD Release 12).Motivo: Esta versão é a mais "universal". Ela evita o uso de tabelas de objetos complexas (BLOCK_RECORD, Dicionários) que causam falhas em visualizadores web (como o Autodesk Viewer) quando gerados manualmente.Geometria: Utiliza POLYLINE + VERTEX (formato antigo) ao invés de LWPOLYLINE.Unidade: Milímetros (mm).

🎨 Estratégia de Layers e Cores (CypCut)O CypCut importa layers sequencialmente se não houver um mapeamento pré-definido. Para garantir que as cores apareçam corretamente na máquina sem intervenção do operador, o código utiliza uma Estratégia de Escrita Sequencial.
O arquivo escreve as entidades na seguinte ordem estrita:
Ordem de Escrita Layer ID (DXF) Cor (ACI) Mapeamento CypCut (Padrão) Função
1º "1" 3 (Verde) Layer 1 (Verde) Corte Principal
2º "2" 6 (Magenta) Layer 2 (Rosa) Gravação (Textos)
3º "0" 7 (Branco) Layer 3 (Amarelo) Visualização (Mesa)

Nota Importante:
O Layer da Chapa/Mesa (3º na fila) será importado como Layer 3 (Amarelo) no CypCut. O operador deve configurar o CypCut para não processar (Desmarcar "Output") o Layer Amarelo.

📦 Como Usar
Importação TypeScript:

import { generateDxfContent } from './utils/dxfWriter';

Assinatura da Função TypeScript

const dxfString = generateDxfContent(
placedParts, // Array de peças posicionadas (Nesting)
allParts, // Array com a geometria original das peças
binSize, // Dimensões da chapa (ex: { width: 3000, height: 1200 })
cropLines // (Opcional) Linhas de corte de retalho
);

Exemplo de Implementação TypeScript

const handleDownloadDxf = () => {
// 1. Gera o conteúdo do arquivo
const dxfContent = generateDxfContent(parts, originalGeometries, sheetSize, cuts);

// 2. Cria o Blob e dispara o download
const blob = new Blob([dxfContent], { type: 'application/dxf' });
const url = URL.createObjectURL(blob);

const link = document.createElement('a');
link.href = url;
link.download = `nesting-${Date.now()}.dxf`;
document.body.appendChild(link);
link.click();
document.body.removeChild(link);
};

⚙️ Manutenção e Ajustes

Adicionar novos Layers

Se for necessário adicionar um novo tipo de linha (ex: "Risco"), você deve:

1. Adicionar a configuração em LAYER_CONFIG no arquivo dxfWriter.ts.
2. Adicionar a chave no array LAYER_ORDER na posição desejada.
   - Lembre-se: A posição no array define a cor que o CypCut vai assumir (1ª posição = Verde, 2ª = Rosa, 3ª = Amarelo, 4ª = Ciano, etc.).

Solução de Problemas Comuns

- Erro: "O arquivo não abre no Autodesk Viewer / Erro de Recoverable exit code".

  Causa: Geralmente ocorre se a versão do cabeçalho for alterada para AC1015 sem implementar a tabela BLOCK_RECORD.

  Solução: Mantenha a versão em AC1009.

- Erro: "A chapa está saindo Verde (Corte) no CypCut".

  Causa: A ordem de escrita foi alterada e a chapa está sendo gravada antes das peças.

  Solução: Verifique o array LAYER_ORDER. "CORTE" deve vir sempre antes de "CHAPA".

  📝 Histórico de Decisões

  10/01/2026: Migração de AC1015 para AC1009 para corrigir bugs críticos no visualizador da Autodesk.

  10/01/2026: Implementação da lógica de Layer Order para forçar cores corretas no CypCut (Verde=Corte, Rosa=Gravação).
