require("dotenv").config();
const express = require("express");
const path = require("path"); // <--- ADICIONE ESTA LINHA
const cors = require("cors");
const db = require("./db.cjs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const paymentRoutes = require("./routes/payment.routes.cjs");
const crypto = require("crypto"); // Necessário para gerar UUIDs

const app = express();

app.use(cors());

// Configuração híbrida: JSON normal para tudo, mas guarda o Raw Body para o Webhook do Stripe
app.use(
  express.json({
    limit: "50mb",
    verify: (req, res, buf) => {
      // Se a URL começar com /api/webhook, salvamos o buffer bruto
      if (req.originalUrl.startsWith("/api/webhook")) {
        req.rawBody = buf.toString();
      }
    },
  }),
);

// ==========================================
// ROTAS DE PAGAMENTO
// ==========================================
app.use("/api/payment", paymentRoutes);

// ==========================================
// CONFIGURAÇÃO CENTRALIZADA DA CHAVE SECRETA
// (Isso resolve o erro de invalid signature)
// ==========================================
const JWT_SECRET =
  process.env.JWT_SECRET || "segredo-super-secreto-do-nesting-app";

// ==========================================================
// MIDDLEWARE DE AUTENTICAÇÃO (Versão Diagnóstico Anti-Looping)
// ==========================================================
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // [cite: 6]

  if (token == null) {
    console.log("❌ AUTH ERROR: Nenhum token recebido no header.");
    return res.sendStatus(401); // [cite: 7]
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log("🚫 AUTH FALHOU NA ROTA:", req.originalUrl);

      // DIAGNÓSTICO PRECISO
      if (err.name === "TokenExpiredError") {
        console.log(
          "   Motivo: ⏳ TOKEN EXPIRADO (Expired At: " + err.expiredAt + ")",
        );
        // Se expirar 1 segundo após o login, o relógio do servidor está errado.
      } else if (err.name === "JsonWebTokenError") {
        console.log(
          "   Motivo: 🔓 ASSINATURA INVÁLIDA (O JWT_SECRET mudou ou o token veio corrompido)",
        );
        console.log(
          "   Token recebido (início):",
          token.substring(0, 15) + "...",
        );
      } else {
        console.log("   Motivo: " + err.message);
      }

      return res.sendStatus(403); //
    }

    req.user = user;
    next();
  });
}

