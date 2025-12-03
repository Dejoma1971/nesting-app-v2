/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import DxfParser from 'dxf-parser';
import { NestingBoard } from './NestingBoard';
import type { ImportedPart } from './types';

export const DxfReader = () => {
  const [parts, setParts] = useState<ImportedPart[]>([]);
  const [error, setError] = useState<string>('');
  const [isDarkMode, setIsDarkMode] = useState(true);

  // --- MATEMÁTICA GEOMÉTRICA (ACHATAMENTO DE BLOCOS) ---
  
  // Função para rotacionar um ponto (usada ao explodir blocos)
  const rotatePoint = (x: number, y: number, angleDeg: number) => {
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
        x: (x * cos) - (y * sin),
        y: (x * sin) + (y * cos)
    };
  };

  // Função Recursiva para Explodir INSERTs em Geometria Pura
  const flattenGeometry = (entities: any[], blocks: any, transform = { x: 0, y: 0, rotation: 0, scale: 1 }): any[] => {
    let flatEntities: any[] = [];

    if (!entities) return [];

    entities.forEach(ent => {
        if (ent.type === 'INSERT') {
            const block = blocks[ent.name];
            if (block && block.entities) {
                // Calcula a nova transformação acumulada
                const newScale = transform.scale * (ent.scale?.x || 1); // Simplificação: assume escala uniforme
                const newRotation = transform.rotation + (ent.rotation || 0);
                
                // A posição do insert precisa ser rotacionada pela transformação do pai
                const rPos = rotatePoint(ent.position.x, ent.position.y, transform.rotation);
                const newX = transform.x + (rPos.x * transform.scale);
                const newY = transform.y + (rPos.y * transform.scale);

                // Recursividade: Explode o bloco dentro do bloco
                const childEnts = flattenGeometry(block.entities, blocks, {
                    x: newX,
                    y: newY,
                    rotation: newRotation,
                    scale: newScale
                });
                flatEntities = flatEntities.concat(childEnts);
            }
        } else {
            // Se for geometria primitiva, aplicamos a transformação atual nela
            // e adicionamos à lista plana.
            const clone = JSON.parse(JSON.stringify(ent)); // Clone para não alterar o original
            
            // Aplica Transformações (Scale -> Rotate -> Translate)
            const applyTrans = (x: number, y: number) => {
                const rx = x * transform.scale;
                const ry = y * transform.scale;
                const r = rotatePoint(rx, ry, transform.rotation);
                return { x: r.x + transform.x, y: r.y + transform.y };
            };

            if (clone.type === 'LINE') {
                const p1 = applyTrans(clone.vertices[0].x, clone.vertices[0].y);
                const p2 = applyTrans(clone.vertices[1].x, clone.vertices[1].y);
                clone.vertices[0] = { x: p1.x, y: p1.y };
                clone.vertices[1] = { x: p2.x, y: p2.y };
                flatEntities.push(clone);
            } 
            else if (clone.type === 'LWPOLYLINE' || clone.type === 'POLYLINE') {
                if (clone.vertices) {
                    clone.vertices = clone.vertices.map((v: any) => {
                        const p = applyTrans(v.x, v.y);
                        return { ...v, x: p.x, y: p.y };
                    });
                }
                flatEntities.push(clone);
            }
            else if (clone.type === 'CIRCLE') {
                const c = applyTrans(clone.center.x, clone.center.y);
                clone.center = { x: c.x, y: c.y };
                clone.radius *= transform.scale;
                flatEntities.push(clone);
            }
            // Adicione outros tipos aqui se necessário (ARC, ELLIPSE, etc)
        }
    });

    return flatEntities;
  };

  // --- CÁLCULO DE ÁREA (Mesmo de antes, mas agora recebe lista limpa) ---
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
           if (ent.vertices) {
               ent.vertices.forEach((v: any) => {
                   if(v.x < minX) minX = v.x; if(v.x > maxX) maxX = v.x;
                   if(v.y < minY) minY = v.y; if(v.y > maxY) maxY = v.y;
               });
               if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && ent.shape) {
                    calculatedNetArea += calculatePolygonArea(ent.vertices);
               }
           } 
           else if (ent.center && ent.radius) {
               const cx = ent.center.x;
               const cy = ent.center.y;
               const r = ent.radius;
               if(cx - r < minX) minX = cx - r; if(cx + r > maxX) maxX = cx + r;
               if(cy - r < minY) minY = cy - r; if(cy + r > maxY) maxY = cy + r;
               calculatedNetArea += Math.PI * r * r;
           }
      });

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
                        const rawEnts = (parsed as any).entities;
                        const blks = (parsed as any).blocks;
                        
                        // 1. AQUI ESTÁ A MÁGICA: Achatamos tudo antes de qualquer coisa
                        const flatEnts = flattenGeometry(rawEnts, blks);

                        // 2. Analisamos a geometria já explodida
                        const metrics = analyzeGeometry(flatEnts);

                        newParts.push({
                            id: crypto.randomUUID(),
                            name: file.name,
                            entities: flatEnts, // Salvamos as entidades já planas
                            blocks: {}, // Não precisamos mais dos blocos
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