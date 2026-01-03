require("dotenv").config();
const express = require("express");
const cors = require("cors");
const db = require("./db.cjs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

// 1. CONFIGURAÇÕES
app.use(cors());
app.use(express.json({ limit: "50mb" }));
const JWT_SECRET =
  process.env.JWT_SECRET || "segredo-super-secreto-do-nesting-app";

// ==========================================================
// 2. ROTAS
// ==========================================================

// --- ROTA DE LOGIN (Corrigida e Blindada) ---
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    // 1. Busca o usuário pelo e-mail
    const [rows] = await db.query(
      "SELECT id, nome, email, senha_hash, empresa_id, plano, cargo, status FROM usuarios WHERE email = ?",
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Usuário não encontrado" });
    }

    const user = rows[0];

    // 2. Verifica a senha
    const validPassword = await bcrypt.compare(password, user.senha_hash);
    if (!validPassword) {
      return res.status(401).json({ error: "Senha incorreta" });
    }

    // 3. Verifica se o usuário tem empresa vinculada
    if (!user.empresa_id) {
      console.warn(
        `ALERTA: Usuário ${user.email} logou sem empresa vinculada.`
      );
      // Opcional: Bloquear login ou permitir com restrições.
      // Vamos permitir, mas o Token ficará sem ID e o painel vai dar 403 (esperado).
    }

    // 4. GERA O TOKEN
    const token = jwt.sign(
      {
        id: user.id,
        empresa_id: user.empresa_id,
        plano: user.plano,
        cargo: user.cargo,
      },
      process.env.JWT_SECRET || "SEGREDO_FIXO_PARA_TESTE_123",
      { expiresIn: "24h" }
    );

    // 5. Retorna tudo para o Frontend
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

// --- SALVAR PEÇAS (Regra: 30 Dias Garantidos + Teto de 30 Peças) ---
app.post("/api/pecas", authenticateToken, async (req, res) => {
  const parts = req.body;
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;

  if (!Array.isArray(parts) || parts.length === 0)
    return res.status(400).json({ error: "Lista vazia." });

  if (!empresaId)
    return res.status(403).json({ error: "Usuário não vinculado." });

  try {
    // 1. BUSCAR DADOS DO PLANO
    const [empRows] = await db.query(
      "SELECT trial_start_date, subscription_status, max_parts FROM empresas WHERE id = ?",
      [empresaId]
    );

    if (empRows.length === 0)
      return res.status(403).json({ error: "Empresa não encontrada." });

    const empresa = empRows[0];

    // =================================================================================
    // VERIFICAÇÃO 1: O TRIAL JÁ EXPIROU? (Data Limite)
    // =================================================================================
    if (empresa.subscription_status === "trial") {
      const now = new Date();
      const start = new Date(empresa.trial_start_date);

      // Calcula dias corridos
      const diffTime = Math.abs(now - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays > 30) {
        return res.status(403).json({
          error: `SEU TRIAL EXPIROU! Os 30 dias de teste acabaram. Para continuar salvando e acessando seus projetos, assine o Plano Premium.`,
        });
      }
    }

    // =================================================================================
    // VERIFICAÇÃO 2: ESTOROU A CAPACIDADE? (Limite de peças)
    // =================================================================================
    if (empresa.max_parts !== null) {
      // Conta quantas peças já existem no banco
      const [countRows] = await db.query(
        "SELECT COUNT(*) as total FROM pecas_engenharia WHERE empresa_id = ?",
        [empresaId]
      );
      const currentTotal = countRows[0].total;
      const newTotal = currentTotal + parts.length;

      // Se tentar salvar mais do que o permitido
      if (newTotal > empresa.max_parts) {
        return res.status(403).json({
          error: `CAPACIDADE ATINGIDA! Você já usou ${currentTotal} de ${empresa.max_parts} peças do seu Trial. Para salvar mais peças ilimitadas, faça o upgrade agora.`,
        });
      }
    }

    // =================================================================================
    // SUCESSO: SALVA NO BANCO
    // =================================================================================
    const sql = `
      INSERT INTO pecas_engenharia 
      (id, usuario_id, empresa_id, nome_arquivo, pedido, op, material, espessura, autor, quantidade, cliente, 
      largura, altura, area_bruta, geometria, blocos_def, status, tipo_producao)
      VALUES ?
    `;
    const values = parts.map((p) => [
      p.id,
      usuarioId,
      empresaId,
      p.name,
      p.pedido || null,
      p.op || null,
      p.material,
      p.espessura,
      p.autor || null,
      p.quantity || 1,
      p.cliente || null,
      p.width,
      p.height,
      p.grossArea,
      JSON.stringify(p.entities),
      JSON.stringify(p.blocks || {}),
      "AGUARDANDO", // <--- A VÍRGULA AQUI É OBRIGATÓRIA
      p.tipo_producao || "NORMAL", // Nova linha
    ]);

    const [result] = await db.query(sql, [values]);   

    res.status(201).json({
      message: "Peças salvas com sucesso!",
      count: result.affectedRows,
    });
  } catch (error) {
    console.error("Erro ao salvar:", error);
    res.status(500).json({ error: "Erro interno ao processar." });
  }
});


// --- NOVO: VERIFICAR DUPLICIDADE DE PEÇAS (Pedido + Nome) ---
app.post("/api/pecas/verificar-existencia", authenticateToken, async (req, res) => {
  const { itens } = req.body; // Espera array de { pedido, nome }
  const empresaId = req.user.empresa_id;

  if (!itens || !Array.isArray(itens) || itens.length === 0) {
    return res.json({ duplicadas: [] });
  }

  try {
    // Monta uma query dinâmica para verificar vários pares ao mesmo tempo
    // Ex: WHERE empresa_id = X AND ((pedido = 'A' AND nome_arquivo = 'B') OR (pedido = 'C' AND ...))
    const conditions = itens.map(() => "(pedido = ? AND nome_arquivo = ?)").join(" OR ");
    const values = [empresaId];
    
    itens.forEach(item => {
      values.push(item.pedido, item.nome);
    });

    const sql = `
      SELECT pedido, nome_arquivo 
      FROM pecas_engenharia 
      WHERE empresa_id = ? AND (${conditions})
    `;

    const [rows] = await db.query(sql, values);

    // Retorna a lista de peças que JÁ EXISTEM no banco
    res.json({ duplicadas: rows });

  } catch (error) {
    console.error("Erro na verificação de existência:", error);
    res.status(500).json({ error: "Erro ao verificar duplicidade." });
  }
});

// --- BUSCAR PEÇAS (Todos da empresa veem) ---
app.get("/api/pecas/buscar", authenticateToken, async (req, res) => {
  const { pedido } = req.query;
  const empresaId = req.user.empresa_id;

  if (!pedido) return res.status(400).json({ error: "Falta pedido." });

  const pedidosArray = pedido
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  try {
    const sql = `SELECT * FROM pecas_engenharia WHERE pedido IN (?) AND empresa_id = ? AND status = 'AGUARDANDO'`;
    const [rows] = await db.query(sql, [pedidosArray, empresaId]);

    if (rows.length === 0)
      return res.status(404).json({ message: "Não encontrado ou sem peças pendentes" });

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
      entities:
        typeof row.geometria === "string"
          ? JSON.parse(row.geometria)
          : row.geometria,
      blocks:
        typeof row.blocos_def === "string"
          ? JSON.parse(row.blocos_def)
          : row.blocos_def || {},
      dataCadastro: row.data_cadastro,
      tipo_producao: row.tipo_producao,
    }));

    res.json(formattedParts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- NOVO: Endpoint para o Painel de Assinatura (Frontend consome isso) ---
app.get("/api/subscription/status", authenticateToken, async (req, res) => {
  console.log("DEBUG TOKEN:", req.user);
  try {
    const empresaId = req.user.empresa_id;

    // 1. Busca dados da empresa
    // CORREÇÃO AQUI: Adicionado 'plano' no SELECT
    const [empresaRows] = await db.query(
      "SELECT plano, trial_start_date, subscription_status, subscription_end_date, max_parts, max_users FROM empresas WHERE id = ?",
      [empresaId]
    );
    const empresa = empresaRows[0];

    // 2. Conta quantas peças essa empresa já usou
    const [countRows] = await db.query(
      "SELECT COUNT(*) as total FROM pecas_engenharia WHERE empresa_id = ?",
      [empresaId]
    );
    const partsUsed = countRows[0].total;

    // 3. Conta quantos usuários essa empresa tem
    const [userCountRows] = await db.query(
      "SELECT COUNT(*) as total FROM usuarios WHERE empresa_id = ?",
      [empresaId]
    );
    const usersUsed = userCountRows[0].total;

    // 4. Calcula dias restantes (Lógica Amigável)
    let daysLeft = 0;
    if (empresa.subscription_status === "trial") {
      const now = new Date();
      const start = new Date(empresa.trial_start_date);
      const expirationDate = new Date(start);
      expirationDate.setDate(expirationDate.getDate() + 30);

      const timeLeftMs = expirationDate - now;
      daysLeft = Math.ceil(timeLeftMs / (1000 * 60 * 60 * 24));
      daysLeft = Math.max(0, daysLeft);
    }

    // CORREÇÃO AQUI: Retorna o nome real do plano se não for trial
    res.json({
      status: empresa.subscription_status,
      plan:
        empresa.subscription_status === "trial"
          ? "Teste Gratuito"
          : empresa.plano || "Plano Premium", // Usa o nome real do banco
      parts: { used: partsUsed, limit: empresa.max_parts },
      users: { used: usersUsed, limit: empresa.max_users },
      daysLeft: daysLeft,
    });
  } catch (error) {
    console.error("Erro subs:", error);
    res.status(500).json({ error: "Erro ao buscar assinatura" });
  }
});

// --- ROTA DE CADASTRO (SIGN UP) ---
app.post("/api/register", async (req, res) => {
  const { nome, email, password, nomeEmpresa } = req.body;

  if (!nome || !email || !password || !nomeEmpresa) {
    return res.status(400).json({ error: "Todos os campos são obrigatórios." });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Verifica se o email já existe
    const [existingUser] = await connection.query(
      "SELECT id FROM usuarios WHERE email = ?",
      [email]
    );
    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(400).json({ error: "Este e-mail já está cadastrado." });
    }

    // 2. Cria a EMPRESA (Trial de 30 dias)
    const empresaId = crypto.randomUUID();

    await connection.query(
      `
            INSERT INTO empresas (id, nome, plano, subscription_status, max_parts, max_users, trial_start_date)
            VALUES (?, ?, 'free', 'trial', 50, 1, NOW())
        `,
      [empresaId, nomeEmpresa]
    );

    // 3. Criptografa a senha
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(password, salt);

    // 4. Cria o USUÁRIO (Dono da empresa)
    const usuarioId = crypto.randomUUID();

    await connection.query(
      `
            INSERT INTO usuarios (id, nome, email, senha_hash, plano, status, empresa_id, cargo)
            VALUES (?, ?, ?, ?, 'free', 'ativo', ?, 'admin')
        `,
      [usuarioId, nome, email, senhaHash, empresaId]
    );

    await connection.commit();

    res.status(201).json({
      message: "Cadastro realizado com sucesso! Faça login para começar.",
    });
  } catch (error) {
    await connection.rollback();
    console.error("Erro no cadastro:", error);
    res.status(500).json({ error: "Erro ao criar conta." });
  } finally {
    connection.release();
  }
});

// --- MIDDLEWARE DE AUTENTICAÇÃO ---
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (token == null) {
    console.log("DEBUG: Token não fornecido no cabeçalho.");
    return res.sendStatus(401);
  }

  jwt.verify(token, "SEGREDO_FIXO_PARA_TESTE_123", (err, user) => {
    if (err) {
      console.log("DEBUG: Erro ao verificar token:", err.message);
      return res.sendStatus(403);
    }

    if (!user.empresa_id) {
      console.log("DEBUG: ALERTA VERMELHO - Token válido, mas SEM empresa_id!");
    }

    req.user = user;
    next();
  });
}

