/* ============================================================
   server.js — Backend Express + Postgres do app de gestão
   ------------------------------------------------------------
   Responsabilidades:
   - Servir o frontend estático (a pasta-pai: index.html, css,
     js, data, assets) — mesma origem do app.
   - Persistir o estado do app num único registro JSONB
     (tabela "estado", id=1) no Postgres.
   - Autenticar por DUAS senhas (mestre = edita / visualizador =
     só lê) com sessão em cookie httpOnly *assinado*.
   - Migrar o schema na inicialização e semear a partir dos
     JSON em ../data quando o banco estiver vazio.

   Sem dependências além de express, pg e cookie-parser.
   ============================================================ */
"use strict";

const path = require("path");
const fs = require("fs");
const express = require("express");
const cookieParser = require("cookie-parser");
const { Pool } = require("pg");

/* ============================================================
   Constantes e configuração
   ============================================================ */

// Raiz do frontend estático. No bundle achatado (server.js na raiz,
// junto do front) o default é ".". Pode ser sobrescrito por STATIC_DIR.
const ROOT = path.resolve(__dirname, process.env.STATIC_DIR || ".");
const DATA_DIR = path.join(ROOT, "data");

// Nome do cookie de sessão e tempo de vida (7 dias).
const COOKIE_NOME = "gestao_sess";
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Limite do corpo das requisições. O estado inteiro trafega num único
// PUT e pode conter anexos em base64 (fotos + PDFs/materiais dos
// palestrantes), por isso o teto é generoso (20 MB) mas ainda bloqueia abusos.
const BODY_LIMIT = "20mb";

// Porta (Railway injeta PORT; cai para 3000 em dev).
const PORT = process.env.PORT || 3000;

// Segredo para assinar o cookie de sessão. Em produção DEVE vir
// de SESSION_SECRET; em dev sem segredo, geramos um efêmero
// (sessões não sobrevivem a um restart, o que é aceitável em dev).
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  require("crypto").randomBytes(32).toString("hex");

if (!process.env.SESSION_SECRET) {
  console.warn(
    "[aviso] SESSION_SECRET ausente — usando segredo efêmero (apenas dev)."
  );
}

// Senhas de acesso. Sem elas o login é impossível (falha segura).
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || "";
const VIEWER_PASSWORD = process.env.VIEWER_PASSWORD || "";

if (!MASTER_PASSWORD || !VIEWER_PASSWORD) {
  console.warn(
    "[aviso] MASTER_PASSWORD/VIEWER_PASSWORD ausentes — o login ficará indisponível até defini-las."
  );
}

// Perfis de área temática: cada um edita SOMENTE as chaves de domínio
// listadas em `edita` (o resto do estado fica em modo leitura). A senha
// vem de variável de ambiente própria; sem a senha, o perfil não loga.
const AREA_ROLES = {
  governanca: {
    senha: process.env.GOVERNANCA_PASSWORD || "",
    edita: [
      "cronograma", "eap", "financeiro", "contratacoes", "canvas",
      "reunioes", "documentos", "equipe", "checklist", "metas"
    ]
  },
  conteudo: {
    senha: process.env.CONTEUDO_PASSWORD || "",
    edita: ["palestrantes", "prospeccao"]
  },
  experiencia: {
    senha: process.env.EXPERIENCIA_PASSWORD || "",
    edita: ["patrocinio", "voluntarios"]
  }
};

// Chaves editáveis de uma role: null = todas (master), [] = nenhuma (viewer).
function chavesEditaveis(role) {
  if (role === "master") return null;
  const area = AREA_ROLES[role];
  return area ? area.edita : [];
}

// Quais chaves de domínio compõem o estado (mesma forma de Gestao.data).
// A ordem/forma espelha tools/build-vault.js para manter consistência.
const SEED_SOURCES = {
  cronograma: "cronograma.json",
  financeiro: "financeiro.json",
  contratacoes: "contratacoes.json",
  eap: "eap.json",
  canvas: "canvas.json",
  reunioes: "reunioes.json",
  documentos: "documentos.json",
  equipe: "equipe.json",
  checklist: "checklist.json",
  palestrantes: "palestrantes.json"
};

/* ============================================================
   Postgres (pool)
   ============================================================ */

const DATABASE_URL = process.env.DATABASE_URL || "";

