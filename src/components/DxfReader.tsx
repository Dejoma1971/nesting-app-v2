/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import DxfParser from 'dxf-parser';
import { NestingBoard } from './NestingBoard';
import type { ImportedPart } from './types';

// --- DEFINIÇÃO DAS PROPRIEDADES ACEITAS ---
interface DxfReaderProps {
    preLoadedParts?: ImportedPart[];
}

export const DxfReader: React.FC<DxfReaderProps> = ({ preLoadedParts }) => {
  // 1. Inicialização de Estado (Lazy)
  // Se vieram peças da engenharia, já inicia com elas.
  const [parts, setParts] = useState<ImportedPart[]>(preLoadedParts || []);
  
  const [error, setError] = useState<string>('');
  
  const [isDarkMode, setIsDarkMode] = useState(true);
  
  // 2. Estado do Modo (Local ou Banco)
  const [sourceMode, setSourceMode] = useState<'local' | 'db' | null>(
      (preLoadedParts && preLoadedParts.length > 0) ? 'local' : null
  ); 
  
  // 3. Estados de Busca no Banco (CORREÇÃO: Declarados aqui no topo)
  const [dbFilters, setDbFilters] = useState({ pedido: '', material: '' });
  const [isLoadingDB, setIsLoadingDB] = useState(false);

  // --- LÓGICA GEOMÉTRICA ---
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
           
           // Cálculo simples de área para peças locais
           if (ent.type === 'CIRCLE') calculatedNetArea += Math.PI * (ent.radius * ent.radius);
           else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.shape) calculatedNetArea += calculatePolygonArea(ent.vertices);
      });
      if (minX === Infinity) return { width: 0, height: 0, grossArea: 0, netArea: 0 };
      const width = maxX - minX; const height = maxY - minY;
      const grossArea = width * height;
      return { width, height, grossArea, netArea: calculatedNetArea > 0 ? calculatedNetArea : grossArea };
  };

  // --- 1. MODO LOCAL: UPLOAD ---
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    setSourceMode('local');
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
    if (newParts.length > 0) { setParts(prev => [...prev, ...newParts]); setError(''); } else { setError('Nenhum arquivo válido.'); }
  };

  // --- 2. MODO BANCO: BUSCA ---
  const handleDBSearch = async () => {
      if (!dbFilters.pedido && !dbFilters.material) { alert("Digite um Pedido ou Material para buscar."); return; }
      setIsLoadingDB(true);
      setSourceMode('db'); 
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

  const handleClearBoard = () => {
      if(window.confirm("Isso limpará a mesa de corte atual. Continuar?")) {
          setParts([]);
          setSourceMode(null);
      }
  };

  const containerStyle: React.CSSProperties = { fontFamily: 'Arial', background: isDarkMode?'#1e1e1e':'#fff', color: isDarkMode?'#e0e0e0':'#333', width:'100vw', height:'100vh', display:'flex', flexDirection:'column', margin:0, padding:0, overflow:'hidden' };
  const toolbarStyle: React.CSSProperties = { padding:'10px 20px', borderBottom: isDarkMode?'1px solid #333':'1px solid #ccc', display:'flex', justifyContent:'space-between', alignItems:'center', height:'60px', background: isDarkMode ? '#252526' : '#f0f0f0' };
  const inputStyle: React.CSSProperties = { padding: '5px', borderRadius: '4px', border: '1px solid #555', background: isDarkMode ? '#1e1e1e' : '#fff', color: isDarkMode ? '#fff' : '#333', marginRight: '10px' };

  return (
    <div style={containerStyle}>
      <div style={toolbarStyle}>
        <div style={{display:'flex', gap:'20px', alignItems:'center'}}>
            <h2 style={{margin:0, fontSize:'18px', color:'#28a745'}}>Planejamento de Corte</h2>
            
            {/* MODO HÍBRIDO */}
            {preLoadedParts && preLoadedParts.length > 0 ? (
                 <span style={{background:'#007bff', color:'white', padding:'2px 8px', borderRadius:'4px', fontSize:'12px'}}>
                    ✅ Lote da Engenharia
                 </span>
            ) : (
                sourceMode === null && (
                    <div style={{display:'flex', gap:'10px'}}>
                        {/* OPÇÃO A: LOCAL */}
                        <label style={{background: '#555', color: 'white', padding: '5px 15px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold'}}>
                            📂 Arquivo Local
                            <input type="file" accept=".dxf" multiple onChange={handleFileUpload} style={{display: 'none'}} />
                        </label>
                        
                        {/* OPÇÃO B: BANCO */}
                        <div style={{display:'flex', alignItems:'center', gap:'5px', border:'1px solid #555', padding:'3px 10px', borderRadius:'4px', background: isDarkMode?'rgba(0,0,0,0.2)':'#fff'}}>
                            <span style={{fontSize:'12px'}}>☁️ Banco:</span>
                            <input placeholder="Pedido..." style={{...inputStyle, width:'80px'}} value={dbFilters.pedido} onChange={e=>setDbFilters({...dbFilters, pedido: e.target.value})} />
                            <input placeholder="Material..." style={{...inputStyle, width:'80px'}} value={dbFilters.material} onChange={e=>setDbFilters({...dbFilters, material: e.target.value})} />
                            <button onClick={handleDBSearch} disabled={isLoadingDB} style={{cursor:'pointer', background:'transparent', border:'none'}}>🔎</button>
                        </div>
                    </div>
                )
            )}
            
            {/* BOTÃO LIMPAR */}
            {parts.length > 0 && (
                <button onClick={handleClearBoard} style={{background:'transparent', border:'1px solid #ff4d4d', color:'#ff4d4d', padding:'5px 10px', borderRadius:'4px', cursor:'pointer', fontSize:'12px'}}>
                    🗑️ Limpar Mesa
                </button>
            )}
        </div>
        <div style={{display:'flex', gap:'10px'}}>
            <button onClick={()=>setIsDarkMode(!isDarkMode)} style={{background:'transparent', border:'1px solid currentColor', color:'currentColor', padding:'5px 10px', borderRadius:'4px', cursor:'pointer'}}>{isDarkMode?'Modo Claro':'Modo Escuro'}</button>
        </div>
      </div>
      
      {error && <div style={{color:'red', padding:10, textAlign:'center'}}>{error}</div>}
      
      <div style={{flex:1, display:'flex', overflow:'hidden'}}>
        {parts.length > 0 ? (
            <NestingBoard parts={parts} />
        ) : (
            <div style={{width:'100%', display:'flex', flexDirection:'column', justifyContent:'center', alignItems:'center', opacity:0.5}}>
                <p style={{fontSize:'18px'}}>Mesa de Corte Vazia</p>
                <p style={{fontSize:'14px'}}>Aguardando peças...</p>
            </div>
        )}
      </div>
    </div>
  );
};