// --- ROTA DE LISTA DE PEDIDOS DISPONÍVEIS ---
app.get("/api/pedidos/disponiveis", authenticateToken, async (req, res) => {
  const empresaId = req.user.empresa_id;
  try {
    // ALTERAÇÃO: Adicionado "AND status = 'AGUARDANDO'"
    // Isso garante que pedidos 100% "EM PRODUÇÃO" sumam da lista.
    const [rows] = await db.query(
      "SELECT DISTINCT pedido FROM pecas_engenharia WHERE empresa_id = ? AND status = 'AGUARDANDO' AND pedido IS NOT NULL AND pedido != '' ORDER BY pedido DESC",
      [empresaId]
    );

    const pedidos = rows.map((r) => r.pedido);
    res.json(pedidos);
  } catch (error) {
    console.error("Erro ao buscar lista de pedidos:", error);
    res.status(500).json({ error: "Erro ao buscar lista de pedidos." });
  }
});

// --- ROTA: REGISTRAR PRODUÇÃO (ATUALIZADA COM MOTOR) ---
app.post("/api/producao/registrar", authenticateToken, async (req, res) => {
  // 1. Recebemos 'motor' do body agora
  const { chapaIndex, aproveitamento, densidade, itens, motor } = req.body;

  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;
  const plano = req.user.plano;

  // Validação de Plano (Mantida)
  if (
    plano !== "Premium Dev" &&
    plano !== "Premium" &&
    plano !== "Corporativo"
  ) {
    return res
      .status(403)
      .json({ error: "Plano não permite registro histórico." });
  }

  if (!itens || itens.length === 0) {
    return res.status(400).json({ error: "Nenhum item informado." });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 2. BUSCA INTELIGENTE (Mantida)
    let materialReal = "Desconhecido";
    let espessuraReal = "N/A";

    const primeiraPecaId = itens[0].id;
    const [pecaRows] = await connection.query(
      "SELECT material, espessura FROM pecas_engenharia WHERE id = ? AND empresa_id = ?",
      [primeiraPecaId, empresaId]
    );
    if (pecaRows.length > 0) {
      materialReal = pecaRows[0].material;
      espessuraReal = pecaRows[0].espessura;
    }

    // 3. Grava o Histórico COM O MOTOR
    const [result] = await connection.query(
      `INSERT INTO producao_historico 
       (empresa_id, usuario_id, data_producao, chapa_index, aproveitamento, densidade, material, espessura, motor) 
       VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?)`,
      [
        empresaId,
        usuarioId,
        chapaIndex,
        aproveitamento,
        densidade || aproveitamento,
        materialReal,
        espessuraReal,
        motor || "Smart Nest", // <--- NOVO CAMPO INSERIDO AQUI
      ]
    );

    const producaoId = result.insertId;

    // 4. Salva os Itens (Mantido)
    const values = itens.map((item) => [
      producaoId,
      item.id,
      item.quantidade || item.qtd,
      item.tipo_producao || 'NORMAL'
    ]); // Garante compatibilidade de nome
    await connection.query(
      `INSERT INTO producao_itens (producao_id, peca_original_id, quantidade, tipo_producao) VALUES ?`,
      [values]
    );

    // =================================================================================
    const idsParaAtualizar = itens.map(i => i.id);
    
    if (idsParaAtualizar.length > 0) {
        // Atualiza o status para 'EM PRODUÇÃO' apenas para as peças desta lista e desta empresa
        await connection.query(
            "UPDATE pecas_engenharia SET status = 'EM PRODUÇÃO' WHERE id IN (?) AND empresa_id = ?",
            [idsParaAtualizar, empresaId]
        );
    }
    // =================================================================================

    await connection.commit();
    res.json({
      message: "Produção registrada com sucesso!",
      detalhes: { material: materialReal, espessura: espessuraReal, motor },
    });
  } catch (error) {
    await connection.rollback();
    console.error("Erro ao registrar produção:", error);
    // Tratamento para evitar erro genérico se for duplicado (opcional, mas recomendado pelo hook novo)
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ error: "Duplicate entry for nesting signature" });
    }
    res.status(500).json({ error: "Erro ao salvar no banco." });
  } finally {
    connection.release();
  }
});

