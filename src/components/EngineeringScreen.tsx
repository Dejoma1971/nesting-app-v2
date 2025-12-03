/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from 'react';
import DxfParser from 'dxf-parser';
import type { ImportedPart } from './types';

// --- ESTRUTURAS AUXILIARES ---
interface Point { x: number; y: number; }
interface EntityBox { minX: number; minY: number; maxX: number; maxY: number; area: number; }

// --- 1. FUNÇÕES AUXILIARES (FORA DO COMPONENTE) ---

// Classe para Agrupamento (Union-Find)
class UnionFind {
  parent: number[];
  constructor(size: number) {
      this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(i: number): number {
      if (this.parent[i] === i) return i;
      this.parent[i] = this.find(this.parent[i]);
      return this.parent[i];
  }
  union(i: number, j: number) {
      const rootI = this.find(i);
      const rootJ = this.find(j);
      if (rootI !== rootJ) this.parent[rootI] = rootJ;
  }
}

// Matemática de Rotação
const rotatePoint = (x: number, y: number, angleDeg: number) => {
  const rad = (angleDeg * Math.PI) / 180;
  return { 
      x: (x * Math.cos(rad)) - (y * Math.sin(rad)), 
      y: (x * Math.sin(rad)) + (y * Math.cos(rad)) 
  };
};

// Extrai pontos de conexão de uma entidade (início e fim)
const getConnectionPoints = (ent: any): Point[] => {
    if (ent.type === 'LINE') return ent.vertices; // [start, end]
    if (ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') return ent.vertices; // todos os pontos
    if (ent.type === 'ARC') {
        // Calcula início e fim do arco baseado no ângulo
        const r = ent.radius;
        const cx = ent.center.x;
        const cy = ent.center.y;
        const p1 = {
            x: cx + r * Math.cos(ent.startAngle),
            y: cy + r * Math.sin(ent.startAngle)
        };
        const p2 = {
            x: cx + r * Math.cos(ent.endAngle),
            y: cy + r * Math.sin(ent.endAngle)
        };
        return [p1, p2];
    }
    // Círculos não têm pontas soltas, mas retornamos o centro para caso toquem em algo
    if (ent.type === 'CIRCLE') return []; 
    return [];
};

// Verifica se dois pontos estão "perto o suficiente" (TOLERÂNCIA DE 1mm)
const arePointsClose = (p1: Point, p2: Point) => {
    const TOLERANCE = 1.0; // 1mm de tolerância para fechar gaps do DXF
    return Math.abs(p1.x - p2.x) < TOLERANCE && Math.abs(p1.y - p2.y) < TOLERANCE;
};

// Verifica se duas entidades se tocam
const entitiesTouch = (ent1: any, ent2: any) => {
    const pts1 = getConnectionPoints(ent1);
    const pts2 = getConnectionPoints(ent2);

    // Se for círculo, verifica se está contido (bounding box) ou se toca algo
    // Para simplificar: Círculos são "ilhas" que serão capturadas pela lógica de contenção depois.
    // Aqui focamos em conectar linhas e arcos abertos.
    
    for (const p1 of pts1) {
        for (const p2 of pts2) {
            if (arePointsClose(p1, p2)) return true;
        }
    }
    return false;
};

const calculateBoundingBox = (entities: any[]): EntityBox => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    const update = (x: number, y: number) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    };

    entities.forEach(ent => {
        if (ent.vertices) ent.vertices.forEach((v: any) => update(v.x, v.y));
        else if (ent.center && ent.radius) {
            update(ent.center.x - ent.radius, ent.center.y - ent.radius);
            update(ent.center.x + ent.radius, ent.center.y + ent.radius);
        } else if (ent.type === 'ARC') {
             // Para arco, bounding box precisa ser mais preciso, mas centro +/- raio funciona como aproximação segura
             update(ent.center.x - ent.radius, ent.center.y - ent.radius);
             update(ent.center.x + ent.radius, ent.center.y + ent.radius);
        }
    });

    if (minX === Infinity) return { minX: 0, minY: 0, maxX: 0, maxY: 0, area: 0 };
    return { minX, minY, maxX, maxY, area: (maxX - minX) * (maxY - minY) };
};

