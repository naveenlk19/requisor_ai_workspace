#!/bin/bash
set -e

# Best-effort install (includes devDependencies — drizzle-kit is a devDep).
# The firewall-blocked docx-parser/decompress pair was removed from
# package.json, so a normal install succeeds. If install still fails, continue
# with the existing node_modules rather than aborting the whole post-merge.
npm install --no-audit --no-fund --include=dev || {
  echo "[post-merge] npm install exited non-zero; continuing with existing node_modules." >&2
}

# IMPORTANT: no --force. This database contains live objects created by raw SQL
# in server/db-setup.ts that are NOT in shared/schema.ts (oauth_states table,
# embeddings.tsv column + GIN index, users.auth_provider, tasks.updated_at /
# last_opened_at). A forced push would DROP them and break OAuth state, hybrid
# retrieval, and task queries. Non-forced push applies clean additive changes
# automatically and safely aborts (EOF on the prompt) when anything ambiguous
# or destructive is detected — resolve those cases with targeted SQL instead.
./node_modules/.bin/drizzle-kit push < /dev/null || {
  echo "[post-merge] drizzle-kit push needs manual review (ambiguous or destructive drift); apply schema changes via targeted SQL." >&2
}

# Dev serves the prebuilt frontend from dist/public — rebuild so merged client
# changes actually show up.
NODE_OPTIONS=--max-old-space-size=3584 npx vite build
