import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface SubscriptionData {
    status: 'trial' | 'active' | 'past_due' | 'canceled';
    plan: string;
    parts: { used: number; limit: number | null };
    users: { used: number; limit: number };
    daysLeft: number;
}

export const SubscriptionPanel: React.FC = () => {
    const { user } = useAuth();
    const [data, setData] = useState<SubscriptionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!user) return;

        fetch('http://localhost:3001/api/subscription/status', {
            headers: { 'Authorization': `Bearer ${user.token}` }
        })
        .then(res => {
            if (!res.ok) {
                throw new Error('Falha ao buscar assinatura');
            }
            return res.json();
        })
        .then(data => {
            setData(data);
            setLoading(false);
        })
        .catch(err => {
            console.error("Erro no painel:", err);
            setError(true);
            setLoading(false);
        });
    }, [user]);

    // Se estiver carregando, mostra um texto simples
    if (loading) return <div style={{padding: 10, fontSize: 12, color: '#aaa'}}>Carregando plano...</div>;
    
    // SE DEU ERRO, mostra aviso discreto
    if (error || !data) {
        return (
            <div style={{
                padding: '5px 10px', 
                background: '#2d2d2d', 
                color: '#ff4d4d', 
                borderRadius: '4px', 
                border: '1px solid #ff4d4d',
                fontSize: '11px'
            }}>
                ⚠️ Erro ao carregar plano
            </div>
        );
    }

    // --- PROTEÇÃO E VALORES PADRÃO ---
    const partsUsed = data.parts?.used || 0;
    const partsLimit = data.parts?.limit || 30; 

    // REMOVIDO: usersUsed e usersLimit (não estamos exibindo no painel compacto)

    const partsPercentage = partsLimit 
        ? Math.min(100, (partsUsed / partsLimit) * 100) 
        : 100; 

    const isLimitReached = partsLimit && partsUsed >= partsLimit;

    // Estilos do Painel Compacto (Para o Header)
    const styles = {
        container: {
            background: 'linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)',
            color: '#fff',
            padding: '8px 15px', // Padding reduzido para caber no header
            borderRadius: '6px',
            border: '1px solid #444',
            boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
            display: 'flex',
            flexDirection: 'column' as const,
            justifyContent: 'center',
            width: '100%'
        },
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '5px',
        },
        badge: {
            background: data.status === 'trial' ? '#ffc107' : '#28a745',
            color: '#000',
            padding: '1px 6px',
            borderRadius: '10px',
            fontSize: '10px',
            fontWeight: 'bold' as const,
            marginLeft: '8px'
        },
        progressBarContainer: {
            height: '4px',
            background: '#444',
            borderRadius: '2px',
            overflow: 'hidden'
        },
        progressBarFill: {
            height: '100%',
            width: `${partsPercentage}%`,
            background: isLimitReached ? '#dc3545' : '#007bff',
            transition: 'width 0.5s ease'
        }
    };

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={{display: 'flex', alignItems: 'center'}}>
                    <span style={{fontSize:'11px', color:'#aaa', fontWeight: 'bold'}}>{data.plan}</span>
                    <span style={styles.badge}>
                        {data.status === 'trial' ? `${data.daysLeft} dias` : 'ATIVO'}
                    </span>
                </div>
                <div style={{fontSize:'10px', fontWeight:'bold'}}>
                     <span style={{color: isLimitReached ? '#ff4d4d' : '#fff'}}>
                        {partsUsed} / {partsLimit ? partsLimit : '∞'} peças
                    </span>
                </div>
            </div>

            <div style={styles.progressBarContainer}>
                <div style={styles.progressBarFill}></div>
            </div>
            
            {isLimitReached && (
                <div style={{fontSize: '9px', color: '#ff4d4d', textAlign: 'center', marginTop: '2px'}}>
                    Limite atingido!
                </div>
            )}
        </div>
    );
};