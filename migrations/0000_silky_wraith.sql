CREATE TABLE "ai_agents" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"agent_type" text NOT NULL,
	"capabilities" text[] NOT NULL,
	"instructions" text,
	"model" text DEFAULT 'gpt-4o',
	"temperature" integer DEFAULT 70,
	"max_tokens" integer DEFAULT 2000,
	"is_active" boolean DEFAULT true,
	"is_public" boolean DEFAULT false,
	"created_by" varchar NOT NULL,
	"project_id" integer,
	"avatar" text DEFAULT '🤖',
	"color" text DEFAULT '#3b82f6',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_prompts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"prompt" text NOT NULL,
	"prompt_type" text NOT NULL,
	"response" jsonb,
	"project_id" integer,
	"task_id" integer,
	"feedback" text,
	"rating" integer,
	"used_response" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_response_feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"session_id" text,
	"surface" text NOT NULL,
	"query" text,
	"response_text" text,
	"model_used" text,
	"retrieved_chunk_ids" integer[] DEFAULT '{}',
	"citations_emitted" integer DEFAULT 0,
	"citations_stripped" integer DEFAULT 0,
	"citations_clicked" integer DEFAULT 0,
	"entities_extracted" integer DEFAULT 0,
	"edges_extracted" integer DEFAULT 0,
	"neighbors_added" integer DEFAULT 0,
	"quality_format" real,
	"quality_specificity" real,
	"quality_completeness" real,
	"rating" integer NOT NULL,
	"comment" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai_tools" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"free_plan_available" boolean DEFAULT false,
	"pricing" text,
	"website" text NOT NULL,
	"logo_url" text,
	"use_case" text,
	"ideal_for" text
);
--> statement-breakpoint
CREATE TABLE "beliefs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"subject_entity_id" integer NOT NULL,
	"predicate" text NOT NULL,
	"object" text NOT NULL,
	"holder" text,
	"weight" real DEFAULT 0.5 NOT NULL,
	"embedding" vector(768),
	"source_embedding_ids" integer[] DEFAULT '{}',
	"mention_count" integer DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp DEFAULT now(),
	"last_seen_at" timestamp DEFAULT now(),
	"decayed_at" timestamp,
	"contradiction_of_belief_id" integer,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "budget_estimates" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft',
	"total_amount" integer DEFAULT 0,
	"currency" text DEFAULT 'USD',
	"client_name" text,
	"client_email" text,
	"client_company" text,
	"valid_until" timestamp,
	"terms" text,
	"notes" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "budget_line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"budget_id" integer NOT NULL,
	"task_id" integer,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1,
	"rate" integer NOT NULL,
	"hours" integer DEFAULT 0,
	"total_amount" integer NOT NULL,
	"role" text,
	"position" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "capacity_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"team_member_id" integer,
	"alert_type" text NOT NULL,
	"severity" text DEFAULT 'medium',
	"message" text NOT NULL,
	"threshold" integer,
	"current_value" integer,
	"is_resolved" boolean DEFAULT false,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"insights" text,
	"actions" text,
	"suggested_prompts" text,
	"citations" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"project_id" integer,
	"session_id" text NOT NULL,
	"title" text,
	"mode" text DEFAULT 'plan',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "chat_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "completed_social_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"topic" text NOT NULL,
	"tone" text,
	"platform" text NOT NULL,
	"scheduled_time" timestamp NOT NULL,
	"executed_at" timestamp NOT NULL,
	"status" text NOT NULL,
	"final_content" text,
	"media_urls" text[] DEFAULT '{}',
	"error_message" text,
	"platform_response" jsonb,
	"user_timezone" text DEFAULT 'UTC',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversation_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversation_id" integer NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"object_path" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"title" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"action_items" jsonb DEFAULT '[]'::jsonb,
	"participants" text[] DEFAULT '{}',
	"meeting_date" timestamp,
	"tags" text[] DEFAULT '{}',
	"channel_name" text,
	"thread_id" text,
	"project_id" integer,
	"audio_url" text,
	"audio_mime_type" text,
	"diarized_transcript" jsonb,
	"speaker_map" jsonb,
	"participant_count" integer,
	"external_id" text,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "discovery_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"share_token" text NOT NULL,
	"title" text NOT NULL,
	"report_data" jsonb NOT NULL,
	"is_public" boolean DEFAULT true,
	"view_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "discovery_reports_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "email_verification_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false,
	CONSTRAINT "email_verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_type" text NOT NULL,
	"source_id" integer NOT NULL,
	"chunk_index" integer DEFAULT 0 NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(768),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'ok' NOT NULL,
	"error_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"display_name" text NOT NULL,
	"mention_count" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "entities_user_kind_slug" UNIQUE("user_id","kind","slug")
);
--> statement-breakpoint
CREATE TABLE "entity_edges" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"src_entity_id" integer NOT NULL,
	"dst_entity_id" integer NOT NULL,
	"predicate" text NOT NULL,
	"source_embedding_id" integer NOT NULL,
	"confidence" integer DEFAULT 70 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "entity_edges_natural_key" UNIQUE("user_id","src_entity_id","dst_entity_id","predicate","source_embedding_id")
);
--> statement-breakpoint
CREATE TABLE "entity_extraction_cache" (
	"chunk_hash" varchar(64) PRIMARY KEY NOT NULL,
	"result" jsonb NOT NULL,
	"model_used" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "evidence_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"source" text DEFAULT 'note' NOT NULL,
	"source_id" integer,
	"tags" text[] DEFAULT '{}',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"insight_type" text,
	"mention_count" integer DEFAULT 1,
	"object_path" text,
	"original_filename" text,
	"mime_type" text,
	"file_size" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "feature_candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"feature_title" text NOT NULL,
	"why_now" text,
	"evidence" text[] DEFAULT '{}',
	"evidence_item_ids" integer[] DEFAULT '{}',
	"evidence_quotes" text[] DEFAULT '{}',
	"source_conversation_ids" integer[] DEFAULT '{}',
	"source_conversation_quotes" text[] DEFAULT '{}',
	"source_session_id" text,
	"ui_changes" text,
	"data_model_changes" text,
	"workflow_changes" text,
	"tasks" jsonb DEFAULT '[]'::jsonb,
	"insights" jsonb DEFAULT '[]'::jsonb,
	"reasoning_chain" text,
	"status" text DEFAULT 'candidate',
	"source_context" text,
	"approved_at" timestamp,
	"project_id" integer,
	"impact_score" integer,
	"effort_score" integer,
	"confidence_score" integer,
	"rice_score" integer,
	"priority_rank" integer,
	"score_reasoning" jsonb,
	"last_sent_to_agent" text,
	"last_sent_at" timestamp,
	"mention_count" integer DEFAULT 1,
	"source" text DEFAULT 'ai',
	"created_by" varchar,
	"tags" text[] DEFAULT '{}',
	"merged_into_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "features" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "features_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"form_id" integer NOT NULL,
	"response_data" jsonb NOT NULL,
	"submitter_email" text,
	"submitter_name" text,
	"ip_address" text,
	"user_agent" text,
	"referrer" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "forms" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_by" varchar NOT NULL,
	"share_token" text NOT NULL,
	"is_public" boolean DEFAULT true,
	"is_active" boolean DEFAULT true,
	"fields" jsonb NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"response_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "forms_share_token_unique" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "google_meet_meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"subject" text NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"meet_link" text,
	"calendar_event_id" text,
	"organizer_email" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"transcript" text,
	"recording_url" text,
	"attendees" text[] DEFAULT '{}',
	"meeting_code" text,
	"transcript_doc_id" text,
	"conference_record_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" text DEFAULT 'info',
	"project_id" integer,
	"created_at" timestamp DEFAULT now(),
	"is_resolved" boolean DEFAULT false,
	"resolved_at" timestamp,
	"suggested_action" text
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"provider" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expiry" timestamp,
	"is_connected" boolean DEFAULT false,
	"last_synced" timestamp,
	"workspace_id" text,
	"additional_data" jsonb
);
--> statement-breakpoint
CREATE TABLE "jira_integrations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"jira_url" text NOT NULL,
	"email" text NOT NULL,
	"api_token" text NOT NULL,
	"cloud_id" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "jira_sync_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"integration_id" integer NOT NULL,
	"sync_type" text NOT NULL,
	"sync_status" text NOT NULL,
	"items_synced" integer DEFAULT 0,
	"error_message" text,
	"sync_data" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "kanban_columns" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"color" text DEFAULT 'bg-slate-100',
	"icon_name" text DEFAULT 'circle',
	"position" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "meeting_intelligence_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"total_count" integer DEFAULT 0 NOT NULL,
	"completed_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_intelligence_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"batch_id" integer,
	"transcript_id" text NOT NULL,
	"project_name" text,
	"department" text,
	"meeting_source" text NOT NULL,
	"meeting_date" text,
	"meeting_title" text,
	"participants" text[] DEFAULT '{}' NOT NULL,
	"transcript_text" text NOT NULL,
	"document_json" jsonb,
	"document_markdown" text,
	"confidence_score" real,
	"status" text DEFAULT 'processing' NOT NULL,
	"error_message" text,
	"chunk_count" integer DEFAULT 1 NOT NULL,
	"token_usage" jsonb,
	"claimed_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_auth_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code_hash" varchar NOT NULL,
	"client_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" varchar,
	"code_challenge_method" varchar,
	"scope" text,
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "oauth_auth_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "oauth_clients" (
	"id" varchar PRIMARY KEY NOT NULL,
	"name" text,
	"redirect_uris" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "onboarding_instances" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"onboardee_id" varchar,
	"onboardee_name" text NOT NULL,
	"onboardee_email" text NOT NULL,
	"manager_id" varchar,
	"status" text DEFAULT 'not_started',
	"start_date" timestamp,
	"expected_end_date" timestamp,
	"actual_end_date" timestamp,
	"completion_rate" integer DEFAULT 0,
	"current_day" integer DEFAULT 1,
	"personalized_data" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "onboarding_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"role" text,
	"duration" integer DEFAULT 7,
	"status" text DEFAULT 'draft',
	"is_template" boolean DEFAULT false,
	"template_for" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "onboarding_step_completions" (
	"id" serial PRIMARY KEY NOT NULL,
	"instance_id" integer NOT NULL,
	"step_id" integer NOT NULL,
	"status" text DEFAULT 'pending',
	"completed_at" timestamp,
	"completed_by" varchar,
	"notes" text,
	"feedback" text,
	"rating" integer,
	"time_spent" integer,
	CONSTRAINT "onboarding_step_completions_instance_id_step_id_unique" UNIQUE("instance_id","step_id")
);
--> statement-breakpoint
CREATE TABLE "onboarding_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"day_number" integer NOT NULL,
	"step_order" integer DEFAULT 0,
	"assigned_to" text,
	"is_required" boolean DEFAULT true,
	"estimated_time" integer,
	"resources" jsonb,
	"completion_criteria" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "onboarding_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"department" text,
	"role" text,
	"is_public" boolean DEFAULT false,
	"template_data" jsonb NOT NULL,
	"usage_count" integer DEFAULT 0,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"token" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp NOT NULL,
	"used" boolean DEFAULT false,
	CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "personal_access_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"token_hash" varchar NOT NULL,
	"token_prefix" varchar,
	"last_used_at" timestamp,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "personal_access_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "priority_weighting_preferences" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"project_id" integer,
	"roi_weight" integer DEFAULT 25,
	"effort_weight" integer DEFAULT 25,
	"urgency_weight" integer DEFAULT 25,
	"strategic_weight" integer DEFAULT 25,
	"profile_name" text DEFAULT 'Balanced',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_invitations" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"token" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"invited_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"expires_at" timestamp,
	"accepted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"added_at" timestamp DEFAULT now(),
	CONSTRAINT "project_members_project_id_user_id_unique" UNIQUE("project_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "project_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text,
	"plan_data" text NOT NULL,
	"is_saved" boolean DEFAULT false,
	"project_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"due_date" timestamp,
	"status" text DEFAULT 'active',
	"progress" integer DEFAULT 0,
	"total_tasks" integer DEFAULT 0,
	"completed_tasks" integer DEFAULT 0,
	"icon" text DEFAULT 'folder-open',
	"icon_bg" text DEFAULT 'blue',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"last_opened_at" timestamp,
	"owner_id" varchar,
	"external_id" text,
	"source" text DEFAULT 'manual',
	"source_data" jsonb,
	"ai_generated" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "rag_eval_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"case_count" integer DEFAULT 0 NOT NULL,
	"pass_count" integer DEFAULT 0 NOT NULL,
	"recall_at_k" real,
	"faithfulness_pass_rate" real,
	"grounding_rate" real,
	"fallback_rate" real,
	"results" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rate_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"hourly_rate" integer NOT NULL,
	"currency" text DEFAULT 'USD',
	"is_active" boolean DEFAULT true,
	"user_id" varchar,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "raw_inputs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"source_type" text DEFAULT 'notes' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rga_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"category" text NOT NULL,
	"confidence" integer DEFAULT 85,
	"reasoning" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rga_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"week_starting" timestamp NOT NULL,
	"rga_percentage" integer,
	"non_rga_percentage" integer,
	"strategic_percentage" integer,
	"total_hours" integer,
	"recommendations" text[],
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "rga_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"mode" text DEFAULT 'pre-funding',
	"target_rga_percentage" integer DEFAULT 40,
	"revenue_channel" text,
	"next_milestone" timestamp,
	"weekly_customer_hours" integer DEFAULT 20,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "scheduled_social_posts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"topic" text NOT NULL,
	"tone" text,
	"platform" text NOT NULL,
	"scheduled_time" timestamp NOT NULL,
	"user_timezone" text DEFAULT 'UTC',
	"status" text DEFAULT 'scheduled',
	"media_urls" text[] DEFAULT '{}',
	"pre_generated_content" text,
	"credentials" jsonb,
	"executed_at" timestamp,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar(255) PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smart_task_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"team_member_id" integer,
	"assignment_type" text NOT NULL,
	"confidence" integer DEFAULT 0,
	"reasoning" text,
	"estimated_completion" text,
	"cost_savings" integer DEFAULT 0,
	"ai_suitable" boolean DEFAULT false,
	"human_required" boolean DEFAULT false,
	"complexity" text DEFAULT 'medium',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "social_media_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"platform" text NOT NULL,
	"account_name" text NOT NULL,
	"account_id" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"profile_url" text,
	"profile_image" text,
	"is_active" boolean DEFAULT true,
	"business_account_id" text,
	"page_id" text,
	"account_type" text,
	"permissions" text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "social_media_brand_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"business_name" text NOT NULL,
	"business_description" text,
	"brand_voice" text,
	"target_audience" text,
	"content_themes" text[],
	"keywords" text[],
	"primary_color" text,
	"secondary_color" text,
	"logo_url" text,
	"website_url" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "social_media_content_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"platform" text,
	"template_type" text,
	"content_pattern" text NOT NULL,
	"variables" text[],
	"hashtags" text[],
	"is_public" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "social_media_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"goal_type" text NOT NULL,
	"target_metric" text,
	"target_value" integer,
	"current_value" integer DEFAULT 0,
	"start_date" timestamp,
	"end_date" timestamp,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "social_media_post_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"platform" text NOT NULL,
	"platform_post_id" text,
	"impressions" integer DEFAULT 0,
	"reach" integer DEFAULT 0,
	"likes" integer DEFAULT 0,
	"comments" integer DEFAULT 0,
	"shares" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"engagement_rate" integer,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "social_media_posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"goal_id" integer,
	"brand_profile_id" integer,
	"content" text NOT NULL,
	"platforms" text[] NOT NULL,
	"platform_content" jsonb,
	"hashtags" text[],
	"media_urls" text[],
	"media_prompt" text,
	"call_to_action" text,
	"status" text DEFAULT 'draft',
	"scheduled_at" timestamp,
	"published_at" timestamp,
	"ai_generated" boolean DEFAULT false,
	"source_content" text,
	"source_type" text,
	"instagram_media_type" text,
	"instagram_location" jsonb,
	"platform_post_ids" jsonb,
	"publish_errors" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "speaker_voiceprints" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"canonical_name" text NOT NULL,
	"team_member_id" integer,
	"embedding" jsonb NOT NULL,
	"sample_count" integer DEFAULT 1 NOT NULL,
	"meeting_count" integer DEFAULT 0 NOT NULL,
	"total_talk_time_ms" integer DEFAULT 0 NOT NULL,
	"last_seen_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "story_estimations" (
	"id" serial PRIMARY KEY NOT NULL,
	"story_id" integer NOT NULL,
	"estimated_by" varchar NOT NULL,
	"story_points" integer NOT NULL,
	"reasoning" text,
	"factors" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"price" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'USD',
	"billing_interval" text DEFAULT 'month',
	"features" text[] DEFAULT '{}' NOT NULL,
	"max_users" integer DEFAULT 1,
	"max_projects" integer DEFAULT 10,
	"monthly_token_limit" integer DEFAULT 25000,
	"stripe_product_id" text,
	"stripe_price_id" text,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "subscription_plans_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "task_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"user_id" varchar,
	"ai_agent_id" integer,
	"assignee_type" text DEFAULT 'user' NOT NULL,
	"estimated_hours" integer DEFAULT 0,
	"estimated_points" integer DEFAULT 0,
	"actual_hours" integer DEFAULT 0,
	"assigned_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"status" text DEFAULT 'assigned',
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "task_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"filename" text NOT NULL,
	"original_name" text NOT NULL,
	"file_type" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"upload_path" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"user_id" varchar NOT NULL,
	"content" text NOT NULL,
	"parent_comment_id" integer,
	"is_edited" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "task_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer,
	"external_id" text NOT NULL,
	"provider" text NOT NULL,
	"last_synced" timestamp DEFAULT now(),
	"mapped_fields" jsonb
);
--> statement-breakpoint
CREATE TABLE "task_priority_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"priority_score" integer NOT NULL,
	"roi_level" text NOT NULL,
	"effort_level" text NOT NULL,
	"urgency_level" text NOT NULL,
	"strategic_fit" text NOT NULL,
	"recommendation" text NOT NULL,
	"confidence" integer DEFAULT 85,
	"weighting_profile" text DEFAULT 'balanced',
	"analysis_data" jsonb,
	"generated_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "task_priority_scores_task_id_unique" UNIQUE("task_id")
);
--> statement-breakpoint
CREATE TABLE "task_tool_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"tool_id" integer NOT NULL,
	"status" text DEFAULT 'suggested',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "task_tool_recommendations_task_id_tool_id_unique" UNIQUE("task_id","tool_id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'todo',
	"is_completed" boolean DEFAULT false,
	"due_date" timestamp,
	"priority" text DEFAULT 'medium',
	"assignee_id" varchar,
	"project_id" integer,
	"parent_task_id" integer,
	"is_subtask" boolean DEFAULT false,
	"completed_subtasks" integer DEFAULT 0,
	"total_subtasks" integer DEFAULT 0,
	"position" integer DEFAULT 0,
	"external_id" text,
	"source" text DEFAULT 'manual',
	"source_data" jsonb,
	"last_synced" timestamp,
	"created_at" timestamp DEFAULT now(),
	"icon" text,
	"progress" integer DEFAULT 0,
	"ai_generated" boolean DEFAULT false,
	"storypoints" integer
);
--> statement-breakpoint
CREATE TABLE "team_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"type" text DEFAULT 'pto' NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar,
	"name" text NOT NULL,
	"email" text,
	"role" text NOT NULL,
	"avatar" text,
	"bio" text,
	"department" text,
	"skills" text[],
	"capacity" integer DEFAULT 40,
	"allocated" integer DEFAULT 0,
	"availability" integer DEFAULT 100,
	"performance" integer DEFAULT 90,
	"hourly_rate" integer DEFAULT 5000,
	"timezone" text DEFAULT 'UTC',
	"working_hours" text DEFAULT '9:00-17:00',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"skills" text[] DEFAULT ARRAY[]::text[],
	"weekly_capacity_hours" integer DEFAULT 40,
	"weekly_capacity_points" integer DEFAULT 20,
	"current_utilization" integer DEFAULT 0,
	"timezone" text DEFAULT 'UTC',
	"working_days" text[] DEFAULT ARRAY['Mon', 'Tue', 'Wed', 'Thu', 'Fri']::text[],
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "team_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "teams_meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"subject" text NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"join_url" text,
	"meeting_id" text,
	"thread_id" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"transcript" text,
	"project_plan" jsonb,
	"attendees" text[] DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "token_budgets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"monthly_limit" integer DEFAULT 1000000 NOT NULL,
	"tokens_used_this_month" integer DEFAULT 0 NOT NULL,
	"reset_date" timestamp NOT NULL,
	"last_warning_at" timestamp,
	"degraded_mode" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "token_budgets_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "token_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"feature" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost" text DEFAULT '0' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_stories" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"title" text NOT NULL,
	"story" text NOT NULL,
	"acceptance_criteria" text[],
	"story_points" integer,
	"complexity" text,
	"risk" text,
	"effort" text,
	"roi_score" integer,
	"priority" text,
	"jira_issue_key" text,
	"jira_issue_id" text,
	"epic_key" text,
	"sprint_id" text,
	"assignee_id" varchar,
	"status" text DEFAULT 'todo',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"username" varchar NOT NULL,
	"email" varchar,
	"password" varchar,
	"email_verified" boolean DEFAULT false,
	"first_name" varchar,
	"last_name" varchar,
	"bio" text,
	"profile_image_url" varchar,
	"plan_id" integer DEFAULT 1,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"subscription_status" text DEFAULT 'active',
	"subscription_end_date" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "zoom_meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"subject" text NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"duration" integer,
	"join_url" text,
	"start_url" text,
	"zoom_meeting_id" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"transcript" text,
	"recording_url" text,
	"attendees" text[] DEFAULT '{}',
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_agents" ADD CONSTRAINT "ai_agents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_prompts" ADD CONSTRAINT "ai_prompts_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_estimates" ADD CONSTRAINT "budget_estimates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_estimates" ADD CONSTRAINT "budget_estimates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_budget_id_budget_estimates_id_fk" FOREIGN KEY ("budget_id") REFERENCES "public"."budget_estimates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_line_items" ADD CONSTRAINT "budget_line_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capacity_alerts" ADD CONSTRAINT "capacity_alerts_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "completed_social_posts" ADD CONSTRAINT "completed_social_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_attachments" ADD CONSTRAINT "conversation_attachments_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "discovery_reports" ADD CONSTRAINT "discovery_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_candidates" ADD CONSTRAINT "feature_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_candidates" ADD CONSTRAINT "feature_candidates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feature_candidates" ADD CONSTRAINT "feature_candidates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_id_forms_id_fk" FOREIGN KEY ("form_id") REFERENCES "public"."forms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forms" ADD CONSTRAINT "forms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insights" ADD CONSTRAINT "insights_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_integrations" ADD CONSTRAINT "jira_integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jira_sync_logs" ADD CONSTRAINT "jira_sync_logs_integration_id_jira_integrations_id_fk" FOREIGN KEY ("integration_id") REFERENCES "public"."jira_integrations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kanban_columns" ADD CONSTRAINT "kanban_columns_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_auth_codes" ADD CONSTRAINT "oauth_auth_codes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_instances" ADD CONSTRAINT "onboarding_instances_plan_id_onboarding_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."onboarding_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_instances" ADD CONSTRAINT "onboarding_instances_onboardee_id_users_id_fk" FOREIGN KEY ("onboardee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_instances" ADD CONSTRAINT "onboarding_instances_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_plans" ADD CONSTRAINT "onboarding_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_step_completions" ADD CONSTRAINT "onboarding_step_completions_instance_id_onboarding_instances_id_fk" FOREIGN KEY ("instance_id") REFERENCES "public"."onboarding_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_step_completions" ADD CONSTRAINT "onboarding_step_completions_step_id_onboarding_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."onboarding_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_step_completions" ADD CONSTRAINT "onboarding_step_completions_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_steps" ADD CONSTRAINT "onboarding_steps_plan_id_onboarding_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."onboarding_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_templates" ADD CONSTRAINT "onboarding_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_access_tokens" ADD CONSTRAINT "personal_access_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priority_weighting_preferences" ADD CONSTRAINT "priority_weighting_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "priority_weighting_preferences" ADD CONSTRAINT "priority_weighting_preferences_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_invitations" ADD CONSTRAINT "project_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_templates" ADD CONSTRAINT "rate_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rga_categories" ADD CONSTRAINT "rga_categories_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rga_reports" ADD CONSTRAINT "rga_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rga_settings" ADD CONSTRAINT "rga_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_social_posts" ADD CONSTRAINT "scheduled_social_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_task_assignments" ADD CONSTRAINT "smart_task_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "smart_task_assignments" ADD CONSTRAINT "smart_task_assignments_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_media_accounts" ADD CONSTRAINT "social_media_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_media_brand_profiles" ADD CONSTRAINT "social_media_brand_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_media_content_templates" ADD CONSTRAINT "social_media_content_templates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_media_goals" ADD CONSTRAINT "social_media_goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_media_post_metrics" ADD CONSTRAINT "social_media_post_metrics_post_id_social_media_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."social_media_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_media_posts" ADD CONSTRAINT "social_media_posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_media_posts" ADD CONSTRAINT "social_media_posts_goal_id_social_media_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."social_media_goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_media_posts" ADD CONSTRAINT "social_media_posts_brand_profile_id_social_media_brand_profiles_id_fk" FOREIGN KEY ("brand_profile_id") REFERENCES "public"."social_media_brand_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_voiceprints" ADD CONSTRAINT "speaker_voiceprints_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaker_voiceprints" ADD CONSTRAINT "speaker_voiceprints_team_member_id_team_members_id_fk" FOREIGN KEY ("team_member_id") REFERENCES "public"."team_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_estimations" ADD CONSTRAINT "story_estimations_story_id_user_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."user_stories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_estimations" ADD CONSTRAINT "story_estimations_estimated_by_users_id_fk" FOREIGN KEY ("estimated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_ai_agent_id_ai_agents_id_fk" FOREIGN KEY ("ai_agent_id") REFERENCES "public"."ai_agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_parent_comment_id_task_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."task_comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_mappings" ADD CONSTRAINT "task_mappings_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_priority_scores" ADD CONSTRAINT "task_priority_scores_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_priority_scores" ADD CONSTRAINT "task_priority_scores_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tool_recommendations" ADD CONSTRAINT "task_tool_recommendations_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_tool_recommendations" ADD CONSTRAINT "task_tool_recommendations_tool_id_ai_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."ai_tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_task_id_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_availability" ADD CONSTRAINT "team_availability_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_profiles" ADD CONSTRAINT "team_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_stories" ADD CONSTRAINT "user_stories_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "beliefs_user_subject_idx" ON "beliefs" USING btree ("user_id","subject_entity_id");--> statement-breakpoint
CREATE INDEX "beliefs_user_status_idx" ON "beliefs" USING btree ("user_id","status","last_seen_at");--> statement-breakpoint
CREATE INDEX "entities_user_kind_idx" ON "entities" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "entity_edges_user_src_pred_idx" ON "entity_edges" USING btree ("user_id","src_entity_id","predicate");--> statement-breakpoint
CREATE INDEX "entity_edges_user_dst_pred_idx" ON "entity_edges" USING btree ("user_id","dst_entity_id","predicate");--> statement-breakpoint
CREATE INDEX "entity_edges_user_chunk_idx" ON "entity_edges" USING btree ("user_id","source_embedding_id");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");