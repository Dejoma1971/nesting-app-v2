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

// Rota de Login (Não precisa de token para entrar nela)
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Dados incompletos." });

  try {
    const [rows] = await db.execute(
      'SELECT id, nome, email, senha_hash, plano FROM usuarios WHERE email = ? AND status = "ativo"',
      [email]
    );
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password, user.senha_hash))) {
      return res.status(401).json({ error: "Credenciais inválidas." });
    }

    const token = jwt.sign({ id: user.id, plano: user.plano }, JWT_SECRET, {
      expiresIn: "24h",
    });

    res.json({
      user: {
        id: user.id,
        name: user.nome,
        email: user.email,
        plan: user.plano,
      },
      token,
    });
  } catch (error) {
    console.error("Erro login:", error);
    res.status(500).json({ error: "Erro interno." });
  }
});

// --- Rota de Busca de Peças (AGORA SEGURA 🔒) ---
// 1. Adicionamos 'authenticateToken' aqui para garantir que temos o usuário
app.get("/api/pecas/buscar", authenticateToken, async (req, res) => {
  const { pedido } = req.query;
  const usuarioId = req.user.id; // <--- Pegamos o ID de quem está logado

  if (!pedido) {
    return res
      .status(400)
      .json({ error: "Por favor, forneça o número do pedido." });
  }

  const pedidosArray = pedido
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  console.log(
    `🔎 Usuário ${req.user.name} buscando pedidos: ${pedidosArray.join(
      ", "
    )}...`
  );

  try {
    // 2. O SQL AGORA EXIGE QUE O DONO SEJA O USUÁRIO LOGADO
    const sql = `SELECT * FROM pecas_engenharia WHERE pedido IN (?) AND usuario_id = ?`;

    // Passamos o array de pedidos E o ID do usuário
    const [rows] = await db.query(sql, [pedidosArray, usuarioId]);

    if (rows.length === 0) {
      // Se o pedido existe mas é de outra pessoa, vai cair aqui (lista vazia)
      return res
        .status(404)
        .json({ message: "Nenhuma peça encontrada para você nestes pedidos." });
    }

    // Formatação dos dados (mantive igual ao seu)
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
    }));

    console.log(`✅ ${formattedParts.length} peças encontradas.`);
    res.json(formattedParts);
  } catch (error) {
    console.error("❌ Erro na busca:", error);
    res
      .status(500)
      .json({ error: "Erro ao buscar dados.", details: error.message });
  }
});

// Busca (Pública ou Privada? Por enquanto pública, mas ideal proteger depois)
app.get("/api/pecas/buscar", async (req, res) => {
  // ... (Mantenha o código de busca que você já tem, ele está funcionando)
  // Se quiser proteger também, adicione authenticateToken e filtre por usuario_id na query SQL
  const { pedido } = req.query;
  if (!pedido) return res.status(400).json({ error: "Falta pedido." });

  const pedidosArray = pedido
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  try {
    const sql = `SELECT * FROM pecas_engenharia WHERE pedido IN (?)`;
    const [rows] = await db.query(sql, [pedidosArray]);

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
