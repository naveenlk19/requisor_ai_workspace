# Local Functionality Test Plan

Feature-by-feature checkpoints for verifying the migrated app against a local
Postgres. Run the UI action, then the SQL query to confirm the data landed.

Connect to the DB:

```bash
docker compose exec db psql -U postgres -d requisor
```

---

## 0. Boot & schema

- [ ] `npm run dev` boots with no red errors; `curl localhost:8080/api/health` returns OK
- [ ] All tables created:

```sql
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
-- expect ~80+
```

- [ ] pgvector active:

```sql
SELECT extname FROM pg_extension WHERE extname = 'vector';
```

- [ ] Plans seeded by db-setup self-heal:

```sql
SELECT id, name, slug, price, monthly_token_limit FROM subscription_plans ORDER BY id;
-- expect Free + paid plan rows; id=1 must exist (new users default to it)
```

## 1. Authentication (Google — replaced Replit Auth)

- [ ] "Sign in" → Google account picker → lands back in the app logged in
- [ ] Log out → session gone → sign in again works
- [ ] Second sign-in with the SAME Google account does NOT create a duplicate user

```sql
-- after first login: one row, email matches your Google account
SELECT id, username, email, plan_id, created_at FROM users ORDER BY created_at DESC LIMIT 5;

-- session persisted (connect-pg-simple)
SELECT count(*) FROM sessions;

-- duplicate check after second login: still one row per email
SELECT email, count(*) FROM users GROUP BY email HAVING count(*) > 1;  -- expect 0 rows
```

## 2. Project creation (AI chat / Plan mode)

- [ ] Create a project via the AI conversational flow (describe an idea, accept the plan)
- [ ] Project appears on the dashboard; tasks/milestones generated

```sql
SELECT id, name, owner_id, source, created_at FROM projects ORDER BY created_at DESC LIMIT 3;

SELECT project_id, count(*) AS tasks, count(*) FILTER (WHERE status = 'todo') AS todo
FROM tasks GROUP BY project_id ORDER BY project_id DESC LIMIT 3;

-- chat history persisted
SELECT id, user_id, created_at FROM chat_sessions ORDER BY created_at DESC LIMIT 3;
SELECT session_id, role, left(content, 60) FROM chat_messages ORDER BY id DESC LIMIT 6;
```

## 3. AI streaming (SSE)

- [ ] Responses in Plan/Build chat stream token-by-token (not one big paste)
- [ ] Token usage recorded:

```sql
SELECT user_id, model, prompt_tokens, completion_tokens, created_at
FROM token_usage ORDER BY created_at DESC LIMIT 5;

SELECT * FROM token_budgets LIMIT 3;
```

## 4. File upload → Evidence Library (Brain → Notes & Files)

- [ ] Upload a PDF and a DOCX; both parse and show extracted content
- [ ] File lands in MinIO, not on local disk

```sql
SELECT id, user_id, title, insight_type, left(content, 60), created_at
FROM evidence_items ORDER BY created_at DESC LIMIT 5;
```

MinIO check: open http://localhost:9001 → bucket `requisor-dev` → `media/` has new objects.

## 5. Meetings: audio upload → transcription → summary

Needs `OPENAI_API_KEY` (Whisper, files ≤25MB) or `ASSEMBLYAI_API_KEY` (diarization).

- [ ] Upload a short audio file in Meetings → transcript appears
- [ ] Summary generated; with AssemblyAI, speakers are labeled
- [ ] Audio playback works (streams back from MinIO)

```sql
SELECT id, title, source, participant_count, audio_url IS NOT NULL AS has_audio,
       diarized_transcript IS NOT NULL AS diarized, created_at
FROM conversations ORDER BY created_at DESC LIMIT 5;

SELECT conversation_id, filename, mime_type, size FROM conversation_attachments
ORDER BY id DESC LIMIT 5;

-- voice fingerprinting (after confirming a speaker name)
SELECT user_id, speaker_name, sample_count FROM speaker_voiceprints LIMIT 5;
```

## 6. Conversations import (paste / Slack / email)

- [ ] Paste a chat transcript in Brain → Conversations → normalized + summarized
- [ ] Action items extracted and routable to a project

