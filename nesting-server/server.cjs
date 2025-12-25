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
const JWT_SECRET = process.env.JWT_SECRET || "segredo-super-secreto-do-nesting-app";

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
      largura, altura, area_bruta, geometria, blocos_def, status)
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
      "AGUARDANDO",
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
    const sql = `SELECT * FROM pecas_engenharia WHERE pedido IN (?) AND empresa_id = ?`;
    const [rows] = await db.query(sql, [pedidosArray, empresaId]);

    if (rows.length === 0)
      return res.status(404).json({ message: "Não encontrado." });

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
          : (empresa.plano || "Plano Premium"), // Usa o nome real do banco
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

    res
      .status(201)
      .json({
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
    const [rows] = await db.query(
      "SELECT DISTINCT pedido FROM pecas_engenharia WHERE empresa_id = ? AND pedido IS NOT NULL AND pedido != '' ORDER BY pedido DESC",
      [empresaId]
    );

    const pedidos = rows.map((r) => r.pedido);
    res.json(pedidos);
  } catch (error) {
    console.error("Erro ao buscar lista de pedidos:", error);
    res.status(500).json({ error: "Erro ao buscar lista de pedidos." });
  }
});

// --- ROTA: REGISTRAR PRODUÇÃO (BUSCANDO DADOS REAIS NO BANCO) ---
app.post("/api/producao/registrar", authenticateToken, async (req, res) => {
  // Recebemos do front apenas o que é calculado na hora (aproveitamento, densidade, itens)
  const { chapaIndex, aproveitamento, densidade, itens } = req.body;
  
  const usuarioId = req.user.id;
  const empresaId = req.user.empresa_id;
  const plano = req.user.plano;

  // 1. Validação de Plano
  if (plano !== 'Premium Dev' && plano !== 'Premium' && plano !== 'Corporativo') {
     return res.status(403).json({ error: "Plano não permite registro histórico." });
  }

  if (!itens || itens.length === 0) {
      return res.status(400).json({ error: "Nenhum item informado." });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // 2. BUSCA INTELIGENTE: Descobre Material e Espessura direto da Engenharia
    // Pegamos o ID da primeira peça da lista para consultar suas propriedades originais
    let materialReal = "Desconhecido";
    let espessuraReal = "N/A";

    const primeiraPecaId = itens[0].id; // ID que veio do frontend (pecas_engenharia.id)

    const [pecaRows] = await connection.query(
        "SELECT material, espessura FROM pecas_engenharia WHERE id = ? AND empresa_id = ?",
        [primeiraPecaId, empresaId]
    );

    if (pecaRows.length > 0) {
        materialReal = pecaRows[0].material;
        espessuraReal = pecaRows[0].espessura;
    }

    // 3. Grava o Histórico com os dados CONFIÁVEIS do banco
    const [result] = await connection.query(
      `INSERT INTO producao_historico 
       (empresa_id, usuario_id, data_producao, chapa_index, aproveitamento, densidade, material, espessura) 
       VALUES (?, ?, NOW(), ?, ?, ?, ?, ?)`,
      [
        empresaId, 
        usuarioId, 
        chapaIndex, 
        aproveitamento, 
        densidade || aproveitamento, // Se densidade não vier, usa o aproveitamento
        materialReal, // <--- Veio do SELECT acima
        espessuraReal // <--- Veio do SELECT acima
      ]
    );
    
    const producaoId = result.insertId;

    // 4. Salva os Itens
    const values = itens.map(item => [producaoId, item.id, item.qtd]);
    await connection.query(
        `INSERT INTO producao_itens (producao_id, peca_original_id, quantidade) VALUES ?`,
        [values]
    );

    await connection.commit();
    res.json({ 
        message: "Produção registrada com sucesso!", 
        detalhes: { material: materialReal, espessura: espessuraReal }
    });

  } catch (error) {
    await connection.rollback();
    console.error("Erro ao registrar produção:", error);
    res.status(500).json({ error: "Erro ao salvar no banco." });
  } finally {
    connection.release();
  }
});

// ==========================================================
// ROTAS DE GESTÃO DE MATERIAIS E ESPESSURAS
// ==========================================================

