# Run Requisor Locally

Everything runs from this folder. One Node process serves both the API and the
React app (the server mounts Vite in dev mode), plus two Docker containers for
infrastructure (Postgres with pgvector, MinIO for S3-compatible object storage).

## Prerequisites

- **Node 20+** (`node -v`)
- **Docker Desktop** (for Postgres + MinIO)
- A **Google OAuth client** for login (5 min, steps below)
- An **OpenAI API key** (most AI features), optionally Anthropic/AssemblyAI

## 1. Start infrastructure

```bash
docker compose up -d
```

This starts:
- Postgres 16 **with pgvector baked in** on `localhost:5432` (user `postgres`, password `postgres`, db `requisor`)
- MinIO (local S3) on `localhost:9000`, web console at http://localhost:9001 (login `minioadmin`/`minioadmin`)
- A one-shot job that creates the `requisor-dev` bucket

Enable the vector extension (first time only):

```bash
docker compose exec db psql -U postgres -d requisor -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

## 2. Create the Google OAuth client (login)

1. https://console.cloud.google.com → APIs & Services → Credentials → Create Credentials → **OAuth client ID** → type **Web application**
2. Authorized redirect URI: `http://localhost:8080/api/callback`
3. Copy the client ID + secret into `.env` (next step)

## 3. Configure environment

```bash
cp .env.example .env
```

Minimal set to boot and log in (everything else is optional and degrades gracefully):

```env
NODE_ENV=development
PORT=8080
APP_URL=http://localhost:8080
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/requisor
SESSION_SECRET=<openssl rand -hex 32>
GOOGLE_CLIENT_ID=<from step 2>
GOOGLE_CLIENT_SECRET=<from step 2>
S3_BUCKET=requisor-dev
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
OPENAI_API_KEY=<your key>
```

> `npm run dev` loads `.env` automatically? **No** — the server reads plain
> `process.env`. Export the vars or use a loader:
> `npx dotenv-cli -e .env -- npm run dev`, or simply
> `set -a && source .env && set +a && npm run dev` (zsh/bash).

## 4. Install, create schema, run

```bash
npm ci
set -a && source .env && set +a
# creates all 81 tables from shared/schema.ts
npm run db:push
# starts server + Vite on http://localhost:8080
npm run dev
```

On first boot the server's self-healing setup (`server/db-setup.ts`) seeds
`subscription_plans` and patches anything `db:push` missed. Watch the logs for
`✅`/`⚠️` lines.

Open **http://localhost:8080** → "Sign in" → Google → you're in.

## 5. Production build (what Render runs)

```bash
# vite build + esbuild server bundle → dist/
npm run build
# NODE_ENV=production node dist/index.js
npm start
```

Or the exact container Render builds:

```bash
docker build -t requisor --build-arg VITE_STRIPE_PUBLIC_KEY=pk_test_xxx .
docker run --rm -p 8080:8080 --env-file .env \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5432/requisor \
  -e S3_ENDPOINT=http://host.docker.internal:9000 \
  requisor
```

(`host.docker.internal` lets the container reach the compose services on your Mac.)

## Running without Docker (native Postgres + MinIO)

If you'd rather not use Docker, both infrastructure pieces run natively on macOS:

```bash
# Postgres 16+ with pgvector
brew install postgresql@18 pgvector
brew services start postgresql@18
createdb requisor
psql requisor -c "CREATE EXTENSION IF NOT EXISTS vector;"

# MinIO (S3-compatible object storage), default creds minioadmin/minioadmin
brew install minio
brew services start minio
```

Create the bucket (no `mc` client needed — uses the AWS SDK already in node_modules):

```bash
node -e "
const { S3Client, CreateBucketCommand } = require('@aws-sdk/client-s3');
new S3Client({ endpoint: 'http://localhost:9000', region: 'us-east-1', forcePathStyle: true,
  credentials: { accessKeyId: 'minioadmin', secretAccessKey: 'minioadmin' } })
  .send(new CreateBucketCommand({ Bucket: 'requisor-dev' }));
"
```

`.env` differences vs the Docker setup:

- Homebrew Postgres has no `postgres` role or SSL — connect as your macOS user
  and disable SSL explicitly (the server otherwise forces `sslmode=require`):
  ```env
  DATABASE_URL=postgresql://<your-mac-username>@localhost:5432/requisor?sslmode=disable
  ```
- If port 8080 is taken, change `PORT`, `APP_URL`, and `APP_DOMAIN` together,
  and register the matching redirect URI (`<APP_URL>/api/callback`) in Google Console.

Everything else (steps 2–4) is identical.

## Verifying features work

See **localtest.md** — a feature-by-feature checklist with the SQL queries to
confirm each flow wrote what it should.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `S3_BUCKET not set` errors on upload | `.env` not loaded into the shell — see the loader note in step 3 |
| `relation "sessions" does not exist` | It's created on demand by the session store; boot the app once, or re-run `npm run db:push` |
| Google login redirects to `/api/login` in a loop | Redirect URI mismatch — must be exactly `http://localhost:8080/api/callback` in Google Console |
| `type "vector" does not exist` during db:push | Run the `CREATE EXTENSION` command from step 1 |
| AI chat returns errors | `OPENAI_API_KEY` missing/invalid; embeddings + entity extraction fail-open, chat itself needs the key |
| Port 8080 busy | `lsof -ti :8080 \| xargs kill` |
