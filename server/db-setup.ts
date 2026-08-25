import { db } from "./db";
import { sql } from "drizzle-orm";

export async function setupDatabase() {
  try {
    console.log("Setting up database tables...");

    // Create session table
    const createSessionsTableSQL = `
      CREATE TABLE IF NOT EXISTS sessions (
        sid VARCHAR(255) PRIMARY KEY,
        sess JSONB NOT NULL,
        expire TIMESTAMP NOT NULL
      )
    `;
    await db.execute(createSessionsTableSQL);

    // Create index on sessions.expire
    const createSessionsIndexSQL = `
      CREATE INDEX IF NOT EXISTS IDX_session_expire ON sessions (expire)
    `;
    await db.execute(createSessionsIndexSQL);

    // Create users table
    const createUsersTableSQL = `
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(255) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        bio TEXT,
        profile_image_url VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await db.execute(createUsersTableSQL);

    // Create projects table
    const createProjectsTableSQL = `
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        due_date TIMESTAMP,
        status TEXT DEFAULT 'active',
        progress INTEGER DEFAULT 0,
        total_tasks INTEGER DEFAULT 0,
        completed_tasks INTEGER DEFAULT 0,
        icon TEXT DEFAULT 'folder-open',
        icon_bg TEXT DEFAULT 'blue',
        created_at TIMESTAMP DEFAULT NOW(),
        owner_id VARCHAR(255) REFERENCES users(id),
        external_id TEXT,
        source TEXT DEFAULT 'manual',
        source_data JSONB,
        ai_generated BOOLEAN DEFAULT FALSE
      )
    `;
    await db.execute(createProjectsTableSQL);

    // Create tasks table
    const createTasksTableSQL = `
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'todo',
        is_completed BOOLEAN DEFAULT FALSE,
        due_date TIMESTAMP,
        priority TEXT DEFAULT 'medium',
        assignee_id VARCHAR(255) REFERENCES users(id),
        project_id INTEGER REFERENCES projects(id),
        parent_task_id INTEGER REFERENCES tasks(id),
        external_id TEXT,
        source TEXT DEFAULT 'manual',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await db.execute(createTasksTableSQL);

    // Create integrations table
    const createIntegrationsTableSQL = `
      CREATE TABLE IF NOT EXISTS integrations (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) REFERENCES users(id),
        provider TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        token_expiry TIMESTAMP,
        is_connected BOOLEAN DEFAULT FALSE,
        last_synced TIMESTAMP,
        workspace_id TEXT,
        additional_data JSONB
      )
    `;
    await db.execute(createIntegrationsTableSQL);

    // Create insights table
    const createInsightsTableSQL = `
      CREATE TABLE IF NOT EXISTS insights (
        id SERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        severity TEXT DEFAULT 'info',
        project_id INTEGER REFERENCES projects(id),
        created_at TIMESTAMP DEFAULT NOW(),
        is_resolved BOOLEAN DEFAULT FALSE,
        resolved_at TIMESTAMP,
        suggested_action TEXT
      )
    `;
    await db.execute(createInsightsTableSQL);

    // Create project members table
    const createProjectMembersTableSQL = `
      CREATE TABLE IF NOT EXISTS project_members (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'viewer',
        added_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await db.execute(createProjectMembersTableSQL);

    // Create project invitations table
    const createProjectInvitationsTableSQL = `
      CREATE TABLE IF NOT EXISTS project_invitations (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'viewer',
        token TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        invited_by VARCHAR(255) NOT NULL REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP,
        accepted_at TIMESTAMP
      )
    `;
    await db.execute(createProjectInvitationsTableSQL);

    // Create kanban columns table
    const createKanbanColumnsTableSQL = `
      CREATE TABLE IF NOT EXISTS kanban_columns (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        color TEXT DEFAULT 'bg-slate-100',
        icon_name TEXT DEFAULT 'circle',
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await db.execute(createKanbanColumnsTableSQL);

    // Create AI tools table
    const createAiToolsTableSQL = `
      CREATE TABLE IF NOT EXISTS ai_tools (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        free_plan_available BOOLEAN DEFAULT FALSE,
        pricing TEXT,
        website TEXT NOT NULL,
        logo_url TEXT,
        use_case TEXT,
        ideal_for TEXT
      )
    `;
    await db.execute(createAiToolsTableSQL);

    // Create task tool recommendations table
    const createTaskToolRecommendationsTableSQL = `
      CREATE TABLE IF NOT EXISTS task_tool_recommendations (
        id SERIAL PRIMARY KEY,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        tool_id INTEGER NOT NULL REFERENCES ai_tools(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'suggested',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(task_id, tool_id)
      )
    `;
    await db.execute(createTaskToolRecommendationsTableSQL);

    // Enable pgvector extension
    try {
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
      console.log("Vector extension enabled.");
    } catch (e) {
      console.warn("Could not enable vector extension. Vector features may not work:", e);
    }

    // Create chat embeddings table
    // 768 dimensions for gemini-1.5-flash text-embedding-004
    const createChatEmbeddingsTableSQL = `
      CREATE TABLE IF NOT EXISTS chat_embeddings (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        embedding vector(768),
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    // Only attempt to create if vector extension succeeded/exists (handled by SQL usually, but good practice)
    try {
      await db.execute(createChatEmbeddingsTableSQL);
    } catch (e) {
      console.warn("Could not create chat_embeddings table (vector extension missing?):", e);
    }

    const createEvidenceItemsTableSQL = `
      CREATE TABLE IF NOT EXISTS evidence_items (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'note',
        source_id INTEGER,
        tags TEXT[] DEFAULT '{}',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await db.execute(createEvidenceItemsTableSQL);

    const addEvidenceOriginalFileColumnsSQL = `
      DO $$ BEGIN
        ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS object_path TEXT;
        ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS original_filename TEXT;
        ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS mime_type TEXT;
        ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS file_size INTEGER;
      EXCEPTION WHEN undefined_table THEN NULL;
      END $$;
    `;
    await db.execute(addEvidenceOriginalFileColumnsSQL);

    const addScoringColumnsSQL = `
      DO $$ BEGIN
        ALTER TABLE feature_candidates ADD COLUMN IF NOT EXISTS impact_score INTEGER;
        ALTER TABLE feature_candidates ADD COLUMN IF NOT EXISTS effort_score INTEGER;
        ALTER TABLE feature_candidates ADD COLUMN IF NOT EXISTS confidence_score INTEGER;
        ALTER TABLE feature_candidates ADD COLUMN IF NOT EXISTS rice_score INTEGER;
        ALTER TABLE feature_candidates ADD COLUMN IF NOT EXISTS priority_rank INTEGER;
        ALTER TABLE feature_candidates ADD COLUMN IF NOT EXISTS score_reasoning JSONB;
        ALTER TABLE feature_candidates ADD COLUMN IF NOT EXISTS insights JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE feature_candidates ADD COLUMN IF NOT EXISTS reasoning_chain TEXT;
        ALTER TABLE feature_candidates ADD COLUMN IF NOT EXISTS last_sent_to_agent TEXT;
        ALTER TABLE feature_candidates ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMP;
      EXCEPTION WHEN undefined_table THEN NULL;
      END $$;
    `;
    await db.execute(addScoringColumnsSQL);

    const addInsightTypeColumnSQL = `
      DO $$ BEGIN
        ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS insight_type TEXT;
        ALTER TABLE evidence_items ADD COLUMN IF NOT EXISTS mention_count INTEGER DEFAULT 1;
      EXCEPTION WHEN undefined_table THEN NULL;
      END $$;
    `;
    await db.execute(addInsightTypeColumnSQL);

    const addMentionCountToFeatureCandidatesSQL = `
      DO $$ BEGIN
        ALTER TABLE feature_candidates ADD COLUMN IF NOT EXISTS mention_count INTEGER DEFAULT 1;
      EXCEPTION WHEN undefined_table THEN NULL;
      END $$;
    `;
    await db.execute(addMentionCountToFeatureCandidatesSQL);

    const addEvidenceItemIdsToFeatureCandidatesSQL = `
      DO $$ BEGIN
        ALTER TABLE feature_candidates ADD COLUMN IF NOT EXISTS evidence_item_ids INTEGER[] DEFAULT '{}';
      EXCEPTION WHEN undefined_table THEN NULL;
      END $$;
    `;
    await db.execute(addEvidenceItemIdsToFeatureCandidatesSQL);

    const addSourceAndCreatedByToFeatureCandidatesSQL = `
      DO $$ BEGIN
        ALTER TABLE feature_candidates ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'ai';
        ALTER TABLE feature_candidates ADD COLUMN IF NOT EXISTS created_by VARCHAR REFERENCES users(id);
        UPDATE feature_candidates SET source = 'ai' WHERE source IS NULL;
      EXCEPTION WHEN undefined_table THEN NULL;
      END $$;
    `;
    await db.execute(addSourceAndCreatedByToFeatureCandidatesSQL);

    // Speaker voiceprint registry — cross-meeting speaker recognition.
    // Without this table, POST /api/conversations/:id/confirm-speaker 500s
    // because upsertSpeakerVoiceprintSample writes here.
    const createSpeakerVoiceprintsTableSQL = `
      CREATE TABLE IF NOT EXISTS speaker_voiceprints (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR NOT NULL REFERENCES users(id),
        canonical_name TEXT NOT NULL,
        team_member_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
        embedding JSONB NOT NULL,
        sample_count INTEGER NOT NULL DEFAULT 1,
        meeting_count INTEGER NOT NULL DEFAULT 0,
        total_talk_time_ms INTEGER NOT NULL DEFAULT 0,
        last_seen_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    try {
      await db.execute(createSpeakerVoiceprintsTableSQL);
      await db.execute(`CREATE INDEX IF NOT EXISTS speaker_voiceprints_user_id_idx ON speaker_voiceprints(user_id)`);
    } catch (e) {
      console.warn("Could not create speaker_voiceprints table:", e);
    }

    const addActionItemsToConversationsSQL = `
      DO $$ BEGIN
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS action_items JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel_name TEXT;
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS thread_id TEXT;
        -- Task #77: AssemblyAI diarization columns. Safe to re-run on existing DBs.
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS diarized_transcript JSONB;
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS speaker_map JSONB;
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS participant_count INTEGER;
        -- Task #84: Gmail integration. external_id is used to dedupe imported emails on re-sync
        -- (we store the Gmail message id as "gmail:<id>"). attachments holds metadata + object-
        -- storage paths for each attached file so we can stream them back via a dedicated route.
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS external_id TEXT;
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
      EXCEPTION WHEN undefined_table THEN NULL;
      END $$;
    `;
    await db.execute(addActionItemsToConversationsSQL);

    // Task #84: enforce uniqueness on (user_id, external_id) so concurrent
    // Gmail imports can't insert the same message twice. Partial index so
    // legacy rows with NULL external_id don't collide with each other.
    try {
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS conversations_user_external_id_uq
        ON conversations(user_id, external_id)
        WHERE external_id IS NOT NULL
      `);
    } catch (e) {
      console.warn(
        "Could not create conversations_user_external_id_uq index:",
        e,
      );
    }

    // Task #84: dedicated attachment rows. Addressing attachments by their
    // own id (rather than by array index in conversations.attachments JSON)
    // is required for stable download URLs and future delete/replace flows.
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS conversation_attachments (
          id SERIAL PRIMARY KEY,
          conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          filename TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          size INTEGER NOT NULL,
          object_path TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS conversation_attachments_conv_idx
        ON conversation_attachments(conversation_id)
      `);
    } catch (e) {
      console.warn("Could not create conversation_attachments table:", e);
    }

    // Past Discoveries (Task #60): tag taxonomy + soft-archive merge target.
    // tags is a Postgres TEXT[] (matching shared/schema.ts text().array());
    // merged_into_id is a self-FK so a merged discovery still resolves to its
    // surviving canonical row. Both are additive and safe to re-run.
    const addPastDiscoveriesColumnsSQL = `
      DO $$ BEGIN
        ALTER TABLE feature_candidates ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
        ALTER TABLE feature_candidates ADD COLUMN IF NOT EXISTS merged_into_id INTEGER REFERENCES feature_candidates(id) ON DELETE SET NULL;
        UPDATE feature_candidates SET tags = '{}' WHERE tags IS NULL;
      EXCEPTION WHEN undefined_table THEN NULL;
      END $$;
    `;
    await db.execute(addPastDiscoveriesColumnsSQL);
    // Index supports the "hide merged-in" list filter and merge-target lookups.
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_feature_candidates_merged_into_id
      ON feature_candidates(merged_into_id)
      WHERE merged_into_id IS NOT NULL;
    `);

    const createDiscoveryReportsSQL = `
      CREATE TABLE IF NOT EXISTS discovery_reports (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR NOT NULL REFERENCES users(id),
        share_token TEXT NOT NULL UNIQUE,
        title TEXT NOT NULL,
        report_data JSONB NOT NULL,
        is_public BOOLEAN DEFAULT TRUE,
        view_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await db.execute(createDiscoveryReportsSQL);

    const createGoogleMeetMeetingsSQL = `
      CREATE TABLE IF NOT EXISTS google_meet_meetings (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        meet_link TEXT,
        calendar_event_id TEXT,
        organizer_email TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled',
        transcript TEXT,
        recording_url TEXT,
        attendees TEXT[] DEFAULT '{}',
        meeting_code TEXT,
        transcript_doc_id TEXT,
        conference_record_id TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `;
    await db.execute(createGoogleMeetMeetingsSQL);

    try {
      await db.execute(`ALTER TABLE google_meet_meetings ADD COLUMN IF NOT EXISTS meeting_code TEXT`);
      await db.execute(`ALTER TABLE google_meet_meetings ADD COLUMN IF NOT EXISTS transcript_doc_id TEXT`);
      await db.execute(`ALTER TABLE google_meet_meetings ADD COLUMN IF NOT EXISTS conference_record_id TEXT`);
    } catch (e) {}

    const createOauthStatesSQL = `
      CREATE TABLE IF NOT EXISTS oauth_states (
        state TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        code_verifier TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `;
    await db.execute(createOauthStatesSQL);

    const createZoomMeetingsSQL = `
      CREATE TABLE IF NOT EXISTS zoom_meetings (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        duration INTEGER,
        join_url TEXT,
        start_url TEXT,
        zoom_meeting_id TEXT,
        status TEXT NOT NULL DEFAULT 'scheduled',
        transcript TEXT,
        recording_url TEXT,
        attendees TEXT[] DEFAULT '{}',
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `;
    await db.execute(createZoomMeetingsSQL);

    const createTokenUsageSQL = `
      CREATE TABLE IF NOT EXISTS token_usage (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR NOT NULL,
        feature TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        estimated_cost TEXT NOT NULL DEFAULT '0',
        metadata JSONB,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `;
    await db.execute(createTokenUsageSQL);

    const createTokenBudgetsSQL = `
      CREATE TABLE IF NOT EXISTS token_budgets (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR NOT NULL UNIQUE,
        monthly_limit INTEGER NOT NULL DEFAULT 25000,
        tokens_used_this_month INTEGER NOT NULL DEFAULT 0,
        reset_date TIMESTAMP NOT NULL,
        last_warning_at TIMESTAMP,
        degraded_mode BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await db.execute(createTokenBudgetsSQL);

    try {
      await db.execute(`UPDATE subscription_plans SET max_projects = 1 WHERE slug = 'free' AND max_projects > 1`);
      // Raise existing Free-plan budgets up to the new 25,000 ceiling without
      // lowering anyone already above it.
      await db.execute(`
        UPDATE token_budgets SET monthly_limit = 25000
        WHERE user_id IN (
          SELECT u.id FROM users u
          LEFT JOIN subscription_plans sp ON u.plan_id = sp.id
          WHERE sp.slug = 'free' OR sp.slug IS NULL
        ) AND monthly_limit < 25000
      `);

      await db.execute(`
        UPDATE token_budgets tb SET monthly_limit = CASE
          WHEN sp.slug = 'pro' THEN 1000000
          WHEN sp.slug = 'business' THEN 10000000
          WHEN sp.slug = 'enterprise' THEN 20000000
          ELSE 25000
        END
        FROM users u
        JOIN subscription_plans sp ON u.plan_id = sp.id
        WHERE tb.user_id = u.id
        AND sp.slug IN ('pro', 'business', 'enterprise')
        AND tb.monthly_limit != CASE
          WHEN sp.slug = 'pro' THEN 1000000
          WHEN sp.slug = 'business' THEN 10000000
          WHEN sp.slug = 'enterprise' THEN 20000000
          ELSE 25000
        END
      `);

      const proResult = await db.execute(`SELECT id FROM subscription_plans WHERE slug = 'pro' LIMIT 1`);
      if (proResult.rows && proResult.rows.length > 0) {
        const proPlanId = proResult.rows[0].id;
        // Per-user plan overrides come from env, never hardcoded emails
        // (this repo's history is treated as public).
        const proEmails = (process.env.SEED_PRO_PLAN_EMAILS || "").split(",").map((e) => e.trim()).filter(Boolean);
        for (const email of proEmails) {
          await db.execute(`UPDATE users SET plan_id = ${proPlanId} WHERE email = '${email.replace(/'/g, "''")}' AND (plan_id IS NULL OR plan_id = 1)`);
        }
        if (proEmails.length > 0) {
          console.log(`[DB Setup] Synced ${proEmails.length} SEED_PRO_PLAN_EMAILS account(s) to Pro plan if needed`);
        }
      }
    } catch (e) {
    }

    try {
      // Ensure monthly_token_limit column exists.
      await db.execute(`ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS monthly_token_limit INTEGER DEFAULT 25000`);
    } catch (e) {
      console.warn("[DB Setup] Could not add monthly_token_limit column:", (e as any)?.message);
    }

    try {
      // Insert canonical paid plans BEFORE backfill so the next step seeds their token limits too.
      await db.execute(`
        INSERT INTO subscription_plans (name, slug, description, price, currency, billing_interval, features, max_users, max_projects, monthly_token_limit, is_active, sort_order)
        SELECT 'Business', 'business', 'For growing teams and agencies', 9900, 'USD', 'month',
          ARRAY['unlimited_projects','advanced_ai','integrations','team_collaboration','priority_support'], 50, 200, 10000000, true, 3
        WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE slug = 'business')
      `);
      await db.execute(`
        INSERT INTO subscription_plans (name, slug, description, price, currency, billing_interval, features, max_users, max_projects, monthly_token_limit, is_active, sort_order)
        SELECT 'Enterprise', 'enterprise', 'For large organizations with custom needs', 29900, 'USD', 'month',
          ARRAY['unlimited_projects','advanced_ai','integrations','team_collaboration','priority_support','sso','custom_integrations'], 500, 1000, 20000000, true, 4
        WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE slug = 'enterprise')
      `);
      await db.execute(`
        UPDATE subscription_plans SET max_projects = 50, max_users = 10 WHERE slug = 'pro' AND max_projects < 50
      `);
      await db.execute(`
        UPDATE subscription_plans SET max_projects = 200, max_users = 50 WHERE slug = 'business' AND max_projects < 200
      `);
      await db.execute(`
        UPDATE subscription_plans SET max_projects = 1000, max_users = 500 WHERE slug = 'enterprise' AND max_projects < 1000
      `);
    } catch (e) {
      console.warn("[DB Setup] Could not seed paid plan rows:", (e as any)?.message);
    }

    try {
      // Backfill canonical token limits.
      // Paid plans are healed when they're NULL/0 OR still sitting at a column default
      // value (5000 from the legacy default, 25000 from the current default). Free is
      // raised to the new 100000 ceiling (was 25000; users complained they hit the
      // limit after ~4 AI planner runs at ~6K tokens each).
      await db.execute(`
        UPDATE subscription_plans SET monthly_token_limit = CASE
          WHEN slug = 'free' THEN 100000
          WHEN slug = 'pro' THEN 1000000
          WHEN slug = 'business' THEN 10000000
          WHEN slug = 'enterprise' THEN 20000000
          ELSE 100000
        END
        WHERE slug IN ('free','pro','business','enterprise')
          AND (
            monthly_token_limit IS NULL
            OR monthly_token_limit = 0
            OR (slug = 'free' AND monthly_token_limit < 100000)
            OR (slug <> 'free' AND monthly_token_limit IN (5000, 25000))
          )
      `);
      // Heal user-count defaults that came in below the canonical tier minimum.
      await db.execute(`UPDATE subscription_plans SET max_users = 10 WHERE slug = 'pro' AND max_users < 10`);
      await db.execute(`UPDATE subscription_plans SET max_users = 50 WHERE slug = 'business' AND max_users < 50`);
      // Heal legacy seed rows where price was stored as whole dollars instead of cents.
      // Restrict to the known canonical paid slugs whose original seed used dollars (29, 99, 299/499)
      // to avoid clobbering any intentionally low-priced custom plans.
      await db.execute(`
        UPDATE subscription_plans
           SET price = price * 100
         WHERE slug IN ('pro','business','enterprise')
           AND price > 0
           AND price < 1000
           AND stripe_price_id IS NULL
      `);
    } catch (e) {
      console.warn("[DB Setup] Could not run subscription_plans price/token backfill:", (e as any)?.message);
    }

    // Task #92: RAG Foundation — embeddings + AI response feedback.
    // pgvector extension already exists (created by chat_embeddings block above).
    // If that block failed (extension missing) these tables still create
    // without the vector column populated — embedding writes will fail loudly
    // and the worker will mark rows as `failed` rather than crash the server.
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS embeddings (
          id SERIAL PRIMARY KEY,
          source_type TEXT NOT NULL,
          source_id INTEGER NOT NULL,
          chunk_index INTEGER NOT NULL DEFAULT 0,
          content TEXT NOT NULL,
          embedding vector(768),
          metadata JSONB DEFAULT '{}'::jsonb,
          status TEXT NOT NULL DEFAULT 'ok',
          error_reason TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS embeddings_natural_key
          ON embeddings (source_type, source_id, chunk_index)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS embeddings_source_idx
          ON embeddings (source_type, source_id)
      `);
      // Task #93 — hybrid retrieval indexes.
      // 1) BM25 lexical: tsvector GIN. Use an ADD COLUMN + UPDATE pair
      //    (not GENERATED) because Neon's pgvector image rejected the
      //    GENERATED expression during testing. Backfill is idempotent.
      try {
        await db.execute(`
          ALTER TABLE embeddings ADD COLUMN IF NOT EXISTS tsv tsvector
        `);
        await db.execute(`
          UPDATE embeddings
             SET tsv = to_tsvector('english', coalesce(content, ''))
           WHERE tsv IS NULL AND chunk_index >= 0
        `);
        await db.execute(`
          CREATE INDEX IF NOT EXISTS embeddings_tsv_gin
            ON embeddings USING GIN (tsv)
        `);
        // Keep tsv in sync on insert/update. AFTER-trigger keeps the row
        // write path (raw INSERT in embeddings.ts) untouched.
        await db.execute(`
          CREATE OR REPLACE FUNCTION embeddings_tsv_refresh() RETURNS trigger AS $$
          BEGIN
            NEW.tsv := to_tsvector('english', coalesce(NEW.content, ''));
            RETURN NEW;
          END
          $$ LANGUAGE plpgsql
        `);
        await db.execute(`
          DROP TRIGGER IF EXISTS embeddings_tsv_trigger ON embeddings
        `);
        await db.execute(`
          CREATE TRIGGER embeddings_tsv_trigger
            BEFORE INSERT OR UPDATE OF content
            ON embeddings
            FOR EACH ROW EXECUTE FUNCTION embeddings_tsv_refresh()
        `);
      } catch (e) {
        console.warn(
          "[DB Setup] Could not create embeddings tsv/GIN index:",
          (e as any)?.message,
        );
      }
      // 2) ANN vector index intentionally NOT created at startup.
      // The Replit Publish flow auto-diffs dev↔prod and re-emits index DDL
      // without the pgvector operator class, which causes prod migration
      // to fail with: 'data type vector has no default operator class for
      // access method "hnsw"'. Vector search falls back to sequential scan.
      // If/when scale demands ANN, create the index directly in prod via the
      // Database UI with the explicit opclass:
      //   CREATE INDEX embeddings_vec_hnsw
      //     ON embeddings USING hnsw (embedding vector_cosine_ops);
    } catch (e) {
      console.warn(
        "[DB Setup] Could not create embeddings table (vector extension missing?):",
        (e as any)?.message,
      );
    }
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS ai_response_feedback (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR NOT NULL,
          session_id TEXT,
          surface TEXT NOT NULL,
          query TEXT,
          response_text TEXT,
          model_used TEXT,
          retrieved_chunk_ids INTEGER[] DEFAULT '{}',
          rating INTEGER NOT NULL,
          comment TEXT,
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS ai_response_feedback_user_idx
          ON ai_response_feedback (user_id, created_at DESC)
      `);
      // Task #94 — citation telemetry columns (idempotent).
      await db.execute(`
        ALTER TABLE ai_response_feedback
          ADD COLUMN IF NOT EXISTS citations_emitted INTEGER DEFAULT 0;
        ALTER TABLE ai_response_feedback
          ADD COLUMN IF NOT EXISTS citations_stripped INTEGER DEFAULT 0;
        ALTER TABLE ai_response_feedback
          ADD COLUMN IF NOT EXISTS citations_clicked INTEGER DEFAULT 0;
      `);
      // Task #104 — response quality score columns (idempotent). REAL 0..1,
      // nullable (null when the checker is disabled or errored).
      await db.execute(`
        ALTER TABLE ai_response_feedback
          ADD COLUMN IF NOT EXISTS quality_format REAL;
        ALTER TABLE ai_response_feedback
          ADD COLUMN IF NOT EXISTS quality_specificity REAL;
        ALTER TABLE ai_response_feedback
          ADD COLUMN IF NOT EXISTS quality_completeness REAL;
      `);
    } catch (e) {
      console.warn(
        "[DB Setup] Could not create ai_response_feedback table:",
        (e as any)?.message,
      );
    }

    // Task #105 — RAG eval harness results. One append-only row per run with a
    // config snapshot + aggregate metrics + the full per-case results blob.
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS rag_eval_runs (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR NOT NULL,
          config JSONB DEFAULT '{}'::jsonb,
          case_count INTEGER NOT NULL DEFAULT 0,
          pass_count INTEGER NOT NULL DEFAULT 0,
          recall_at_k REAL,
          faithfulness_pass_rate REAL,
          grounding_rate REAL,
          fallback_rate REAL,
          results JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS rag_eval_runs_user_idx
          ON rag_eval_runs (user_id, created_at DESC)
      `);
    } catch (e) {
      console.warn(
        "[DB Setup] Could not create rag_eval_runs table:",
        (e as any)?.message,
      );
    }

    // Task #98 — Entity graph tables. Idempotent. Each statement is its own
    // try/catch so a missing pgvector extension on the embeddings block above
    // doesn't block the entity layer (entity tables don't use vector cols).
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS entities (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR NOT NULL,
          kind TEXT NOT NULL,
          slug TEXT NOT NULL,
          display_name TEXT NOT NULL,
          mention_count INTEGER NOT NULL DEFAULT 1,
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS entities_user_kind_slug
          ON entities (user_id, kind, slug)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS entities_user_kind_idx
          ON entities (user_id, kind)
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS entity_edges (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR NOT NULL,
          src_entity_id INTEGER NOT NULL,
          dst_entity_id INTEGER NOT NULL,
          predicate TEXT NOT NULL,
          source_embedding_id INTEGER NOT NULL,
          confidence INTEGER NOT NULL DEFAULT 70,
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS entity_edges_user_src_pred_idx
          ON entity_edges (user_id, src_entity_id, predicate)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS entity_edges_user_dst_pred_idx
          ON entity_edges (user_id, dst_entity_id, predicate)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS entity_edges_user_chunk_idx
          ON entity_edges (user_id, source_embedding_id)
      `);
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS entity_edges_natural_key
          ON entity_edges (user_id, src_entity_id, dst_entity_id, predicate, source_embedding_id)
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS entity_extraction_cache (
          chunk_hash VARCHAR(64) PRIMARY KEY,
          result JSONB NOT NULL,
          model_used TEXT NOT NULL,
          prompt_tokens INTEGER NOT NULL DEFAULT 0,
          completion_tokens INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      // Telemetry columns on ai_response_feedback (Task #98).
      await db.execute(`
        ALTER TABLE ai_response_feedback
          ADD COLUMN IF NOT EXISTS entities_extracted INTEGER DEFAULT 0;
        ALTER TABLE ai_response_feedback
          ADD COLUMN IF NOT EXISTS edges_extracted INTEGER DEFAULT 0;
        ALTER TABLE ai_response_feedback
          ADD COLUMN IF NOT EXISTS neighbors_added INTEGER DEFAULT 0;
      `);
    } catch (e) {
      console.warn(
        "[DB Setup] Could not create entity graph tables:",
        (e as any)?.message,
      );
    }

    // Task #99 — Beliefs table. Depends on the `vector` extension created
    // higher in this file. Each statement guarded individually so a missing
    // pgvector extension still allows the rest of setup to proceed.
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS beliefs (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR NOT NULL,
          subject_entity_id INTEGER NOT NULL,
          predicate TEXT NOT NULL,
          object TEXT NOT NULL,
          holder TEXT,
          weight REAL NOT NULL DEFAULT 0.5,
          embedding vector(768),
          source_embedding_ids INTEGER[] DEFAULT '{}',
          mention_count INTEGER NOT NULL DEFAULT 1,
          first_seen_at TIMESTAMP DEFAULT NOW(),
          last_seen_at TIMESTAMP DEFAULT NOW(),
          decayed_at TIMESTAMP,
          contradiction_of_belief_id INTEGER REFERENCES beliefs(id) ON DELETE SET NULL,
          status TEXT NOT NULL DEFAULT 'active',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS beliefs_user_subject_idx
          ON beliefs (user_id, subject_entity_id)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS beliefs_user_status_idx
          ON beliefs (user_id, status, last_seen_at)
      `);
    } catch (e) {
      console.warn(
        "[DB Setup] Could not create beliefs table:",
        (e as any)?.message,
      );
    }

    // Task: Meeting Intelligence — bulk-transcript MOM/minutes processor.
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS meeting_intelligence_batches (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          label TEXT,
          status TEXT NOT NULL DEFAULT 'queued',
          total_count INTEGER NOT NULL DEFAULT 0,
          completed_count INTEGER NOT NULL DEFAULT 0,
          failed_count INTEGER NOT NULL DEFAULT 0,
          metadata JSONB,
          completed_at TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS meeting_intelligence_batches_user_idx
          ON meeting_intelligence_batches (user_id, created_at)
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS meeting_intelligence_documents (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          batch_id INTEGER,
          transcript_id TEXT NOT NULL,
          project_name TEXT,
          department TEXT,
          meeting_source TEXT NOT NULL,
          meeting_date TEXT,
          meeting_title TEXT,
          participants TEXT[] NOT NULL DEFAULT '{}',
          transcript_text TEXT NOT NULL,
          document_json JSONB,
          document_markdown TEXT,
          confidence_score REAL,
          status TEXT NOT NULL DEFAULT 'processing',
          error_message TEXT,
          chunk_count INTEGER NOT NULL DEFAULT 1,
          token_usage JSONB,
          claimed_at TIMESTAMP,
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS meeting_intelligence_documents_user_idx
          ON meeting_intelligence_documents (user_id, created_at)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS meeting_intelligence_documents_status_idx
          ON meeting_intelligence_documents (status, created_at)
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS meeting_intelligence_documents_batch_idx
          ON meeting_intelligence_documents (batch_id)
      `);
    } catch (e) {
      console.warn(
        "[DB Setup] Could not create meeting_intelligence tables:",
        (e as any)?.message,
      );
    }

    console.log("Database setup complete.");
    return true;
  } catch (error) {
    console.error("Error setting up database:", error);
    return false;
  }
}
