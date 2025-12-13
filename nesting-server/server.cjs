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

// --- Rota para Atualizar Status (Ex: Baixa de Produção) ---
app.put('/api/pecas/status', async (req, res) => {
  const { ids, status } = req.body;

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Lista de IDs inválida.' });
  }
  if (!status) {
    return res.status(400).json({ error: 'Status não fornecido.' });
  }

  console.log(`🔄 Atualizando ${ids.length} peças para status: '${status}'...`);

  try {
    // Atualiza apenas as peças cujos IDs foram passados
    const sql = `UPDATE pecas_engenharia SET status = ? WHERE id IN (?)`;
    
    // O mysql2 aceita arrays diretamente no placeholder (?) para cláusulas IN
    const [result] = await db.query(sql, [status, ids]);

    console.log(`✅ Status atualizado! Linhas afetadas: ${result.affectedRows}`);
    
    res.json({ 
        message: 'Status atualizado com sucesso.', 
        updatedCount: result.affectedRows 
    });

  } catch (error) {
    console.error('❌ Erro ao atualizar status:', error);
    res.status(500).json({ error: 'Erro interno ao atualizar status.', details: error.message });
  }
});

// --- Rota de Registro de Produção (Caminho B) ---
app.post('/api/producao/registrar', async (req, res) => {
  const { itens, chapaIndex, aproveitamento } = req.body;
  // itens espera: [{ id: 'uuid', qtd: 5 }, { id: 'uuid2', qtd: 1 }]

  if (!itens || !Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'Nenhum item para registrar.' });
  }

  const connection = await db.getConnection(); // Pega conexão para transação

  try {
    await connection.beginTransaction();

    console.log(`🏭 Registrando produção da Chapa ${chapaIndex + 1} (Eficiência: ${aproveitamento}%)...`);

    for (const item of itens) {
      // 1. Inserir no Histórico
      await connection.query(
        `INSERT INTO historico_producao (id_peca, quantidade_produzida, numero_chapa, aproveitamento) VALUES (?, ?, ?, ?)`,
        [item.id, item.qtd, chapaIndex + 1, aproveitamento]
      );

      // 2. Verificar Totais para Atualizar Status
      // Soma tudo que já foi feito dessa peça (histórico)
      const [histRows] = await connection.query(
        `SELECT SUM(quantidade_produzida) as total_feito FROM historico_producao WHERE id_peca = ?`,
        [item.id]
      );
      const totalFeito = histRows[0].total_feito || 0;

      // Pega a meta original
      const [pecaRows] = await connection.query(
        `SELECT quantidade FROM pecas_engenharia WHERE id = ?`,
        [item.id]
      );
      
      if (pecaRows.length > 0) {
        const meta = pecaRows[0].quantidade;
        let novoStatus = 'EM PRODUCAO';
        
        if (totalFeito >= meta) {
          novoStatus = 'CONCLUIDO';
        }

        // Atualiza o status na tabela pai
        await connection.query(
          `UPDATE pecas_engenharia SET status = ? WHERE id = ?`,
          [novoStatus, item.id]
        );
      }
    }

    await connection.commit();
    console.log("✅ Produção registrada e status atualizados.");
    res.json({ message: 'Produção registrada com sucesso!' });

  } catch (error) {
    await connection.rollback();
    console.error("❌ Erro ao registrar produção:", error);
    res.status(500).json({ error: 'Erro ao processar produção.', details: error.message });
  } finally {
    connection.release();
  }
});

// 4. Iniciar Servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🔥 Servidor rodando na porta ${PORT}`);
});
