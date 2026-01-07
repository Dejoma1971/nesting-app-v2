require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./db.cjs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const paymentRoutes = require("./routes/payment.routes.cjs");
const crypto = require("crypto"); // Necessário para gerar UUIDs

const app = express();

app.use(cors());

// Configuração híbrida: JSON normal para tudo, mas guarda o Raw Body para o Webhook do Stripe
app.use(express.json({
  limit: '50mb',
  verify: (req, res, buf) => {
    // Se a URL começar com /api/webhook, salvamos o buffer bruto
    if (req.originalUrl.startsWith('/api/webhook')) {
      req.rawBody = buf.toString();
    }
  }
}));

// ==========================================
// ROTAS DE PAGAMENTO
// ==========================================
app.use("/api/payment", paymentRoutes);

// ==========================================
// CONFIGURAÇÃO CENTRALIZADA DA CHAVE SECRETA
// (Isso resolve o erro de invalid signature)
// ==========================================
const JWT_SECRET = process.env.JWT_SECRET || "segredo-super-secreto-do-nesting-app";

// ==========================================================
// MIDDLEWARE DE AUTENTICAÇÃO (Definido aqui para usar o JWT_SECRET correto)
// ==========================================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    // console.log("DEBUG: Token não fornecido.");
    return res.sendStatus(401);
  }

  // CORREÇÃO: Usando a constante unificada JWT_SECRET
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log("DEBUG: Erro ao verificar token:", err.message);
      return res.sendStatus(403);
    }
    req.user = user;
    next();
  });
}

