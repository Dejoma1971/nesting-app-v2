/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useCallback } from 'react';
import { EngineeringService } from '../components/menus/engineeringService';

// Interfaces Locais (Garantem que o TS entenda o campo 'origem')
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
    
    // Estados do Formulário
    const [newItemName, setNewItemName] = useState('');
    const [newItemDensity, setNewItemDensity] = useState('7.85');
    
    const [loading, setLoading] = useState(false);
    
    // Listas Tipadas com as Interfaces Locais
    const [materials, setMaterials] = useState<MaterialItem[]>([]); 
    const [thicknesses, setThicknesses] = useState<ThicknessItem[]>([]);

    const loadData = useCallback(async () => {
        if (!user || !user.token) return;
        setLoading(true);
        try {
            if (activeTab === 'materials') {
                const data = await EngineeringService.getCustomMaterials(user.token);
                // CORREÇÃO: Forçamos o tipo aqui com 'as unknown as MaterialItem[]'
                // Isso resolve o erro de compatibilidade de tipos
                setMaterials(data as unknown as MaterialItem[]);
            } else {
                const data = await EngineeringService.getCustomThicknesses(user.token);
                // CORREÇÃO: Mesma coisa para espessuras
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
            
            // Sucesso!
            onUpdate(); // Atualiza a tela pai
            await loadData(); // Recarrega a lista local
            setNewItemName(""); // Limpa o input
            
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

    // --- ESTILOS ---
    const modalStyle: React.CSSProperties = {
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10000
    };
    const contentStyle: React.CSSProperties = {
        background: theme.modalBg || '#fff', color: theme.text || '#333',
        width: '450px', borderRadius: '8px', padding: '25px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: '20px'
    };
    const tabContainerStyle: React.CSSProperties = {
        display: 'flex', borderBottom: `1px solid ${theme.border || '#ccc'}`, marginBottom: '10px'
    };
    const tabStyle = (isActive: boolean): React.CSSProperties => ({
        flex: 1, padding: '12px', cursor: 'pointer', textAlign: 'center', fontWeight: 'bold',
        borderBottom: isActive ? '3px solid #007bff' : 'none',
        color: isActive ? '#007bff' : theme.label || '#666',
        transition: 'all 0.2s'
    });
    const listStyle: React.CSSProperties = {
        maxHeight: '250px', overflowY: 'auto', border: `1px solid ${theme.border || '#eee'}`, borderRadius: '4px',
        background: theme.inputBg || '#f9f9f9', padding: '5px'
    };
    const itemStyle: React.CSSProperties = {
        display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: `1px solid ${theme.border || '#eee'}`,
        alignItems: 'center', fontSize: '13px'
    };
    const inputStyle: React.CSSProperties = {
        padding: '10px', borderRadius: '4px', border: `1px solid ${theme.border || '#ccc'}`, 
        background: theme.inputBg, color: theme.text, fontSize: '14px'
    };

    return (
        <div style={modalStyle}>
            <div style={contentStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '18px' }}>Configurar Padrões</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '24px', cursor: 'pointer', color: theme.text }}>✕</button>
                </div>

                {/* ABAS */}
                <div style={tabContainerStyle}>
                    <div style={tabStyle(activeTab === 'materials')} onClick={() => setActiveTab('materials')}>
                        🧪 Materiais
                    </div>
                    <div style={tabStyle(activeTab === 'thicknesses')} onClick={() => setActiveTab('thicknesses')}>
                        📏 Espessuras
                    </div>
                </div>

                {/* AREA DE INPUTS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px', background: theme.batchBg || 'rgba(0,0,0,0.03)', padding: '15px', borderRadius: '6px' }}>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 'bold', color: theme.label }}>
                            {activeTab === 'materials' ? 'Nome do Material' : 'Valor da Espessura (mm ou pol)'}
                        </label>
                        <input 
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            placeholder={activeTab === 'materials' ? "Ex: Aço Inox 304" : "Ex: 1/4\" ou 6.35mm"}
                            style={inputStyle}
                            autoFocus
                        />
                    </div>

                    {activeTab === 'materials' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            <label style={{ fontSize: '12px', fontWeight: 'bold', color: theme.label }}>
                                Densidade (g/cm³)
                            </label>
                            <input 
                                type="number"
                                step="0.01"
                                value={newItemDensity}
                                onChange={(e) => setNewItemDensity(e.target.value)}
                                placeholder="Ex: 7.85"
                                style={inputStyle}
                            />
                        </div>
                    )}

                    <button 
                        onClick={handleAdd} 
                        disabled={loading}
                        style={{ 
                            padding: '12px', background: '#28a745', color: '#fff', border: 'none', 
                            borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginTop: '5px',
                            opacity: loading ? 0.7 : 1
                        }}
                    >
                        {loading ? 'Salvando...' : '✅ Adicionar'}
                    </button>
                </div>

                {/* LISTA DE ITENS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <label style={{ fontSize: '12px', fontWeight: 'bold', color: theme.label }}>Itens Cadastrados:</label>
                    <div style={listStyle}>
                        {activeTab === 'materials' ? (
                            materials.length === 0 ? <div style={{ padding: '15px', textAlign: 'center' }}>Nenhum material.</div> :
                            materials.map(m => (
                                <div key={`${m.origem}-${m.id}`} style={itemStyle}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontWeight: 'bold' }}>
                                            {m.nome} 
                                            {m.origem === 'padrao' && <span style={{fontSize:'10px', color:'#007bff', marginLeft:'5px'}}>(Padrão)</span>}
                                        </span>
                                        {m.densidade && <span style={{ fontSize: '10px', opacity: 0.7 }}>Dens: {m.densidade}</span>}
                                    </div>
                                    {m.origem === 'custom' && (
                                        <button onClick={() => handleDelete(m.id)} title="Excluir" style={{ color: '#ff4d4d', background: 'none', border: 'none', cursor: 'pointer' }}>🗑️</button>
                                    )}
                                </div>
                            ))
                        ) : (
                            thicknesses.length === 0 ? <div style={{ padding: '15px', textAlign: 'center' }}>Nenhuma espessura.</div> :
                            thicknesses.map(t => (
                                <div key={`${t.origem}-${t.id}`} style={itemStyle}>
                                    <div>
                                        <span style={{ fontWeight: 'bold' }}>{t.valor}</span>
                                        {t.origem === 'padrao' && <span style={{fontSize:'10px', color:'#007bff', marginLeft:'5px'}}>(Padrão)</span>}
                                    </div>
                                    {t.origem === 'custom' && (
                                        <button onClick={() => handleDelete(t.id)} title="Excluir" style={{ color: '#ff4d4d', background: 'none', border: 'none', cursor: 'pointer' }}>🗑️</button>
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