// ==========================================================
// ROTA WEBHOOK DO STRIPE (AUTOMAÇÃO DE PAGAMENTO)
// ==========================================================
app.post("/api/webhook", async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

  let event;

  try {
    if (!req.rawBody) throw new Error("Raw body não encontrado.");
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    console.error(`❌ Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const userEmail = session.customer_details.email;
    const amountTotal = session.amount_total; // Centavos

    console.log(
      `💰 Pagamento recebido de: ${userEmail} | Valor: ${amountTotal}`,
    );

    try {
      const connection = await db.getConnection();

      // Lógica de Planos
      let novoPlano = "Premium";
      let limiteUsuarios = 1;

      // Se pagou mais que o base ($24.90), é Corporativo
      if (amountTotal > 2490) {
        novoPlano = "Corporativo";
        // Cálculo: (Total - Base) / Preço Extra + 1 Admin
        const valorExtra = amountTotal - 2490;
        const usersExtras = Math.floor(valorExtra / 1200);
        limiteUsuarios = 1 + usersExtras;
      } else {
        // Se for Premium (não corporativo), defina o limite (ex: 500 ou ilimitado também)
        limitePecas = null;
      }

      console.log(
        `📊 Definindo plano: ${novoPlano} com ${limiteUsuarios} usuários.`,
      );

      // 1. Descobre a empresa do usuário
      const [users] = await connection.query(
        "SELECT empresa_id FROM usuarios WHERE email = ?",
        [userEmail],
      );

      if (users.length > 0) {
        const empresaId = users[0].empresa_id;

        // 2. Atualiza a EMPRESA
        await connection.query(
          `
                UPDATE empresas 
                SET plano = ?, subscription_status = 'active', max_users = ? 
                WHERE id = ?`,
          [novoPlano, limiteUsuarios, limitePecas, empresaId],
        );

        // 3. Atualiza o ADMIN
        await connection.query(
          `
                UPDATE usuarios SET plano = ? WHERE email = ?`,
          [novoPlano, userEmail],
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

  res.json({ received: true });
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
      [email],
    );

    if (rows.length === 0)
      return res.status(401).json({ error: "Usuário não encontrado" });

    const user = rows[0];

    const validPassword = await bcrypt.compare(password, user.senha_hash);
    if (!validPassword)
      return res.status(401).json({ error: "Senha incorreta" });

    // CORREÇÃO: Usando a constante JWT_SECRET
    const token = jwt.sign(
      {
        id: user.id,
        empresa_id: user.empresa_id,
        plano: user.plano,
        cargo: user.cargo,
      },
      JWT_SECRET,
      { expiresIn: "30d" },
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
      [userId],
    );

    if (rows.length === 0)
      return res.status(404).json({ error: "Usuário não encontrado." });

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
      { expiresIn: "30d" },
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

    const [existingUser] = await connection.query(
      "SELECT id FROM usuarios WHERE email = ?",
      [email],
    );
    if (existingUser.length > 0) {
      await connection.rollback();
      return res.status(400).json({ error: "Este e-mail já está cadastrado." });
    }

    const empresaId = crypto.randomUUID();
    await connection.query(
      `INSERT INTO empresas (id, nome, plano, subscription_status, max_parts, max_users, trial_start_date)
       VALUES (?, ?, 'free', 'trial', 50, 1, NOW())`,
      [empresaId, nomeEmpresa],
    );

    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(password, salt);

    const usuarioId = crypto.randomUUID();
    await connection.query(
      `INSERT INTO usuarios (id, nome, email, senha_hash, plano, status, empresa_id, cargo)
       VALUES (?, ?, ?, ?, 'free', 'ativo', ?, 'admin')`,
      [usuarioId, nome, email, senhaHash, empresaId],
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
      [empresaId],
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

  if (usuarioCargo !== "admin") {
    return res
      .status(403)
      .json({ error: "Apenas administradores podem adicionar membros." });
  }
  if (!nome || !email || !password) {
    return res.status(400).json({ error: "Preencha todos os campos." });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [empRows] = await connection.query(
      "SELECT max_users, plano FROM empresas WHERE id = ?",
      [empresaId],
    );
    if (empRows.length === 0) throw new Error("Empresa não encontrada");
    const empresa = empRows[0];
    const limiteUsuarios = empresa.max_users || 1;

    const [countRows] = await connection.query(
      "SELECT COUNT(*) as total FROM usuarios WHERE empresa_id = ?",
      [empresaId],
    );
    const totalAtual = countRows[0].total;

    if (totalAtual >= limiteUsuarios) {
      await connection.rollback();
      return res.status(403).json({
        error: "LIMITE ATINGIDO",
        message: `Seu plano atual (${empresa.plano}) permite apenas ${limiteUsuarios} usuários.`,
      });
    }

    const [existing] = await connection.query(
      "SELECT id FROM usuarios WHERE email = ?",
      [email],
    );
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
      [novoId, nome, email, senhaHash, empresaId],
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

  if (requesterCargo !== "admin")
    return res.status(403).json({ error: "Sem permissão." });
  if (targetId === req.user.id)
    return res.status(400).json({ error: "Não exclua a si mesmo aqui." });

  try {
    const [result] = await db.query(
      "DELETE FROM usuarios WHERE id = ? AND empresa_id = ?",
      [targetId, empresaId],
    );

    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ error: "Usuário não encontrado na sua equipe." });
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

  if (!Array.isArray(parts) || parts.length === 0)
    return res.status(400).json({ error: "Lista vazia." });

  try {
    const [empRows] = await db.query(
      "SELECT trial_start_date, subscription_status, max_parts FROM empresas WHERE id = ?",
      [empresaId],
    );
    const empresa = empRows[0];

    // Validação Trial
    if (empresa.subscription_status === "trial") {
      const now = new Date();
      const start = new Date(empresa.trial_start_date);
      const diffTime = Math.abs(now - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 30)
        return res.status(403).json({ error: "SEU TRIAL EXPIROU!" });
    }

    // Validação Limite Peças
    if (empresa.max_parts !== null) {
      const [countRows] = await db.query(
        "SELECT COUNT(*) as total FROM pecas_engenharia WHERE empresa_id = ?",
        [empresaId],
      );
      const currentTotal = countRows[0].total;
      if (currentTotal + parts.length > empresa.max_parts) {
        // Use 409 (Conflict) ou 429 (Too Many Requests) para NÃO deslogar o usuário
        return res.status(409).json({
          error: "CAPACIDADE ATINGIDA!",
          message: `Seu plano permite ${empresa.max_parts} peças. Você já tem ${currentTotal}.`,
        });
      }
    }

    const sql = `
      INSERT INTO pecas_engenharia 
      (id, usuario_id, empresa_id, nome_arquivo, pedido, op, material, espessura, autor, quantidade, cliente, 
      largura, altura, area_bruta, geometria, blocos_def, status, tipo_producao, is_rotation_locked)
      VALUES ?
    `;

    const values = parts.map((p) => [
      crypto.randomUUID(),
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
      "AGUARDANDO",
      p.tipo_producao || "NORMAL",
      p.isRotationLocked ? 1 : 0, // <--- AQUI ESTA A CORREÇÃO
    ]);

    const [result] = await db.query(sql, [values]);
    res
      .status(201)
      .json({ message: "Peças salvas!", count: result.affectedRows });
  } catch (error) {
    console.error(error);
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "Duplicidade Detectada!",
        message:
          "Esta peça já existe neste pedido com este mesmo Tipo de Produção. Altere o tipo para salvar novamente.",
      });
    }
    // ---------------------

    res.status(500).json({ error: "Erro interno." });
  }
});

// --- VERIFICAR DUPLICIDADE ---
app.post(
  "/api/pecas/verificar-existencia",
  authenticateToken,
  async (req, res) => {
    const { itens } = req.body;
    const empresaId = req.user.empresa_id;

    if (!itens || !Array.isArray(itens) || itens.length === 0)
      return res.json({ duplicadas: [] });

    try {
      const conditions = itens
        .map(() => "(pedido = ? AND nome_arquivo = ?)")
        .join(" OR ");
      const values = [empresaId];
      itens.forEach((item) => values.push(item.pedido, item.nome));

      const sql = `SELECT pedido, nome_arquivo FROM pecas_engenharia WHERE empresa_id = ? AND (${conditions})`;
      const [rows] = await db.query(sql, values);
      res.json({ duplicadas: rows });
    } catch (error) {
      res.status(500).json({ error: "Erro ao verificar duplicidade." });
    }
  },
);

// --- BUSCAR PEÇAS (COM FILTRO DE OP) ---
app.get("/api/pecas/buscar", authenticateToken, async (req, res) => {
  const { pedido, op } = req.query; // <--- Agora aceita 'op'
  const empresaId = req.user.empresa_id;

  if (!pedido) return res.status(400).json({ error: "Falta pedido." });

  const pedidosArray = pedido
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  // Tratamento das OPs (se vierem)
  let opsArray = [];
  if (op) {
    opsArray = op
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }

  try {
    // Nova query: Seleciona apenas o registro mais recente de cada arquivo para evitar duplicidade de quantidade
   let sql = `
      SELECT * FROM pecas_engenharia 
      WHERE pedido IN (?) 
        AND empresa_id = ? 
        AND status = 'AGUARDANDO'
        AND (nome_arquivo, data_cadastro) IN (
          SELECT nome_arquivo, MAX(data_cadastro) 
          FROM pecas_engenharia 
          WHERE pedido IN (?) 
          AND empresa_id = ?  /* <--- CORREÇÃO AQUI */
          GROUP BY nome_arquivo
        )
    `;

    // Note que passamos 'pedidosArray' duas vezes: uma para a query principal e outra para a subquery
    const params = [pedidosArray, empresaId, pedidosArray, empresaId];

    // Mantém o filtro de OPs se elas existirem
    if (opsArray.length > 0) {
      sql += ` AND op IN (?)`;
      params.push(opsArray);
    }

    const [rows] = await db.query(sql, params);

    if (rows.length === 0)
      return res.status(404).json({ message: "Não encontrado" });

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
      isRotationLocked: !!row.is_rotation_locked, // <--- ADICIONE ESTA LINHA
    }));

    res.json(formattedParts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- LISTAR PEDIDOS DISPONÍVEIS (COM BLOQUEIO E TIMEOUT) ---
app.get("/api/pedidos/disponiveis", authenticateToken, async (req, res) => {
  const empresaId = req.user.empresa_id;
  const usuarioId = req.user.id;

  // Tempo limite em minutos para considerar um bloqueio "expirado" (ex: 30 min)
  const LOCK_TIMEOUT_MINUTES = 30;

  try {
    // 1. Buscamos Pedido, OP e dados de bloqueio + Nome do usuário que bloqueou
    const sql = `
      SELECT DISTINCT 
        pe.pedido, 
        pe.op, 
        pe.locked_by, 
        pe.locked_at,
        u.nome as locker_name
      FROM pecas_engenharia pe
      LEFT JOIN usuarios u ON pe.locked_by = u.id
      WHERE pe.empresa_id = ? 
        AND pe.status = 'AGUARDANDO' 
        AND pe.pedido IS NOT NULL 
        AND pe.pedido != '' 
      ORDER BY pe.pedido DESC, pe.op ASC
    `;

    const [rows] = await db.query(sql, [empresaId]);

    // 2. Agrupamos e verificamos a validade do bloqueio
    const mapaPedidos = {};
    const now = new Date();

    rows.forEach((row) => {
      // Verifica se está bloqueado e se o bloqueio ainda é válido
      let isLocked = false;
      let lockedByInfo = null;

      if (row.locked_by) {
        const lockTime = new Date(row.locked_at);
        const diffMinutes = (now - lockTime) / 1000 / 60;

        // Se o bloqueio for recente (< 30 min), consideramos válido
        if (diffMinutes < LOCK_TIMEOUT_MINUTES) {
          // Se fui EU que bloqueiei, para mim aparece como disponível (ou marcado)
          // Se foi OUTRO, aparece como bloqueado
          if (row.locked_by !== usuarioId) {
            isLocked = true;
            lockedByInfo = row.locker_name || "Outro usuário";
          }
        }
      }

      if (!mapaPedidos[row.pedido]) {
        mapaPedidos[row.pedido] = {
          ops: new Set(),
          // Se qualquer parte do pedido estiver bloqueada, marcamos o pedido como "com alertas"
          // Mas aqui vamos focar na granularidade da OP
        };
      }

      // Adicionamos a OP com seu status individual
      if (row.op) {
        mapaPedidos[row.pedido].ops.add(
          JSON.stringify({
            name: row.op,
            isLocked: isLocked,
            lockedBy: lockedByInfo,
          }),
        );
      }
    });

    // 3. Convertemos para array final
    const resultado = Object.keys(mapaPedidos).map((pedido) => {
      const opsData = Array.from(mapaPedidos[pedido].ops).map((s) =>
        JSON.parse(s),
      );
      return {
        pedido,
        ops: opsData, // Agora é uma lista de objetos: { name: "OP1", isLocked: true... }
      };
    });

    // Ordena
    resultado.sort((a, b) =>
      b.pedido.localeCompare(a.pedido, undefined, { numeric: true }),
    );

    res.json(resultado);
  } catch (error) {
    console.error("Erro ao buscar pedidos:", error);
    res.status(500).json({ error: "Erro ao buscar pedidos." });
  }
});

// --- BLOQUEAR (RESERVAR) PEDIDOS/OPS ---
app.post("/api/pedidos/lock", authenticateToken, async (req, res) => {
  const { pedido, op } = req.body; // Recebe string do pedido e string (ou array) de OPs
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;

  if (!pedido) return res.status(400).json({ error: "Pedido obrigatório." });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Verifica se já existe algo bloqueado por OUTRA pessoa recentemente
    // 1. DEFINIÇÃO DA QUERY (REMOVA O 'FOR UPDATE' DAQUI DE DENTRO)
    let checkSql = `
      SELECT locked_by, locked_at, u.nome 
      FROM pecas_engenharia pe
      LEFT JOIN usuarios u ON pe.locked_by = u.id
      WHERE pe.empresa_id = ? 
        AND pe.pedido = ?
        AND pe.locked_by IS NOT NULL 
        AND pe.locked_by != ?
        AND pe.locked_at > DATE_SUB(NOW(), INTERVAL 30 MINUTE)
    `;

    const params = [empresaId, pedido, usuarioId];

    // Se tiver OPs específicas, filtra também
    let opsArray = [];
    if (op) {
      opsArray = Array.isArray(op) ? op : op.split(",").map((s) => s.trim());
      if (opsArray.length > 0) {
        checkSql += ` AND pe.op IN (?)`;
        params.push(opsArray);
      }
    }

    // 2. EXECUÇÃO (O 'FOR UPDATE' DEVE ENTRAR AQUI, NO FINAL DA STRING)
    // A ordem obrigatória do MySQL é: WHERE ... LIMIT ... FOR UPDATE
    const [lockedRows] = await connection.query(
      checkSql + " LIMIT 1 FOR UPDATE",
      params,
    );

    if (lockedRows.length > 0) {
      // JA ESTÁ BLOQUEADO!
      await connection.rollback();
      return res.status(409).json({
        error: "Bloqueado",
        message: `Este pedido/OP está sendo usado por ${lockedRows[0].nome || "outro usuário"} no momento.`,
      });
    }

    // 2. Se está livre, realiza o BLOQUEIO (Update)
    let updateSql = `
      UPDATE pecas_engenharia 
      SET locked_by = ?, locked_at = NOW()
      WHERE empresa_id = ? AND pedido = ?
    `;
    const updateParams = [usuarioId, empresaId, pedido];

    if (opsArray.length > 0) {
      updateSql += ` AND op IN (?)`;
      updateParams.push(opsArray);
    }

    await connection.query(updateSql, updateParams);

    await connection.commit();
    res.json({ message: "Reserva realizada com sucesso." });
  } catch (error) {
    await connection.rollback();
    console.error("Erro ao bloquear:", error);
    res.status(500).json({ error: "Erro ao tentar reservar pedido." });
  } finally {
    connection.release();
  }
});

// --- DESBLOQUEAR PEDIDOS ---
app.post("/api/pedidos/unlock", authenticateToken, async (req, res) => {
  const { pedido, op } = req.body;
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;

  // Se não mandar pedido, desbloqueia TUDO desse usuário (útil para "Limpar Mesa" ou "Logout")
  try {
    let sql = `
      UPDATE pecas_engenharia 
      SET locked_by = NULL, locked_at = NULL
      WHERE empresa_id = ? AND locked_by = ?
    `;
    const params = [empresaId, usuarioId];

    if (pedido) {
      sql += ` AND pedido = ?`;
      params.push(pedido);
    }

    // Se quiser desbloquear OP específica (opcional)
    if (op) {
      const opsArray = Array.isArray(op) ? op : op.split(",");
      sql += ` AND op IN (?)`;
      params.push(opsArray);
    }

    await db.query(sql, params);
    res.json({ message: "Desbloqueado com sucesso." });
  } catch (error) {
    console.error("Erro ao desbloquear:", error);
    res.status(500).json({ error: "Erro ao liberar pedido." });
  }
});

// --- STATUS DA ASSINATURA ---
app.get("/api/subscription/status", authenticateToken, async (req, res) => {
  try {
    const empresaId = req.user.empresa_id;
    const [empresaRows] = await db.query(
      "SELECT plano, trial_start_date, subscription_status, subscription_end_date, max_parts, max_users FROM empresas WHERE id = ?",
      [empresaId],
    );
    const empresa = empresaRows[0];

    const [countRows] = await db.query(
      "SELECT COUNT(*) as total FROM pecas_engenharia WHERE empresa_id = ?",
      [empresaId],
    );
    const partsUsed = countRows[0].total;

    const [userCountRows] = await db.query(
      "SELECT COUNT(*) as total FROM usuarios WHERE empresa_id = ?",
      [empresaId],
    );
    const usersUsed = userCountRows[0].total;

    let daysLeft = 0;
    if (empresa.subscription_status === "trial") {
      const now = new Date();
      const start = new Date(empresa.trial_start_date);
      const expirationDate = new Date(start);
      expirationDate.setDate(expirationDate.getDate() + 30);
      daysLeft = Math.max(
        0,
        Math.ceil((expirationDate - now) / (1000 * 60 * 60 * 24)),
      );
    }

    res.json({
      status: empresa.subscription_status,
      plan:
        empresa.subscription_status === "trial"
          ? "Teste Gratuito"
          : empresa.plano || "Plano Premium",
      parts: { used: partsUsed, limit: empresa.max_parts },
      users: { used: usersUsed, limit: empresa.max_users },
      daysLeft: daysLeft,
    });
  } catch (error) {
    res.status(500).json({ error: "Erro ao buscar assinatura" });
  }
});

// ... (Mantenha os imports e configurações iniciais até a linha 99 do seu arquivo original)

// ==========================================
// 6. ROTAS DE DASHBOARD (ATUALIZADO)
// ==========================================

// [server.cjs] - Atualização da rota /api/dashboard/stats

app.get("/api/dashboard/stats", authenticateToken, async (req, res) => {
  const empresaId = req.user.empresa_id;
  const { startDate, endDate } = req.query;

  let dateFilterProducao = "";
  let dateFilterEngenharia = "";
  const params = [empresaId];

  // Configura os filtros de data
  if (startDate && endDate) {
    const start = `${startDate} 00:00:00`;
    const end = `${endDate} 23:59:59`;
    dateFilterProducao = "AND h.data_producao BETWEEN ? AND ?";
    dateFilterEngenharia = "AND pe.data_cadastro BETWEEN ? AND ?";
    params.push(start, end);
  } else {
    dateFilterProducao =
      "AND h.data_producao >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
    dateFilterEngenharia =
      "AND pe.data_cadastro >= DATE_SUB(NOW(), INTERVAL 30 DAY)";
  }

  try {
    const connection = await db.getConnection();

    // 1. ENTRADA NA ENGENHARIA
    const engenhariaQuery = `
      SELECT 
        u.nome as usuario,
        COUNT(DISTINCT pe.pedido) as qtd_pedidos_entrada,
        COUNT(*) as qtd_pecas_entrada
      FROM pecas_engenharia pe
      JOIN usuarios u ON pe.usuario_id = u.id
      WHERE pe.empresa_id = ? ${dateFilterEngenharia}
      GROUP BY u.nome
    `;

    // 2. PROCESSADOS NO NESTING
    const processadosQuery = `
      SELECT 
        u.nome as usuario,
        COUNT(DISTINCT pe.pedido) as qtd_pedidos_processados,
        COUNT(DISTINCT h.id) as qtd_chapas_geradas,
        AVG(h.aproveitamento) as eficiencia_media,
        AVG(h.consumo_chapa) as consumo_medio
      FROM producao_historico h
      JOIN usuarios u ON h.usuario_id = u.id
      LEFT JOIN producao_itens pi ON h.id = pi.producao_id
      LEFT JOIN pecas_engenharia pe ON pi.peca_original_id = pe.id
      WHERE h.empresa_id = ? ${dateFilterProducao}
      GROUP BY u.nome
    `;

    // 3. RELATÓRIO DE CHAPAS CONSUMIDAS (ATUALIZADO)
    // Agora agrupamos também por Largura e Altura
    const consumoQuery = `
      SELECT 
        material, 
        espessura,
        largura_chapa,
        altura_chapa,
        COUNT(*) as total_chapas,
        AVG(aproveitamento) as avg_aproveitamento,
        AVG(consumo_chapa) as avg_consumo,
        SUM(area_retalho) as total_retalho_m2
      FROM producao_historico h
      WHERE h.empresa_id = ? ${dateFilterProducao}
      GROUP BY material, espessura, largura_chapa, altura_chapa
      ORDER BY material ASC, espessura ASC, total_chapas DESC
    `;

    // Executa em paralelo
    const [rowsEngenharia] = await connection.query(engenhariaQuery, params);
    const [rowsProcessados] = await connection.query(processadosQuery, params);
    const [rowsConsumo] = await connection.query(consumoQuery, params);

    // 4. SALDO
    const totalEntrada = rowsEngenharia.reduce(
      (acc, curr) => acc + curr.qtd_pedidos_entrada,
      0,
    );
    const totalSaida = rowsProcessados.reduce(
      (acc, curr) => acc + curr.qtd_pedidos_processados,
      0,
    );

    connection.release();

    res.json({
      resumo: {
        totalEntrada,
        totalSaida,
        saldo: totalEntrada - totalSaida,
      },
      engenharia: rowsEngenharia,
      producao: rowsProcessados,
      estudoConsumo: rowsConsumo,
    });
  } catch (error) {
    console.error("Erro Dashboard:", error);
    res.status(500).json({ error: "Erro ao processar métricas avançadas" });
  }
});

// [server.cjs] - Atualização da rota /api/producao/registrar

app.post("/api/producao/registrar", authenticateToken, async (req, res) => {
  // RECEBENDO OS NOVOS DADOS DO FRONTEND
  const {
    chapaIndex,
    aproveitamento, // Este será o Global (Real)
    consumo, // NOVO: Consumo %
    retalhoLinear, // NOVO: mm
    areaRetalho, // NOVO: m²
    itens,
    motor,
    larguraChapa,
    alturaChapa,
  } = req.body;

  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;

  if (!itens || itens.length === 0)
    return res.status(400).json({ error: "Nenhum item informado." });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    let materialReal = "Desconhecido";
    let espessuraReal = 0;

    const [pecaRows] = await connection.query(
      "SELECT material, espessura FROM pecas_engenharia WHERE id = ? AND empresa_id = ?",
      [itens[0].id, empresaId],
    );
    if (pecaRows.length > 0) {
      materialReal = pecaRows[0].material;
      espessuraReal = pecaRows[0].espessura || "0";
    }

    // INSERT ATUALIZADO COM OS NOVOS CAMPOS
    const [result] = await connection.query(
      `INSERT INTO producao_historico 
       (empresa_id, usuario_id, data_producao, chapa_index, aproveitamento, densidade, material, espessura, motor, largura_chapa, altura_chapa, consumo_chapa, retalho_linear, area_retalho) 
       VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        empresaId,
        usuarioId,
        chapaIndex,
        aproveitamento, // Global
        7.85, // Densidade do MATERIAL (Aço), não do arranjo
        materialReal,
        espessuraReal,
        motor || "Smart Nest",
        larguraChapa || 0,
        alturaChapa || 0,
        consumo || 0, // NOVO
        retalhoLinear || 0, // NOVO
        areaRetalho || 0, // NOVO
      ],
    );

    // ... O restante do código (INSERT producao_itens, UPDATE status, commit) permanece igual ...
    const producaoId = result.insertId;

    const values = itens.map((item) => [
      producaoId,
      item.id,
      item.quantidade || item.qtd,
      item.tipo_producao || "NORMAL",
    ]);

    await connection.query(
      `INSERT INTO producao_itens (producao_id, peca_original_id, quantidade, tipo_producao) VALUES ?`,
      [values],
    );

    const idsParaAtualizar = itens.map((i) => i.id);
    if (idsParaAtualizar.length > 0) {
      await connection.query(
        "UPDATE pecas_engenharia SET status = 'EM PRODUÇÃO' WHERE id IN (?) AND empresa_id = ?",
        [idsParaAtualizar, empresaId],
      );
    }

    await connection.commit();
    res.json({
      message: "Produção registrada!",
      detalhes: { material: materialReal, espessura: espessuraReal, motor },
    });
  } catch (error) {
    // ... (Bloco catch permanece igual) ...
    await connection.rollback();
    console.error(error);
    if (error.code === "ER_DUP_ENTRY")
      return res.status(409).json({ error: "Duplicate entry" });
    res.status(500).json({ error: "Erro ao salvar." });
  } finally {
    connection.release();
  }
});