// 1. Listar Materiais + Espessuras
app.get("/api/materiais", authenticateToken, async (req, res) => {
  const empresaId = req.user.empresa_id;
  
  try {
    const [materiais] = await db.query(
      `SELECT * FROM materiais WHERE empresa_id IS NULL OR empresa_id = ? ORDER BY Material ASC`, 
      [empresaId]
    );

    const materialIds = materiais.map(m => m.id);
    let espessuras = [];
    
    if (materialIds.length > 0) {
      const [rows] = await db.query(
        `SELECT id, material_id, milimetros, polegadas, bitola FROM espessuras WHERE material_id IN (?) ORDER BY milimetros ASC`,
        [materialIds]
      );
      espessuras = rows;
    }

    const resultado = materiais.map(m => ({
      ...m,
      isGlobal: m.empresa_id === null,
      espessuras: espessuras.filter(e => e.material_id === m.id)
    }));

    res.json(resultado);
  } catch (error) {
    console.error("Erro ao buscar materiais:", error);
    res.status(500).json({ error: "Erro interno." });
  }
});

// 2. Criar Material
app.post("/api/materiais", authenticateToken, async (req, res) => {
  const { Material, densidade, Descricao } = req.body;
  const empresaId = req.user.empresa_id;

  if (!Material || !densidade) return res.status(400).json({ error: "Dados incompletos." });

  try {
    const [result] = await db.query(
      "INSERT INTO materiais (empresa_id, Material, densidade, Descricao) VALUES (?, ?, ?, ?)",
      [empresaId, Material, parseFloat(densidade), Descricao || ""]
    );
    res.status(201).json({ id: result.insertId, message: "Material criado." });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: "Nome já existe." });
    res.status(500).json({ error: "Erro ao salvar." });
  }
});

// 3. Excluir Material
app.delete("/api/materiais/:id", authenticateToken, async (req, res) => {
  const id = req.params.id;
  const empresaId = req.user.empresa_id;
  try {
    const [result] = await db.query("DELETE FROM materiais WHERE id = ? AND empresa_id = ?", [id, empresaId]);
    if (result.affectedRows === 0) return res.status(403).json({ error: "Não permitido." });
    res.json({ message: "Material excluído." });
  } catch (error) { res.status(500).json({ error: "Erro ao excluir." }); }
});

// 4. Adicionar Espessura (VERSÃO CORRIGIDA E PERMISSIVA)
app.post("/api/espessuras", authenticateToken, async (req, res) => {
  const { material_id, milimetros, polegadas, bitola } = req.body;
  const empresaId = req.user.empresa_id;

  if (!material_id || !milimetros) return res.status(400).json({ error: "Milímetros é obrigatório." });

  try {
    const [mat] = await db.query("SELECT empresa_id FROM materiais WHERE id = ?", [material_id]);
    if (mat.length === 0) return res.status(404).json({ error: "Material não encontrado" });
    
    // Regra: Permite se for dono OU se for material global (NULL)
    const isDono = mat[0].empresa_id === empresaId;
    const isGlobal = mat[0].empresa_id === null;

    if (!isDono && !isGlobal) {
       return res.status(403).json({ error: "Acesso negado." });
    }

    await db.query(
      "INSERT INTO espessuras (material_id, milimetros, polegadas, bitola) VALUES (?, ?, ?, ?)",
      [material_id, milimetros, polegadas || null, bitola || null]
    );
    res.status(201).json({ message: "Espessura adicionada." });
  } catch (error) { res.status(500).json({ error: "Erro ao salvar." }); }
});

// 5. Excluir Espessura
app.delete("/api/espessuras/:id", authenticateToken, async (req, res) => {
    const id = req.params.id;
    const empresaId = req.user.empresa_id;
    // Permite apagar apenas se o material for da empresa (protege o global)
    const query = `DELETE e FROM espessuras e INNER JOIN materiais m ON m.id = e.material_id WHERE e.id = ? AND m.empresa_id = ?`;
    try {
        const [result] = await db.query(query, [id, empresaId]);
        if (result.affectedRows === 0) return res.status(403).json({error: "Não permitido."});
        res.json({message: "Removido."});
    } catch(e) { res.status(500).json({error: "Erro."}); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🔥 Servidor Seguro rodando na porta ${PORT}`);
});