import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PlacedPart } from './nestingCore';
import type { ImportedPart } from '../components/types';

// --- CONFIGURAÇÕES GERAIS ---
const A4_WIDTH = 210;
const A4_HEIGHT = 297;
const MARGIN = 10;
// REMOVIDO: const CONTENT_WIDTH = ... (Não estava sendo usado)

interface PDFOptions {
    fileName?: string;
    companyName: string;
    operatorName: string;
    orders: string[];
    material: string;
    thickness: string;
    density: number;
    binWidth: number;
    binHeight: number;
    parts: ImportedPart[];
    placedParts: PlacedPart[];
}

// Tipagem para entidades DXF
interface DxfEntity {
    type: string;
    name?: string; // Para INSERT
    vertices?: { x: number; y: number }[];
    center?: { x: number; y: number };
    radius?: number;
    startAngle?: number;
    endAngle?: number;
    position?: { x: number; y: number };
    rotation?: number;
    scale?: { x: number; y: number; z: number };
}

// CORREÇÃO: Interface para Blocos (substitui o 'any')
interface DxfBlock {
    entities: DxfEntity[];
}

// --- HELPER: Extrair número ---
const parseNumber = (val: string | number): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const match = val.toString().match(/(\d+[.,]?\d*)/);
    if (!match) return 0;
    return Number(match[0].replace(',', '.'));
};

// --- HELPER: Desenhar Geometria Recursiva (Suporte a Blocos) ---
const drawEntities = (
    ctx: CanvasRenderingContext2D, 
    entities: DxfEntity[], 
    blocks: Record<string, DxfBlock>, // CORREÇÃO: Uso do tipo DxfBlock
    offsetX: number, 
    offsetY: number, 
    scale: number,
    baseY: number
) => {
    const tx = (x: number) => offsetX + x * scale;
    const ty = (y: number) => baseY - (offsetY + y * scale); 

    entities.forEach(ent => {
        ctx.beginPath();
        if (ent.type === 'INSERT' && ent.name && blocks[ent.name]) {
            const block = blocks[ent.name];
            const bX = ent.position?.x || 0;
            const bY = ent.position?.y || 0;
            
            drawEntities(
                ctx, 
                block.entities, 
                blocks, 
                offsetX + bX * scale, 
                offsetY + bY * scale, 
                scale, 
                baseY
            );
        }
        else if (ent.type === 'LINE' && ent.vertices && ent.vertices.length >= 2) {
            ctx.moveTo(tx(ent.vertices[0].x), ty(ent.vertices[0].y));
            ctx.lineTo(tx(ent.vertices[1].x), ty(ent.vertices[1].y));
        } 
        else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.vertices) {
            if(ent.vertices.length > 0) {
               ctx.moveTo(tx(ent.vertices[0].x), ty(ent.vertices[0].y));
               for(let i=1; i<ent.vertices.length; i++){
                   ctx.lineTo(tx(ent.vertices[i].x), ty(ent.vertices[i].y));
               }
            }
        }
        else if (ent.type === 'CIRCLE' && ent.center && ent.radius) {
            ctx.moveTo(tx(ent.center.x) + ent.radius * scale, ty(ent.center.y));
            ctx.arc(tx(ent.center.x), ty(ent.center.y), ent.radius * scale, 0, 2 * Math.PI);
        }
        else if (ent.type === 'ARC' && ent.center && ent.radius) {
             ctx.moveTo(tx(ent.center.x) + ent.radius * scale, ty(ent.center.y));
             ctx.arc(tx(ent.center.x), ty(ent.center.y), ent.radius * scale, 0, 2 * Math.PI);
        }
        ctx.stroke();
    });
};

// --- HELPER: Calcular Bounding Box Recursivo ---
const calculateBounds = (
    entities: DxfEntity[], 
    blocks: Record<string, DxfBlock>, // CORREÇÃO: Uso do tipo DxfBlock
    currentX = 0, 
    currentY = 0
) => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    const update = (x: number, y: number) => {
        if (x < minX) minX = x; if (y < minY) minY = y;
        if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    };

    entities.forEach(ent => {
        if (ent.type === 'INSERT' && ent.name && blocks[ent.name]) {
            const bX = ent.position?.x || 0;
            const bY = ent.position?.y || 0;
            const bBounds = calculateBounds(blocks[ent.name].entities, blocks, currentX + bX, currentY + bY);
            if (bBounds.minX !== Infinity) {
                update(bBounds.minX, bBounds.minY);
                update(bBounds.maxX, bBounds.maxY);
            }
        }
        else if (ent.vertices) {
            ent.vertices.forEach(v => update(currentX + v.x, currentY + v.y));
        }
        else if ((ent.type === 'CIRCLE' || ent.type === 'ARC') && ent.center && ent.radius) {
            update(currentX + ent.center.x - ent.radius, currentY + ent.center.y - ent.radius);
            update(currentX + ent.center.x + ent.radius, currentY + ent.center.y + ent.radius);
        }
    });

    return { minX, minY, maxX, maxY };
};

