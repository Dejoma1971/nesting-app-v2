import React, { useState } from 'react';


interface RegisterScreenProps {
    onNavigateToLogin: () => void;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ onNavigateToLogin }) => {
    const [formData, setFormData] = useState({
        nome: '',
        email: '',
        password: '',
        nomeEmpresa: ''
    });
    const [loading, setLoading] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const response = await fetch('http://localhost:3001/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                alert("Conta criada com sucesso! Aproveite seus 30 dias grátis.");
                onNavigateToLogin(); // Volta para o login
            } else {
                alert(data.error || "Erro ao cadastrar.");
            }
        } catch (error) {
            console.error(error);
            alert("Erro de conexão.");
        } finally {
            setLoading(false);
        }
    };

    // Estilos Inline Simples (Tema Escuro)
    const styles = {
        container: { display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#1e1e1e', color: '#fff' },
        form: { display: 'flex', flexDirection: 'column' as const, width: '300px', gap: '15px', background: '#2d2d2d', padding: '30px', borderRadius: '8px', border: '1px solid #444' },
        input: { padding: '10px', borderRadius: '4px', border: '1px solid #555', background: '#1e1e1e', color: '#fff' },
        button: { padding: '10px', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' as const },
        link: { marginTop: '10px', color: '#007bff', cursor: 'pointer', textDecoration: 'underline', fontSize: '14px', background: 'transparent', border: 'none' }
    };

    return (
        <div style={styles.container}>
            <h2 style={{color: '#007bff'}}>Crie sua Conta Grátis</h2>
            <p style={{marginTop: 0, opacity: 0.7}}>Comece seu teste de 30 dias agora.</p>
            
            <form onSubmit={handleRegister} style={styles.form}>
                <input name="nome" placeholder="Seu Nome" value={formData.nome} onChange={handleChange} style={styles.input} required />
                <input name="nomeEmpresa" placeholder="Nome da Empresa" value={formData.nomeEmpresa} onChange={handleChange} style={styles.input} required />
                <input name="email" type="email" placeholder="Seu E-mail" value={formData.email} onChange={handleChange} style={styles.input} required />
                <input name="password" type="password" placeholder="Senha" value={formData.password} onChange={handleChange} style={styles.input} required />
                
                <button type="submit" disabled={loading} style={{...styles.button, background: loading ? '#555' : '#28a745'}}>
                    {loading ? 'Criando Conta...' : 'Começar Agora 🚀'}
                </button>
            </form>

            <button onClick={onNavigateToLogin} style={styles.link}>
                Já tem conta? Fazer Login
            </button>
        </div>
    );
};