// ==========================================================
// ROTA WEBHOOK DO STRIPE (AUTOMAÇÃO DE PAGAMENTO)
// ==========================================================
app.post('/api/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET; 
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  let event;

  try {
    if (!req.rawBody) throw new Error('Raw body não encontrado.');
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    console.error(`❌ Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userEmail = session.customer_details.email;
    const amountTotal = session.amount_total; // Centavos

    console.log(`💰 Pagamento recebido de: ${userEmail} | Valor: ${amountTotal}`);

    try {
        const connection = await db.getConnection();
        
        // Lógica de Planos
        let novoPlano = 'Premium';
        let limiteUsuarios = 1;

        // Se pagou mais que o base ($24.90), é Corporativo
        if (amountTotal > 2490) {
            novoPlano = 'Corporativo';
            // Cálculo: (Total - Base) / Preço Extra + 1 Admin
            const valorExtra = amountTotal - 2490;
            const usersExtras = Math.floor(valorExtra / 1200);
            limiteUsuarios = 1 + usersExtras;
        }

        console.log(`📊 Definindo plano: ${novoPlano} com ${limiteUsuarios} usuários.`);

        // 1. Descobre a empresa do usuário
        const [users] = await connection.query("SELECT empresa_id FROM usuarios WHERE email = ?", [userEmail]);
        
        if (users.length > 0) {
            const empresaId = users[0].empresa_id;

            // 2. Atualiza a EMPRESA
            await connection.query(`
                UPDATE empresas 
                SET plano = ?, subscription_status = 'active', max_users = ? 
                WHERE id = ?`, 
              [novoPlano, limiteUsuarios, empresaId]
            );

            // 3. Atualiza o ADMIN
            await connection.query(`
                UPDATE usuarios SET plano = ? WHERE email = ?`,
                [novoPlano, userEmail]
            );
            console.log(`✅ Sucesso! Empresa ${empresaId} atualizada.`);
        } else {
            console.error("⚠️ Usuário pagante não encontrado no banco:", userEmail);
        }
        
        connection.release();
    } catch (dbError) {
        console.error("❌ Erro ao atualizar banco:", dbError);
    }
  }

  res.json({received: true});
});

// ==========================================================
// 2. ROTAS DE AUTENTICAÇÃO
// ==========================================================

// --- LOGIN (CORRIGIDO) ---
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const [rows] = await db.query(
      "SELECT id, nome, email, senha_hash, empresa_id, plano, cargo, status FROM usuarios WHERE email = ?",
      [email]
    );

    if (rows.length === 0) return res.status(401).json({ error: "Usuário não encontrado" });

    const user = rows[0];

    const validPassword = await bcrypt.compare(password, user.senha_hash);
    if (!validPassword) return res.status(401).json({ error: "Senha incorreta" });

    // CORREÇÃO: Usando a constante JWT_SECRET
    const token = jwt.sign(
      {
        id: user.id,
        empresa_id: user.empresa_id,
        plano: user.plano,
        cargo: user.cargo,
      },
      JWT_SECRET, 
      { expiresIn: "24h" }
    );

    res.json({
      message: "Login realizado com sucesso",
      token,
      user: {
        id: user.id,
        name: user.nome,
        email: user.email,
        empresa_id: user.empresa_id,
        plano: user.plano,
        cargo: user.cargo,
      },
    });
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// --- ROTA PARA ATUALIZAR O PERFIL (RENOVAR TOKEN) ---
app.get("/api/auth/me", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  try {
    const [rows] = await db.query(
      "SELECT id, nome, email, empresa_id, plano, cargo, status FROM usuarios WHERE id = ?",
      [userId]
    );

    if (rows.length === 0) return res.status(404).json({ error: "Usuário não encontrado." });

    const user = rows[0];

    // CORREÇÃO: Gera novo token com JWT_SECRET correto e plano atualizado
    const newToken = jwt.sign(
      {
        id: user.id,
        empresa_id: user.empresa_id,
        plano: user.plano, 
        cargo: user.cargo,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token: newToken,
      user: {
        id: user.id,
        name: user.nome,
        email: user.email,
        empresa_id: user.empresa_id,
        plano: user.plano,
        cargo: user.cargo,
      },
    });
  } catch (error) {
    console.error("Erro ao renovar perfil:", error);
    res.status(500).json({ error: "Erro ao atualizar perfil." });
  }
});

// --- CADASTRO (SIGN UP) ---
app.post("/api/register", async (req, res) => {
  const { nome, email, password, nomeEmpresa } = req.body;

  if (!nome || !email || !password || !nomeEmpresa) {
    return res.status(400).json({ error: "Todos os campos são obrigatórios." });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [existingUser] = await connection.query("SELECT id FROM usuarios WHERE email = ?", [email]);
    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(400).json({ error: "Este e-mail já está cadastrado." });
    }

    const empresaId = crypto.randomUUID();
    await connection.query(
      `INSERT INTO empresas (id, nome, plano, subscription_status, max_parts, max_users, trial_start_date)
       VALUES (?, ?, 'free', 'trial', 50, 1, NOW())`,
      [empresaId, nomeEmpresa]
    );

    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(password, salt);

    const usuarioId = crypto.randomUUID();
    await connection.query(
      `INSERT INTO usuarios (id, nome, email, senha_hash, plano, status, empresa_id, cargo)
       VALUES (?, ?, ?, ?, 'free', 'ativo', ?, 'admin')`,
      [usuarioId, nome, email, senhaHash, empresaId]
    );

    await connection.commit();
    res.status(201).json({ message: "Cadastro realizado com sucesso!" });
  } catch (error) {
    await connection.rollback();
    console.error("Erro no cadastro:", error);
    res.status(500).json({ error: "Erro ao criar conta." });
  } finally {
    connection.release();
  }
});

// ==========================================================
// 3. ROTAS DE GESTÃO DE EQUIPE
// ==========================================================

// --- LISTAR MEMBROS ---
app.get("/api/team", authenticateToken, async (req, res) => {
  const empresaId = req.user.empresa_id;
  try {
    const [rows] = await db.query(
      "SELECT id, nome, email, cargo, status, ultimo_login FROM usuarios WHERE empresa_id = ?",
      [empresaId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar equipe." });
  }
});

// --- ADICIONAR MEMBRO ---
app.post("/api/team/add", authenticateToken, async (req, res) => {
  const { nome, email, password } = req.body;
  const empresaId = req.user.empresa_id;
  const usuarioCargo = req.user.cargo;

  if (usuarioCargo !== 'admin') {
    return res.status(403).json({ error: "Apenas administradores podem adicionar membros." });
  }
  if (!nome || !email || !password) {
    return res.status(400).json({ error: "Preencha todos os campos." });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [empRows] = await connection.query("SELECT max_users, plano FROM empresas WHERE id = ?", [empresaId]);
    if (empRows.length === 0) throw new Error("Empresa não encontrada");
    const empresa = empRows[0];
    const limiteUsuarios = empresa.max_users || 1;

    const [countRows] = await connection.query("SELECT COUNT(*) as total FROM usuarios WHERE empresa_id = ?", [empresaId]);
    const totalAtual = countRows[0].total;

    if (totalAtual >= limiteUsuarios) {
      await connection.rollback();
      return res.status(403).json({ 
        error: "LIMITE ATINGIDO", 
        message: `Seu plano atual (${empresa.plano}) permite apenas ${limiteUsuarios} usuários.` 
      });
    }

    const [existing] = await connection.query("SELECT id FROM usuarios WHERE email = ?", [email]);
    if (existing.length > 0) {
      await connection.rollback();
      return res.status(400).json({ error: "Este e-mail já está em uso." });
    }

    const novoId = crypto.randomUUID();
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(password, salt);

    await connection.query(
      `INSERT INTO usuarios (id, nome, email, senha_hash, empresa_id, cargo, status, plano)
       VALUES (?, ?, ?, ?, ?, 'operador', 'ativo', 'dependente')`, 
      [novoId, nome, email, senhaHash, empresaId]
    );

    await connection.commit();
    res.status(201).json({ message: "Membro adicionado!" });
  } catch (error) {
    await connection.rollback();
    res.status(500).json({ error: "Erro ao adicionar membro." });
  } finally {
    connection.release();
  }
});

// --- REMOVER MEMBRO ---
app.delete("/api/team/:id", authenticateToken, async (req, res) => {
  const targetId = req.params.id;
  const empresaId = req.user.empresa_id;
  const requesterCargo = req.user.cargo;

  if (requesterCargo !== 'admin') return res.status(403).json({ error: "Sem permissão." });
  if (targetId === req.user.id) return res.status(400).json({ error: "Não exclua a si mesmo aqui." });

  try {
    const [result] = await db.query(
      "DELETE FROM usuarios WHERE id = ? AND empresa_id = ?",
      [targetId, empresaId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Usuário não encontrado na sua equipe." });
    }
    res.json({ message: "Usuário removido." });
  } catch (error) {
    res.status(500).json({ error: "Erro ao processar exclusão." });
  }
});

// ==========================================
// 4. ROTAS DE ENGENHARIA E PEÇAS
// ==========================================

// --- SALVAR PEÇAS ---
app.post("/api/pecas", authenticateToken, async (req, res) => {
  const parts = req.body;
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;

  if (!Array.isArray(parts) || parts.length === 0) return res.status(400).json({ error: "Lista vazia." });

  try {
    const [empRows] = await db.query(
      "SELECT trial_start_date, subscription_status, max_parts FROM empresas WHERE id = ?",
      [empresaId]
    );
    const empresa = empRows[0];

    // Validação Trial
    if (empresa.subscription_status === "trial") {
      const now = new Date();
      const start = new Date(empresa.trial_start_date);
      const diffTime = Math.abs(now - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 30) return res.status(403).json({ error: "SEU TRIAL EXPIROU!" });
    }

    // Validação Limite Peças
    if (empresa.max_parts !== null) {
      const [countRows] = await db.query("SELECT COUNT(*) as total FROM pecas_engenharia WHERE empresa_id = ?", [empresaId]);
      const currentTotal = countRows[0].total;
      if (currentTotal + parts.length > empresa.max_parts) {
        return res.status(403).json({ error: "CAPACIDADE ATINGIDA!" });
      }
    }

    const sql = `
      INSERT INTO pecas_engenharia 
      (id, usuario_id, empresa_id, nome_arquivo, pedido, op, material, espessura, autor, quantidade, cliente, 
      largura, altura, area_bruta, geometria, blocos_def, status, tipo_producao)
      VALUES ? `;
      
    const values = parts.map((p) => [
      p.id, usuarioId, empresaId, p.name, p.pedido || null, p.op || null, p.material, p.espessura,
      p.autor || null, p.quantity || 1, p.cliente || null, p.width, p.height, p.grossArea,
      JSON.stringify(p.entities), JSON.stringify(p.blocks || {}), "AGUARDANDO", p.tipo_producao || "NORMAL"
    ]);

    const [result] = await db.query(sql, [values]);   
    res.status(201).json({ message: "Peças salvas!", count: result.affectedRows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro interno." });
  }
});

// --- VERIFICAR DUPLICIDADE ---
app.post("/api/pecas/verificar-existencia", authenticateToken, async (req, res) => {
  const { itens } = req.body;
  const empresaId = req.user.empresa_id;

  if (!itens || !Array.isArray(itens) || itens.length === 0) return res.json({ duplicadas: [] });

  try {
    const conditions = itens.map(() => "(pedido = ? AND nome_arquivo = ?)").join(" OR ");
    const values = [empresaId];
    itens.forEach(item => values.push(item.pedido, item.nome));

    const sql = `SELECT pedido, nome_arquivo FROM pecas_engenharia WHERE empresa_id = ? AND (${conditions})`;
    const [rows] = await db.query(sql, values);
    res.json({ duplicadas: rows });
  } catch (error) {
    res.status(500).json({ error: "Erro ao verificar duplicidade." });
  }
});

// --- BUSCAR PEÇAS ---
app.get("/api/pecas/buscar", authenticateToken, async (req, res) => {
  const { pedido } = req.query;
  const empresaId = req.user.empresa_id;

  if (!pedido) return res.status(400).json({ error: "Falta pedido." });

  const pedidosArray = pedido.split(",").map((p) => p.trim()).filter(Boolean);

  try {
    const sql = `SELECT * FROM pecas_engenharia WHERE pedido IN (?) AND empresa_id = ? AND status = 'AGUARDANDO'`;
    const [rows] = await db.query(sql, [pedidosArray, empresaId]);

    if (rows.length === 0) return res.status(404).json({ message: "Não encontrado" });

    const formattedParts = rows.map((row) => ({
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
      entities: typeof row.geometria === "string" ? JSON.parse(row.geometria) : row.geometria,
      blocks: typeof row.blocos_def === "string" ? JSON.parse(row.blocos_def) : row.blocos_def || {},
      dataCadastro: row.data_cadastro,
      tipo_producao: row.tipo_producao,
    }));

    res.json(formattedParts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- LISTAR PEDIDOS DISPONÍVEIS ---
app.get("/api/pedidos/disponiveis", authenticateToken, async (req, res) => {
  const empresaId = req.user.empresa_id;
  try {
    const [rows] = await db.query(
      "SELECT DISTINCT pedido FROM pecas_engenharia WHERE empresa_id = ? AND status = 'AGUARDANDO' AND pedido IS NOT NULL AND pedido != '' ORDER BY pedido DESC",
      [empresaId]
    );
    res.json(rows.map((r) => r.pedido));
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar pedidos." });
  }
});

// --- STATUS DA ASSINATURA ---
app.get("/api/subscription/status", authenticateToken, async (req, res) => {
  try {
    const empresaId = req.user.empresa_id;
    const [empresaRows] = await db.query(
      "SELECT plano, trial_start_date, subscription_status, subscription_end_date, max_parts, max_users FROM empresas WHERE id = ?",
      [empresaId]
    );
    const empresa = empresaRows[0];

    const [countRows] = await db.query("SELECT COUNT(*) as total FROM pecas_engenharia WHERE empresa_id = ?", [empresaId]);
    const partsUsed = countRows[0].total;

    const [userCountRows] = await db.query("SELECT COUNT(*) as total FROM usuarios WHERE empresa_id = ?", [empresaId]);
    const usersUsed = userCountRows[0].total;

    let daysLeft = 0;
    if (empresa.subscription_status === "trial") {
      const now = new Date();
      const start = new Date(empresa.trial_start_date);
      const expirationDate = new Date(start);
      expirationDate.setDate(expirationDate.getDate() + 30);
      daysLeft = Math.max(0, Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24)));
    }

    res.json({
      status: empresa.subscription_status,
      plan: empresa.subscription_status === "trial" ? "Teste Gratuito" : empresa.plano || "Plano Premium",
      parts: { used: partsUsed, limit: empresa.max_parts },
      users: { used: usersUsed, limit: empresa.max_users },
      daysLeft: daysLeft,
    });
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar assinatura" });
  }
});

// --- REGISTRAR PRODUÇÃO (Com Histórico e Motor) ---
app.post("/api/producao/registrar", authenticateToken, async (req, res) => {
  const { chapaIndex, aproveitamento, densidade, itens, motor } = req.body;
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;

  if (!itens || itens.length === 0) return res.status(400).json({ error: "Nenhum item informado." });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    let materialReal = "Desconhecido";
    let espessuraReal = "N/A";

    const [pecaRows] = await connection.query(
      "SELECT material, espessura FROM pecas_engenharia WHERE id = ? AND empresa_id = ?",
      [itens[0].id, empresaId]
    );
    if (pecaRows.length > 0) {
      materialReal = pecaRows[0].material;
      espessuraReal = pecaRows[0].espessura;
    }

    const [result] = await connection.query(
      `INSERT INTO producao_historico 
       (empresa_id, usuario_id, data_producao, chapa_index, aproveitamento, densidade, material, espessura, motor) 
       VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?)`,
      [empresaId, usuarioId, chapaIndex, aproveitamento, densidade || aproveitamento, materialReal, espessuraReal, motor || "Smart Nest"]
    );

    const producaoId = result.insertId;
    const values = itens.map((item) => [producaoId, item.id, item.quantidade || item.qtd, item.tipo_producao || 'NORMAL']);
    
    await connection.query(
      `INSERT INTO producao_itens (producao_id, peca_original_id, quantidade, tipo_producao) VALUES ?`,
      [values]
    );

    const idsParaAtualizar = itens.map(i => i.id);
    if (idsParaAtualizar.length > 0) {
        await connection.query(
            "UPDATE pecas_engenharia SET status = 'EM PRODUÇÃO' WHERE id IN (?) AND empresa_id = ?",
            [idsParaAtualizar, empresaId]
        );
    }

    await connection.commit();
    res.json({ message: "Produção registrada!", detalhes: { material: materialReal, espessura: espessuraReal, motor } });
  } catch (error) {
    await connection.rollback();
    if (error.code === "ER_DUP_ENTRY") return res.status(409).json({ error: "Duplicate entry" });
    res.status(500).json({ error: "Erro ao salvar." });
  } finally {
    connection.release();
  }
});

// ==========================================
// ROTAS DE MATERIAIS E ESPESSURAS
// ==========================================

// --- MATERIAIS ---
app.get("/api/materials", authenticateToken, async (req, res) => {
  try {
    const query = `
        SELECT id, nome, densidade, 'padrao' as origem FROM materiais_padrao
        UNION ALL
        SELECT id, nome, densidade, 'custom' as origem FROM materiais_personalizados 
        WHERE usuario_id = ? ORDER BY nome ASC`;
    const [results] = await db.query(query, [req.user.id]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/materials", authenticateToken, async (req, res) => {
  const { name, density } = req.body;
  if (!name) return res.status(400).json({ error: "Nome obrigatório" });
  try {
    const [result] = await db.query(
      "INSERT INTO materiais_personalizados (usuario_id, nome, densidade) VALUES (?, ?, ?)",
      [req.user.id, name, density || 7.85]
    );
    res.json({ id: result.insertId, nome: name, densidade: density || 7.85 });
  } catch (err) {
    res.status(500).json({ error: "Erro ao salvar" });
  }
});

app.put("/api/materials/:id", authenticateToken, async (req, res) => {
  const { name, density } = req.body;
  try {
    const [result] = await db.query(
      "UPDATE materiais_personalizados SET nome = ?, densidade = ? WHERE id = ? AND usuario_id = ?",
      [name, density || 7.85, req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Não encontrado" });
    res.json({ message: "Atualizado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/materials/:id", authenticateToken, async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM materiais_personalizados WHERE id = ? AND usuario_id = ?",
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Não encontrado" });
    res.json({ message: "Removido" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ESPESSURAS ---
app.get("/api/thicknesses", authenticateToken, async (req, res) => {
  try {
    const query = `
        SELECT id, valor, 'padrao' as origem FROM espessuras_padrao
        UNION ALL
        SELECT id, valor, 'custom' as origem FROM espessuras_personalizadas 
        WHERE usuario_id = ?`;
    const [results] = await db.query(query, [req.user.id]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/thicknesses", authenticateToken, async (req, res) => {
  const { value } = req.body;
  if (!value) return res.status(400).json({ error: "Valor obrigatório" });
  try {
    const [result] = await db.query(
      "INSERT INTO espessuras_personalizadas (usuario_id, valor) VALUES (?, ?)",
      [req.user.id, value]
    );
    res.json({ id: result.insertId, valor: value });
  } catch (err) {
    res.status(500).json({ error: "Erro ao salvar" });
  }
});

app.put("/api/thicknesses/:id", authenticateToken, async (req, res) => {
  const { value } = req.body;
  try {
    const [result] = await db.query(
      "UPDATE espessuras_personalizadas SET valor = ? WHERE id = ? AND usuario_id = ?",
      [value, req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Não encontrado" });
    res.json({ message: "Atualizado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/thicknesses/:id", authenticateToken, async (req, res) => {
  try {
    const [result] = await db.query(
      "DELETE FROM espessuras_personalizadas WHERE id = ? AND usuario_id = ?",
      [req.params.id, req.user.id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: "Não encontrado" });
    res.json({ message: "Removido" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🔥 Servidor Seguro rodando na porta ${PORT}`);
});