const isContained = (inner: EntityBox, outer: EntityBox) => {
    const eps = 0.5; 
    return (
        inner.minX >= outer.minX - eps &&
        inner.maxX <= outer.maxX + eps &&
        inner.minY >= outer.minY - eps &&
        inner.maxY <= outer.maxY + eps
    );
};

// Função recursiva para explodir blocos
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
          const applyTrans = (x: number, y: number) => {
              const rx = x * transform.scale; 
              const ry = y * transform.scale;
              const r = rotatePoint(rx, ry, transform.rotation);
              return { x: r.x + transform.x, y: r.y + transform.y };
          };

          // Aplica transformações básicas
          if (clone.type === 'LINE') {
              const p1 = applyTrans(clone.vertices[0].x, clone.vertices[0].y);
              const p2 = applyTrans(clone.vertices[1].x, clone.vertices[1].y);
              clone.vertices = [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
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
          else if (clone.type === 'ARC') {
              const c = applyTrans(clone.center.x, clone.center.y);
              clone.center = { x: c.x, y: c.y };
              clone.radius *= transform.scale;
              clone.startAngle += (transform.rotation * Math.PI / 180);
              clone.endAngle += (transform.rotation * Math.PI / 180);
              flatEntities.push(clone);
          }
      }
  });
  return flatEntities;
};

const processFileToParts = (flatEntities: any[], fileName: string): ImportedPart[] => {
    // A. AGRUPAR POR CONECTIVIDADE (BRUTE FORCE COM TOLERÂNCIA)
    // Usamos O(N^2) aqui, mas para < 10.000 entidades é instantâneo e muito mais seguro que Map de Strings.
    const n = flatEntities.length;
    const uf = new UnionFind(n);

    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            // Se as entidades i e j se tocam (com tolerância), una os grupos
            if (entitiesTouch(flatEntities[i], flatEntities[j])) {
                uf.union(i, j);
            }
        }
    }

    // Organiza os grupos
    const clusters = new Map<number, any[]>();
    flatEntities.forEach((ent, idx) => {
        const root = uf.find(idx);
        if (!clusters.has(root)) clusters.set(root, []);
        clusters.get(root)!.push(ent);
    });

    // B. DETECTAR CONTENÇÃO (PAI vs FUROS)
    const candidateParts = Array.from(clusters.values()).map(ents => ({
        entities: ents,
        box: calculateBoundingBox(ents),
        children: [] as any[],
        isHole: false
    }));

    // Ordena do maior para o menor
    candidateParts.sort((a, b) => b.box.area - a.box.area);

    const finalParts: ImportedPart[] = [];

    // Verifica contenção
    for (let i = 0; i < candidateParts.length; i++) {
        const parent = candidateParts[i];
        if (parent.isHole) continue;

        // FILTRO DE LIXO: Se a "peça" for muito pequena (ex: < 10mm x 10mm) e não for furo de ninguém
        // Provavelmente é sujeira do desenho.
        const width = parent.box.maxX - parent.box.minX;
        const height = parent.box.maxY - parent.box.minY;
        if (width < 2 && height < 2) continue; 

        for (let j = i + 1; j < candidateParts.length; j++) {
            const child = candidateParts[j];
            if (!child.isHole && isContained(child.box, parent.box)) {
                parent.entities = parent.entities.concat(child.entities);
                child.isHole = true;
            }
        }

        // C. NORMALIZAÇÃO
        const finalBox = calculateBoundingBox(parent.entities);
        const finalW = finalBox.maxX - finalBox.minX;
        const finalH = finalBox.maxY - finalBox.minY;

        const normalizedEntities = parent.entities.map((ent: any) => {
            const clone = JSON.parse(JSON.stringify(ent));
            const move = (x: number, y: number) => ({ x: x - finalBox.minX, y: y - finalBox.minY });
            
            if (clone.vertices) {
                clone.vertices = clone.vertices.map((v:any) => { const p = move(v.x, v.y); return {...v, x: p.x, y: p.y}; });
            } else if (clone.center) {
                const c = move(clone.center.x, clone.center.y);
                clone.center = { x: c.x, y: c.y };
            }
            return clone;
        });

        finalParts.push({
            id: crypto.randomUUID(),
            name: `${fileName} - Item ${finalParts.length + 1}`,
            entities: normalizedEntities,
            blocks: {},
            width: finalW,
            height: finalH,
            grossArea: finalW * finalH,
            netArea: finalW * finalH
        });
    }

    return finalParts;
};