// SSL: o Postgres da Railway exige TLS. Habilitamos quando a URL
// pede sslmode=require OU quando estamos em produção. Em Postgres
// local (sem TLS) deixamos desligado para não quebrar a conexão.
function sslConfig(url) {
  if (!url) return false;
  const pedeSsl =
    /sslmode=require/i.test(url) ||
    /[?&]ssl=true/i.test(url) ||
    process.env.NODE_ENV === "production";
  return pedeSsl ? { rejectUnauthorized: false } : false;
}

const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: sslConfig(DATABASE_URL)
    })
  : null;

if (!pool) {
  console.warn(
    "[aviso] DATABASE_URL ausente — o servidor sobe, mas /api/estado responderá 503 até configurar o banco."
  );
}

/* ============================================================
   Migração + seed
   ------------------------------------------------------------
   Cria a tabela (idempotente) e, se a linha id=1 não existir ou
   estiver vazia ({}), semeia juntando os JSON de ../data.
   ============================================================ */

const CREATE_TABLE_SQL = `
  create table if not exists estado (
    id int primary key default 1,
    data jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now(),
    constraint uma_linha check (id = 1)
  );
`;

const CREATE_VOTOS_SQL = `
  create table if not exists votos (
    id          serial primary key,
    codigo      text        not null,
    categoria   text        not null,
    candidato_id text       not null,
    criado_em   timestamptz not null default now(),
    unique (codigo, categoria)
  );
`;

// Decifra ../data/vault.enc (AES-256-GCM, chave PBKDF2) com a senha de
// seed. Usado quando o repo só tem o vault cifrado (sem JSON em claro),
// mantendo os dados protegidos no repositório.
function decifrarVault() {
  try {
    const crypto = require("crypto");
    const vp = path.join(DATA_DIR, "vault.enc");
    if (!fs.existsSync(vp)) return null;
    const v = JSON.parse(fs.readFileSync(vp, "utf8"));
    const senha = process.env.SEED_PASSWORD || "PMBOKSUMMIT";
    const salt = Buffer.from(v.salt, "base64");
    const iv = Buffer.from(v.iv, "base64");
    const ct = Buffer.from(v.ct, "base64");
    const key = crypto.pbkdf2Sync(senha, salt, v.iter || 150000, 32, "sha256");
    const tag = ct.slice(ct.length - 16);
    const dados = ct.slice(0, ct.length - 16);
    const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
    d.setAuthTag(tag);
    const txt = Buffer.concat([d.update(dados), d.final()]).toString("utf8");
    return JSON.parse(txt);
  } catch (e) {
    console.warn("[seed] vault.enc indisponível/senha incorreta -", e.message);
    return null;
  }
}

// Monta o estado inicial. 1º tenta os JSON em claro de ../data; se não
// houver nenhum (repo público só com vault.enc), decifra o vault.enc.
function montarSeed() {
  const bundle = {};
  let achouArquivo = false;
  for (const [chave, arquivo] of Object.entries(SEED_SOURCES)) {
    const p = path.join(DATA_DIR, arquivo);
    try {
      bundle[chave] = JSON.parse(fs.readFileSync(p, "utf8"));
      achouArquivo = true;
    } catch (e) {
      bundle[chave] = null;
    }
  }
  if (!achouArquivo) {
    const v = decifrarVault();
    if (v) {
      console.log("[seed] estado semeado a partir de vault.enc");
      return v;
    }
  }
  // Garante forma consistente: chaves ausentes viram {}.
  for (const chave of Object.keys(SEED_SOURCES)) {
    if (!bundle[chave]) bundle[chave] = {};
  }
  return bundle;
}

// Considera "vazio" um objeto nulo, não-objeto ou sem chaves.
function estaVazio(data) {
  return (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    Object.keys(data).length === 0
  );
}

async function migrarESemear() {
  if (!pool) return;
  await pool.query(CREATE_TABLE_SQL);
  await pool.query(CREATE_VOTOS_SQL);

  const { rows } = await pool.query(
    "select data from estado where id = 1"
  );

  const precisaSeed = rows.length === 0 || estaVazio(rows[0].data);
  if (!precisaSeed) {
    console.log("[db] estado já populado — seed dispensado.");
    return;
  }

  const seed = montarSeed();
  // upsert idempotente na linha única.
  await pool.query(
    `insert into estado (id, data, updated_at)
     values (1, $1::jsonb, now())
     on conflict (id) do update
       set data = excluded.data, updated_at = now()`,
    [JSON.stringify(seed)]
  );
  console.log(
    "[db] estado semeado a partir de ../data:",
    Object.keys(seed).join(", ")
  );
}

