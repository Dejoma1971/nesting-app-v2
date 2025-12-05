require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./db.cjs'); // Importando a conexão configurada

const app = express();

// 1. Configurações
app.use(cors()); // Permite que o React acesse o servidor
app.use(express.json({ limit: '50mb' })); // Aumenta limite para suportar desenhos grandes

// 2. Rota de Teste (Para saber se está vivo)
app.get('/', (req, res) => {
  res.send('Servidor Nesting Online e Conectado! 🚀');
});

// 3. Rota de Cadastro de Peças (O Coração do Sistema)
app.post('/api/pecas', async (req, res) => {
  const parts = req.body; // O array de peças que vem do React

  // Validação básica
  if (!Array.isArray(parts) || parts.length === 0) {
    return res.status(400).json({ error: 'Lista de peças vazia ou inválida.' });
  }

  console.log(`📥 Recebendo lote com ${parts.length} peças...`);

  // A Query SQL exata para a tabela que criamos
  const sql = `
    INSERT INTO pecas_engenharia 
    (id, nome_arquivo, pedido, op, material, espessura, autor, cliente, largura, altura, area_bruta, geometria, blocos_def, status)
    VALUES ?
  `;

  // Transforma o Array de Objetos do JS em Array de Arrays para o MySQL (Bulk Insert)
  const values = parts.map(p => [
    p.id,
    p.name,
    p.pedido || null,
    p.op || null,
    p.material,
    p.espessura,
    p.autor || null,
    p.cliente || null,
    p.width,
    p.height,
    p.grossArea, // Área Bruta
    JSON.stringify(p.entities), // Converte o desenho para JSON Texto
    JSON.stringify(p.blocks || {}), // Converte os blocos para JSON Texto
    'DISPONIVEL' // Status padrão
  ]);

  try {
    // Executa a inserção de todas as linhas de uma vez
    const [result] = await db.query(sql, [values]);
    
    console.log(`✅ Sucesso! ${result.affectedRows} peças foram gravadas no banco.`);
    
    res.status(201).json({ 
        message: 'Lote salvo com sucesso!', 
        count: result.affectedRows 
    });
    
  } catch (error) {
    console.error('❌ Erro fatal ao salvar no MySQL:', error);
    res.status(500).json({ error: 'Erro interno ao salvar dados.', details: error.message });
  }
});

// 4. Iniciar Servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
});