// --- 2. COMPONENTE PRINCIPAL ---

export const EngineeringScreen = () => {
  const [parts, setParts] = useState<ImportedPart[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    setLoading(true);
    setProcessingMsg('Lendo arquivo...');
    
    const parser = new DxfParser();
    const newPartsGlobal: ImportedPart[] = [];

    const readers = Array.from(files).map(file => {
        return new Promise<void>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const content = e.target?.result as string;
                    setProcessingMsg(`Processando ${file.name}...`);
                    const parsed = parser.parseSync(content);
                    
                    if (parsed) {
                        const flatEnts = flattenGeometry((parsed as any).entities, (parsed as any).blocks);
                        const partsFromFile = processFileToParts(flatEnts, file.name);
                        newPartsGlobal.push(...partsFromFile);
                    }
                } catch (err) { console.error(err); }
                resolve();
            };
            reader.readAsText(file);
        });
    });

    await Promise.all(readers);
    setParts(prev => [...prev, ...newPartsGlobal]);
    setLoading(false);
    setProcessingMsg('');
  };

  const renderEntity = (entity: any, index: number): React.ReactNode => {
    switch (entity.type) {
      case 'LINE': return <line key={index} x1={entity.vertices[0].x} y1={entity.vertices[0].y} x2={entity.vertices[1].x} y2={entity.vertices[1].y} stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />;
      case 'LWPOLYLINE': case 'POLYLINE': { if (!entity.vertices) return null; const d = entity.vertices.map((v:any, i:number)=>`${i===0?'M':'L'} ${v.x} ${v.y}`).join(' '); return <path key={index} d={entity.shape?d+" Z":d} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />; }
      case 'CIRCLE': return <circle key={index} cx={entity.center.x} cy={entity.center.y} r={entity.radius} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />;
      case 'ARC': {
          const startAngle = entity.startAngle;
          const endAngle = entity.endAngle;
          const r = entity.radius;
          const x1 = entity.center.x + r * Math.cos(startAngle);
          const y1 = entity.center.y + r * Math.sin(startAngle);
          const x2 = entity.center.x + r * Math.cos(endAngle);
          const y2 = entity.center.y + r * Math.sin(endAngle);
          // Correção para arcos que cruzam o zero
          let da = endAngle - startAngle;
          if (da < 0) da += 2 * Math.PI;
          const largeArc = da > Math.PI ? 1 : 0;
          const d = `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
          return <path key={index} d={d} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />;
      }
      default: return null;
    }
  };

  // --- ESTILOS ---
  const containerStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100vh', background: '#1e1e1e', color: '#e0e0e0', fontFamily: 'Arial' };
  const headerStyle: React.CSSProperties = { padding: '15px 20px', borderBottom: '1px solid #444', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#252526' };
  const splitContainer: React.CSSProperties = { display: 'flex', flex: 1, overflow: 'hidden' };
  const leftPanel: React.CSSProperties = { flex: 1, borderRight: '1px solid #444', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: '#1e1e1e' };
  const rightPanel: React.CSSProperties = { flex: 2, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: '#1e1e1e' };
  const cardStyle: React.CSSProperties = { width: '120px', height: '120px', border: '1px solid #444', margin: '10px', borderRadius: '4px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#2d2d2d', flexDirection: 'column', cursor: 'pointer', transition: '0.2s', position: 'relative' };
  const tableHeaderStyle: React.CSSProperties = { textAlign: 'left', padding: '10px', borderBottom: '1px solid #555', color: '#888', fontSize: '13px' };
  const tableCellStyle: React.CSSProperties = { padding: '10px', borderBottom: '1px solid #333', fontSize: '14px' };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
            <h2 style={{ margin: 0, fontSize: '18px', color: '#007bff' }}>Engenharia & Projetos</h2>
            {loading ? <span style={{fontSize:'12px', color:'#ffd700'}}>⏳ {processingMsg}</span> : <div style={{fontSize:'12px', background:'#333', padding:'5px 10px', borderRadius:'4px'}}>Fase 1: Importação</div>}
        </div>
        <div>
             <label style={{ background: '#007bff', color: 'white', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
                + Importar DXF (Conjunto)
                <input type="file" accept=".dxf" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
             </label>
        </div>
      </div>

      <div style={splitContainer}>
        <div style={leftPanel}>
            <div style={{ padding: '10px', borderBottom: '1px solid #333', fontWeight: 'bold', fontSize: '12px', background: '#252526' }}>
                PEÇAS IDENTIFICADAS ({parts.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', padding: '10px', alignContent: 'flex-start' }}>
                {parts.map((part, idx) => {
                     let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
                     part.entities.forEach((ent:any) => {
                         if(ent.vertices) ent.vertices.forEach((v:any)=>{if(v.x<minX)minX=v.x;if(v.x>maxX)maxX=v.x;if(v.y<minY)minY=v.y;if(v.y>maxY)maxY=v.y;});
                         else if(ent.center){
                             const r=ent.radius || 0; 
                             if(ent.center.x-r<minX)minX=ent.center.x-r;if(ent.center.x+r>maxX)maxX=ent.center.x+r;
                             if(ent.center.y-r<minY)minY=ent.center.y-r;if(ent.center.y+r>maxY)maxY=ent.center.y+r;
                         }
                     });
                     const w = (maxX-minX) || 100; 
                     const h = (maxY-minY) || 100;
                     const p = Math.max(w, h) * 0.1;
                     const viewBox = `${minX-p} ${minY-p} ${w+p*2} ${h+p*2}`;

                     return (
                        <div key={part.id} style={cardStyle} title={part.name}>
                            <div style={{position:'absolute', top:2, left:2, fontSize:'9px', color:'#777'}}>#{idx+1}</div>
                            <div style={{flex:1, width:'100%', padding:'5px', boxSizing:'border-box'}}>
                                <svg viewBox={viewBox} style={{width:'100%', height:'100%'}} transform="scale(1, -1)" preserveAspectRatio="xMidYMid meet">
                                    {part.entities.map((ent: any, i: number) => renderEntity(ent, i))}
                                </svg>
                            </div>
                            <div style={{width:'100%', background:'rgba(0,0,0,0.3)', padding:'2px 5px', fontSize:'10px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', textAlign:'center'}}>
                                {part.width.toFixed(0)}x{part.height.toFixed(0)}
                            </div>
                        </div>
                     );
                })}
            </div>
        </div>

        <div style={rightPanel}>
            <div style={{ padding: '10px', borderBottom: '1px solid #333', fontWeight: 'bold', fontSize: '12px', background: '#252526' }}>
                LISTA PARA CADASTRO
            </div>
            
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr style={{background: 'rgba(255,255,255,0.05)'}}>
                        <th style={{...tableHeaderStyle, width:'40px'}}>#</th>
                        <th style={tableHeaderStyle}>Nome (Sugerido)</th>
                        <th style={tableHeaderStyle}>Dimensões (mm)</th>
                        <th style={tableHeaderStyle}>Área (m²)</th>
                        <th style={tableHeaderStyle}>Qtd. Entidades</th>
                    </tr>
                </thead>
                <tbody>
                    {parts.map((part, i) => (
                        <tr key={part.id} style={{background: i%2===0 ? 'transparent' : 'rgba(255,255,255,0.02)'}}>
                            <td style={tableCellStyle}>{i + 1}</td>
                            <td style={{...tableCellStyle, fontWeight:'bold', color: '#fff'}}>{part.name}</td>
                            <td style={tableCellStyle}>{part.width.toFixed(1)} x {part.height.toFixed(1)}</td>
                            <td style={tableCellStyle}>{(part.grossArea / 1000000).toFixed(4)}</td>
                            <td style={tableCellStyle}>{part.entities.length}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>
    </div>
  );
};






// /* eslint-disable @typescript-eslint/no-explicit-any */
// import React, { useState } from 'react';
// import DxfParser from 'dxf-parser';
// import type { ImportedPart } from './types';

// export const EngineeringScreen = () => {
//   const [parts, setParts] = useState<ImportedPart[]>([]);
//   const [loading, setLoading] = useState(false);

//   // --- LÓGICA GEOMÉTRICA (Reutilizada para exibir as miniaturas) ---
//   const rotatePoint = (x: number, y: number, angleDeg: number) => {
//     const rad = (angleDeg * Math.PI) / 180;
//     return { x: (x * Math.cos(rad)) - (y * Math.sin(rad)), y: (x * Math.sin(rad)) + (y * Math.cos(rad)) };
//   };

//   const flattenGeometry = (entities: any[], blocks: any, transform = { x: 0, y: 0, rotation: 0, scale: 1 }): any[] => {
//     let flatEntities: any[] = [];
//     if (!entities) return [];
//     entities.forEach(ent => {
//         if (ent.type === 'INSERT') {
//             const block = blocks[ent.name];
//             if (block && block.entities) {
//                 const newScale = transform.scale * (ent.scale?.x || 1);
//                 const newRotation = transform.rotation + (ent.rotation || 0);
//                 const rPos = rotatePoint(ent.position.x, ent.position.y, transform.rotation);
//                 const newX = transform.x + (rPos.x * transform.scale);
//                 const newY = transform.y + (rPos.y * transform.scale);
//                 flatEntities = flatEntities.concat(flattenGeometry(block.entities, blocks, { x: newX, y: newY, rotation: newRotation, scale: newScale }));
//             }
//         } else {
//             const clone = JSON.parse(JSON.stringify(ent));
//             const applyTrans = (x: number, y: number) => {
//                 const rx = x * transform.scale, ry = y * transform.scale;
//                 const r = rotatePoint(rx, ry, transform.rotation);
//                 return { x: r.x + transform.x, y: r.y + transform.y };
//             };
//             if (clone.type === 'LINE') {
//                 const p1 = applyTrans(clone.vertices[0].x, clone.vertices[0].y);
//                 const p2 = applyTrans(clone.vertices[1].x, clone.vertices[1].y);
//                 clone.vertices = [{ x: p1.x, y: p1.y }, { x: p2.x, y: p2.y }];
//                 flatEntities.push(clone);
//             } else if (clone.type === 'LWPOLYLINE' || clone.type === 'POLYLINE') {
//                 if (clone.vertices) clone.vertices = clone.vertices.map((v: any) => { const p = applyTrans(v.x, v.y); return { ...v, x: p.x, y: p.y }; });
//                 flatEntities.push(clone);
//             } else if (clone.type === 'CIRCLE') {
//                 const c = applyTrans(clone.center.x, clone.center.y);
//                 clone.center = { x: c.x, y: c.y };
//                 clone.radius *= transform.scale;
//                 flatEntities.push(clone);
//             }
//         }
//     });
//     return flatEntities;
//   };

//   const analyzeGeometry = (flatEntities: any[]) => {
//       let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
//       flatEntities.forEach(ent => {
//            if (ent.vertices) ent.vertices.forEach((v: any) => { if(v.x<minX)minX=v.x; if(v.x>maxX)maxX=v.x; if(v.y<minY)minY=v.y; if(v.y>maxY)maxY=v.y; });
//            else if (ent.center && ent.radius) {
//                const cx = ent.center.x, cy = ent.center.y, r = ent.radius;
//                if(cx-r<minX)minX=cx-r; if(cx+r>maxX)maxX=cx+r; if(cy-r<minY)minY=cy-r; if(cy+r>maxY)maxY=cy+r;
//            }
//       });
//       if (minX === Infinity) return { width: 0, height: 0, grossArea: 0 };
//       const width = maxX - minX;
//       const height = maxY - minY;
//       return { width, height, grossArea: width * height, minX, minY };
//   };

//   const renderEntity = (entity: any, index: number): React.ReactNode => {
//     switch (entity.type) {
//       case 'LINE': return <line key={index} x1={entity.vertices[0].x} y1={entity.vertices[0].y} x2={entity.vertices[1].x} y2={entity.vertices[1].y} stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />;
//       case 'LWPOLYLINE': case 'POLYLINE': { if (!entity.vertices) return null; const d = entity.vertices.map((v:any, i:number)=>`${i===0?'M':'L'} ${v.x} ${v.y}`).join(' '); return <path key={index} d={entity.shape?d+" Z":d} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />; }
//       case 'CIRCLE': return <circle key={index} cx={entity.center.x} cy={entity.center.y} r={entity.radius} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />;
//       default: return null;
//     }
//   };

//   // --- HANDLER DE IMPORTAÇÃO ---
//   const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
//     const files = event.target.files;
//     if (!files || files.length === 0) return;
//     setLoading(true);

//     const parser = new DxfParser();
//     const newParts: ImportedPart[] = [];

//     const readers = Array.from(files).map(file => {
//         return new Promise<void>((resolve) => {
//             const reader = new FileReader();
//             reader.onload = (e) => {
//                 try {
//                     const content = e.target?.result as string;
//                     const parsed = parser.parseSync(content);
//                     if (parsed) {
//                         const flatEnts = flattenGeometry((parsed as any).entities, (parsed as any).blocks);
//                         const metrics = analyzeGeometry(flatEnts);
//                         newParts.push({
//                             id: crypto.randomUUID(),
//                             name: file.name,
//                             entities: flatEnts,
//                             blocks: {},
//                             width: metrics.width,
//                             height: metrics.height,
//                             grossArea: metrics.grossArea,
//                             netArea: metrics.grossArea // Simplificado por hora
//                         });
//                     }
//                 } catch (err) { console.error(err); }
//                 resolve();
//             };
//             reader.readAsText(file);
//         });
//     });

//     await Promise.all(readers);
//     setParts(prev => [...prev, ...newParts]);
//     setLoading(false);
//   };

//   // --- ESTILOS ---
//   const containerStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', height: '100vh', background: '#1e1e1e', color: '#e0e0e0', fontFamily: 'Arial' };
//   const headerStyle: React.CSSProperties = { padding: '15px 20px', borderBottom: '1px solid #444', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#252526' };
//   const splitContainer: React.CSSProperties = { display: 'flex', flex: 1, overflow: 'hidden' };
//   const leftPanel: React.CSSProperties = { flex: 1, borderRight: '1px solid #444', display: 'flex', flexDirection: 'column', overflowY: 'auto', background: '#1e1e1e' };
//   const rightPanel: React.CSSProperties = { flex: 2, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: '#1e1e1e' };
  
//   const cardStyle: React.CSSProperties = { width: '120px', height: '120px', border: '1px solid #444', margin: '10px', borderRadius: '4px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#2d2d2d', flexDirection: 'column', cursor: 'pointer', transition: '0.2s' };
  
//   const tableHeaderStyle: React.CSSProperties = { textAlign: 'left', padding: '10px', borderBottom: '1px solid #555', color: '#888', fontSize: '13px' };
//   const tableCellStyle: React.CSSProperties = { padding: '10px', borderBottom: '1px solid #333', fontSize: '14px' };

//   return (
//     <div style={containerStyle}>
//       {/* HEADER */}
//       <div style={headerStyle}>
//         <div style={{display:'flex', alignItems:'center', gap:'15px'}}>
//             <h2 style={{ margin: 0, fontSize: '18px', color: '#007bff' }}>Engenharia & Projetos</h2>
//             <div style={{fontSize:'12px', background:'#333', padding:'5px 10px', borderRadius:'4px'}}>Fase 1: Importação</div>
//         </div>
//         <div>
//              <label style={{ background: '#007bff', color: 'white', padding: '8px 15px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>
//                 + Importar DXF
//                 <input type="file" accept=".dxf" multiple onChange={handleFileUpload} style={{ display: 'none' }} />
//              </label>
//         </div>
//       </div>

//       {/* ÁREA PRINCIPAL DIVIDIDA */}
//       <div style={splitContainer}>
        
//         {/* ESQUERDA: GALERIA DE MINIATURAS */}
//         <div style={leftPanel}>
//             <div style={{ padding: '10px', borderBottom: '1px solid #333', fontWeight: 'bold', fontSize: '12px', background: '#252526' }}>
//                 VISUALIZAÇÃO ({parts.length})
//             </div>
//             <div style={{ display: 'flex', flexWrap: 'wrap', padding: '10px', alignContent: 'flex-start' }}>
//                 {parts.length === 0 && <div style={{width:'100%', textAlign:'center', marginTop:50, opacity:0.5}}>Nenhum arquivo importado</div>}
//                 {parts.map(part => {
//                      // Calcula ViewBox da Miniatura
//                      let minX=Infinity, minY=Infinity, maxX=-Infinity, maxY=-Infinity;
//                      part.entities.forEach((ent:any) => {
//                          if(ent.vertices) ent.vertices.forEach((v:any)=>{if(v.x<minX)minX=v.x;if(v.x>maxX)maxX=v.x;if(v.y<minY)minY=v.y;if(v.y>maxY)maxY=v.y;});
//                          else if(ent.center){const r=ent.radius; if(ent.center.x-r<minX)minX=ent.center.x-r;if(ent.center.x+r>maxX)maxX=ent.center.x+r;if(ent.center.y-r<minY)minY=ent.center.y-r;if(ent.center.y+r>maxY)maxY=ent.center.y+r;}
//                      });
//                      const w = maxX-minX; const h = maxY-minY;
//                      const p = Math.max(w, h) * 0.1;
//                      const viewBox = `${minX-p} ${minY-p} ${w+p*2} ${h+p*2}`;

//                      return (
//                         <div key={part.id} style={cardStyle} title={part.name}>
//                             <div style={{flex:1, width:'100%', padding:'5px', boxSizing:'border-box'}}>
//                                 <svg viewBox={viewBox} style={{width:'100%', height:'100%'}} transform="scale(1, -1)" preserveAspectRatio="xMidYMid meet">
//                                     {part.entities.map((ent: any, i: number) => renderEntity(ent, i))}
//                                 </svg>
//                             </div>
//                             <div style={{width:'100%', background:'rgba(0,0,0,0.3)', padding:'2px 5px', fontSize:'10px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', textAlign:'center'}}>
//                                 {part.name}
//                             </div>
//                         </div>
//                      );
//                 })}
//             </div>
//         </div>

//         {/* DIREITA: LISTA DE DADOS */}
//         <div style={rightPanel}>
//             <div style={{ padding: '10px', borderBottom: '1px solid #333', fontWeight: 'bold', fontSize: '12px', background: '#252526', display: 'flex', justifyContent: 'space-between' }}>
//                 <span>DADOS TÉCNICOS</span>
//                 {loading && <span style={{color: '#ffd700'}}>Carregando...</span>}
//             </div>
            
//             <table style={{ width: '100%', borderCollapse: 'collapse' }}>
//                 <thead>
//                     <tr style={{background: 'rgba(255,255,255,0.05)'}}>
//                         <th style={{...tableHeaderStyle, width:'30px'}}>#</th>
//                         <th style={tableHeaderStyle}>Nome do Arquivo</th>
//                         <th style={tableHeaderStyle}>Dimensões (mm)</th>
//                         <th style={tableHeaderStyle}>Área Bruta (m²)</th>
//                         <th style={tableHeaderStyle}>Status</th>
//                     </tr>
//                 </thead>
//                 <tbody>
//                     {parts.map((part, i) => (
//                         <tr key={part.id} style={{background: i%2===0 ? 'transparent' : 'rgba(255,255,255,0.02)'}}>
//                             <td style={tableCellStyle}>{i + 1}</td>
//                             <td style={{...tableCellStyle, fontWeight:'bold', color: '#fff'}}>{part.name}</td>
//                             <td style={tableCellStyle}>{part.width.toFixed(1)} x {part.height.toFixed(1)}</td>
//                             <td style={tableCellStyle}>{(part.grossArea / 1000000).toFixed(4)}</td>
//                             <td style={tableCellStyle}>
//                                 <span style={{background: '#444', padding: '2px 8px', borderRadius: '4px', fontSize: '11px'}}>Novo</span>
//                             </td>
//                         </tr>
//                     ))}
//                     {parts.length === 0 && (
//                         <tr>
//                             <td colSpan={5} style={{padding: '30px', textAlign: 'center', opacity: 0.5}}>
//                                 Importe arquivos para iniciar o cadastro.
//                             </td>
//                         </tr>
//                     )}
//                 </tbody>
//             </table>
//         </div>

//       </div>
//     </div>
//   );
// };