/* ============================================================
   App Express
   ============================================================ */

const app = express();

// Confia no proxy da Railway (necessário p/ cookies Secure atrás de TLS).
app.set("trust proxy", 1);

// Corpo JSON com limite de tamanho (anexos base64).
app.use(express.json({ limit: BODY_LIMIT }));

// Cookies assinados com o segredo de sessão.
app.use(cookieParser(SESSION_SECRET));

/* ---- Helpers de sessão ---------------------------------- */

// Lê a role do cookie assinado. Retorna "master" | "viewer" |
// nome de área (governanca/conteudo/experiencia) | null.
function lerRole(req) {
  const role = req.signedCookies && req.signedCookies[COOKIE_NOME];
  if (role === "master" || role === "viewer") return role;
  if (role && AREA_ROLES[role]) return role;
  return null;
}

// Define o cookie de sessão assinado com a role.
function setSessao(res, role) {
  res.cookie(COOKIE_NOME, role, {
    httpOnly: true, // inacessível a JS no cliente (anti-XSS)
    signed: true, // assinado com SESSION_SECRET (anti-adulteração)
    sameSite: "lax", // mesma origem; protege contra CSRF básico
    secure: process.env.NODE_ENV === "production", // só HTTPS em prod
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/"
  });
}

// Middleware: exige sessão (qualquer role). 401 se ausente.
function exigeSessao(req, res, next) {
  const role = lerRole(req);
  if (!role) return res.status(401).json({ error: "nao_autenticado" });
  req.role = role;
  next();
}

// Middleware: exige role master. 403 se for viewer.
function exigeMaster(req, res, next) {
  const role = lerRole(req);
  if (!role) return res.status(401).json({ error: "nao_autenticado" });
  if (role !== "master") {
    return res.status(403).json({ error: "somente_leitura" });
  }
  req.role = role;
  next();
}

// Comparação de senha em tempo (quase) constante p/ evitar timing.
function senhaConfere(informada, esperada) {
  if (!esperada) return false;
  const a = Buffer.from(String(informada));
  const b = Buffer.from(String(esperada));
  if (a.length !== b.length) return false;
  try {
    return require("crypto").timingSafeEqual(a, b);
  } catch (_e) {
    return false;
  }
}

/* ============================================================
   Rotas de autenticação
   ============================================================ */

// POST /api/login { senha } -> { role }. Nunca loga a senha.
app.post("/api/login", (req, res) => {
  const senha = req.body && req.body.senha;
  if (typeof senha !== "string" || !senha) {
    return res.status(400).json({ error: "senha_obrigatoria" });
  }

  let role = null;
  if (senhaConfere(senha, MASTER_PASSWORD)) role = "master";
  else if (senhaConfere(senha, VIEWER_PASSWORD)) role = "viewer";
  else {
    // Senhas dos perfis de área (governanca/conteudo/experiencia).
    for (const nome of Object.keys(AREA_ROLES)) {
      if (senhaConfere(senha, AREA_ROLES[nome].senha)) {
        role = nome;
        break;
      }
    }
  }

  if (!role) return res.status(401).json({ error: "senha_incorreta" });

  setSessao(res, role);
  return res.json({ role, edita: chavesEditaveis(role) });
});

// POST /api/logout -> limpa o cookie de sessão.
app.post("/api/logout", (req, res) => {
  res.clearCookie(COOKIE_NOME, { path: "/" });
  return res.json({ ok: true });
});

// GET /api/me -> { role, edita } ou 401.
app.get("/api/me", (req, res) => {
  const role = lerRole(req);
  if (!role) return res.status(401).json({ error: "nao_autenticado" });
  return res.json({ role, edita: chavesEditaveis(role) });
});

/* ============================================================
   Rotas de dados
   ============================================================ */

// GET /api/ping -> { backend:true }. Sempre 200, sem auth.
// Usado pelo frontend para detectar o MODO BACKEND.
app.get("/api/ping", (_req, res) => {
  res.json({ backend: true });
});