// --- 1. GERAR MINIATURA DA PEÇA ---
const createThumbnail = (part: ImportedPart): string => {
    const canvas = document.createElement('canvas');
    const size = 100;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Cast seguro para a interface correta
    const blocksData = (part.blocks || {}) as Record<string, DxfBlock>;

    const bounds = calculateBounds(part.entities as DxfEntity[], blocksData);
    if (bounds.minX === Infinity) return ''; 

    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const margin = 5;
    const scale = (size - margin * 2) / Math.max(w, h);
    
    const offsetX = (size - w * scale) / 2 - bounds.minX * scale;
    const offsetY = (size - h * scale) / 2 - bounds.minY * scale;

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#000';
    
    drawEntities(ctx, part.entities as DxfEntity[], blocksData, offsetX, offsetY, scale, size);

    return canvas.toDataURL('image/png');
};

// --- 2. GERAR MAPA DA CHAPA (PREVIEW) ---
const createSheetPreview = (
    binW: number, binH: number, 
    placedParts: PlacedPart[], 
    partsLib: ImportedPart[]
): string => {
    const canvas = document.createElement('canvas');
    const scaleFactor = 0.5; 
    canvas.width = binW * scaleFactor; 
    canvas.height = binH * scaleFactor;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, canvas.width, canvas.height);

    placedParts.forEach((placed, idx) => {
        const original = partsLib.find(p => p.id === placed.partId);
        if (!original) return;

        const isRotated = Math.abs(placed.rotation) % 180 !== 0;
        const wReal = isRotated ? original.height : original.width;
        const hReal = isRotated ? original.width : original.height;

        const x = placed.x * scaleFactor;
        const w = wReal * scaleFactor;
        const h = hReal * scaleFactor;
        const y = canvas.height - (placed.y * scaleFactor) - h; 

        ctx.fillStyle = '#4facfe';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);

        if (w > 10 && h > 10) {
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Arial';
            ctx.fillText(`${idx + 1}`, x + 2, y + 10);
        }
    });

    return canvas.toDataURL('image/png');
};

