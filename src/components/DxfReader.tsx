/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import DxfParser from 'dxf-parser';
import { NestingBoard } from './NestingBoard';
import type { ImportedPart } from './types';
import { getTheme } from '../styles/theme'; // Usa o mesmo tema

interface DxfReaderProps {
    preLoadedParts?: ImportedPart[];
    onBack: () => void; // Recebe a função de voltar do App.tsx
}

export const DxfReader: React.FC<DxfReaderProps> = ({ preLoadedParts, onBack }) => {
    // 1. Estado
    const [parts, setParts] = useState<ImportedPart[]>(preLoadedParts || []);
    const [error, setError] = useState<string>('');
    const [isLoadingDB, setIsLoadingDB] = useState(false);
    
    // Filtros do Banco
    const [dbFilters, setDbFilters] = useState({ pedido: '', material: '' });
    
    // Controle de Tema local (apenas para a tela de seleção inicial)
    const [isDarkMode, setIsDarkMode] = useState(true);
    const theme = getTheme(isDarkMode);

    // --- LÓGICA GEOMÉTRICA (Flatten/Analyze) ---
    // (Mantida compacta para não ocupar espaço, já que é idêntica à anterior)
    const rotatePoint = (x: number, y: number, angleDeg: number) => { const rad = (angleDeg * Math.PI) / 180; return { x: (x * Math.cos(rad)) - (y * Math.sin(rad)), y: (x * Math.sin(rad)) + (y * Math.cos(rad)) }; };
    
    const flattenGeometry = (entities: any[], blocks: any, transform = { x: 0, y: 0, rotation: 0, scale: 1 }): any[] => {
        let flatEntities: any[] = [];
        if (!entities) return [];
        entities.forEach(ent => {
            if (ent.type === 'INSERT') {
                const block = blocks[ent.name];
                if (block && block.entities) {
                    const newScale = transform.scale * (ent.scale?.x || 1);
                    const newRotation = transform.rotation + (ent.rotation || 0);
                    const rPos = rotatePoint(ent.position.x, ent.position.y, transform.rotation);
                    const newX = transform.x + (rPos.x * transform.scale);
                    const newY = transform.y + (rPos.y * transform.scale);
                    flatEntities = flatEntities.concat(flattenGeometry(block.entities, blocks, { x: newX, y: newY, rotation: newRotation, scale: newScale }));
                }
            } else {
                const clone = JSON.parse(JSON.stringify(ent));
                const applyTrans = (x: number, y: number) => { const rx = x * transform.scale; const ry = y * transform.scale; const r = rotatePoint(rx, ry, transform.rotation); return { x: r.x + transform.x, y: r.y + transform.y }; };
                if (clone.type === 'LINE') { const p1 = applyTrans(clone.vertices[0].x, clone.vertices[0].y); const p2 = applyTrans(clone.vertices[1].x, clone.vertices[1].y); clone.vertices = [{x:p1.x, y:p1.y}, {x:p2.x, y:p2.y}]; flatEntities.push(clone); } 
                else if (clone.type === 'LWPOLYLINE' || clone.type === 'POLYLINE') { if (clone.vertices) { clone.vertices = clone.vertices.map((v: any) => { const p = applyTrans(v.x, v.y); return { ...v, x: p.x, y: p.y }; }); } flatEntities.push(clone); } 
                else if (clone.type === 'CIRCLE' || clone.type === 'ARC') { const c = applyTrans(clone.center.x, clone.center.y); clone.center = { x: c.x, y: c.y }; clone.radius *= transform.scale; if(clone.type === 'ARC'){ clone.startAngle += (transform.rotation * Math.PI/180); clone.endAngle += (transform.rotation * Math.PI/180); } flatEntities.push(clone); }
            }
        });
        return flatEntities;
    };

    const calculatePolygonArea = (vertices: {x: number, y: number}[]) => {
        let area = 0;
        const n = vertices.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += vertices[i].x * vertices[j].y;
            area -= vertices[j].x * vertices[i].y;
        }
        return Math.abs(area) / 2;
    };

    const analyzeGeometry = (flatEntities: any[]) => {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let calculatedNetArea = 0;
        flatEntities.forEach(ent => {
               if (ent.vertices) ent.vertices.forEach((v: any) => { if(v.x < minX) minX = v.x; if(v.x > maxX) maxX = v.x; if(v.y < minY) minY = v.y; if(v.y > maxY) maxY = v.y; });
               else if (ent.center) { const r = ent.radius || 0; if(ent.center.x - r < minX) minX = ent.center.x - r; if(ent.center.x + r > maxX) maxX = ent.center.x + r; if(ent.center.y - r < minY) minY = ent.center.y - r; if(ent.center.y + r > maxY) maxY = ent.center.y + r; }
               if (ent.type === 'CIRCLE') calculatedNetArea += Math.PI * (ent.radius * ent.radius);
               else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.shape) calculatedNetArea += calculatePolygonArea(ent.vertices);
        });
        if (minX === Infinity) return { width: 0, height: 0, grossArea: 0, netArea: 0 };
        const width = maxX - minX; const height = maxY - minY;
        const grossArea = width * height;
        return { width, height, grossArea, netArea: calculatedNetArea > 0 ? calculatedNetArea : grossArea };
    };

    // --- HANDLERS ---
    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        
        const parser = new DxfParser();
        const newParts: ImportedPart[] = [];
        const readers = Array.from(files).map(file => {
            return new Promise<void>((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const content = e.target?.result as string;
                        const parsed = parser.parseSync(content);
                        if (parsed) {
                            const flatEnts = flattenGeometry((parsed as any).entities, (parsed as any).blocks);
                            const metrics = analyzeGeometry(flatEnts);
                            newParts.push({
                                id: crypto.randomUUID(),
                                name: file.name,
                                entities: flatEnts,
                                blocks: {},
                                width: metrics.width,
                                height: metrics.height,
                                grossArea: metrics.grossArea,
                                netArea: metrics.netArea,
                                pedido: 'Local', op: 'N/A', material: 'Desconhecido', espessura: '-', autor: 'Upload', dataCadastro: new Date().toISOString()
                            });
                        }
                    } catch (err) { console.error(err); }
                    resolve();
                };
                reader.readAsText(file);
            });
        });
        await Promise.all(readers);
        if (newParts.length > 0) {
            setParts(prev => [...prev, ...newParts]);
            setError('');
        } else {
            setError('Nenhum arquivo válido.');
        }
    };

    const handleDBSearch = async () => {
        if (!dbFilters.pedido && !dbFilters.material) { alert("Digite um Pedido ou Material para buscar."); return; }
        setIsLoadingDB(true);
        try {
            const params = new URLSearchParams();
            if (dbFilters.pedido) params.append('pedido', dbFilters.pedido);
            if (dbFilters.material) params.append('material', dbFilters.material);
            
            const response = await fetch(`http://localhost:3001/api/pecas/busca?${params.toString()}`);
            if (!response.ok) throw new Error('Erro ao buscar no banco.');
            const data = await response.json();
            
            if (Array.isArray(data) && data.length > 0) {
                const dbParts: ImportedPart[] = data.map((item: any) => ({
                    id: item.id,
                    name: item.nome_arquivo,
                    entities: typeof item.geometria === 'string' ? JSON.parse(item.geometria) : item.geometria,
                    blocks: typeof item.blocos_def === 'string' ? JSON.parse(item.blocos_def) : (item.blocos_def || {}),
                    width: Number(item.largura), height: Number(item.altura), grossArea: Number(item.area_bruta), netArea: Number(item.area_bruta),
                    pedido: item.pedido, op: item.op, material: item.material, espessura: item.espessura, autor: item.autor, dataCadastro: item.data_cadastro
                }));
                setParts(prev => [...prev, ...dbParts]);
                setError('');
            } else { alert("Nenhuma peça encontrada."); }
        } catch (err: any) { console.error(err); alert("Erro na conexão com o servidor."); } finally { setIsLoadingDB(false); }
    };

    // --- DECISÃO DE RENDERIZAÇÃO ---
    
    // CASO 1: TEMOS PEÇAS -> MOSTRA O BOARD COMPLETO
    if (parts.length > 0) {
        return <NestingBoard parts={parts} onBack={onBack} />;
    }

    // CASO 2: NÃO TEMOS PEÇAS -> MOSTRA TELA DE SELEÇÃO (Estilizada com Tema)
    const containerStyle: React.CSSProperties = { 
        display: 'flex', flexDirection: 'column', height: '100vh', 
        background: theme.bg, color: theme.text, fontFamily: 'Arial',
        alignItems: 'center', justifyContent: 'center'
    };
    
    const cardStyle: React.CSSProperties = {
        background: theme.panelBg, border: `1px solid ${theme.border}`,
        borderRadius: '8px', padding: '30px', width: '400px',
        boxShadow: '0 4px 10px rgba(0,0,0,0.2)', textAlign: 'center'
    };

    const inputStyle: React.CSSProperties = {
        width: '100%', padding: '10px', marginTop: '10px',
        background: theme.inputBg, border: `1px solid ${theme.border}`,
        color: theme.text, borderRadius: '4px'
    };

    return (
        <div style={containerStyle}>
            {/* Cabeçalho Simples para Voltar */}
            <div style={{position: 'absolute', top: 20, left: 20}}>
                <button onClick={onBack} style={{background: 'transparent', border: 'none', color: theme.text, cursor: 'pointer', fontSize: '24px', display:'flex', alignItems:'center'}}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                    <span style={{fontSize: '16px', marginLeft: '10px', fontWeight: 'bold'}}>Voltar</span>
                </button>
            </div>

            <div style={{position: 'absolute', top: 20, right: 20}}>
                 <button onClick={() => setIsDarkMode(!isDarkMode)} style={{background: 'transparent', border: `1px solid ${theme.border}`, color: theme.text, padding: '5px 10px', borderRadius: '4px', cursor: 'pointer'}}>
                    {isDarkMode ? '☀️' : '🌙'}
                 </button>
            </div>

            <h1 style={{color: '#28a745', marginBottom: '40px'}}>Iniciar Planejamento de Corte</h1>

            <div style={{display: 'flex', gap: '30px', flexWrap: 'wrap', justifyContent: 'center'}}>
                
                {/* CARD: UPLOAD LOCAL */}
                <div style={cardStyle}>
                    <h3 style={{marginTop: 0}}>📂 Arquivo Local</h3>
                    <p style={{fontSize: '13px', opacity: 0.7}}>Carregue arquivos DXF diretamente do seu computador.</p>
                    <label style={{
                        display: 'block', marginTop: '20px', padding: '12px', 
                        background: '#007bff', color: 'white', borderRadius: '4px', 
                        cursor: 'pointer', fontWeight: 'bold'
                    }}>
                        Selecionar DXF
                        <input type="file" accept=".dxf" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
                    </label>
                </div>

                {/* CARD: BUSCA BANCO */}
                <div style={cardStyle}>
                    <h3 style={{marginTop: 0}}>☁️ Banco de Dados</h3>
                    <p style={{fontSize: '13px', opacity: 0.7}}>Busque peças cadastradas pela Engenharia.</p>
                    <input 
                        placeholder="Número do Pedido" 
                        style={inputStyle}
                        value={dbFilters.pedido}
                        onChange={e => setDbFilters({...dbFilters, pedido: e.target.value})}
                    />
                    <input 
                        placeholder="Material (ex: Inox)" 
                        style={inputStyle}
                        value={dbFilters.material}
                        onChange={e => setDbFilters({...dbFilters, material: e.target.value})}
                    />
                    <button 
                        onClick={handleDBSearch} 
                        disabled={isLoadingDB}
                        style={{
                            width: '100%', marginTop: '20px', padding: '12px', 
                            background: isLoadingDB ? '#666' : '#28a745', color: 'white', border: 'none',
                            borderRadius: '4px', cursor: isLoadingDB ? 'wait' : 'pointer', fontWeight: 'bold'
                        }}
                    >
                        {isLoadingDB ? 'Buscando...' : '🔍 Buscar no Banco'}
                    </button>
                </div>
            </div>

            {error && <div style={{marginTop: '20px', color: '#dc3545', fontWeight: 'bold'}}>{error}</div>}
        </div>
    );
};