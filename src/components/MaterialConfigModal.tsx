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
    const [newItemName, setNewItemName] = useState('');
    const [newItemDensity, setNewItemDensity] = useState('7.85');
    const [loading, setLoading] = useState(false);
    
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

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleAdd = async () => {
        if (!newItemName.trim()) {
            alert("Por favor, preencha o campo principal.");
            return;
        }
        if (!user || !user.token) return;

        setLoading(true);
        try {
            if (activeTab === 'materials') {
                await EngineeringService.addCustomMaterial(user.token, newItemName, newItemDensity);
            } else {
                await EngineeringService.addCustomThickness(user.token, newItemName);
            }
            onUpdate(); 
            await loadData();
            setNewItemName("");
        } catch (error: any) {
            alert("Erro ao adicionar: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Deseja remover este item da lista?")) return;
        if (!user || !user.token) return;

        setLoading(true);
        try {
            if (activeTab === 'materials') {
                await EngineeringService.deleteCustomMaterial(user.token, id);
            } else {
                await EngineeringService.deleteCustomThickness(user.token, id);
            }
            await loadData();
            onUpdate();
        } catch (error: any) {
            alert("Erro ao remover: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    // --- ESTILOS COMPACTOS ---
    
    const overlayStyle: React.CSSProperties = {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        zIndex: 99999, padding: '10px' // Padding externo reduzido
    };

    const modalContentStyle: React.CSSProperties = {
        background: theme.modalBg || '#fff', 
        color: theme.text || '#333',
        width: '100%', maxWidth: '500px', 
        // AUMENTADO: Ocupa até 90% da altura da tela, sem limite fixo de pixels
        height: '90vh', 
        borderRadius: '12px', 
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)', 
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden' 
    };

    const headerStyle: React.CSSProperties = {
        // COMPACTADO: Padding reduzido
        padding: '15px 20px', 
        borderBottom: `1px solid ${theme.border || '#ccc'}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: theme.headerBg || theme.modalBg,
        flexShrink: 0
    };

    const bodyContainerStyle: React.CSSProperties = {
        display: 'flex', flexDirection: 'column',
        flex: 1, 
        overflow: 'hidden', 
        // COMPACTADO: Espaçamentos internos reduzidos
        padding: '15px', gap: '15px' 
    };

    const fixedControlsStyle: React.CSSProperties = {
        flexShrink: 0,
        display: 'flex', flexDirection: 'column', gap: '10px' // Gap reduzido
    };

    const scrollableListStyle: React.CSSProperties = {
        flex: 1, 
        overflowY: 'auto', 
        border: `1px solid ${theme.border || '#eee'}`, 
        borderRadius: '6px',
        background: theme.inputBg || '#f9f9f9',
        minHeight: 0 
    };

    const tabContainerStyle: React.CSSProperties = {
        display: 'flex', borderBottom: `1px solid ${theme.border || '#ccc'}`, marginBottom: '5px'
    };
    
    const tabStyle = (isActive: boolean): React.CSSProperties => ({
        flex: 1, padding: '8px', cursor: 'pointer', textAlign: 'center', fontWeight: 'bold', fontSize: '13px', // Fonte menor
        borderBottom: isActive ? '3px solid #007bff' : 'none',
        color: isActive ? '#007bff' : theme.label || '#666',
        transition: 'all 0.2s', opacity: isActive ? 1 : 0.6
    });

    const itemStyle: React.CSSProperties = {
        display: 'flex', justifyContent: 'space-between', 
        // COMPACTADO: Altura da linha reduzida
        padding: '8px 12px', 
        borderBottom: `1px solid ${theme.border || '#eee'}`,
        alignItems: 'center', fontSize: '13px', background: theme.cardBg
    };

    const inputStyle: React.CSSProperties = {
        // COMPACTADO: Input mais fino
        padding: '8px', 
        borderRadius: '4px', border: `1px solid ${theme.border || '#ccc'}`, 
        background: theme.inputBg, color: theme.text, fontSize: '13px', width: '100%', boxSizing: 'border-box'
    };

    const labelStyle: React.CSSProperties = {
        fontSize: '11px', fontWeight: 'bold', color: theme.label
    };

    return (
        <div style={overlayStyle}>
            <div style={modalContentStyle}>
                
                {/* CABEÇALHO */}
                <div style={headerStyle}>
                    <h3 style={{ margin: 0, fontSize: '16px' }}>Adiconar Material</h3>
                    <button onClick={onClose} style={{ background: 'rgba(0,0,0,0.05)', border: 'none', fontSize: '16px', cursor: 'pointer', color: theme.text, width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>

                {/* CORPO */}
                <div style={bodyContainerStyle}>
                    
                    {/* ÁREA FIXA (Abas + Form) - COMPACTADA */}
                    <div style={fixedControlsStyle}>
                        <div style={tabContainerStyle}>
                            <div style={tabStyle(activeTab === 'materials')} onClick={() => setActiveTab('materials')}>🧪 Materiais</div>
                            <div style={tabStyle(activeTab === 'thicknesses')} onClick={() => setActiveTab('thicknesses')}>📏 Espessuras</div>
                        </div>

                        {/* Caixa cinza do formulário mais apertada */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: theme.batchBg || 'rgba(0,0,0,0.03)', padding: '12px', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={labelStyle}>
                                    {activeTab === 'materials' ? 'Nome do Material' : 'Valor da Espessura (mm ou pol)'}
                                </label>
                                <input value={newItemName} onChange={(e) => setNewItemName(e.target.value)} placeholder={activeTab === 'materials' ? "Ex: Titânio" : "Ex: 2.50mm"} style={inputStyle} autoFocus />
                            </div>

                            {activeTab === 'materials' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <label style={labelStyle}>Densidade (g/cm³)</label>
                                    <input type="number" step="0.01" value={newItemDensity} onChange={(e) => setNewItemDensity(e.target.value)} placeholder="Ex: 7.85" style={inputStyle} />
                                </div>
                            )}

                            <button onClick={handleAdd} disabled={loading} style={{ padding: '8px', background: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginTop: '5px', opacity: loading ? 0.7 : 1, fontSize: '13px' }}>
                                {loading ? '...' : '✅ Adicionar'}
                            </button>
                        </div>
                        
                        <label style={{ fontSize: '11px', fontWeight: 'bold', color: theme.label }}>Itens Cadastrados:</label>
                    </div>

                    {/* ÁREA DA LISTA (OCUPA O RESTO) */}
                    <div style={scrollableListStyle}>
                        {activeTab === 'materials' ? (
                            materials.length === 0 ? <div style={{ padding: '15px', textAlign: 'center', color: theme.label, fontSize: '12px' }}>Nenhum material.</div> :
                            materials.map(m => (
                                <div key={`${m.origem}-${m.id}`} style={itemStyle}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontWeight: 'bold' }}>
                                            {m.nome} 
                                            {m.origem === 'padrao' && <span style={{fontSize:'9px', color:'#007bff', marginLeft:'5px'}}>(Padrão)</span>}
                                        </span>
                                        {m.densidade && <span style={{ fontSize: '10px', opacity: 0.7 }}>Dens: {m.densidade}</span>}
                                    </div>
                                    {m.origem === 'custom' && (
                                        <button onClick={() => handleDelete(m.id)} title="Excluir" style={{ color: '#ff4d4d', background: 'none', border: 'none', cursor: 'pointer', padding: '0 5px', fontSize: '16px' }}>×</button>
                                    )}
                                </div>
                            ))
                        ) : (
                            thicknesses.length === 0 ? <div style={{ padding: '15px', textAlign: 'center', color: theme.label, fontSize: '12px' }}>Nenhuma espessura.</div> :
                            thicknesses.map(t => (
                                <div key={`${t.origem}-${t.id}`} style={itemStyle}>
                                    <div>
                                        <span style={{ fontWeight: 'bold' }}>{t.valor}</span>
                                        {t.origem === 'padrao' && <span style={{fontSize:'9px', color:'#007bff', marginLeft:'5px'}}>(Padrão)</span>}
                                    </div>
                                    {t.origem === 'custom' && (
                                        <button onClick={() => handleDelete(t.id)} title="Excluir" style={{ color: '#ff4d4d', background: 'none', border: 'none', cursor: 'pointer', padding: '0 5px', fontSize: '16px' }}>×</button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};