// --- 3. FUNÇÃO PRINCIPAL ---
export const generateGuillotineReport = (options: PDFOptions) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const { 
        companyName, operatorName, orders, material, thickness, 
        density, binWidth, binHeight, parts, placedParts 
    } = options;

    const thickVal = parseNumber(thickness); 
    const binAreaMm2 = binWidth * binHeight;
    const binWeight = (binAreaMm2 / 1000000) * thickVal * density;

    const binIds = Array.from(new Set(placedParts.map(p => p.binId))).sort((a, b) => a - b);

    if (binIds.length === 0) {
        alert("Nenhuma peça posicionada.");
        return;
    }

    binIds.forEach((binId, index) => {
        if (index > 0) doc.addPage();

        const partsInBin = placedParts.filter(p => p.binId === binId);
        
        const groupedParts: Record<string, { count: number, original: ImportedPart, dimensions: string }> = {};
        let totalPartsWeight = 0;
        let maxUsedX = 0;
        let maxUsedY = 0;

        partsInBin.forEach(p => {
            const original = parts.find(op => op.id === p.partId);
            if (!original) return;

            const isRotated = Math.abs(p.rotation) % 180 !== 0;
            const w = isRotated ? original.height : original.width;
            const h = isRotated ? original.width : original.height;
            
            if (p.x + w > maxUsedX) maxUsedX = p.x + w;
            if (p.y + h > maxUsedY) maxUsedY = p.y + h;

            const partWeight = (original.netArea / 1000000) * thickVal * density;
            totalPartsWeight += partWeight;

            if (!groupedParts[p.partId]) {
                groupedParts[p.partId] = {
                    count: 0,
                    original,
                    dimensions: `${w.toFixed(0)} x ${h.toFixed(0)}`
                };
            }
            groupedParts[p.partId].count++;
        });

        const efficiency = binWeight > 0 ? (totalPartsWeight / binWeight) * 100 : 0;
        const loss = 100 - efficiency;

        // --- A. CABEÇALHO ---
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(companyName, MARGIN, 15);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        const dateStr = new Date().toLocaleString('pt-BR');
        doc.text(`Data: ${dateStr}`, A4_WIDTH - MARGIN, 15, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.text(`ORDEM DE CORTE - CHAPA ${index + 1} DE ${binIds.length}`, A4_WIDTH - MARGIN, 20, { align: 'right' });

        doc.setLineWidth(0.5);
        doc.line(MARGIN, 22, A4_WIDTH - MARGIN, 22);

        // Dados
        let yPos = 30;
        doc.setFont('helvetica', 'bold');
        doc.text('DADOS TÉCNICOS:', MARGIN, yPos);
        yPos += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        
        doc.text(`Pedidos: ${orders.join(', ') || '-'}`, MARGIN, yPos);
        doc.text(`Material: ${material}`, MARGIN, yPos + 5);
        doc.text(`Espessura: ${thickness}`, MARGIN, yPos + 10);
        
        doc.text(`Operador: ${operatorName}`, 110, yPos);
        doc.text(`Mesa: ${binWidth.toFixed(0)} x ${binHeight.toFixed(0)} mm`, 110, yPos + 5);

        yPos += 15;

        // --- B. DESENHO DA MESA ---
        const sheetImg = createSheetPreview(binWidth, binHeight, partsInBin, parts);
        if (sheetImg) {
            const previewH = 50; 
            const previewW = (binWidth / binHeight) * previewH;
            const previewX = (A4_WIDTH - previewW) / 2;
            
            doc.addImage(sheetImg, 'PNG', previewX, yPos, previewW, previewH);
            doc.rect(previewX, yPos, previewW, previewH);
            yPos += previewH + 10;
        }

        // --- C. TABELA DE PEÇAS ---
        const tableBody = Object.values(groupedParts).map((item, idx) => {
            const thumbDataUrl = createThumbnail(item.original);
            const unitWeight = (item.original.netArea / 1000000) * thickVal * density;
            
            return [
                idx + 1,
                thumbDataUrl ? { content: '', image: thumbDataUrl } : 'Sem Geo',
                item.dimensions,
                item.count,
                unitWeight.toFixed(3)
            ];
        });

        autoTable(doc, {
            startY: yPos,
            head: [['Item', 'Visual', 'Dimensões (mm)', 'Qtd', 'Peso (kg)']],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            body: tableBody as any,
            theme: 'grid',
            headStyles: { fillColor: [50, 50, 50], textColor: 255 },
            styles: { fontSize: 9, cellPadding: 1, valign: 'middle', halign: 'center', overflow: 'hidden' },
            columnStyles: {
                0: { cellWidth: 10 },
                1: { cellWidth: 20, minCellHeight: 20 },
                2: { cellWidth: 35 },
                3: { cellWidth: 15, fontStyle: 'bold' },
                4: { cellWidth: 25, halign: 'right' },
            },
            margin: { right: MARGIN, left: MARGIN },
            tableWidth: 'auto',
            didDrawCell: (data) => {
                if (data.section === 'body' && data.column.index === 1) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const img = (tableBody[data.row.index][1] as any).image;
                    if (img) {
                        doc.addImage(img, 'PNG', data.cell.x + 2, data.cell.y + 2, 16, 16);
                    }
                }
            }
        });

        // --- D. RODAPÉ ---
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let finalY = (doc as any).lastAutoTable.finalY + 10;
        
        if (finalY > A4_HEIGHT - 50) {
            doc.addPage();
            finalY = 20;
        }

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('RESUMO:', MARGIN, finalY);
        doc.line(MARGIN, finalY + 1, A4_WIDTH - MARGIN, finalY + 1);
        
        doc.setFont('helvetica', 'normal');
        doc.text(`Peso Líq: ${totalPartsWeight.toFixed(2)} kg`, MARGIN, finalY + 6);
        doc.text(`Peso Bruto: ${binWeight.toFixed(2)} kg`, MARGIN, finalY + 11);

        doc.setFont('helvetica', 'bold');
        doc.text(`Aprov.: ${efficiency.toFixed(1)}%`, 80, finalY + 6);
        doc.text(`Perda: ${loss.toFixed(1)}%`, 80, finalY + 11);

        const offcutRightW = binWidth - maxUsedX;
        const offcutRightH = binHeight;
        const offcutTopW = maxUsedX; 
        const offcutTopH = binHeight - maxUsedY;
        const MIN_SIZE = 50;

        doc.rect(130, finalY - 5, 70, 20);
        doc.setFontSize(9);
        doc.text('SOBRAS ÚTEIS (>50mm):', 132, finalY);
        
        let offsetSobra = 5;
        if (offcutRightW > MIN_SIZE) {
            doc.text(`Lat: ${offcutRightW.toFixed(0)} x ${offcutRightH.toFixed(0)} mm`, 132, finalY + offsetSobra);
            offsetSobra += 5;
        }
        if (offcutTopW > MIN_SIZE && offcutTopH > MIN_SIZE) {
            doc.text(`Sup: ${offcutTopW.toFixed(0)} x ${offcutTopH.toFixed(0)} mm`, 132, finalY + offsetSobra);
            offsetSobra += 5;
        }
        if (offsetSobra === 5) doc.text('- Nenhuma', 132, finalY + 5);
    });

    doc.save(options.fileName || `Relatorio_Guilhotina_${Date.now()}.pdf`);
};