// ==========================================
// ROTAS DE MATERIAIS (COMPARTILHADO NA EQUIPE)
// ==========================================

app.get("/api/materials", authenticateToken, async (req, res) => {
  try {
    const empresaId = req.user.empresa_id; // Pega o ID da empresa do token

    // Busca materiais padrão + materiais da EMPRESA do usuário
    const query = `
        SELECT id, nome, densidade, 'padrao' as origem FROM materiais_padrao
        UNION ALL
        SELECT id, nome, densidade, 'custom' as origem FROM materiais_personalizados 
        WHERE empresa_id = ? ORDER BY nome ASC`;

    const [results] = await db.query(query, [empresaId]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/materials", authenticateToken, async (req, res) => {
  const { name, density } = req.body;
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;

  if (!name) return res.status(400).json({ error: "Nome obrigatório" });

  try {
    // Insere vinculando à EMPRESA, mas mantemos o usuario_id para saber quem criou (opcional)
    const [result] = await db.query(
      "INSERT INTO materiais_personalizados (usuario_id, empresa_id, nome, densidade) VALUES (?, ?, ?, ?)",
      [usuarioId, empresaId, name, density || 7.85],
    );
    res.json({ id: result.insertId, nome: name, densidade: density || 7.85 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao salvar material." });
  }
});

app.put("/api/materials/:id", authenticateToken, async (req, res) => {
  const { name, density } = req.body;
  const empresaId = req.user.empresa_id;

  try {
    // Atualiza verificando se pertence à EMPRESA (qualquer um da empresa pode editar)
    const [result] = await db.query(
      "UPDATE materiais_personalizados SET nome = ?, densidade = ? WHERE id = ? AND empresa_id = ?",
      [name, density || 7.85, req.params.id, empresaId],
    );

    if (result.affectedRows === 0)
      return res
        .status(404)
        .json({ error: "Material não encontrado ou sem permissão." });

    res.json({ message: "Atualizado com sucesso" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/materials/:id", authenticateToken, async (req, res) => {
  const empresaId = req.user.empresa_id;

  try {
    // Remove verificando a EMPRESA
    const [result] = await db.query(
      "DELETE FROM materiais_personalizados WHERE id = ? AND empresa_id = ?",
      [req.params.id, empresaId],
    );

    if (result.affectedRows === 0)
      return res
        .status(404)
        .json({ error: "Material não encontrado ou sem permissão." });

    res.json({ message: "Material removido" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// ROTAS DE ESPESSURAS (COMPARTILHADO NA EQUIPE)
// ==========================================

app.get("/api/thicknesses", authenticateToken, async (req, res) => {
  try {
    const empresaId = req.user.empresa_id;

    const query = `
        SELECT id, valor, 'padrao' as origem FROM espessuras_padrao
        UNION ALL
        SELECT id, valor, 'custom' as origem FROM espessuras_personalizadas 
        WHERE empresa_id = ? ORDER BY valor ASC`; // Ordenar por valor fica melhor visualmente

    const [results] = await db.query(query, [empresaId]);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/thicknesses", authenticateToken, async (req, res) => {
  const { value } = req.body;
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;

  if (!value) return res.status(400).json({ error: "Valor obrigatório" });

  try {
    const [result] = await db.query(
      "INSERT INTO espessuras_personalizadas (usuario_id, empresa_id, valor) VALUES (?, ?, ?)",
      [usuarioId, empresaId, value],
    );
    res.json({ id: result.insertId, valor: value });
  } catch (err) {
    res.status(500).json({ error: "Erro ao salvar espessura" });
  }
});

app.put("/api/thicknesses/:id", authenticateToken, async (req, res) => {
  const { value } = req.body;
  const empresaId = req.user.empresa_id;

  try {
    const [result] = await db.query(
      "UPDATE espessuras_personalizadas SET valor = ? WHERE id = ? AND empresa_id = ?",
      [value, req.params.id, empresaId],
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Não encontrado" });

    res.json({ message: "Atualizado" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/thicknesses/:id", authenticateToken, async (req, res) => {
  const empresaId = req.user.empresa_id;

  try {
    const [result] = await db.query(
      "DELETE FROM espessuras_personalizadas WHERE id = ? AND empresa_id = ?",
      [req.params.id, empresaId],
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Não encontrado" });

    res.json({ message: "Removido" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ROTA TEMPORÁRIA PARA CORRIGIR ESPESSURAS
app.get("/api/fix-database", async (req, res) => {
  try {
    const connection = await db.getConnection();

    // 1. Busca todos os registros zerados vinculados à engenharia
    const [rows] = await connection.query(`
      SELECT ph.id, pe.espessura as texto_original 
      FROM producao_historico ph
      JOIN producao_itens pi ON ph.id = pi.producao_id
      JOIN pecas_engenharia pe ON pi.peca_original_id = pe.id
      WHERE ph.espessura = 0 OR ph.espessura = '0'
    `);

    let corrigidos = 0;

    // 2. Processa um por um usando JavaScript
    for (const row of rows) {
      const texto = String(row.texto_original);

      // Regex que procura por "numero,numero" ou "numero.numero" (Ex: 0,60 ou 1.5)
      // Ignora números inteiros isolados como o "24" de "Chapa #24"
      const match = texto.match(/(\d+[.,]\d+)/);

      if (match) {
        // Pega o valor encontrado (ex: "0,60"), troca vírgula por ponto e converte
        const valorLimpo = parseFloat(match[0].replace(",", "."));

        if (!isNaN(valorLimpo) && valorLimpo > 0) {
          await connection.query(
            "UPDATE producao_historico SET espessura = ? WHERE id = ?",
            [valorLimpo, row.id],
          );
          corrigidos++;
        }
      }
    }

    connection.release();
    res.json({
      message: `Processo finalizado. Registros corrigidos: ${corrigidos}`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 5. SERVIR O FRONTEND (REACT/VITE)
// ==========================================

// Diz para o Express que a pasta 'dist' contém arquivos estáticos (CSS, JS, Imagens)
app.use(express.static(path.join(__dirname, "../dist")));

// Correção: Trocamos '*' por /.*/ (sem aspas)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../dist", "index.html"));
});

// ==========================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🔥 Servidor Seguro rodando na porta ${PORT}`);
});