// ==========================================
//  ROTAS PARA MATERIAIS (CORRIGIDO PARA ASYNC/AWAIT)
// ==========================================

// 1. Buscar materiais (Universal + Custom)
app.get("/api/materials", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  console.log("DEBUG: Buscando materiais para", userId);

  try {
    const query = `
            SELECT id, nome, densidade, 'padrao' as origem FROM materiais_padrao
            UNION ALL
            SELECT id, nome, densidade, 'custom' as origem FROM materiais_personalizados 
            WHERE usuario_id = ? COLLATE utf8mb4_unicode_ci
            ORDER BY nome ASC
        `;

    // CORREÇÃO: Usando await e desestruturando [rows]
    const [results] = await db.query(query, [userId]);

    console.log("DEBUG: Materiais encontrados:", results.length);
    res.json(results);
  } catch (err) {
    console.error("ERRO CRÍTICO MATERIAIS:", err);
    res.status(500).json({ error: err.message });
  }
});

// 2. Adicionar novo material
app.post("/api/materials", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { name, density } = req.body;

  if (!name) return res.status(400).json({ error: "Nome obrigatório" });
  const densidadeValor = density ? parseFloat(density) : 7.85;

  try {
    const query =
      "INSERT INTO materiais_personalizados (usuario_id, nome, densidade) VALUES (?, ?, ?)";
    const [result] = await db.query(query, [userId, name, densidadeValor]);

    res.json({
      id: result.insertId,
      nome: name,
      densidade: densidadeValor,
      usuario_id: userId,
    });
  } catch (err) {
    console.error("Erro ao salvar material:", err);
    res.status(500).json({ error: "Erro ao salvar material" });
  }
});

