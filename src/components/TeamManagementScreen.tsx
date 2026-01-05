import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { handleSubscription } from '../services/paymentService'; // <--- Importa o serviço

interface TeamMember {
  id: string;
  nome: string;
  email: string;
  cargo: string;
}

interface TeamManagementScreenProps {
  onClose: () => void;
}

export const TeamManagementScreen: React.FC<TeamManagementScreenProps> = ({ onClose }) => {
  const { user } = useAuth();
  const { theme } = useTheme();
  
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [newUser, setNewUser] = useState({ nome: '', email: '', password: '' });
  
  // Estado para mensagens e controle de upgrade
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [showUpgradeBtn, setShowUpgradeBtn] = useState(false); // <--- Novo controle

  // Busca dados do plano da empresa (opcional, mas bom pra exibir o limite real)
  const [limitInfo, setLimitInfo] = useState({ used: 0, max: 1 });

  const fetchTeam = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      // 1. Busca a lista
      const res = await fetch('http://localhost:3001/api/team', {
        headers: { Authorization: `Bearer ${user.token || ''}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTeam(data);
        
        // 2. Busca info da assinatura (para pegar o limite exato do banco)
        const resSub = await fetch('http://localhost:3001/api/subscription/status', {
             headers: { Authorization: `Bearer ${user.token || ''}` }
        });
        if(resSub.ok) {
            const subData = await resSub.json();
            setLimitInfo({ used: subData.users.used, max: subData.users.limit });
        }
      }
    } catch (error) {
      console.error("Erro ao buscar equipe:", error);
    } finally {
      setLoading(false);
    }
  }, [user?.token]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  // Função para comprar vaga extra
  const handleBuyExtraSeat = () => {
     // Aqui mandamos quantity = 1 (apenas para adicionar um slot)
     // No seu backend você pode criar uma lógica específica ou apenas somar
     if(confirm("Você será redirecionado para o pagamento da vaga adicional ($12.00). Continuar?")) {
        handleSubscription('corporate', 1, user?.token);
     }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    setShowUpgradeBtn(false); // Reseta botão
    
    if (!user?.token) return;

    try {
      const res = await fetch('http://localhost:3001/api/team/add', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${user.token || ''}` 
        },
        body: JSON.stringify(newUser)
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        // --- LÓGICA DE UPGRADE ---
        if (data.error === "LIMITE ATINGIDO") {
            setMsg({ type: 'error', text: `Limite atingido! Seu plano permite apenas ${limitInfo.max} usuários.` });
            setShowUpgradeBtn(true); // Mostra o botão de comprar
        } else {
            setMsg({ type: 'error', text: data.error || data.message || 'Erro ao adicionar' });
        }
      } else {
        setMsg({ type: 'success', text: 'Membro adicionado!' });
        setNewUser({ nome: '', email: '', password: '' });
        fetchTeam(); // Recarrega lista e contadores
      }
    } catch (error) {
      console.error(error);
      setMsg({ type: 'error', text: 'Erro de conexão.' });
    }
  };

  const handleDelete = async (id: string) => {
    if(!confirm("Remover este usuário da equipe?")) return;
    if (!user?.token) return;

    try {
      await fetch(`http://localhost:3001/api/team/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user.token || ''}` }
      });
      fetchTeam();
    } catch (error) {
      console.error(error);
      alert("Erro ao deletar");
    }
  };

  // --- ESTILOS ---
  const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    backgroundColor: theme.modalOverlay,
    zIndex: 9999,
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    backdropFilter: 'blur(3px)'
  };

  const boxStyle: React.CSSProperties = {
    background: theme.modalBg,
    color: theme.text,
    padding: '25px', 
    borderRadius: '12px',
    width: '600px', 
    maxWidth: '95%', 
    maxHeight: '90vh', 
    overflowY: 'auto',
    position: 'relative',
    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
    border: `1px solid ${theme.border}`
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '6px',
    border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.text, outline: 'none'
  };

  return (
    <div style={overlayStyle}>
      <div style={boxStyle}>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '10px', borderBottom: `1px solid ${theme.border}` }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Gerenciar Equipe</h2>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', fontSize: '24px', cursor: 'pointer', color: theme.text, padding: '0 5px', fontWeight: 'bold' }}>✕</button>
        </div>

        <div style={{ background: theme.batchBg || 'rgba(0,0,0,0.05)', padding: '15px', borderRadius: '8px', marginBottom: '25px' }}>
            <h4 style={{ margin: '0 0 15px 0' }}>Adicionar Novo Membro</h4>
            
            <form onSubmit={handleAdd}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <input required placeholder="Nome" value={newUser.nome} onChange={e => setNewUser({...newUser, nome: e.target.value})} style={inputStyle} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <input required type="email" placeholder="Email" value={newUser.email} onChange={e => setNewUser({...newUser, email: e.target.value})} style={inputStyle} />
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                   <input required type="password" placeholder="Senha Provisória" value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})} style={{ ...inputStyle, marginBottom: 0, width: '200px' }} />
                    <button type="submit" style={{ background: '#007bff', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', height: '40px' }}>
                      + Adicionar
                    </button>
                </div>
            </form>
            
            {/* ÁREA DE MENSAGEM E UPGRADE */}
            {msg.text && (
                <div style={{ 
                    marginTop: '15px', padding: '10px', borderRadius: '4px', 
                    background: msg.type === 'error' ? 'rgba(255,0,0,0.1)' : 'rgba(0,255,0,0.1)', 
                    color: msg.type === 'error' ? '#ff4d4f' : '#28a745', 
                    border: `1px solid ${msg.type === 'error' ? '#ff4d4f' : '#28a745'}`,
                    display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                    <span>{msg.text}</span>
                    
                    {/* BOTÃO MÁGICO QUE APARECE NO ERRO DE LIMITE */}
                    {showUpgradeBtn && (
                        <button 
                            onClick={handleBuyExtraSeat}
                            style={{
                                background: "gold", color: "#333", border: "1px solid #999",
                                padding: "5px 15px", borderRadius: "4px", fontWeight: "bold",
                                cursor: "pointer", marginLeft: "15px", boxShadow: "0 2px 5px rgba(0,0,0,0.2)"
                            }}
                        >
                            Comprar +1 Vaga ($12)
                        </button>
                    )}
                </div>
            )}
        </div>

        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0 }}>Membros Atuais</h4>
                <span style={{ fontSize: '0.9rem', padding: '2px 8px', borderRadius: '10px', background: theme.buttonBorder, color: theme.text }}>
                    {/* Usa os dados reais do banco agora */}
                    {limitInfo.used} / {limitInfo.max}
                </span>
            </div>

            {loading && <p style={{ opacity: 0.6 }}>Carregando lista...</p>}
            
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {team.map(member => (
                    <li key={member.id} style={{ borderBottom: `1px solid ${theme.border}`, padding: '15px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '35px', height: '35px', borderRadius: '50%', background: member.cargo === 'admin' ? '#007bff' : '#6c757d', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>
                                {member.nome.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div style={{ fontWeight: 'bold' }}>{member.nome} {member.id === user?.id && <span style={{ opacity: 0.5, marginLeft: '5px' }}>(Você)</span>}</div>
                                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>{member.email} • {member.cargo}</div>
                            </div>
                        </div>
                        {member.id !== user?.id && (
                            <button onClick={() => handleDelete(member.id)} style={{ color: '#ff4d4f', border: `1px solid #ff4d4f`, background: 'transparent', cursor: 'pointer', padding: '5px 10px', borderRadius: '4px', fontSize: '0.8rem' }}>Remover</button>
                        )}
                    </li>
                ))}
            </ul>
        </div>
      </div>
    </div>
  );
};