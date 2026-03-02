require("dotenv").config();
const express = require("express");
const path = require("path"); // <--- ADICIONE ESTA LINHA
const cors = require("cors");
const db = require("./db.cjs");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const paymentRoutes = require("./routes/payment.routes.cjs");
const crypto = require("crypto"); // Necessário para gerar UUIDs
const setupTelemetry = require("./telemetria.cjs");

const app = express(); // 1º: Criamos o app

// 2º: Configuramos a Telemetria (Logs e Métricas)
setupTelemetry(app);

// Variável de controle para ambientes
const isProduction =
  process.env.NODE_ENV === "production" || process.env.JWT_SECRET;

// CORREÇÃO DO CORS: Permite explicitamente o Frontend e Credenciais
app.use(
  cors({
    origin: isProduction ? true : "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// app.use(cors());

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

// --- SALVAR PEÇAS (COM BLOQUEIO PARA 'NORMAL' E SUBSTITUIÇÃO CIRÚRGICA PARA 'EDIÇÃO') ---
app.post("/api/pecas", authenticateToken, async (req, res) => {
  const parts = req.body;
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;

  if (!Array.isArray(parts) || parts.length === 0)
    return res.status(400).json({ error: "Lista vazia." });

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // =================================================================
    // 1. BLOQUEIO DE SEGURANÇA (APENAS PARA TIPO 'NORMAL')
    // =================================================================
    // Regra: Um pedido não pode ter duplicidade de produção 'NORMAL'.
    // Se o usuário tenta salvar 'NORMAL', verificamos se o pedido já existe ativo.

    const pecasNormais = parts.filter(
      (p) => !p.tipo_producao || p.tipo_producao === "NORMAL",
    );

    if (pecasNormais.length > 0) {
      // Extrai os pedidos únicos que estão sendo salvos como NORMAL
      const pedidosCheck = [
        ...new Set(pecasNormais.map((p) => p.pedido).filter(Boolean)),
      ];

      if (pedidosCheck.length > 0) {
        const [conflitos] = await connection.query(
          `SELECT DISTINCT pedido 
           FROM pecas_engenharia 
           WHERE empresa_id = ? 
             AND tipo_producao = 'NORMAL' 
             AND status IN ('AGUARDANDO', 'EM PRODUÇÃO')
             AND pedido IN (?)`,
          [empresaId, pedidosCheck],
        );

        if (conflitos.length > 0) {
          await connection.rollback();
          connection.release();
          return res.status(409).json({
            error: "Bloqueio de Segurança",
            message: `O pedido ${conflitos[0].pedido} já possui produção 'NORMAL' cadastrada.\n\nSe você deseja corrigir ou adicionar peças a este pedido, altere o Tipo de Produção para 'EDITAR CADASTRO', 'ERRO DE PROJETO' ou 'RETRABALHO'.`,
          });
        }
      }
    }

    // =================================================================
    // 2. VALIDAÇÃO RIGOROSA E SUBSTITUIÇÃO CIRÚRGICA
    // =================================================================
    // Filtramos tudo que não for NORMAL
    const pecasEspeciais = parts.filter(
      (p) => p.tipo_producao && p.tipo_producao.toUpperCase() !== "NORMAL",
    );

    for (const p of pecasEspeciais) {
      if (p.pedido && p.name) {
        // Agora pegamos EXATAMENTE o value enviado pelo frontend
        const tipoReq = p.tipo_producao.toUpperCase().trim();

        // --- TRAVA PARA EDIÇÃO DE CADASTRO (Lendo com Underline!) ---
        if (tipoReq === "EDITAR_CADASTRO") {
          // 1. Verifica qual é o status atual da peça no banco de dados
          const [statusCheck] = await connection.query(
            `SELECT status FROM pecas_engenharia 
             WHERE empresa_id = ? AND pedido = ? AND nome_arquivo = ?
             ORDER BY data_cadastro DESC LIMIT 1`,
            [empresaId, p.pedido, p.name],
          );

          if (statusCheck.length > 0) {
            const statusAtual = statusCheck[0].status.toUpperCase();

            // Se a peça já passou do estágio de planejamento, BLOQUEIA a edição!
            if (statusAtual === "EM PRODUÇÃO" || statusAtual === "CONCLUÍDO") {
              await connection.rollback();
              connection.release();

              // Devolve um erro 409 que será lido pelo 'alert' do seu EngineeringScreen.tsx
              return res.status(409).json({
                error: "Edição Bloqueada",
                message: `A peça "${p.name}" já foi enviada para corte (Status: ${statusAtual}).\n\nA "Edição de Cadastro" é permitida apenas para peças que ainda estão aguardando.\nPara repor o material desta peça, altere o Tipo de Produção para "Erro de Processo", "Erro de Projeto", etc.`,
              });
            }
          }

          // 2. Se passou pela trava (está AGUARDANDO), deleta a antiga para a nova tomar o lugar
          await connection.query(
            `DELETE FROM pecas_engenharia 
             WHERE empresa_id = ? AND pedido = ? AND nome_arquivo = ? AND status = 'AGUARDANDO'`,
            [empresaId, p.pedido, p.name],
          );
        }

        // --- LÓGICA DO RETRABALHO ---
        // Se for RETRABALHO_PERDA, RETRABALHO_PROCESSO, ERRO_ENGENHARIA ou ERRO_COMERCIAL,
        // ele não entra no if acima. Não apaga a antiga e simplesmente insere a nova no Passo 4.
      }
    }

    // const pecasCorrecao = parts.filter(
    //   (p) => p.tipo_producao && p.tipo_producao !== "NORMAL",
    // );

    // // Processamos uma a uma para garantir a precisão (Nome + Pedido)
    // for (const p of pecasCorrecao) {
    //   if (p.pedido && p.name) {
    //     // "Mata" a peça antiga específica daquele pedido que ainda não foi produzida
    //     await connection.query(
    //       `UPDATE pecas_engenharia
    //        SET status = 'SUBSTITUIDO'
    //        WHERE empresa_id = ?
    //          AND pedido = ?
    //          AND nome_arquivo = ?
    //          AND status = 'AGUARDANDO'`,
    //       [empresaId, p.pedido, p.name],
    //     );
    //   }
    // }

    // =================================================================
    // 3. VERIFICAÇÕES DE PLANO (TRIAL / LIMITES)
    // =================================================================
    const [empRows] = await connection.query(
      "SELECT trial_start_date, subscription_status, max_parts FROM empresas WHERE id = ?",
      [empresaId],
    );
    const empresa = empRows[0];

    // Validação Trial
    if (empresa.subscription_status === "trial") {
      const now = new Date();
      const start = new Date(empresa.trial_start_date);
      const diffDays = Math.ceil(Math.abs(now - start) / (1000 * 60 * 60 * 24));
      if (diffDays > 30) {
        await connection.rollback();
        connection.release();
        return res.status(403).json({ error: "SEU TRIAL EXPIROU!" });
      }
    }

    // Validação Limite Peças
    if (empresa.max_parts !== null) {
      const [countRows] = await connection.query(
        "SELECT COUNT(*) as total FROM pecas_engenharia WHERE empresa_id = ?",
        [empresaId],
      );
      if (countRows[0].total + parts.length > empresa.max_parts) {
        await connection.rollback();
        connection.release();
        return res.status(409).json({
          error: "CAPACIDADE ATINGIDA!",
          message: `Plano excedido. Limite: ${empresa.max_parts}. Atual: ${countRows[0].total}.`,
        });
      }
    }

    // =================================================================
    // 4. INSERÇÃO DAS NOVAS PEÇAS
    // =================================================================
    const sql = `
      INSERT INTO pecas_engenharia 
      (id, usuario_id, empresa_id, nome_arquivo, pedido, op, material, espessura, autor, quantidade, cliente, 
      largura, altura, area_bruta, area_liquida, geometria, blocos_def, status, tipo_producao, is_rotation_locked)
      VALUES ?
    `;

    const values = parts.map((p) => [
      crypto.randomUUID(), // Gera novo ID único para a nova versão
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
      p.netArea || p.grossArea,
      JSON.stringify(p.entities),
      JSON.stringify(p.blocks || {}),
      "AGUARDANDO", // Sempre entra como AGUARDANDO (a antiga virou SUBSTITUIDO)
      p.tipo_producao || "NORMAL",
      p.isRotationLocked ? 1 : 0,
    ]);

    const [result] = await connection.query(sql, [values]);

    await connection.commit();
    res.status(201).json({
      message: "Peças salvas com sucesso!",
      count: result.affectedRows,
    });
  } catch (error) {
    await connection.rollback();
    console.error("Erro ao salvar peças:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "Conflito de Dados",
        message: "Erro de duplicidade interna. Tente novamente.",
      });
    }
    res.status(500).json({ error: "Erro interno ao processar salvamento." });
  } finally {
    if (connection) connection.release();
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
// [server.cjs] - BUSCAR PEÇAS (COM DEDUPLICAÇÃO FORÇADA E NORMALIZADA)
// [server.cjs] - ROTA DE BUSCA OTIMIZADA (SEM ESTOURAR MEMÓRIA)

app.get("/api/pecas/buscar", authenticateToken, async (req, res) => {
  const { pedido, op } = req.query;
  const empresaId = req.user.empresa_id;

  if (!pedido) return res.status(400).json({ error: "Falta pedido." });

  const pedidosArray = pedido
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  let opsArray = [];

  if (op) {
    const opDecoded = decodeURIComponent(op);
    opsArray = opDecoded
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  }

  const safeJsonParse = (content, fallback = {}) => {
    if (!content) return fallback;
    if (typeof content !== "string") return content;
    try {
      return JSON.parse(content);
    } catch (e) {
      console.warn("⚠️ JSON Corrompido ignorado.");
      return fallback;
    }
  };

  try {
    // 1. SQL CORRIGIDO: Removemos o "AND status = 'AGUARDANDO'"
    // Buscamos todo o histórico daquele pedido para a deduplicação não ser enganada.
    let sql = `
      SELECT * FROM pecas_engenharia 
      WHERE empresa_id = ?
    `;

    const params = [empresaId];
    if (pedidosArray.length > 0) {
      sql += ` AND pedido IN (?)`;
      params.push(pedidosArray);
    }

    if (opsArray.length > 0) {
      sql += ` AND op IN (?)`;
      params.push(opsArray);
    }

    const [rows] = await db.query(sql, params);

    if (rows.length === 0)
      return res.status(404).json({ message: "Peças não encontradas." });

    // 2. ORDENAÇÃO
    rows.sort((a, b) => new Date(b.data_cadastro) - new Date(a.data_cadastro));

    // 3. DEDUPLICAÇÃO (Acha a verdadeira última versão)
    const pecasUnicas = {};
    rows.forEach((row) => {
      const rawNome = row.nome_arquivo ? String(row.nome_arquivo) : "";
      const rawPedido = row.pedido ? String(row.pedido) : "";
      const nomeLimpo = rawNome.trim().toLowerCase();
      const pedidoLimpo = rawPedido.trim();

      if (!nomeLimpo || !pedidoLimpo) return;

      const chave = `${pedidoLimpo}|${nomeLimpo}`;
      if (!pecasUnicas[chave]) {
        pecasUnicas[chave] = row;
      }
    });

    // 4. O FILTRO SALVADOR: Agora filtramos o status *após* descobrir qual é a versão real
    const rowsFiltradas = Object.values(pecasUnicas).filter(
      (row) => row.status === "AGUARDANDO",
    );

    // 5. MAPEAMENTO E RETORNO
    const formattedParts = rowsFiltradas.map((row) => ({
      id: row.id,
      name: row.nome_arquivo,
      pedido: row.pedido,
      op: row.op,
      material: row.material,
      espessura: row.espessura,
      autor: row.autor,
      quantity: Number(row.quantidade) || 1,
      cliente: row.cliente,
      width: Number(row.largura),
      height: Number(row.altura),
      grossArea: Number(row.area_bruta),
      netArea: Number(row.area_liquida) || Number(row.area_bruta),
      entities: safeJsonParse(row.geometria, []),
      blocks: safeJsonParse(row.blocos_def, {}),
      dataCadastro: row.data_cadastro,
      tipo_producao: row.tipo_producao,
      isRotationLocked: !!row.is_rotation_locked,
    }));

    res.json(formattedParts);
  } catch (error) {
    console.error("❌ ERRO NA BUSCA:", error);
    res.status(500).json({ error: "Erro interno: " + error.message });
  }
});

// --- LISTAR PEDIDOS DISPONÍVEIS (COM BLOQUEIO E TIMEOUT) ---
app.get("/api/pedidos/disponiveis", authenticateToken, async (req, res) => {
  const empresaId = req.user.empresa_id;
  const usuarioId = req.user.id;

  // Tempo limite em minutos para considerar um bloqueio "expirado" (ex: 30 min)
  const LOCK_TIMEOUT_MINUTES = 2;

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
        AND (pe.pedido, pe.nome_arquivo, pe.data_cadastro) IN (
        SELECT pedido, nome_arquivo, MAX(data_cadastro)
        FROM pecas_engenharia
        WHERE empresa_id = ?
        GROUP BY pedido, nome_arquivo
      )
      ORDER BY pe.pedido DESC, pe.op ASC
    `;

    const [rows] = await db.query(sql, [empresaId, empresaId]);

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

// [server.cjs] - CORREÇÃO DE BLOQUEIO (SEM FOR UPDATE)

// --- BLOQUEAR PEDIDO (CHECK-ON-CLICK) ---
app.post("/api/pedidos/lock", authenticateToken, async (req, res) => {
  const { pedido, op } = req.body;
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;

  // TOLERÂNCIA: Se o usuário não renovar o sinal em 2 minutos, o sistema libera.
  // Isso evita que o pedido fique travado se o PC desligar.
  const TOLERANCIA_MINUTOS = 2;

  if (!pedido) return res.status(400).json({ error: "Pedido obrigatório." });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. VERIFICAÇÃO INTELIGENTE (SEM FOR UPDATE)
    // Verifica se existe alguém (que NÃO seja eu) com um bloqueio RECENTE (< 2 min)
    let checkSql = `
      SELECT u.nome, pe.locked_at 
      FROM pecas_engenharia pe
      JOIN usuarios u ON pe.locked_by = u.id
      WHERE pe.empresa_id = ? 
        AND pe.pedido = ?
        AND pe.locked_by IS NOT NULL 
        AND pe.locked_by != ? 
        AND pe.locked_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
      LIMIT 1
    `;

    const params = [empresaId, pedido, usuarioId, TOLERANCIA_MINUTOS];
    let opsArray = [];

    // Adiciona filtro de OP se houver
    if (op) {
      opsArray = Array.isArray(op) ? op : op.split(",").map((s) => s.trim());
      if (opsArray.length > 0) {
        checkSql = checkSql.replace("LIMIT 1", "AND pe.op IN (?) LIMIT 1");
        params.push(opsArray);
      }
    }

    const [lockedRows] = await connection.query(checkSql, params);

    // 2. SE ALGUÉM ESTIVER USANDO, RETORNA ERRO (MAS NÃO TRAVA O BANCO)
    if (lockedRows.length > 0) {
      await connection.rollback();
      const usuarioBloqueador = lockedRows[0].nome || "Desconhecido";
      const horarioBloqueio = new Date(
        lockedRows[0].locked_at,
      ).toLocaleTimeString();

      return res.status(409).json({
        error: "Bloqueado",
        message: `Em uso por ${usuarioBloqueador} (desde ${horarioBloqueio}).`,
      });
    }

    // 3. CAMINHO LIVRE: REALIZA O BLOQUEIO OU RENOVAÇÃO
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

    res.json({ message: "Sessão iniciada/renovada." });
  } catch (error) {
    await connection.rollback();
    console.error("Erro ao bloquear:", error);
    // Erro 500 genérico, mas agora sem travar o banco para os outros
    res.status(500).json({ error: "Erro técnico ao reservar pedido." });
  } finally {
    connection.release();
  }
});

// --- DESBLOQUEAR PEDIDO ---
app.post("/api/pedidos/unlock", authenticateToken, async (req, res) => {
  const { pedido, op } = req.body;
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;

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
    // Desbloqueio opcional por OP
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

// [server.cjs] - Atualização da rota /api/producao/registrar

app.post("/api/producao/registrar", authenticateToken, async (req, res) => {
  // RECEBENDO O PACOTE RICO DO FRONTEND
  const { chapaIndex, motor, stats, itens, nestingSignature } = req.body;
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;

  if (!itens || itens.length === 0)
    return res.status(400).json({ error: "Nenhum item informado." });
  
  if (!stats) 
    return res.status(400).json({ error: "Métricas de engenharia ausentes." });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. CÁLCULO DAS PORCENTAGENS BASEADAS NO PACOTE DA ENGENHARIA
    const aproveitamento = stats.totalBinArea > 0 ? (stats.netPartsArea / stats.totalBinArea) * 100 : 0;
    const consumo = stats.totalBinArea > 0 ? (stats.effectiveArea / stats.totalBinArea) * 100 : 0;
    
    // 2. CONVERSÕES DIMENSIONAIS
    const areaRetalhoM2 = stats.retalhoArea / 1000000; // Transformando mm² em m²
    const retalhoLinearY = Math.max(0, stats.binHeight - stats.effectiveHeight);

    // 3. INSERT MESTRE (Sem selects lentos, salva os dados diretos da Engenharia)
    const [result] = await connection.query(
      `INSERT INTO producao_historico 
       (empresa_id, usuario_id, data_producao, chapa_index, aproveitamento, densidade, material, espessura, motor, nesting_signature, largura_chapa, altura_chapa, consumo_chapa, retalho_linear, area_retalho) 
       VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        empresaId,
        usuarioId,
        chapaIndex,
        aproveitamento,
        stats.densidade,    // Veio limpo do banco via frontend
        stats.material,     // Nome real do material
        stats.espessura,    // Valor em milímetros exato (já formatado com ponto!)
        motor || "Smart Nest",
        nestingSignature || null,
        stats.binWidth,
        stats.binHeight,
        consumo,
        retalhoLinearY,
        areaRetalhoM2,
      ],
    );

    const producaoId = result.insertId;

    // 4. INSERT DOS ITENS (Filhos)
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

    // 5. ATUALIZAR STATUS DAS PEÇAS ORIGINAIS (COM DESCONTO PARCIAL)
    for (const item of itens) {
      // a) Pega a meta total da peça (quantas a engenharia pediu)
      const [pecaRows] = await connection.query(
        "SELECT quantidade FROM pecas_engenharia WHERE id = ? AND empresa_id = ?",
        [item.id, empresaId]
      );

      if (pecaRows.length > 0) {
        const metaTotal = Number(pecaRows[0].quantidade) || 1;

        // b) Soma todas as peças que já foram cortadas desta ID (incluindo a que acabou de ser inserida no Passo 4)
        const [prodRows] = await connection.query(
          "SELECT SUM(quantidade) as total_produzido FROM producao_itens WHERE peca_original_id = ?",
          [item.id]
        );
        const totalProduzido = Number(prodRows[0].total_produzido) || 0;

        // c) Se já produziu tudo (ou mais), muda o status para tirar da fila de arranjo.
        if (totalProduzido >= metaTotal) {
          await connection.query(
            "UPDATE pecas_engenharia SET status = 'EM PRODUÇÃO' WHERE id = ? AND empresa_id = ?",
            [item.id, empresaId]
          );
        }
      }
    }

    await connection.commit();
    
    // 6. SUCESSO! DEVOLVENDO O ID PARA VINCULAR O RETALHO
    res.json({
      message: "Produção registrada!",
      producaoId: producaoId, 
      detalhes: { material: stats.material, espessura: stats.espessura, motor },
    });

  } catch (error) {
    await connection.rollback();
    console.error("Erro ao registrar produção:", error);
    if (error.code === "ER_DUP_ENTRY")
      return res.status(409).json({ error: "Duplicate entry", producaoId: null });
    res.status(500).json({ error: "Erro ao salvar histórico." });
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

// ==========================================
// ROTAS DE ESPESSURAS (COMPARTILHADO NA EQUIPE)
// ==========================================

app.get("/api/thicknesses", authenticateToken, async (req, res) => {
  try {
    const empresaId = req.user.empresa_id;

    // --- LÓGICA DE ORDENAÇÃO INTELIGENTE ---
    // 1º: valor_mm IS NULL -> Joga os que não têm milímetro (antigos) para o final da lista
    // 2º: valor_mm ASC -> Ordena do menor para o maior (ex: 0.80, 0.90, 1.20, 3.17)
    // 3º: valor ASC -> Se dois tiverem o mesmo milímetro, desempata pelo nome alfabético
    const query = `
        SELECT id, valor, valor_mm, 'padrao' as origem FROM espessuras_padrao
        UNION ALL
        SELECT id, valor, valor_mm, 'custom' as origem FROM espessuras_personalizadas 
        WHERE empresa_id = ? 
        ORDER BY (valor_mm IS NULL), valor_mm ASC, valor ASC`; 

    const [results] = await db.query(query, [empresaId]);
    res.json(results);
  } catch (err) {
    console.error("❌ Erro no GET /api/thicknesses:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/thicknesses", authenticateToken, async (req, res) => {
  console.log("📥 DADOS RECEBIDOS DO FRONTEND (CRIAR):", req.body);
  const { value, value_mm } = req.body;
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;

  if (!value) return res.status(400).json({ error: "Valor obrigatório" });

  try {
    // BLINDAGEM: Troca vírgula por ponto e converte para número
    const mmLimpo = value_mm
      ? parseFloat(String(value_mm).replace(",", "."))
      : null;

    const [result] = await db.query(
      "INSERT INTO espessuras_personalizadas (usuario_id, empresa_id, valor, valor_mm) VALUES (?, ?, ?, ?)",
      [usuarioId, empresaId, value, mmLimpo],
    );
    res.json({ id: result.insertId, valor: value, valor_mm: mmLimpo });
  } catch (err) {
    console.error("❌ Erro no POST /api/thicknesses:", err); // <--- LOG PARA DEBUG
    res.status(500).json({ error: "Erro ao salvar espessura" });
  }
});

app.put("/api/thicknesses/:id", authenticateToken, async (req, res) => {
  console.log("📥 DADOS RECEBIDOS DO FRONTEND (EDITAR):", req.body);
  const { value, value_mm } = req.body;
  const empresaId = req.user.empresa_id;

  try {
    // BLINDAGEM: Troca vírgula por ponto e converte para número
    const mmLimpo = value_mm
      ? parseFloat(String(value_mm).replace(",", "."))
      : null;

    const [result] = await db.query(
      "UPDATE espessuras_personalizadas SET valor = ?, valor_mm = ? WHERE id = ? AND empresa_id = ?",
      [value, mmLimpo, req.params.id, empresaId],
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ error: "Não encontrado" });

    res.json({ message: "Atualizado", valor_mm: mmLimpo });
  } catch (err) {
    console.error("❌ Erro no PUT /api/thicknesses:", err); // <--- LOG PARA DEBUG
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
// ROTAS DE RETALHOS (ESTOQUE INTELIGENTE)
// ==========================================

// 1. LISTAR RETALHOS DISPONÍVEIS (Alerta "Eco-Smart" com Bloqueio de Concorrência)
app.get("/api/retalhos/disponiveis", authenticateToken, async (req, res) => {
  const empresaId = req.user.empresa_id;
  const usuarioId = req.user.id; // <-- Adicionamos o ID do usuário
  const { material, espessura_mm } = req.query;

  // TOLERÂNCIA: Retalhos bloqueados há mais de 2 minutos são considerados livres
  const LOCK_TIMEOUT_MINUTES = 2;

  try {
    // A MÁGICA AQUI: Oculta retalhos que estão bloqueados por OUTROS usuários ativamente
    let sql = `
      SELECT * FROM retalhos_estoque 
      WHERE empresa_id = ? 
        AND status = 'DISPONIVEL'
        AND (
          locked_by IS NULL 
          OR locked_by = ? 
          OR locked_at <= DATE_SUB(NOW(), INTERVAL ? MINUTE)
        )
    `;
    const params = [empresaId, usuarioId, LOCK_TIMEOUT_MINUTES];

    if (material) {
      sql += ` AND material = ?`;
      params.push(material);
    }

    if (espessura_mm) {
      const espLimpa = parseFloat(String(espessura_mm).replace(',', '.'));
      sql += ` AND espessura_mm = ?`;
      params.push(espLimpa);
    }

    sql += ` ORDER BY area_m2 ASC`;
    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error("❌ Erro ao buscar retalhos:", error);
    res.status(500).json({ error: "Erro ao buscar estoque de retalhos." });
  }
});

// --- BLOQUEAR RETALHO (CHECK-ON-CLICK) ---
app.post("/api/retalhos/lock", authenticateToken, async (req, res) => {
  const { retalhosIds } = req.body; // Array de IDs de retalhos (pois a Fila aceita múltiplos)
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;
  
  // Mesma tolerância de 2 minutos dos pedidos
  const TOLERANCIA_MINUTOS = 2;

  if (!retalhosIds || !Array.isArray(retalhosIds) || retalhosIds.length === 0) {
    return res.status(400).json({ error: "IDs dos retalhos obrigatórios." });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. VERIFICAÇÃO INTELIGENTE (SEM FOR UPDATE)
    // Verifica se existe alguém (que NÃO seja eu) usando um desses retalhos RECENTEMENTE (< 2 min)
    const checkSql = `
      SELECT u.nome, re.locked_at, re.codigo 
      FROM retalhos_estoque re
      JOIN usuarios u ON re.locked_by = u.id
      WHERE re.empresa_id = ? 
        AND re.id IN (?)
        AND re.locked_by IS NOT NULL 
        AND re.locked_by != ? 
        AND re.locked_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)
      LIMIT 1
    `;
    const params = [empresaId, retalhosIds, usuarioId, TOLERANCIA_MINUTOS];
    const [lockedRows] = await connection.query(checkSql, params);

    // 2. SE ALGUÉM ESTIVER USANDO, RETORNA ERRO (MAS NÃO TRAVA O BANCO)
    if (lockedRows.length > 0) {
      await connection.rollback();
      const usuarioBloqueador = lockedRows[0].nome || "Desconhecido";
      const retalhoCodigo = lockedRows[0].codigo;
      const horarioBloqueio = new Date(lockedRows[0].locked_at).toLocaleTimeString();
      
      return res.status(409).json({
        error: "Bloqueado",
        message: `O retalho ${retalhoCodigo} está em uso por ${usuarioBloqueador} (desde ${horarioBloqueio}).`,
      });
    }

    // 3. CAMINHO LIVRE: REALIZA O BLOQUEIO OU RENOVAÇÃO
    const updateSql = `
      UPDATE retalhos_estoque 
      SET locked_by = ?, locked_at = NOW()
      WHERE empresa_id = ? AND id IN (?)
    `;
    await connection.query(updateSql, [usuarioId, empresaId, retalhosIds]);
    
    await connection.commit();
    res.json({ message: "Sessão do(s) retalho(s) iniciada/renovada." });
  } catch (error) {
    await connection.rollback();
    console.error("Erro ao bloquear retalho:", error);
    res.status(500).json({ error: "Erro técnico ao reservar retalho." });
  } finally {
    connection.release();
  }
});

// --- DESBLOQUEAR RETALHO ---
app.post("/api/retalhos/unlock", authenticateToken, async (req, res) => {
  const { retalhosIds } = req.body;
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;

  try {
    let sql = `
      UPDATE retalhos_estoque 
      SET locked_by = NULL, locked_at = NULL
      WHERE empresa_id = ? AND locked_by = ?
    `;
    const params = [empresaId, usuarioId];

    // Se mandar IDs específicos, solta só eles. Se vier vazio, solta TODOS desse usuário.
    if (retalhosIds && Array.isArray(retalhosIds) && retalhosIds.length > 0) {
      sql += ` AND id IN (?)`;
      params.push(retalhosIds);
    }

    await db.query(sql, params);
    res.json({ message: "Retalho(s) desbloqueado(s) com sucesso." });
  } catch (error) {
    console.error("Erro ao desbloquear retalho:", error);
    res.status(500).json({ error: "Erro ao liberar retalho." });
  }
});

// 2. SALVAR NOVOS RETALHOS (Gatilho: Salvar DXF)
app.post("/api/retalhos", authenticateToken, async (req, res) => {
  const { retalhos } = req.body;
  const empresaId = req.user.empresa_id;
  const usuarioId = req.user.id;

  if (!retalhos || !Array.isArray(retalhos) || retalhos.length === 0) {
    return res.status(400).json({ error: "Nenhum retalho enviado." });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const sql = `
      INSERT INTO retalhos_estoque 
      (id, empresa_id, usuario_id, codigo, material, espessura_mm, largura, altura, origem_producao_id, status)
      VALUES ?
    `;

    // 1. Criamos um array vazio para guardar o que o banco gerou
    const retalhosCriados = [];

    const values = retalhos.map((r) => {
      // Blindagem matemática: garante que todos os números venham com ponto
      const espLimpa = parseFloat(String(r.espessura_mm).replace(',', '.')) || 0;
      const largLimpa = parseFloat(String(r.largura).replace(',', '.')) || 0;
      const altLimpa = parseFloat(String(r.altura).replace(',', '.')) || 0;

      // 2. Extraímos a geração do código para uma variável separada
      const codigoDefinitivo = r.codigo || `RET-${Math.floor(Math.random() * 10000)}`;

      // 3. Guardamos a informação para devolver ao React
      retalhosCriados.push({
        codigo: codigoDefinitivo,
        largura: largLimpa,
        altura: altLimpa
      });

      // ATENÇÃO: O colchete de abertura e as vírgulas devem estar exatos aqui
      return [
        crypto.randomUUID(),
        empresaId,
        usuarioId,
        codigoDefinitivo, // Usamos a variável aqui
        r.material || 'Desconhecido',
        espLimpa,
        largLimpa,
        altLimpa,
        r.origem_producao_id || null,
        'DISPONIVEL'
      ];
    });

    const [result] = await connection.query(sql, [values]);
    await connection.commit();

    res.status(201).json({
      message: "Retalhos salvos no estoque com sucesso!",
      count: result.affectedRows,
      retalhos: retalhosCriados // 4. AQUI ESTÁ A MÁGICA: Devolvemos a lista ao React!
    });

  } catch (error) {
    await connection.rollback();
    console.error("❌ Erro ao salvar retalhos:", error);
    res.status(500).json({ error: "Erro interno ao guardar retalhos." });
  } finally {
    connection.release();
  }
});

// 3. MARCAR RETALHO COMO USADO (Baixa no Estoque)
app.put("/api/retalhos/:id/usar", authenticateToken, async (req, res) => {
  const { id } = req.params;
  const empresaId = req.user.empresa_id;

  try {
    const [result] = await db.query(
      `UPDATE retalhos_estoque 
       SET status = 'USADO', used_at = NOW() 
       WHERE id = ? AND empresa_id = ? AND status = 'DISPONIVEL'`,
      [id, empresaId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Retalho não encontrado ou já utilizado." });
    }

    res.json({ message: "Retalho baixado do estoque com sucesso!" });
  } catch (error) {
    console.error("❌ Erro ao usar retalho:", error);
    res.status(500).json({ error: "Erro técnico ao atualizar retalho." });
  }
});

// ==========================================
// 5. SERVIR O FRONTEND (REACT/VITE)
// ==========================================

// Diz para o Express que a pasta 'dist' contém arquivos estáticos (CSS, JS, Imagens)
app.use(express.static(path.join(__dirname, "../dist")));

// O Error Handler da Telemetria deve vir ANTES do catch-all do React
app.use((err, req, res, next) => {
  if (app.useTelemetryError) {
    app.useTelemetryError(err, req, res, next);
  } else {
    console.error("Fallback Error Handler:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Correção: Trocamos '*' por /.*/ (sem aspas)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../dist", "index.html"));
});

// [server.cjs] - ADICIONE ISTO ANTES DE app.listen(...)

// --- EXCLUIR PEDIDO (COM VALIDAÇÃO DE ADMIN) ---
app.delete("/api/pedidos/:pedido", authenticateToken, async (req, res) => {
  const { pedido } = req.params;
  const empresaId = req.user.empresa_id;
  const userCargo = req.user.cargo; // 'admin' ou 'operador'

  if (!pedido) return res.status(400).json({ error: "Pedido obrigatório." });

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 1. VERIFICA STATUS DAS PEÇAS DESSE PEDIDO
    const [rows] = await connection.query(
      `SELECT status FROM pecas_engenharia WHERE empresa_id = ? AND pedido = ?`,
      [empresaId, pedido],
    );

    if (rows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Pedido não encontrado." });
    }

    // Verifica se existe alguma peça que NÃO esteja 'AGUARDANDO'
    // (ex: 'EM PRODUÇÃO', 'CONCLUÍDO', 'SUBSTITUIDO')
    const temPecasEmProducao = rows.some((r) => r.status !== "AGUARDANDO");

    // 2. APLICA A REGRA DE NEGÓCIO
    // Se tiver peças em produção e o usuário NÃO for admin, bloqueia.
    if (temPecasEmProducao && userCargo !== "admin") {
      await connection.rollback();
      return res.status(403).json({
        error: "Permissão Negada",
        message:
          "Este pedido possui itens em produção ou concluídos. Apenas Administradores podem excluí-lo.",
      });
    }

    // 3. EXECUTA A EXCLUSÃO
    // Nota: Dependendo das suas chaves estrangeiras (Foreign Keys),
    // isso pode apagar o histórico de produção (cascade) ou dar erro.
    // Assumindo que queremos limpar o cadastro atual:
    await connection.query(
      "DELETE FROM pecas_engenharia WHERE empresa_id = ? AND pedido = ?",
      [empresaId, pedido],
    );

    await connection.commit();
    res.json({ message: `Pedido ${pedido} excluído com sucesso.` });
  } catch (error) {
    await connection.rollback();
    console.error("Erro ao excluir pedido:", error);
    // Tratamento para erro de Foreign Key (caso tenha histórico travado)
    if (error.code && error.code.includes("ROW_IS_REFERENCED")) {
      return res.status(409).json({
        error: "Não é possível excluir",
        message:
          "Este pedido já possui histórico de produção vinculado e não pode ser apagado totalmente.",
      });
    }
    res.status(500).json({ error: "Erro interno ao excluir pedido." });
  } finally {
    connection.release();
  }
});

// ==========================================

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🔥 Servidor Seguro rodando na porta ${PORT}`);
});
