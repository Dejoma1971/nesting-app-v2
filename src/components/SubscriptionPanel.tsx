import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface SubscriptionData {
    status: 'trial' | 'active' | 'past_due' | 'canceled';
    plan: string;
    parts: { used: number; limit: number | null };
    users: { used: number; limit: number };
    daysLeft: number;
}

interface SubscriptionPanelProps {
    isDarkMode: boolean;
}

export const SubscriptionPanel: React.FC<SubscriptionPanelProps> = ({ isDarkMode }) => {
    const { user } = useAuth();
    const [data, setData] = useState<SubscriptionData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!user) return;

        fetch('http://localhost:3001/api/subscription/status', {
            headers: { 'Authorization': `Bearer ${user.token}` }
        })
        .then(res => res.json())
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

    if (loading) return <div style={{padding: 10, fontSize: 12, color: isDarkMode ? '#aaa' : '#666'}}>...</div>;
    
    if (error || !data) return null;

    // --- LÓGICA DE STATUS CORRIGIDA ---
    let statusColor = '#666';
    let statusText = '';

    switch (data.status) {
        case 'trial':
            statusColor = isDarkMode ? '#ffc107' : '#d39e00'; // Amarelo
            statusText = `Teste Gratuito (${data.daysLeft} dias)`;
            break;
        case 'active':
            statusColor = '#28a745'; // Verde
            // Mostra o nome real do plano (Ex: "Premium Dev") vindo do banco
            statusText = `${data.plan || 'Plano Ativo'}`; 
            break;
        case 'past_due':
            statusColor = '#dc3545'; // Vermelho
            statusText = 'Pagamento Pendente';
            break;
        case 'canceled':
            statusColor = '#6c757d'; // Cinza
            statusText = 'Cancelado';
            break;
        default:
            statusColor = '#17a2b8'; // Azul (Fallback)
            statusText = data.plan;
    }

    // --- PALETA DE CORES ADAPTATIVA ---
    const textColor = isDarkMode ? '#fff' : '#333';
    const bgColor = isDarkMode ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
    const dividerColor = isDarkMode ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';

    const styles = {
        container: {
            background: bgColor,
            border: `1px solid ${statusColor}`,
            borderRadius: '20px',
            padding: '5px 15px',
            display: 'flex',
            alignItems: 'center',
            gap: '15px',
            color: textColor,
            fontSize: '12px',
            whiteSpace: 'nowrap' as const,
            transition: 'all 0.3s ease'
        },
        userText: {
            fontWeight: 'bold' as const,
            color: textColor
        },
        divider: {
            width: '1px',
            height: '14px',
            background: dividerColor
        },
        statusText: {
            color: statusColor,
            fontWeight: 'bold' as const
        }
    };

    return (
        <div style={styles.container} title={`Status: ${data.status}`}>
            <span style={styles.userText}>
                👤 {user?.name || 'Usuário'}
            </span>

            <div style={styles.divider}></div>

            <span style={styles.statusText}>
                {statusText}
            </span>
        </div>
    );
};