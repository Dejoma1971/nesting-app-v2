import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface SubscriptionData {
    status: 'trial' | 'active' | 'past_due' | 'canceled';
    plan: string;
    parts: { used: number; limit: number | null };
    users: { used: number; limit: number };
    daysLeft: number;
}

// --- NOVO: Aceita a prop isDarkMode ---
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

    const isTrial = data.status === 'trial';
    // No tema claro, o amarelo do trial pode ficar ruim de ler, escurecemos um pouco
    const statusColor = isTrial 
        ? (isDarkMode ? '#ffc107' : '#d39e00') 
        : '#28a745'; 
        
    const statusText = isTrial ? `Teste Gratuito (${data.daysLeft} dias restantes)` : 'Plano Premium Ativo';

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
            color: textColor, // <--- Cor adaptativa
            fontSize: '12px',
            whiteSpace: 'nowrap' as const,
            transition: 'all 0.3s ease'
        },
        userText: {
            fontWeight: 'bold' as const,
            color: textColor // <--- Cor adaptativa
        },
        divider: {
            width: '1px',
            height: '14px',
            background: dividerColor // <--- Divisória adaptativa
        },
        statusText: {
            color: statusColor,
            fontWeight: 'bold' as const
        }
    };

    return (
        <div style={styles.container} title={`Plano: ${data.plan}`}>
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