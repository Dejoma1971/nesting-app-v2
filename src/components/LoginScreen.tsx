import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom'; // <--- 1. IMPORTAR SEARCH PARAMS
import { useAuth } from '../context/AuthContext';
import { handleSubscription } from '../services/paymentService'; // <--- 2. IMPORTAR SERVIÇO DE PAGAMENTO

interface LoginScreenProps {
    onLoginSuccess: () => void;
    onNavigateToRegister: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, onNavigateToRegister }) => {
    const { login } = useAuth();
    const [searchParams] = useSearchParams(); // Hook para ler a URL

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await fetch('http://localhost:3001/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok) {
                // Monta o objeto usuário completo
                const userDataCompleto = {
                    ...data.user, 
                    token: data.token
                };

                // Salva no contexto/localStorage
                login(userDataCompleto);

                // --- 3. LÓGICA DE INTERCEPTAÇÃO DE PAGAMENTO ---
                const pendingPlan = searchParams.get("plan");
                
                if (pendingPlan) {
                    // Se tem plano pendente, NÃO vai para o dashboard.
                    // Vai para o Stripe agora!
                    const qtd = searchParams.get("quantity") ? Number(searchParams.get("quantity")) : 1;
                    
                    console.log(`Redirecionando para pagamento do plano: ${pendingPlan} (Qtd: ${qtd})`);
                    
                    // Chama a mesma função que usamos na Landing Page
                    // IMPORTANTE: Como o handleSubscription usa window.location.href, ele vai sair daqui.
                    await handleSubscription(pendingPlan as "premium" | "corporate", qtd); 
                } else {
                    // Fluxo normal: Entra no sistema
                    onLoginSuccess();
                }
                // ----------------------------------------------

            } else {
                alert(data.error || "Erro ao entrar.");
            }
        } catch (error) {
            console.error(error);
            alert("Erro de conexão com o servidor.");
        } finally {
            setLoading(false);
        }
    };

    // Estilos inline simples (Tema Escuro)
    const styles = {
        container: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1e1e1e', color: '#fff' },
        form: { display: 'flex', flexDirection: 'column' as const, width: '300px', gap: '15px', background: '#2d2d2d', padding: '30px', borderRadius: '8px', border: '1px solid #444' },
        input: { padding: '10px', borderRadius: '4px', border: '1px solid #555', background: '#1e1e1e', color: '#fff' },
        button: { padding: '10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' as const },
        linkBtn: { marginTop: '15px', background: 'transparent', border: 'none', color: '#007bff', textDecoration: 'underline', cursor: 'pointer', fontSize: '14px' }
    };

    return (
        <div style={styles.container}>
            <h2 style={{color: '#007bff'}}>autoNest Hub</h2>
            <p style={{opacity: 0.6, marginTop: -10}}>
                {searchParams.get("plan") 
                    ? "Faça login para concluir sua assinatura" 
                    : "Faça login para continuar"}
            </p>
            
            <form onSubmit={handleSubmit} style={styles.form}>
                <input 
                    type="email" 
                    placeholder="E-mail" 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    style={styles.input}
                    required 
                />
                <input 
                    type="password" 
                    placeholder="Senha" 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    style={styles.input}
                    required 
                />
                
                <button type="submit" disabled={loading} style={{...styles.button, background: loading ? '#555' : '#007bff'}}>
                    {loading ? 'Entrando...' : 'Entrar'}
                </button>
            </form>

            <button onClick={onNavigateToRegister} style={styles.linkBtn}>
                Não tem uma conta? Crie agora (Teste Grátis)
            </button>
        </div>
    );
};