// GET /api/estado -> { data, updated_at }. Exige sessão (master|viewer).
app.get("/api/estado", exigeSessao, async (_req, res) => {
  if (!pool) return res.status(503).json({ error: "sem_banco" });
  try {
    const { rows } = await pool.query(
      "select data, updated_at from estado where id = 1"
    );
    if (rows.length === 0) {
      // Linha ausente (seed não rodou): devolve vazio coerente.
      return res.json({ data: {}, updated_at: null });
    }
    return res.json({
      data: rows[0].data,
      updated_at: rows[0].updated_at
    });
  } catch (e) {
    console.error("[GET /api/estado] erro:", e.message);
    return res.status(500).json({ error: "erro_interno" });
  }
});

// PUT /api/estado { data } -> { updated_at }.
// - master: substitui o estado inteiro (comportamento original).
// - perfil de área: só as chaves permitidas do payload são aplicadas,
//   via merge raso no Postgres (data || $1::jsonb) — atômico e à prova
//   de escalada: o que estiver fora da área é simplesmente ignorado.
// - viewer: 403.
app.put("/api/estado", exigeSessao, async (req, res) => {
  if (!pool) return res.status(503).json({ error: "sem_banco" });

  const permitidas = chavesEditaveis(req.role);
  if (permitidas && permitidas.length === 0) {
    return res.status(403).json({ error: "somente_leitura" });
  }

  const data = req.body && req.body.data;
  // Validação de fronteira: precisa ser um objeto (não array/escalar/null).
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return res.status(400).json({ error: "data_invalido" });
  }

  // Perfil de área: reduz o payload às chaves da área.
  let payload = data;
  if (permitidas) {
    payload = {};
    for (const k of permitidas) {
      if (data[k] !== undefined) payload[k] = data[k];
    }
    if (Object.keys(payload).length === 0) {
      return res.status(403).json({ error: "fora_da_area" });
    }
  }

  // Master substitui tudo; área faz merge raso das chaves permitidas.
  const sql = permitidas
    ? `update estado set data = data || $1::jsonb, updated_at = now()
       where id = 1
       returning updated_at`
    : `update estado set data = $1::jsonb, updated_at = now()
       where id = 1
       returning updated_at`;

  try {
    const { rows } = await pool.query(sql, [JSON.stringify(payload)]);

    if (rows.length === 0) {
      // Linha ainda não existe — cria agora (defensivo).
      const ins = await pool.query(
        `insert into estado (id, data, updated_at)
         values (1, $1::jsonb, now())
         returning updated_at`,
        [JSON.stringify(payload)]
      );
      return res.json({ updated_at: ins.rows[0].updated_at });
    }

    return res.json({ updated_at: rows[0].updated_at });
  } catch (e) {
    console.error("[PUT /api/estado] erro:", e.message);
    return res.status(500).json({ error: "erro_interno" });
  }
});

/* ============================================================
   Rotas de votação (públicas — sem autenticação)
   ============================================================ */

// Retorna as sessões votáveis (tipo "especial", exceto Premiação)
// agrupadas por categoria, a partir do estado atual.
app.get("/api/votacao/candidatos", async (_req, res) => {
  if (!pool) return res.status(503).json({ error: "sem_banco" });
  try {
    const { rows } = await pool.query("select data from estado where id = 1");
    const data = rows[0] && rows[0].data ? rows[0].data : {};
    const palcos = (data.palestrantes && data.palestrantes.palcos) || [];

    const categorias = {
      "melhor-projeto": { label: "Melhor Projeto", candidatos: [] },
      "melhor-pmo":     { label: "Melhor PMO",     candidatos: [] }
    };

    palcos.forEach(function (palco) {
      (palco.sessoes || []).forEach(function (s) {
        if (s.tipo !== "especial" || s.id === "prem") return;
        if (s.titulo.toLowerCase().includes("projeto")) {
          categorias["melhor-projeto"].candidatos.push({ id: s.id, titulo: s.titulo, palestrante: s.palestrante || "", empresa: s.empresa || "" });
        } else if (s.titulo.toLowerCase().includes("pmo")) {
          categorias["melhor-pmo"].candidatos.push({ id: s.id, titulo: s.titulo, palestrante: s.palestrante || "", empresa: s.empresa || "" });
        }
      });
    });

    return res.json(categorias);
  } catch (e) {
    console.error("[GET /api/votacao/candidatos]", e.message);
    return res.status(500).json({ error: "erro_interno" });
  }
});

