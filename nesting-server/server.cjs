require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./db.cjs"); // Importando a conexão configurada

const app = express();

// 1. Configurações
app.use(cors()); // Permite que o React acesse o servidor
app.use(express.json({ limit: "50mb" })); // Aumenta limite para suportar desenhos grandes

// 2. Rota de Teste (Para saber se está vivo)
app.get("/", (req, res) => {
  res.send("Servidor Nesting Online e Conectado! 🚀");
});

// 3. Rota de Cadastro de Peças (O Coração do Sistema)
app.post("/api/pecas", async (req, res) => {
  const parts = req.body; // O array de peças que vem do React

  // Validação básica
  if (!Array.isArray(parts) || parts.length === 0) {
    return res.status(400).json({ error: "Lista de peças vazia ou inválida." });
  }

  console.log(`📥 Recebendo lote com ${parts.length} peças...`);

  // --- ALTERAÇÃO 1: Adicionado campo 'quantidade' e ajustado 'status' ---
  const sql = `
    INSERT INTO pecas_engenharia 
    (id, nome_arquivo, pedido, op, material, espessura, autor, quantidade, cliente, largura, altura, area_bruta, geometria, blocos_def, status)
    VALUES ?
  `;

  // --- ALTERAÇÃO 2: Mapeando p.quantity ---
  const values = parts.map((p) => [
    p.id,
    p.name,
    p.pedido || null,
    p.op || null,
    p.material,
    p.espessura,
    p.autor || null,
    p.quantity || 1, // <--- AQUI: Pega a quantidade enviada ou define 1
    p.cliente || null,
    p.width,
    p.height,
    p.grossArea,
    JSON.stringify(p.entities),
    JSON.stringify(p.blocks || {}),
    "AGUARDANDO", // <--- AQUI: Status atualizado conforme banco de dados
  ]);

  try {
    // Executa a inserção de todas as linhas de uma vez
    const [result] = await db.query(sql, [values]);

    console.log(
      `✅ Sucesso! ${result.affectedRows} peças foram gravadas no banco.`
    );

    res.status(201).json({
      message: "Lote salvo com sucesso!",
      count: result.affectedRows,
    });
  } catch (error) {
    console.error("❌ Erro fatal ao salvar no MySQL:", error);
    res
      .status(500)
      .json({ error: "Erro interno ao salvar dados.", details: error.message });
  }
});

// --- Rota de Busca de Peças por Pedido (Suporta múltiplos: "1001,1002") ---
app.get('/api/pecas/buscar', async (req, res) => {
  const { pedido } = req.query;

  if (!pedido) {
    return res.status(400).json({ error: 'Por favor, forneça o número do pedido.' });
  }

  // Tratamento para múltiplos pedidos (ex: "35905, 35906")
  // Transforma "35905, 35906" em um array ['35905', '35906']
  const pedidosArray = pedido.split(',').map(p => p.trim()).filter(Boolean);

  console.log(`🔎 Buscando peças dos pedidos: ${pedidosArray.join(', ')}...`);

  try {
    // Usamos "IN (?)" e passamos o array. A biblioteca mysql2 trata isso automaticamente.
    // IMPORTANTE: removemos o ORDER BY para evitar o erro de memória com JSONs grandes
    const sql = `SELECT * FROM pecas_engenharia WHERE pedido IN (?)`;
    
    const [rows] = await db.query(sql, [pedidosArray]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Nenhuma peça encontrada para estes pedidos.' });
    }

    const formattedParts = rows.map(row => ({
      id: row.id,
      name: row.nome_arquivo,
      pedido: row.pedido,
      op: row.op,
      material: row.material,
      espessura: row.espessura,
      autor: row.autor,
      quantity: row.quantidade,
      cliente: row.cliente,
      width: Number(row.largura),
      height: Number(row.altura),
      grossArea: Number(row.area_bruta),
      // Validação de JSON seguro
      entities: (typeof row.geometria === 'string') ? JSON.parse(row.geometria) : row.geometria,
      blocks: (typeof row.blocos_def === 'string') ? JSON.parse(row.blocos_def) : (row.blocos_def || {}),
      dataCadastro: row.data_cadastro
    }));

    console.log(`✅ Encontradas ${formattedParts.length} peças.`);
    res.json(formattedParts);

  } catch (error) {
    console.error('❌ Erro na busca:', error);
    res.status(500).json({ error: 'Erro ao buscar dados.', details: error.message });
  }
});

// 4. Iniciar Servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
});
