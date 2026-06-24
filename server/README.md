# Backend de gestão — Node + Postgres

Backend Express que serve o frontend estático do app de gestão (PMIRS Summit 2026)
e persiste o estado num único registro JSONB no Postgres, com **dois níveis de
acesso por senha**:

- **MESTRE** (`MASTER_PASSWORD`): pode editar e salvar.
- **VISUALIZADOR** (`VIEWER_PASSWORD`): apenas visualiza (somente leitura).

O frontend detecta o modo em runtime: se `GET /api/ping` responder, entra no
**modo backend**; se falhar (ex.: GitHub Pages), continua no **modo vault**
(estático, decifrando `data/vault.enc`) — o fallback fica intacto.

---

## Estrutura

```
Site_Gestao/
├── index.html        ← frontend estático (servido pelo backend)
├── css/  js/  data/  assets/
└── server/           ← este backend
    ├── server.js
    ├── package.json
    ├── railway.json
    ├── .env.example
    └── README.md
```

O servidor serve a **pasta-pai** (`..`) como estático, então `index.html`,
`css/`, `js/`, `data/` e `assets/` são entregues na mesma origem das rotas `/api`.

---

## Rodar local

Pré-requisitos: Node >= 18 e um Postgres acessível.

```bash
cd server
npm install

# Gere um segredo de sessão:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Suba o servidor (uma linha):
DATABASE_URL="postgres://usuario:senha@localhost:5432/gestao" \
MASTER_PASSWORD="senha-mestre" \
VIEWER_PASSWORD="senha-visualizador" \
SESSION_SECRET="<cole-o-segredo-gerado>" \
npm start
```

Abra `http://localhost:3000`. Na primeira subida, se a tabela `estado` estiver
vazia, ela é **semeada** automaticamente juntando os JSON de `../data`.

> No Windows (PowerShell), defina as variáveis antes:
> ```powershell
> $env:DATABASE_URL="postgres://usuario:senha@localhost:5432/gestao"
> $env:MASTER_PASSWORD="senha-mestre"
> $env:VIEWER_PASSWORD="senha-visualizador"
> $env:SESSION_SECRET="<segredo>"
> npm start
> ```

---

## Variáveis de ambiente

| Variável          | Obrigatória | Descrição                                                        |
|-------------------|:-----------:|------------------------------------------------------------------|
| `DATABASE_URL`    | sim¹        | Conexão Postgres. Na Railway, injetada pelo plugin Postgres.     |
| `MASTER_PASSWORD` | sim         | Senha do nível mestre (edita).                                   |
| `VIEWER_PASSWORD` | sim         | Senha do nível visualizador (só lê).                            |
| `SESSION_SECRET`  | sim²        | Segredo para assinar o cookie de sessão.                         |
| `PORT`            | não         | Porta. A Railway injeta automaticamente.                        |
| `NODE_ENV`        | não         | `production` ativa cookie `Secure` e SSL no banco.              |

¹ Sem `DATABASE_URL` o servidor sobe (serve estático + `/api/ping`), mas
`/api/estado` responde `503`.
² Sem `SESSION_SECRET` em dev, um segredo efêmero é gerado (sessões caem a cada
restart). **Em produção, sempre defina.**

---

## Rotas da API

| Método | Rota           | Auth            | Corpo            | Resposta                          |
|--------|----------------|-----------------|------------------|-----------------------------------|
| GET    | `/api/ping`    | nenhuma         | —                | `{ backend: true }` (sempre 200)  |
| POST   | `/api/login`   | nenhuma         | `{ senha }`      | `{ role }` ou `401`               |
| POST   | `/api/logout`  | nenhuma         | —                | `{ ok: true }`                    |
| GET    | `/api/me`      | cookie          | —                | `{ role }` ou `401`               |
| GET    | `/api/estado`  | master/viewer   | —                | `{ data, updated_at }`            |
| PUT    | `/api/estado`  | **master**      | `{ data }`       | `{ updated_at }` (viewer → `403`) |

- `role` é `"master"` ou `"viewer"`.
- Cookie de sessão: `httpOnly`, **assinado** (`SESSION_SECRET`), `SameSite=Lax`,
  `Secure` em produção.
- Limite de corpo: 8 MB (anexos base64) → acima disso, `413`.

---

## Deploy na Railway

1. **Crie o serviço** a partir do repositório.
   - Como o backend vive em `server/`, configure o **Root Directory** do serviço
     como `server` (Settings → Service → Root Directory). Assim a Railway acha o
     `package.json` e o `railway.json` corretos. O `server.js` serve a pasta-pai
     (`..`), então o frontend continua sendo entregue normalmente.
   - Alternativa (root como diretório do serviço): mantenha o Root Directory na
     raiz e defina o **Start Command** como `node server/server.js`. Nesse caso o
     `server/railway.json` não é lido; configure o start command manualmente.
2. **Adicione o plugin Postgres** (Add → Database → PostgreSQL). Ele cria a
   variável `DATABASE_URL` e a referencia no serviço automaticamente.
3. **Configure as variáveis** no serviço (Variables):
   - `MASTER_PASSWORD`
   - `VIEWER_PASSWORD`
   - `SESSION_SECRET` (string longa e aleatória)
   - `NODE_ENV=production` (recomendado: ativa cookie `Secure` + SSL no banco)
4. **Deploy.** Na primeira subida o servidor cria a tabela `estado` e a semeia a
   partir de `../data`. Gere um domínio público em Settings → Networking.

> Qual arquivo de deploy usar: com **Root Directory = `server`**, a Railway lê
> `server/railway.json` (builder Nixpacks + `startCommand: node server.js`). Não
> é necessário `Procfile` nem `nixpacks.toml`. Com root na raiz do repo, ignore
> o `railway.json` e use o Start Command `node server/server.js`.

---

## Schema do banco

Criado automaticamente na inicialização (idempotente):

```sql
create table if not exists estado (
  id int primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint uma_linha check (id = 1)
);
```

Sempre uma única linha (`id = 1`). O estado inteiro do app vive em `data`.

---

## Como testar local sem Railway

Com um Postgres local (Docker, por exemplo):

```bash
docker run -d --name pg-gestao -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=gestao -p 5432:5432 postgres:16

cd server && npm install
DATABASE_URL="postgres://postgres:postgres@localhost:5432/gestao" \
MASTER_PASSWORD="mestre123" VIEWER_PASSWORD="viewer123" \
SESSION_SECRET="dev-secret-please-change" npm start
```

Verifique as rotas:

```bash
# detecção de modo (sem auth)
curl -s localhost:3000/api/ping                       # {"backend":true}

# login mestre (guarda o cookie)
curl -s -c ck.txt -X POST localhost:3000/api/login \
  -H 'Content-Type: application/json' -d '{"senha":"mestre123"}'   # {"role":"master"}

# ler estado
curl -s -b ck.txt localhost:3000/api/estado

# salvar (master ok)
curl -s -b ck.txt -X PUT localhost:3000/api/estado \
  -H 'Content-Type: application/json' -d '{"data":{"x":1}}'

# viewer não pode salvar -> 403
curl -s -c ck2.txt -X POST localhost:3000/api/login \
  -H 'Content-Type: application/json' -d '{"senha":"viewer123"}'
curl -s -o /dev/null -w "%{http_code}\n" -b ck2.txt -X PUT \
  localhost:3000/api/estado -H 'Content-Type: application/json' -d '{"data":{}}'  # 403
```