// Verifica em quais categorias um código já votou.
app.get("/api/votacao/situacao", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "sem_banco" });
  const codigo = req.query.codigo && String(req.query.codigo).trim().toUpperCase();
  if (!codigo) return res.status(400).json({ error: "codigo_obrigatorio" });
  try {
    const { rows } = await pool.query(
      "select categoria from votos where codigo = $1", [codigo]
    );
    const jaVotou = rows.map(function (r) { return r.categoria; });
    return res.json({ codigo: codigo, ja_votou: jaVotou });
  } catch (e) {
    console.error("[GET /api/votacao/situacao]", e.message);
    return res.status(500).json({ error: "erro_interno" });
  }
});

// Registra um voto. Retorna 409 se o código já votou nessa categoria.
app.post("/api/votacao/votar", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "sem_banco" });
  const { codigo, categoria, candidato_id } = req.body || {};
  if (!codigo || !categoria || !candidato_id) {
    return res.status(400).json({ error: "campos_obrigatorios" });
  }
  const cod = String(codigo).trim().toUpperCase();
  const cat = String(categoria).trim();
  const cid = String(candidato_id).trim();

  const categoriasValidas = ["melhor-projeto", "melhor-pmo"];
  if (!categoriasValidas.includes(cat)) {
    return res.status(400).json({ error: "categoria_invalida" });
  }

  try {
    await pool.query(
      "insert into votos (codigo, categoria, candidato_id) values ($1, $2, $3)",
      [cod, cat, cid]
    );
    return res.json({ ok: true });
  } catch (e) {
    if (e.code === "23505") { // unique_violation
      return res.status(409).json({ error: "ja_votou" });
    }
    console.error("[POST /api/votacao/votar]", e.message);
    return res.status(500).json({ error: "erro_interno" });
  }
});

// Zera todos os votos (somente master).
app.delete("/api/votacao/zerar", exigeMaster, async (_req, res) => {
  if (!pool) return res.status(503).json({ error: "sem_banco" });
  try {
    await pool.query("delete from votos");
    return res.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/votacao/zerar]", e.message);
    return res.status(500).json({ error: "erro_interno" });
  }
});

// Resultado da votação: contagem por categoria e candidato.
app.get("/api/votacao/resultado", async (_req, res) => {
  if (!pool) return res.status(503).json({ error: "sem_banco" });
  try {
    const { rows } = await pool.query(
      "select categoria, candidato_id, count(*)::int as votos from votos group by categoria, candidato_id order by categoria, votos desc"
    );
    const resultado = {};
    rows.forEach(function (r) {
      if (!resultado[r.categoria]) resultado[r.categoria] = [];
      resultado[r.categoria].push({ candidato_id: r.candidato_id, votos: r.votos });
    });
    return res.json(resultado);
  } catch (e) {
    console.error("[GET /api/votacao/resultado]", e.message);
    return res.status(500).json({ error: "erro_interno" });
  }
});

/* ============================================================
   Frontend estático
   ------------------------------------------------------------
   Servido por último, depois das rotas /api, para que /api/*
   nunca caia no static. Serve index.html, css, js, data, assets.
   ============================================================ */
app.use(
  express.static(ROOT, {
    index: "index.html",
    extensions: ["html"]
  })
);

// Tratador de erros central (ex.: corpo acima do limite -> 413).
// Mensagens genéricas; detalhes só no log do servidor.
app.use((err, _req, res, _next) => {
  if (err && err.type === "entity.too.large") {
    return res.status(413).json({ error: "corpo_muito_grande" });
  }
  console.error("[erro]", err && err.message);
  if (res.headersSent) return;
  res.status(500).json({ error: "erro_interno" });
});

/* ============================================================
   Bootstrap
   ============================================================ */
async function iniciar() {
  try {
    await migrarESemear();
  } catch (e) {
    // Não derruba o processo: o app ainda serve o estático e /api/ping.
    console.error("[db] falha na migração/seed:", e.message);
  }

  app.listen(PORT, () => {
    console.log(`Servidor de gestão ouvindo na porta ${PORT}`);
    console.log(`Servindo estático de: ${ROOT}`);
  });
}

iniciar();
