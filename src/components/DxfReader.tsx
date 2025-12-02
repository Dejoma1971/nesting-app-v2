/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import DxfParser from 'dxf-parser';
import { NestingBoard } from './NestingBoard';
import type { ImportedPart } from './types';

export const DxfReader = () => {
  const [parts, setParts] = useState<ImportedPart[]>([]);
  const [error, setError] = useState<string>('');
  const [isDarkMode, setIsDarkMode] = useState(true);

  // --- MATEMÁTICA GEOMÉTRICA ---
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

  const analyzeGeometry = (entities: any[], blocks: any) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let calculatedNetArea = 0;

      const traverse = (ents: any[], offsetX = 0, offsetY = 0) => {
          if(!ents) return;
          ents.forEach(ent => {
              if (ent.type === 'INSERT') {
                  const block = blocks[ent.name];
                  if (block && block.entities) {
                       traverse(block.entities, (ent.position?.x||0)+offsetX, (ent.position?.y||0)+offsetY);
                  }
              }
              else if (ent.vertices) {
                  ent.vertices.forEach((v: any) => {
                      const x = v.x + offsetX;
                      const y = v.y + offsetY;
                      if(x < minX) minX = x; if(x > maxX) maxX = x;
                      if(y < minY) minY = y; if(y > maxY) maxY = y;
                  });
                  // Calcula área se for fechado
                  if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.shape) {
                       const absVertices = ent.vertices.map((v:any) => ({x: v.x+offsetX, y: v.y+offsetY}));
                       calculatedNetArea += calculatePolygonArea(absVertices);
                  }
              } 
              else if (ent.center && ent.radius) {
                  const cx = ent.center.x + offsetX;
                  const cy = ent.center.y + offsetY;
                  const r = ent.radius;
                  if(cx - r < minX) minX = cx - r; if(cx + r > maxX) maxX = cx + r;
                  if(cy - r < minY) minY = cy - r; if(cy + r > maxY) maxY = cy + r;
                  calculatedNetArea += Math.PI * r * r;
              }
          });
      };

      traverse(entities);

      if (minX === Infinity) return { width: 0, height: 0, grossArea: 0, netArea: 0 };
      const width = maxX - minX;
      const height = maxY - minY;
      const grossArea = width * height;

      return { 
          width, height, grossArea, 
          netArea: calculatedNetArea > 0 ? calculatedNetArea : grossArea 
      };
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const newParts: ImportedPart[] = [];
    const parser = new DxfParser();

    const readers = Array.from(files).map(file => {
        return new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target?.result as string;
                    const parsed = parser.parseSync(content);
                    if (parsed) {
                        const ents = (parsed as any).entities;
                        const blks = (parsed as any).blocks;
                        const metrics = analyzeGeometry(ents, blks); // <--- Aqui calculamos!

                        newParts.push({
                            id: crypto.randomUUID(),
                            name: file.name,
                            entities: ents,
                            blocks: blks,
                            width: metrics.width,
                            height: metrics.height,
                            grossArea: metrics.grossArea,
                            netArea: metrics.netArea
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
    } else { setError('Nenhum arquivo válido.'); }
  };

  // ... (Estilos e JSX iguais ao anterior) ...
  // Vou resumir a parte visual pois não mudou, foque na lógica acima.
  
  const containerStyle: React.CSSProperties = { fontFamily: 'Arial', background: isDarkMode?'#1e1e1e':'#fff', color: isDarkMode?'#e0e0e0':'#333', width:'100vw', height:'100vh', display:'flex', flexDirection:'column', margin:0, padding:0, overflow:'hidden' };

  return (
    <div style={containerStyle}>
      <div style={{ padding:'10px 20px', borderBottom: isDarkMode?'1px solid #333':'1px solid #ccc', display:'flex', justifyContent:'space-between', alignItems:'center', height:'60px' }}>
        <div style={{display:'flex', gap:'20px', alignItems:'center'}}>
            <h2 style={{margin:0, fontSize:'18px'}}>Fase 2: Configuração de Nesting</h2>
            <input type="file" accept=".dxf" multiple onChange={handleFileUpload} style={{fontSize:'12px'}} />
        </div>
        <button onClick={()=>setIsDarkMode(!isDarkMode)} style={{background:'transparent', border:'1px solid currentColor', color:'currentColor', padding:'5px 10px', borderRadius:'4px', cursor:'pointer'}}>{isDarkMode?'Modo Claro':'Modo Escuro'}</button>
      </div>
      {error && <div style={{color:'red', padding:10, textAlign:'center'}}>{error}</div>}
      <div style={{flex:1, display:'flex', overflow:'hidden'}}>
        {parts.length > 0 ? <NestingBoard parts={parts} /> : <div style={{width:'100%', display:'flex', justifyContent:'center', alignItems:'center', opacity:0.5}}><p>Selecione arquivos DXF.</p></div>}
      </div>
    </div>
  );
};