// 2.1. Editar Material (NOVO)
app.put("/api/materials/:id", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const materialId = req.params.id;
  const { name, density } = req.body;

  if (!name) return res.status(400).json({ error: "Nome obrigatório" });
  const densidadeValor = density ? parseFloat(density) : 7.85;

  try {
    // Garante que só edita se for DO USUÁRIO (usuario_id = ?)
    const query =
      "UPDATE materiais_personalizados SET nome = ?, densidade = ? WHERE id = ? AND usuario_id = ?";
    const [result] = await db.query(query, [
      name,
      densidadeValor,
      materialId,
      userId,
    ]);

    if (result.affectedRows === 0)
      return res
        .status(404)
        .json({ error: "Material não encontrado ou não permitido." });

    res.json({ message: "Material atualizado!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Deletar material
app.delete("/api/materials/:id", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const materialId = req.params.id;

  try {
    const query =
      "DELETE FROM materiais_personalizados WHERE id = ? AND usuario_id = ?";
    const [result] = await db.query(query, [materialId, userId]);

    if (result.affectedRows === 0)
      return res
        .status(404)
        .json({ error: "Não encontrado ou não autorizado." });
    res.json({ message: "Material removido" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
//  ROTAS PARA ESPESSURAS (CORRIGIDO PARA ASYNC/AWAIT)
// ==========================================

// 4. Buscar espessuras (Universal + Custom)
app.get("/api/thicknesses", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  console.log("DEBUG: Buscando espessuras para", userId);

  try {
    const query = `
            SELECT id, valor, 'padrao' as origem FROM espessuras_padrao
            UNION ALL
            SELECT id, valor, 'custom' as origem FROM espessuras_personalizadas 
            WHERE usuario_id = ? COLLATE utf8mb4_unicode_ci
        `;

    // CORREÇÃO: Usando await
    const [results] = await db.query(query, [userId]);

    console.log("DEBUG: Espessuras encontradas:", results.length);
    res.json(results);
  } catch (err) {
    console.error("ERRO CRÍTICO ESPESSURAS:", err);
    res.status(500).json({ error: err.message });
  }
});

// 5. Adicionar espessura
app.post("/api/thicknesses", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { value } = req.body;

  if (!value) return res.status(400).json({ error: "Valor obrigatório" });

  try {
    const query =
      "INSERT INTO espessuras_personalizadas (usuario_id, valor) VALUES (?, ?)";
    const [result] = await db.query(query, [userId, value]);

    res.json({ id: result.insertId, valor: value, usuario_id: userId });
  } catch (err) {
    console.error("Erro ao salvar espessura:", err);
    res.status(500).json({ error: "Erro ao salvar espessura" });
  }
});

// 5.1. Editar Espessura (NOVO)
app.put("/api/thicknesses/:id", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const thicknessId = req.params.id;
  const { value } = req.body;

  if (!value) return res.status(400).json({ error: "Valor obrigatório" });

  try {
    const query =
      "UPDATE espessuras_personalizadas SET valor = ? WHERE id = ? AND usuario_id = ?";
    const [result] = await db.query(query, [value, thicknessId, userId]);

    if (result.affectedRows === 0)
      return res
        .status(404)
        .json({ error: "Espessura não encontrada ou não permitida." });

    res.json({ message: "Espessura atualizada!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Deletar espessura
app.delete("/api/thicknesses/:id", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const id = req.params.id;

  try {
    const query =
      "DELETE FROM espessuras_personalizadas WHERE id = ? AND usuario_id = ?";
    const [result] = await db.query(query, [id, userId]);

    if (result.affectedRows === 0)
      return res
        .status(404)
        .json({ error: "Não encontrado ou não autorizado." });
    res.json({ message: "Espessura removida" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🔥 Servidor Seguro rodando na porta ${PORT}`);
});
