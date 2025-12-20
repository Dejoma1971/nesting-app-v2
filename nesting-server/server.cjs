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

// --- MIDDLEWARE DE AUTENTICAÇÃO (O PORTEIRO) ---
// Essa função verifica se o usuário mandou o token correto antes de deixar entrar na rota
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  // O token vem no formato "Bearer KJHKSJDH...", então pegamos a segunda parte
  const token = authHeader && authHeader.split(" ")[1];

  if (!token)
    return res.status(401).json({ error: "Acesso negado. Faça login." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err)
      return res.status(403).json({ error: "Token inválido ou expirado." });
    req.user = user; // Salva os dados do usuário dentro da requisição
    next(); // Pode passar!
  });
}

// ==========================================================
// 2. ROTAS
// ==========================================================

// --- ROTA DE LOGIN ATUALIZADA (Global & Multi-Tenant) ---
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)
    return res.status(400).json({ error: "Dados incompletos." });

  try {
    // Agora buscamos também o empresa_id e o cargo
    const [rows] = await db.execute(
      'SELECT id, nome, email, senha_hash, plano, empresa_id, cargo FROM usuarios WHERE email = ? AND status = "ativo"',
      [email]
    );

    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.senha_hash))) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    // --- MUDANÇA CRUCIAL: O Token carrega a identidade da EMPRESA ---
    const token = jwt.sign(
      {
        id: user.id,
        empresa_id: user.empresa_id, // <--- Isso permite o compartilhamento
        plano: user.plano,
        cargo: user.cargo,
      },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      user: {
        id: user.id,
        name: user.nome,
        email: user.email,
        plan: user.plano,
        empresa_id: user.empresa_id, // Front pode precisar saber
        role: user.cargo,
      },
      token,
    });
  } catch (error) {
    console.error("Erro login:", error);
    res.status(500).json({ error: "Erro interno." });
  }
});

// --- SALVAR PEÇAS (Compartilhado na Empresa) ---
app.post("/api/pecas", authenticateToken, async (req, res) => {
  const parts = req.body;
  const usuarioId = req.user.id; // Quem fez (Auditoria)
  const empresaId = req.user.empresa_id; // Quem é o dono (A Empresa)

  if (!Array.isArray(parts) || parts.length === 0)
    return res.status(400).json({ error: "Lista vazia." });

  // Se o usuário não tiver empresa (erro de cadastro antigo), bloqueia
  if (!empresaId)
    return res
      .status(403)
      .json({ error: "Usuário não vinculado a uma organização/empresa." });

  const sql = `
    INSERT INTO pecas_engenharia 
    (id, usuario_id, empresa_id, nome_arquivo, pedido, op, material, espessura, autor, quantidade, cliente, 
    largura, altura, area_bruta, geometria, blocos_def, status)
    VALUES ?
  `;

  const values = parts.map((p) => [
    p.id,
    usuarioId, // Autor
    empresaId, // <--- DONO REAL DA PEÇA (A Metalúrgica)
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

  try {
    const [result] = await db.query(sql, [values]);
    res
      .status(201)
      .json({
        message: "Salvo na conta da empresa!",
        count: result.affectedRows,
      });
  } catch (error) {
    console.error("Erro salvar:", error);
    res.status(500).json({ error: "Erro ao salvar." });
  }
});

// --- BUSCAR PEÇAS (Todos da empresa veem) ---
app.get("/api/pecas/buscar", authenticateToken, async (req, res) => {
  const { pedido } = req.query;
  const empresaId = req.user.empresa_id; // <--- A Chave Mágica

  if (!pedido) return res.status(400).json({ error: "Falta pedido." });

  const pedidosArray = pedido
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  try {
    // Busca onde empresa_id bate, não importa qual funcionário salvou
    const sql = `SELECT * FROM pecas_engenharia WHERE pedido IN (?) AND empresa_id = ?`;

    const [rows] = await db.query(sql, [pedidosArray, empresaId]);

    // ... (restante do código de formatação igual ao anterior) ...

    // Só pra garantir que não quebre se não achar nada
    if (rows.length === 0)
      return res.status(404).json({ message: "Não encontrado." });

    const formattedParts = rows.map((row) => ({
      // ... (seus campos de mapeamento normais) ...
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
    }));

    res.json(formattedParts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
// ... (Mantenha as outras rotas de status e produção como estavam)

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🔥 Servidor Seguro rodando na porta ${PORT}`);
});
