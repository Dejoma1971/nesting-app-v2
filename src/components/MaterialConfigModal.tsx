/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback } from "react";

// --- TABELA DE PADRÕES (Baseada no PDF Maqtech: ABNT e USG) ---
// Preenchimento automático para agilizar o cadastro
const STANDARD_LIST = [
  { label: 'Chapa #28 (0,38mm)', mm: 0.38, bitola: '#28', pol: '1/64"' },
  { label: 'Chapa #26 (0,45mm)', mm: 0.45, bitola: '#26', pol: '3/160"' },
  { label: 'Chapa #24 (0,60mm)', mm: 0.60, bitola: '#24', pol: '1/40"' },
  { label: 'Chapa #22 (0,75mm)', mm: 0.75, bitola: '#22', pol: '1/32"' },
  { label: 'Chapa #20 (0,90mm)', mm: 0.90, bitola: '#20', pol: '3/80"' },
  { label: 'Chapa #19 (1,06mm)', mm: 1.06, bitola: '#19', pol: '7/160"' },
  { label: 'Chapa #18 (1,25mm)', mm: 1.25, bitola: '#18', pol: '1/20"' },
  { label: 'Chapa #16 (1,50mm)', mm: 1.50, bitola: '#16', pol: '1/16"' },
  { label: 'Chapa #14 (1,90mm)', mm: 1.90, bitola: '#14', pol: '5/64"' },
  { label: 'Chapa #13 (2,25mm)', mm: 2.25, bitola: '#13', pol: '3/32"' },
  { label: 'Chapa #12 (2,65mm)', mm: 2.65, bitola: '#12', pol: '7/64"' },
  { label: 'Chapa #11 (3,00mm)', mm: 3.00, bitola: '#11', pol: '1/8"' },
  { label: 'Chapa #10 (3,35mm)', mm: 3.35, bitola: '#10', pol: '9/64"' },
  { label: '1/8" (3,17mm)',      mm: 3.175, bitola: '',    pol: '1/8"' },
  { label: 'Chapa #9 (3,75mm)',  mm: 3.75, bitola: '#9',  pol: '5/32"' },
  { label: 'Chapa #8 (4,25mm)',  mm: 4.25, bitola: '#8',  pol: '11/64"' },
  { label: '3/16" (4,76mm)',      mm: 4.762, bitola: '',    pol: '3/16"' },
  { label: 'Chapa #7 (4,50mm)',  mm: 4.50, bitola: '#7',  pol: '3/16"' }, 
  { label: 'Chapa #1/4" (6,35mm)',mm: 6.35, bitola: '',    pol: '1/4"' },
  { label: '5/16" (7,93mm)',      mm: 7.938, bitola: '',    pol: '5/16"' },
  { label: '3/8" (9,52mm)',       mm: 9.525, bitola: '',    pol: '3/8"' },
  { label: '1/2" (12,70mm)',      mm: 12.70, bitola: '',    pol: '1/2"' },
  { label: '5/8" (15,87mm)',      mm: 15.875,bitola: '',    pol: '5/8"' },
  { label: '3/4" (19,05mm)',      mm: 19.05, bitola: '',    pol: '3/4"' },
  { label: '1" (25,40mm)',        mm: 25.40, bitola: '',    pol: '1"' },
];

// --- TIPOS ---
export interface IEspessura {
  id: number;
  material_id: number;
  milimetros: number;  
  polegadas?: string;  
  bitola?: string;     
}

export interface IMaterial {
  id: number;
  Material: string;
  Descricao?: string;
  densidade: number;
  isGlobal: boolean;
  espessuras: IEspessura[];
}

interface MaterialConfigModalProps {
  user: any;
  theme: any; 
  onClose: () => void;
  onUpdate: () => void;
}