```sql
SELECT id, title, source, external_id FROM conversations
WHERE source IN ('manual','slack','discord','email')
ORDER BY created_at DESC LIMIT 5;
```

## 7. Embeddings, entity graph, beliefs (Context Brain)

After uploading evidence/conversations, ask the Brain a question about them.

- [ ] Answer cites sources (citation chips)
- [ ] Retrieval data present:

```sql
SELECT count(*) FROM embeddings;
SELECT type, count(*) FROM entities GROUP BY type ORDER BY count(*) DESC LIMIT 8;
SELECT predicate, count(*) FROM entity_edges GROUP BY predicate LIMIT 8;

-- beliefs only appear after consolidation runs (nightly, or run the backfill):
-- npx tsx scripts/backfill-beliefs.ts <userId>
SELECT id, predicate, object, holder, weight, status FROM beliefs LIMIT 5;
```

## 8. Feature candidates & prioritization (Build mode)

- [ ] Generate/add feature candidates; RICE scores compute; priority matrix renders

```sql
SELECT id, title, rice_score, mention_count, status FROM feature_candidates
ORDER BY created_at DESC LIMIT 5;
```

## 9. Object storage round-trip (the S3 migration seam — test carefully)

- [ ] Upload (audio or Gmail attachment) → download/stream back → bytes identical
- [ ] Kill MinIO (`docker compose stop minio`) → upload fails with a clean error, app stays up → restart it

## 10. Stripe (test mode)

- [ ] Upgrade flow opens Stripe checkout (test card `4242 4242 4242 4242`)
- [ ] Webhook updates the user (needs `stripe listen --forward-to localhost:8080/api/stripe/webhook` and the CLI's webhook secret in `STRIPE_WEBHOOK_SECRET`)

```sql
SELECT id, email, plan_id, stripe_customer_id, subscription_status FROM users
WHERE stripe_customer_id IS NOT NULL;
```

## 11. MCP endpoint

- [ ] Personal access token created on the Connect page:

```sql
SELECT id, user_id, name, left(token_hash, 12), created_at FROM personal_access_tokens
ORDER BY created_at DESC LIMIT 3;
```

- [ ] OAuth discovery works: `curl localhost:8080/.well-known/oauth-authorization-server` returns JSON

```sql
SELECT client_id, client_name FROM oauth_clients ORDER BY created_at DESC LIMIT 3;
```

## 12. Background jobs (cron)

- [ ] With `CRON_ENABLED=true`, boot logs show "Starting cron scheduler"
- [ ] With `CRON_ENABLED=false`, logs show "disabled via CRON_ENABLED"
- [ ] Scheduled social posts table exists (publishing needs real social accounts — just verify no crash loops in logs):

```sql
SELECT id, status, scheduled_for FROM scheduled_social_posts LIMIT 3;
```

## 13. Integrations smoke (optional, each needs its own OAuth app + localhost callback)

- [ ] Gmail connect → import 5 messages → `SELECT count(*) FROM conversations WHERE source='email';`
- [ ] Jira/Asana/Monday/Smartsheet connect → `SELECT provider, user_id FROM integrations;`
- [ ] Linear: set `LINEAR_API_KEY` → integration reports available (migrated off Replit connectors — worth testing if you use it)

---

## Migration-specific regression checks (the seams that changed)

These are the exact places the Replit removal touched — test them hardest:

1. **Login** (Replit OIDC → Google): new user, returning user, logout, MCP consent redirect (`/api/oauth/authorize` while logged out should bounce to login and return).
2. **Object storage** (sidecar → S3): upload, download, stream audio, Gmail attachment fetch.
3. **OAuth callback URLs in social flows** (Twitter/Instagram/Mastodon protocol detection was rewritten): connect one social account end-to-end if you use social publishing.
4. **Teams meeting OAuth** (`getRedirectUri` was hardcoded to a Replit domain, now `APP_URL`-based): reconnect Teams if used.
5. **Linear** (Replit connector → `LINEAR_API_KEY`).
6. **Session cookie**: log in, restart the server (`Ctrl-C`, `npm run dev`), reload the page — still logged in (sessions live in Postgres, not memory).
