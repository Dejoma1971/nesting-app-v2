/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback } from 'react';
import { EngineeringService } from '../components/menus/engineeringService';

// Interfaces Locais
interface MaterialItem {
    id: number;
    nome: string;
    densidade?: number;
    origem: 'padrao' | 'custom';
}

interface ThicknessItem {
    id: number;
    valor: string;
    origem: 'padrao' | 'custom';
}

interface MaterialConfigModalProps {
    user: any;
    theme: any;
    onClose: () => void;
    onUpdate: () => void;
}

export const MaterialConfigModal: React.FC<MaterialConfigModalProps> = ({ user, theme, onClose, onUpdate }) => {
    const [activeTab, setActiveTab] = useState<'materials' | 'thicknesses'>('materials');
    
    // Estados de Adição
    const [newItemName, setNewItemName] = useState('');
    const [newItemDensity, setNewItemDensity] = useState('7.85');
    const [loading, setLoading] = useState(false);

    // Estados de Edição
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editName, setEditName] = useState('');
    const [editDensity, setEditDensity] = useState('');
    
    // Estado para Hover
    const [hoveredKey, setHoveredKey] = useState<string | null>(null);

    // Listas
    const [materials, setMaterials] = useState<MaterialItem[]>([]); 
    const [thicknesses, setThicknesses] = useState<ThicknessItem[]>([]);

    const loadData = useCallback(async () => {
        if (!user || !user.token) return;
        setLoading(true);
        try {
            if (activeTab === 'materials') {
                const data = await EngineeringService.getCustomMaterials(user.token);
                setMaterials(data as unknown as MaterialItem[]);
            } else {
                const data = await EngineeringService.getCustomThicknesses(user.token);
                setThicknesses(data as unknown as ThicknessItem[]);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [user, activeTab]);

    useEffect(() => { loadData(); }, [loadData]);

    // --- Lógica de Adicionar ---
    const handleAdd = async () => {
        if (!newItemName.trim()) { alert("Preencha o nome."); return; }
        if (!user || !user.token) return;
        setLoading(true);
        try {
            if (activeTab === 'materials') {
                await EngineeringService.addCustomMaterial(user.token, newItemName, newItemDensity);
            } else {
                await EngineeringService.addCustomThickness(user.token, newItemName);
            }
            onUpdate(); await loadData(); setNewItemName("");
        } catch (error: any) { alert("Erro: " + error.message); } 
        finally { setLoading(false); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Remover este item?")) return;
        if (!user || !user.token) return;
        setLoading(true);
        try {
            if (activeTab === 'materials') await EngineeringService.deleteCustomMaterial(user.token, id);
            else await EngineeringService.deleteCustomThickness(user.token, id);
            await loadData(); onUpdate();
        } catch (error: any) { alert("Erro: " + error.message); } 
        finally { setLoading(false); }
    };

    // --- Lógica de Edição ---
    const startEditing = (item: any) => {
        if (item.origem === 'padrao') {
            // Itens padrão não editam, então não fazemos nada (nem alert, para não ser chato)
            return;
        }
        setEditingId(item.id);
        if (activeTab === 'materials') {
            setEditName(item.nome);
            setEditDensity(item.densidade ? item.densidade.toString() : '7.85');
        } else {
            setEditName(item.valor);
        }
    };

    const cancelEditing = () => {
        setEditingId(null);
        setEditName('');
        setEditDensity('');
    };

    const saveEditing = async () => {
        if (!user || !user.token || !editingId) return;
        setLoading(true);
        try {
            if (activeTab === 'materials') {
                await EngineeringService.updateCustomMaterial(user.token, editingId, editName, editDensity);
            } else {
                await EngineeringService.updateCustomThickness(user.token, editingId, editName);
            }
            onUpdate(); await loadData(); cancelEditing();
        } catch (error: any) {
            alert("Erro ao editar: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    // --- ESTILOS ---
    const overlayStyle: React.CSSProperties = {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        zIndex: 99999, padding: '10px'
    };
    const modalContentStyle: React.CSSProperties = {
        background: theme.modalBg || '#fff', color: theme.text || '#333',
        width: '100%', maxWidth: '500px', height: '90vh', 
        borderRadius: '12px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', 
        display: 'flex', flexDirection: 'column', overflow: 'hidden' 
    };
    const headerStyle: React.CSSProperties = {
        padding: '15px 20px', borderBottom: `1px solid ${theme.border || '#ccc'}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: theme.headerBg || theme.modalBg, flexShrink: 0
    };
    const bodyContainerStyle: React.CSSProperties = {
        display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: '15px', gap: '15px' 
    };
    const scrollableListStyle: React.CSSProperties = {
        flex: 1, overflowY: 'auto', border: `1px solid ${theme.border || '#eee'}`, 
        borderRadius: '6px', background: theme.inputBg || '#f9f9f9', minHeight: 0 
    };
    
    // Estilo Base do Item
    const itemStyle: React.CSSProperties = {
        display: 'flex', justifyContent: 'space-between', padding: '8px 12px', 
        borderBottom: `1px solid ${theme.border || '#eee'}`, alignItems: 'center', 
        fontSize: '13px', minHeight: '40px', 
        transition: 'background-color 0.2s ease'
    };

    const inputStyle: React.CSSProperties = {
        padding: '8px', borderRadius: '4px', border: `1px solid ${theme.border || '#ccc'}`, 
        background: theme.inputBg, color: theme.text, fontSize: '13px', width: '100%'
    };
    const editInputStyle: React.CSSProperties = {
        ...inputStyle, padding: '4px', height: '28px'
    };

    return (
        <div style={overlayStyle}>
            <div style={modalContentStyle}>
                <div style={headerStyle}>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Configurar Padrões</h3>
                    <button onClick={onClose} style={{ background: 'rgba(0,0,0,0.05)', border: 'none', fontSize: '16px', cursor: 'pointer', color: theme.text, width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>

                <div style={bodyContainerStyle}>
                    {/* ÁREA DE CADASTRO */}
                    <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, marginBottom: '5px' }}>
                            <div style={{ flex: 1, padding: '8px', cursor: 'pointer', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', borderBottom: activeTab === 'materials' ? '3px solid #007bff' : 'none', color: activeTab === 'materials' ? '#007bff' : theme.label }} onClick={() => setActiveTab('materials')}>🧪 Materiais</div>
                            <div style={{ flex: 1, padding: '8px', cursor: 'pointer', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', borderBottom: activeTab === 'thicknesses' ? '3px solid #007bff' : 'none', color: activeTab === 'thicknesses' ? '#007bff' : theme.label }} onClick={() => setActiveTab('thicknesses')}>📏 Espessuras</div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: theme.batchBg || 'rgba(0,0,0,0.03)', padding: '12px', borderRadius: '8px' }}>
                            <input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder={activeTab === 'materials' ? "Novo: Titânio" : "Nova: 2.50mm"} style={inputStyle} />
                            {activeTab === 'materials' && (
                                <input type="number" step="0.01" value={newItemDensity} onChange={(e) => setNewItemDensity(e.target.value)} placeholder="Densidade: 7.85" style={inputStyle} />
                            )}
                            <button onClick={handleAdd} disabled={loading} style={{ padding: '8px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                                {loading ? '...' : '✅ Adicionar Novo'}
                            </button>
                        </div>
                        <label style={{ fontSize: '11px', fontWeight: 'bold', color: theme.label }}>
                            Dica: Clique 2x para editar itens personalizados.
                        </label>
                    </div>

                    {/* LISTA */}
                    <div style={scrollableListStyle}>
                        {activeTab === 'materials' ? (
                            materials.length === 0 ? <div style={{ padding: '15px', textAlign: 'center', color: theme.label, fontSize: '12px' }}>Vazio.</div> :
                            materials.map(m => {
                                const itemKey = `${m.origem}-${m.id}`;
                                const isCustom = m.origem === 'custom'; // Checagem de origem
                                const isHovered = hoveredKey === itemKey;
                                
                                return (
                                    <div 
                                        key={itemKey} 
                                        style={{
                                            ...itemStyle,
                                            // LÓGICA REFINADA: Só muda cor se for custom E estiver em hover
                                            background: (isCustom && isHovered) ? (theme.hoverRow || 'rgba(0,0,0,0.05)') : theme.cardBg,
                                            // CURSOR: Pointer só para custom
                                            cursor: isCustom ? 'pointer' : 'default'
                                        }} 
                                        // EVENTOS: Só dispara se for custom
                                        onMouseEnter={() => isCustom && setHoveredKey(itemKey)}
                                        onMouseLeave={() => isCustom && setHoveredKey(null)}
                                        onDoubleClick={() => startEditing(m)}
                                        title={isCustom ? "Duplo clique para editar" : "Padrão (fixo)"}
                                    >
                                        {editingId === m.id ? (
                                            <div style={{ display: 'flex', gap: '5px', width: '100%', alignItems: 'center' }}>
                                                <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{...editInputStyle, flex: 2}} autoFocus />
                                                <input type="number" value={editDensity} onChange={(e) => setEditDensity(e.target.value)} style={{...editInputStyle, flex: 1}} placeholder="Dens." />
                                                <button onClick={saveEditing} style={{ background: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '5px' }}>✓</button>
                                                <button onClick={cancelEditing} style={{ background: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '5px' }}>✕</button>
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                    <span style={{ fontWeight: 'bold', color: isCustom ? theme.text : (theme.label || '#666') }}>
                                                        {m.nome} 
                                                        {m.origem === 'padrao' && <span style={{fontSize:'9px', color:'#007bff', marginLeft:'5px'}}>(Padrão)</span>}
                                                    </span>
                                                    {m.densidade && <span style={{ fontSize: '10px', opacity: 0.7 }}>Dens: {m.densidade}</span>}
                                                </div>
                                                {isCustom && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }} style={{ color: '#ff4d4d', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '0 5px' }}>×</button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            })
                        ) : (
                            thicknesses.length === 0 ? <div style={{ padding: '15px', textAlign: 'center', color: theme.label, fontSize: '12px' }}>Vazio.</div> :
                            thicknesses.map(t => {
                                const itemKey = `${t.origem}-${t.id}`;
                                const isCustom = t.origem === 'custom';
                                const isHovered = hoveredKey === itemKey;

                                return (
                                    <div 
                                        key={itemKey} 
                                        style={{
                                            ...itemStyle,
                                            background: (isCustom && isHovered) ? (theme.hoverRow || 'rgba(0,0,0,0.05)') : theme.cardBg,
                                            cursor: isCustom ? 'pointer' : 'default'
                                        }} 
                                        onMouseEnter={() => isCustom && setHoveredKey(itemKey)}
                                        onMouseLeave={() => isCustom && setHoveredKey(null)}
                                        onDoubleClick={() => startEditing(t)}
                                        title={isCustom ? "Duplo clique para editar" : "Padrão (fixo)"}
                                    >
                                        {editingId === t.id ? (
                                            <div style={{ display: 'flex', gap: '5px', width: '100%', alignItems: 'center' }}>
                                                <input value={editName} onChange={(e) => setEditName(e.target.value)} style={editInputStyle} autoFocus />
                                                <button onClick={saveEditing} style={{ background: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '5px' }}>✓</button>
                                                <button onClick={cancelEditing} style={{ background: '#dc3545', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '5px' }}>✕</button>
                                            </div>
                                        ) : (
                                            <>
                                                <div>
                                                    <span style={{ fontWeight: 'bold', color: isCustom ? theme.text : (theme.label || '#666') }}>{t.valor}</span>
                                                    {t.origem === 'padrao' && <span style={{fontSize:'9px', color:'#007bff', marginLeft:'5px'}}>(Padrão)</span>}
                                                </div>
                                                {isCustom && (
                                                    <button onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }} style={{ color: '#ff4d4d', background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', padding: '0 5px' }}>×</button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};