export const MaterialConfigModal: React.FC<MaterialConfigModalProps> = ({
  user,
  theme,
  onClose,
  onUpdate,
}) => {
  const [materiais, setMateriais] = useState<IMaterial[]>([]);
  const [selectedMatId, setSelectedMatId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // Inputs Material
  const [nomeMat, setNomeMat] = useState("");
  const [descMat, setDescMat] = useState("");
  const [densidadeMat, setDensidadeMat] = useState("7.85");
  
  // Inputs Espessura
  const [valMm, setValMm] = useState("");
  const [valPol, setValPol] = useState("");
  const [valBitola, setValBitola] = useState("");

  // Carregar dados
  const fetchMateriais = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const res = await fetch("http://localhost:3001/api/materiais", {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMateriais(data);
      }
    } catch (error) {
      console.error("Erro ao carregar materiais", error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchMateriais();
  }, [fetchMateriais]);

  // Função para aplicar o padrão selecionado
  const handleStandardChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedLabel = e.target.value;
    if (!selectedLabel) return;

    const standard = STANDARD_LIST.find(s => s.label === selectedLabel);
    if (standard) {
        setValMm(standard.mm.toString());
        setValPol(standard.pol);
        setValBitola(standard.bitola);
    }
  };

  // --- AÇÕES MATERIAL ---
  const handleAddMaterial = async () => {
    if (!nomeMat || !densidadeMat) return alert("Nome e Densidade são obrigatórios.");
    
    try {
      const res = await fetch("http://localhost:3001/api/materiais", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}` 
        },
        body: JSON.stringify({ 
            Material: nomeMat, 
            Descricao: descMat,
            densidade: densidadeMat 
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        await fetchMateriais();
        setNomeMat("");
        setDescMat("");
        onUpdate();
        if (data.id) setSelectedMatId(data.id);
      } else {
        alert(data.error || "Erro ao criar");
      }
    } catch (e) { console.error(e); }
  };

  const handleDeleteMaterial = async (id: number) => {
    if (!window.confirm("Isso apagará o material e todas as suas espessuras. Continuar?")) return;
    try {
      const res = await fetch(`http://localhost:3001/api/materiais/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${user.token}` }
      });
      if (res.ok) {
        if (selectedMatId === id) setSelectedMatId(null);
        fetchMateriais();
        onUpdate();
      } else {
         alert("Não permitido excluir materiais do sistema.");
      }
    } catch (e) { console.error(e); }
  };

  // --- AÇÕES ESPESSURA ---
  const handleAddEspessura = async () => {
    if (!selectedMatId || !valMm) return alert("O valor em Milímetros é obrigatório.");
    
    try {
      const res = await fetch("http://localhost:3001/api/espessuras", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}` 
        },
        body: JSON.stringify({ 
            material_id: selectedMatId, 
            milimetros: Number(valMm), 
            polegadas: valPol,
            bitola: valBitola
        })
      });
      
      if (res.ok) {
        fetchMateriais(); 
        setValMm("");
        setValPol("");
        setValBitola("");
        onUpdate();
      } else {
        const data = await res.json();
        alert(data.error);
      }
    } catch (e) { console.error(e); }
  };

  const handleDeleteEspessura = async (id: number) => {
    if (!window.confirm("Remover?")) return;
    try {
        const res = await fetch(`http://localhost:3001/api/espessuras/${id}`, {
            method: "DELETE", headers: { Authorization: `Bearer ${user.token}` }
        });
        if(res.ok) {
            fetchMateriais();
            onUpdate();
        } else {
            alert("Não permitido apagar espessuras globais.");
        }
    } catch(e) { console.error(e); }
  };

  const selectedMaterial = materiais.find(m => Number(m.id) === Number(selectedMatId));

  // --- RENDER ---
  return (
    <div style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center'
    }}>
        <div style={{ 
            position: 'relative', background: theme.panelBg, width: '900px', height: '650px', 
            borderRadius: '8px', display: 'flex', border: `1px solid ${theme.border}`, 
            color: theme.text, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', overflow: 'hidden'
        }}>
            
            {/* BOTÃO FECHAR */}
            <button 
                onClick={onClose} 
                style={{
                    position:'absolute', top: 10, right: 10, background:'transparent', border:'none', 
                    color: theme.text, fontSize: '20px', fontWeight:'bold', cursor:'pointer', zIndex: 10
                }}
            >✕</button>

            {/* --- ESQUERDA: MATERIAIS --- */}
            <div style={{ flex: 1, borderRight: `1px solid ${theme.border}`, display: 'flex', flexDirection: 'column', padding: '20px' }}>
                <h3 style={{marginTop:0, color: '#007bff'}}>1. Materiais</h3>
                
                <div style={{ display:'flex', flexDirection: 'column', gap: '8px', marginBottom: '15px', background: theme.inputBg, padding: 10, borderRadius: 4, border: `1px solid ${theme.border}` }}>
                    <div style={{ display:'flex', gap: 5 }}>
                        <input placeholder="Material (ex: Aço Inox)" value={nomeMat} onChange={e=>setNomeMat(e.target.value)} style={{flex:2, padding:5, borderRadius:4, border:`1px solid ${theme.border}`, fontSize:13}} />
                        <input placeholder="Dens. (g/cm³)" type="number" step="0.01" value={densidadeMat} onChange={e=>setDensidadeMat(e.target.value)} style={{flex:1, padding:5, borderRadius:4, border:`1px solid ${theme.border}`, fontSize:13}} />
                    </div>
                    <input placeholder="Descrição / Aplicação (Opcional)" value={descMat} onChange={e=>setDescMat(e.target.value)} style={{width: '95%', padding:5, borderRadius:4, border:`1px solid ${theme.border}`, fontSize:13}} />
                    <button onClick={handleAddMaterial} style={{width:'100%', background:'#28a745', color:'white', border:'none', borderRadius:4, cursor:'pointer', fontWeight:'bold', padding:'5px'}}>+ Criar Material</button>
                </div>

                <div style={{flex:1, overflowY:'auto', border:`1px solid ${theme.border}`, borderRadius:4, background: theme.inputBg}}>
                    {loading && <div style={{padding:10}}>Carregando...</div>}
                    {!loading && materiais.map(m => (
                        <div key={m.id} onClick={() => setSelectedMatId(m.id)}
                             style={{
                                padding: '10px', cursor: 'pointer', borderBottom:`1px solid ${theme.border}`,
                                background: selectedMatId === m.id ? theme.selectedRow : 'transparent',
                                display:'flex', justifyContent:'space-between', alignItems: 'center'
                             }}>
                            <div style={{overflow:'hidden'}}>
                                <div style={{fontWeight:'bold', fontSize:'14px'}}>{m.Material}</div>
                                <div style={{fontSize:'11px', color: theme.label, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                                    {m.densidade} g/cm³ {m.isGlobal && <span style={{color: '#ffc107', marginLeft: 5}}>★</span>}
                                </div>
                            </div>
                            {!m.isGlobal && (
                                <button onClick={(e)=>{e.stopPropagation(); handleDeleteMaterial(m.id)}} style={{color:'#dc3545', background:'transparent', border:'none', cursor:'pointer'}}>🗑️</button>
                            )}
                            {m.isGlobal && <span title="Padrão do Sistema">🔒</span>}
                        </div>
                    ))}
                </div>
            </div>

            {/* --- DIREITA: ESPESSURAS --- */}
            <div style={{ flex: 1.3, display: 'flex', flexDirection: 'column', padding: '20px', background: !selectedMatId ? theme.batchBg : 'transparent' }}>
                <h3 style={{marginTop:0, color: '#28a745'}}>2. Espessuras</h3>
                
                {!selectedMaterial ? (
                    <div style={{opacity:0.5, marginTop: '20px', textAlign:'center'}}>
                        Selecione um material ao lado para editar.
                    </div>
                ) : (
                    <>
                        {selectedMaterial.isGlobal && (
                            <div style={{fontSize: 11, color: theme.label, marginBottom: 10, background: 'rgba(255,193,7,0.1)', padding: 5, borderRadius: 4}}>
                                🔒 Material Padrão. Você pode adicionar novas espessuras.
                            </div>
                        )}

                        <div style={{background: theme.inputBg, padding: 10, borderRadius: 6, border: `1px solid ${theme.border}`, marginBottom: 15 }}>
                            <div style={{fontSize: 12, fontWeight:'bold', marginBottom: 5, color: theme.label}}>Adicionar Nova Espessura:</div>
                            
                            {/* --- LISTA SUSPENSA (SELECT) NOVO --- */}
                            <div style={{marginBottom: 10}}>
                                <select 
                                    onChange={handleStandardChange}
                                    style={{width:'100%', padding:6, borderRadius:4, border:`1px solid ${theme.border}`, fontSize:13, background: theme.cardBg, color: theme.text}}
                                >
                                    <option value="">Selecione um Padrão de Mercado...</option>
                                    {STANDARD_LIST.map((std) => (
                                        <option key={std.label} value={std.label}>
                                            {std.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div style={{ display:'flex', gap: '5px', alignItems:'flex-end' }}>
                                <div style={{flex:1}}>
                                    <label style={{fontSize:10, color:theme.label}}>MM (Calc)*</label>
                                    <input placeholder="3.00" type="number" step="0.01" value={valMm} onChange={e=>setValMm(e.target.value)} style={{width:'100%', padding:6, borderRadius:4, border:`1px solid ${theme.border}`, fontSize:13}} />
                                </div>
                                <div style={{flex:1}}>
                                    <label style={{fontSize:10, color:theme.label}}>Pol.</label>
                                    <input placeholder='1/8"' value={valPol} onChange={e=>setValPol(e.target.value)} style={{width:'100%', padding:6, borderRadius:4, border:`1px solid ${theme.border}`, fontSize:13}} />
                                </div>
                                <div style={{flex:1}}>
                                    <label style={{fontSize:10, color:theme.label}}>Bitola</label>
                                    <input placeholder='#11' value={valBitola} onChange={e=>setValBitola(e.target.value)} style={{width:'100%', padding:6, borderRadius:4, border:`1px solid ${theme.border}`, fontSize:13}} />
                                </div>
                                <button onClick={handleAddEspessura} style={{background:'#007bff', color:'white', border:'none', borderRadius:4, cursor:'pointer', fontWeight:'bold', height: 32, padding:'0 15px'}}>
                                    Add
                                </button>
                            </div>
                        </div>

                        <div style={{flex:1, overflowY:'auto', border:`1px solid ${theme.border}`, borderRadius:4, background: theme.inputBg}}>
                            {renderThicknessList(selectedMaterial.espessuras, true, theme, handleDeleteEspessura)}
                        </div>
                    </>
                )}
            </div>
        </div>
    </div>
  );
};

// Helper
const renderThicknessList = (list: IEspessura[], canDelete: boolean, theme: any, onDelete: (id: number) => void) => {
    if (list.length === 0) return <div style={{padding:10, opacity:0.6}}>Nenhuma espessura cadastrada.</div>;
    return list.map(e => (
        <div key={e.id} style={{padding: '8px 10px', borderBottom:`1px solid ${theme.border}`, display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div style={{display:'flex', gap: 15, alignItems:'baseline'}}>
                <span style={{fontWeight:'bold', fontSize:'14px', width: 60}}>{e.milimetros}mm</span>
                <span style={{fontSize:'12px', color: theme.label, width: 50}}>{e.polegadas || "-"}</span>
                <span style={{fontSize:'12px', color: theme.label}}>{e.bitola || "-"}</span>
            </div>
            {canDelete && (
                <button onClick={()=>onDelete(e.id)} style={{color:'#dc3545', background:'transparent', border:'none', cursor:'pointer', padding:5}} title="Excluir">✕</button>
            )}
        </div>
    ));
};