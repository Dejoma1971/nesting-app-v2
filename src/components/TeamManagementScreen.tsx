import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext'; // <--- Importando o Tema

// Interface dos dados
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
  const { theme } = useTheme(); // <--- Usando o Tema
  
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [newUser, setNewUser] = useState({ nome: '', email: '', password: '' });
  const [msg, setMsg] = useState({ type: '', text: '' });

  // Lógica para definir o limite baseado no plano (Visual apenas)
  const maxUsers = user?.plano === 'Corporativo' ? 5 : 1;
  const currentCount = team.length;

  // Busca dados
  const fetchTeam = useCallback(async () => {
    if (!user?.token) return;
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3001/api/team', {
        headers: { Authorization: `Bearer ${user.token || ''}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTeam(data);
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

  // Adicionar Membro
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    
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
        setMsg({ type: 'error', text: data.error || data.message || 'Erro ao adicionar' });
      } else {
        setMsg({ type: 'success', text: 'Membro adicionado!' });
        setNewUser({ nome: '', email: '', password: '' });
        fetchTeam();
      }
    } catch (error) {
      console.error(error);
      setMsg({ type: 'error', text: 'Erro de conexão.' });
    }
  };

  // Deletar Membro
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

  // --- ESTILOS COM O TEMA ---
  const overlayStyle: React.CSSProperties = {
    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
    backgroundColor: theme.modalOverlay, // Usa o overlay do tema
    zIndex: 9999,
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    backdropFilter: 'blur(3px)' // Um leve desfoque no fundo
  };

  const boxStyle: React.CSSProperties = {
    background: theme.modalBg, // Fundo do modal correto
    color: theme.text,         // Cor do texto correta
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
    width: '100%', 
    padding: '10px', 
    marginBottom: '10px',
    borderRadius: '6px',
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.inputBg, // Fundo do input
    color: theme.text,              // Texto do input
    outline: 'none'
  };

  return (
    <div style={overlayStyle}>
      <div style={boxStyle}>
        
        {/* CABEÇALHO */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '10px', borderBottom: `1px solid ${theme.border}` }}>
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Gerenciar Equipe</h2>
          
          {/* BOTÃO DE FECHAR (Agora visível) */}
          <button 
            onClick={onClose} 
            style={{
              border: 'none', 
              background: 'transparent', 
              fontSize: '24px', 
              cursor: 'pointer',
              color: theme.text, // Usa a cor do texto do tema
              padding: '0 5px',
              fontWeight: 'bold'
            }}
            title="Fechar Janela"
          >
            ✕
          </button>
        </div>

        {/* FORMULÁRIO */}
        <div style={{ background: theme.batchBg || 'rgba(0,0,0,0.05)', padding: '15px', borderRadius: '8px', marginBottom: '25px' }}>
            <h4 style={{ margin: '0 0 15px 0' }}>Adicionar Novo Membro</h4>
            
            <form onSubmit={handleAdd}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <input 
                      required 
                      placeholder="Nome" 
                      value={newUser.nome} 
                      onChange={e => setNewUser({...newUser, nome: e.target.value})} 
                      style={inputStyle} 
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <input 
                      required 
                      type="email" 
                      placeholder="Email do colaborador" 
                      value={newUser.email} 
                      onChange={e => setNewUser({...newUser, email: e.target.value})} 
                      style={inputStyle} 
                    />
                  </div>
                </div>
                
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                   <input 
                      required 
                      type="password" 
                      placeholder="Senha Provisória" 
                      value={newUser.password} 
                      onChange={e => setNewUser({...newUser, password: e.target.value})} 
                      style={{ ...inputStyle, marginBottom: 0, width: '200px' }} 
                    />
                    
                    <button 
                      type="submit" 
                      style={{ 
                        background: '#007bff', 
                        color: '#fff', 
                        border: 'none', 
                        padding: '10px 20px', 
                        borderRadius: '6px', 
                        cursor: 'pointer',
                        fontWeight: 'bold',
                        height: '40px'
                      }}
                    >
                      + Adicionar
                    </button>
                </div>
            </form>
            
            {msg.text && (
                <div style={{ marginTop: '15px', padding: '10px', borderRadius: '4px', background: msg.type === 'error' ? 'rgba(255,0,0,0.1)' : 'rgba(0,255,0,0.1)', color: msg.type === 'error' ? '#ff4d4f' : '#28a745', fontSize: '14px', border: `1px solid ${msg.type === 'error' ? '#ff4d4f' : '#28a745'}` }}>
                    {msg.text}
                </div>
            )}
        </div>

        {/* LISTA DE MEMBROS */}
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0 }}>Membros Atuais</h4>
                {/* CONTADOR DE USUÁRIOS: 2/5 */}
                <span style={{ fontSize: '0.9rem', padding: '2px 8px', borderRadius: '10px', background: theme.buttonBorder, color: theme.text }}>
                    {currentCount} / {maxUsers}
                </span>
            </div>

            {loading && <p style={{ opacity: 0.6 }}>Carregando lista...</p>}
            
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {team.map(member => (
                    <li key={member.id} 
                        style={{ 
                          borderBottom: `1px solid ${theme.border}`, 
                          padding: '15px 0', 
                          display: 'flex', 
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ 
                              width: '35px', height: '35px', borderRadius: '50%', 
                              background: member.cargo === 'admin' ? '#007bff' : '#6c757d',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              color: '#fff', fontWeight: 'bold', fontSize: '14px'
                            }}>
                                {member.nome.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <div style={{ fontWeight: 'bold' }}>
                                    {member.nome} 
                                    {member.id === user?.id && <span style={{ opacity: 0.5, marginLeft: '5px' }}>(Você)</span>}
                                </div>
                                <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>{member.email} • {member.cargo}</div>
                            </div>
                        </div>

                        {member.id !== user?.id && (
                            <button 
                              onClick={() => handleDelete(member.id)} 
                              title="Remover acesso"
                              style={{ 
                                color: '#ff4d4f', 
                                border: `1px solid #ff4d4f`, 
                                background: 'transparent', 
                                cursor: 'pointer',
                                padding: '5px 10px',
                                borderRadius: '4px',
                                fontSize: '0.8rem'
                              }}
                            >
                              Remover
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </div>

      </div>
    </div>
  );
};