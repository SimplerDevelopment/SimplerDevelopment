-- Sync prod schema to match staging — captured 2026-05-05.
--
-- Background: prod's drizzle.__drizzle_migrations is out of sync with the
-- on-disk migration files (only 2 entries vs 33 disk migrations + 4 journal
-- entries). The 0043+ migrations have been applied to staging via drizzle-kit
-- push but never landed on prod. This script closes that drift in one
-- transaction so the data-mirror scripts (mirror-postcaptain-website,
-- copy-cy-strategies-decks) can run against prod with the schema they expect.
--
-- Apply with:
--   DB_URL=$(railway variables --kv | grep '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)
--   /usr/local/opt/postgresql@17/bin/psql "$DB_URL" -v ON_ERROR_STOP=1 \
--     -f scripts/migrations/sync-prod-schema-to-staging.sql
--
-- Idempotent: re-running is safe (CREATE … IF NOT EXISTS, ADD COLUMN IF NOT
-- EXISTS, constraint adds wrapped in DO blocks).

BEGIN;

-- ─── 1. pgvector extension (required by brain_embeddings.vector(1536)) ─────

CREATE EXTENSION IF NOT EXISTS vector;

-- ─── 2. Add missing columns to existing tables ─────────────────────────────

ALTER TABLE client_websites  ADD COLUMN IF NOT EXISTS custom_css text;
ALTER TABLE client_websites  ADD COLUMN IF NOT EXISTS custom_js  text;
ALTER TABLE post_types       ADD COLUMN IF NOT EXISTS custom_css text;
ALTER TABLE post_types       ADD COLUMN IF NOT EXISTS custom_js  text;
ALTER TABLE post_types       ADD COLUMN IF NOT EXISTS template   text;
ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS form_name  varchar(100) DEFAULT 'main' NOT NULL;

-- ─── 3. Create missing tables (11) — schema captured from staging via       ──
--    pg_dump --schema-only -t public.<table> -d <staging>                      ──
--    CREATEs use IF NOT EXISTS; constraint adds wrapped in DO blocks.        ──
--    Source: /tmp/sd2026-missing-schema.sql (regenerable via the same cmd).  ──

--
-- PostgreSQL database dump
--


-- Dumped from database version 18.3 (Debian 18.3-1.pgdg13+1)
-- Dumped by pg_dump version 18.3 (Homebrew)

SELECT pg_catalog.set_config('search_path', '', false);



--
-- Name: brain_custom_field_values; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.brain_custom_field_values (
    id integer NOT NULL,
    custom_field_id integer NOT NULL,
    entity_type character varying(20) NOT NULL,
    entity_id integer NOT NULL,
    value text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: brain_custom_field_values_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.brain_custom_field_values_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brain_custom_field_values_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brain_custom_field_values_id_seq OWNED BY public.brain_custom_field_values.id;


--
-- Name: brain_custom_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.brain_custom_fields (
    id integer NOT NULL,
    client_id integer NOT NULL,
    entity_type character varying(20) NOT NULL,
    field_name character varying(100) NOT NULL,
    field_label character varying(150),
    field_type character varying(20) NOT NULL,
    options json,
    required boolean DEFAULT false NOT NULL,
    filterable boolean DEFAULT false NOT NULL,
    category character varying(100),
    sort_order integer DEFAULT 0 NOT NULL,
    source character varying(50) DEFAULT 'manual'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: brain_custom_fields_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.brain_custom_fields_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brain_custom_fields_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brain_custom_fields_id_seq OWNED BY public.brain_custom_fields.id;


--
-- Name: brain_embedding_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.brain_embedding_jobs (
    id integer NOT NULL,
    client_id integer NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id integer NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    last_error text,
    enqueued_at timestamp without time zone DEFAULT now() NOT NULL,
    started_at timestamp without time zone
);


--
-- Name: brain_embedding_jobs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.brain_embedding_jobs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brain_embedding_jobs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brain_embedding_jobs_id_seq OWNED BY public.brain_embedding_jobs.id;


--
-- Name: brain_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.brain_embeddings (
    id integer NOT NULL,
    client_id integer NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id integer NOT NULL,
    chunk_index integer DEFAULT 0 NOT NULL,
    content text NOT NULL,
    vector public.vector(1536) NOT NULL,
    model character varying(100) NOT NULL,
    dim integer NOT NULL,
    tokens integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: brain_embeddings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.brain_embeddings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brain_embeddings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brain_embeddings_id_seq OWNED BY public.brain_embeddings.id;


--
-- Name: brain_kb_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.brain_kb_links (
    id integer NOT NULL,
    client_id integer NOT NULL,
    from_note_id integer NOT NULL,
    to_note_id integer,
    raw_target character varying(500) NOT NULL,
    anchor character varying(255),
    display_text character varying(500),
    link_type character varying(20) DEFAULT 'wikilink'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: brain_kb_links_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.brain_kb_links_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brain_kb_links_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brain_kb_links_id_seq OWNED BY public.brain_kb_links.id;


--
-- Name: brain_note_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.brain_note_templates (
    id integer NOT NULL,
    client_id integer NOT NULL,
    name character varying(150) NOT NULL,
    body text NOT NULL,
    trigger character varying(50) DEFAULT 'manual'::character varying NOT NULL,
    variables json,
    enabled boolean DEFAULT true NOT NULL,
    default_tags json,
    created_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: brain_note_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.brain_note_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: brain_note_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.brain_note_templates_id_seq OWNED BY public.brain_note_templates.id;


--
-- Name: mcp_tool_call_daily_rollups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.mcp_tool_call_daily_rollups (
    id integer NOT NULL,
    day timestamp without time zone NOT NULL,
    client_id integer NOT NULL,
    tool_name character varying(100) NOT NULL,
    call_count integer DEFAULT 0 NOT NULL,
    success_count integer DEFAULT 0 NOT NULL,
    error_count integer DEFAULT 0 NOT NULL,
    total_request_bytes integer DEFAULT 0 NOT NULL,
    total_response_bytes integer DEFAULT 0 NOT NULL,
    total_estimated_tokens integer DEFAULT 0 NOT NULL,
    total_duration_ms integer DEFAULT 0 NOT NULL,
    p95_response_bytes integer DEFAULT 0 NOT NULL,
    p95_estimated_tokens integer DEFAULT 0 NOT NULL,
    p95_duration_ms integer DEFAULT 0 NOT NULL,
    max_response_bytes integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mcp_tool_call_daily_rollups_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.mcp_tool_call_daily_rollups_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mcp_tool_call_daily_rollups_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mcp_tool_call_daily_rollups_id_seq OWNED BY public.mcp_tool_call_daily_rollups.id;


--
-- Name: mcp_tool_calls; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.mcp_tool_calls (
    id integer NOT NULL,
    client_id integer NOT NULL,
    api_key_id integer,
    user_id integer,
    tool_name character varying(100) NOT NULL,
    request_bytes integer DEFAULT 0 NOT NULL,
    response_bytes integer DEFAULT 0 NOT NULL,
    estimated_tokens integer DEFAULT 0 NOT NULL,
    duration_ms integer DEFAULT 0 NOT NULL,
    success boolean DEFAULT true NOT NULL,
    error_message text,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: mcp_tool_calls_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.mcp_tool_calls_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: mcp_tool_calls_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.mcp_tool_calls_id_seq OWNED BY public.mcp_tool_calls.id;


--
-- Name: oauth_access_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.oauth_access_tokens (
    id integer NOT NULL,
    token_hash character varying(128) NOT NULL,
    token_preview character varying(24) NOT NULL,
    oauth_client_id integer NOT NULL,
    user_id integer NOT NULL,
    client_id integer NOT NULL,
    scopes json NOT NULL,
    resource character varying(500),
    expires_at timestamp without time zone,
    revoked_at timestamp without time zone,
    last_used_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: oauth_access_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.oauth_access_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: oauth_access_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.oauth_access_tokens_id_seq OWNED BY public.oauth_access_tokens.id;


--
-- Name: oauth_authorization_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.oauth_authorization_codes (
    id integer NOT NULL,
    code_hash character varying(128) NOT NULL,
    oauth_client_id integer NOT NULL,
    user_id integer NOT NULL,
    client_id integer NOT NULL,
    scopes json NOT NULL,
    redirect_uri character varying(500) NOT NULL,
    code_challenge character varying(256) NOT NULL,
    code_challenge_method character varying(16) DEFAULT 'S256'::character varying NOT NULL,
    resource character varying(500),
    expires_at timestamp without time zone NOT NULL,
    consumed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: oauth_authorization_codes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.oauth_authorization_codes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: oauth_authorization_codes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.oauth_authorization_codes_id_seq OWNED BY public.oauth_authorization_codes.id;


--
-- Name: oauth_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public.oauth_clients (
    id integer NOT NULL,
    client_id character varying(64) NOT NULL,
    client_name character varying(200) NOT NULL,
    redirect_uris json NOT NULL,
    client_uri character varying(500),
    logo_uri character varying(500),
    tos_uri character varying(500),
    policy_uri character varying(500),
    token_endpoint_auth_method character varying(32) DEFAULT 'none'::character varying NOT NULL,
    software_id character varying(200),
    software_version character varying(64),
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: oauth_clients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE IF NOT EXISTS public.oauth_clients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: oauth_clients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.oauth_clients_id_seq OWNED BY public.oauth_clients.id;


--
-- Name: brain_custom_field_values id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_custom_field_values ALTER COLUMN id SET DEFAULT nextval('public.brain_custom_field_values_id_seq'::regclass);


--
-- Name: brain_custom_fields id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_custom_fields ALTER COLUMN id SET DEFAULT nextval('public.brain_custom_fields_id_seq'::regclass);


--
-- Name: brain_embedding_jobs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_embedding_jobs ALTER COLUMN id SET DEFAULT nextval('public.brain_embedding_jobs_id_seq'::regclass);


--
-- Name: brain_embeddings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_embeddings ALTER COLUMN id SET DEFAULT nextval('public.brain_embeddings_id_seq'::regclass);


--
-- Name: brain_kb_links id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_kb_links ALTER COLUMN id SET DEFAULT nextval('public.brain_kb_links_id_seq'::regclass);


--
-- Name: brain_note_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.brain_note_templates ALTER COLUMN id SET DEFAULT nextval('public.brain_note_templates_id_seq'::regclass);


--
-- Name: mcp_tool_call_daily_rollups id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tool_call_daily_rollups ALTER COLUMN id SET DEFAULT nextval('public.mcp_tool_call_daily_rollups_id_seq'::regclass);


--
-- Name: mcp_tool_calls id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mcp_tool_calls ALTER COLUMN id SET DEFAULT nextval('public.mcp_tool_calls_id_seq'::regclass);


--
-- Name: oauth_access_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_access_tokens ALTER COLUMN id SET DEFAULT nextval('public.oauth_access_tokens_id_seq'::regclass);


--
-- Name: oauth_authorization_codes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_authorization_codes ALTER COLUMN id SET DEFAULT nextval('public.oauth_authorization_codes_id_seq'::regclass);


--
-- Name: oauth_clients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.oauth_clients ALTER COLUMN id SET DEFAULT nextval('public.oauth_clients_id_seq'::regclass);


--
-- Name: brain_custom_field_values brain_custom_field_values_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.brain_custom_field_values
    ADD CONSTRAINT brain_custom_field_values_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: brain_custom_fields brain_custom_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.brain_custom_fields
    ADD CONSTRAINT brain_custom_fields_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: brain_embedding_jobs brain_embedding_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.brain_embedding_jobs
    ADD CONSTRAINT brain_embedding_jobs_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: brain_embeddings brain_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.brain_embeddings
    ADD CONSTRAINT brain_embeddings_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: brain_kb_links brain_kb_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.brain_kb_links
    ADD CONSTRAINT brain_kb_links_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: brain_note_templates brain_note_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.brain_note_templates
    ADD CONSTRAINT brain_note_templates_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: mcp_tool_call_daily_rollups mcp_tool_call_daily_rollups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.mcp_tool_call_daily_rollups
    ADD CONSTRAINT mcp_tool_call_daily_rollups_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: mcp_tool_calls mcp_tool_calls_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.mcp_tool_calls
    ADD CONSTRAINT mcp_tool_calls_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: oauth_access_tokens oauth_access_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.oauth_access_tokens
    ADD CONSTRAINT oauth_access_tokens_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: oauth_access_tokens oauth_access_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.oauth_access_tokens
    ADD CONSTRAINT oauth_access_tokens_token_hash_key UNIQUE (token_hash);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: oauth_authorization_codes oauth_authorization_codes_code_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.oauth_authorization_codes
    ADD CONSTRAINT oauth_authorization_codes_code_hash_key UNIQUE (code_hash);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: oauth_authorization_codes oauth_authorization_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.oauth_authorization_codes
    ADD CONSTRAINT oauth_authorization_codes_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: oauth_clients oauth_clients_client_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.oauth_clients
    ADD CONSTRAINT oauth_clients_client_id_key UNIQUE (client_id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: oauth_clients oauth_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.oauth_clients
    ADD CONSTRAINT oauth_clients_pkey PRIMARY KEY (id);
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: brain_custom_field_values_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS brain_custom_field_values_entity_idx ON public.brain_custom_field_values USING btree (entity_type, entity_id);


--
-- Name: brain_custom_field_values_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS brain_custom_field_values_unique_idx ON public.brain_custom_field_values USING btree (custom_field_id, entity_id);


--
-- Name: brain_custom_fields_client_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS brain_custom_fields_client_entity_idx ON public.brain_custom_fields USING btree (client_id, entity_type);


--
-- Name: brain_custom_fields_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS brain_custom_fields_unique_idx ON public.brain_custom_fields USING btree (client_id, entity_type, field_name);


--
-- Name: brain_embedding_jobs_entity_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS brain_embedding_jobs_entity_unique_idx ON public.brain_embedding_jobs USING btree (entity_type, entity_id);


--
-- Name: brain_embedding_jobs_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS brain_embedding_jobs_status_idx ON public.brain_embedding_jobs USING btree (status, enqueued_at);


--
-- Name: brain_embeddings_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS brain_embeddings_client_idx ON public.brain_embeddings USING btree (client_id);


--
-- Name: brain_embeddings_entity_chunk_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS brain_embeddings_entity_chunk_idx ON public.brain_embeddings USING btree (entity_type, entity_id, chunk_index);


--
-- Name: brain_embeddings_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS brain_embeddings_entity_idx ON public.brain_embeddings USING btree (entity_type, entity_id);


--
-- Name: brain_embeddings_vector_hnsw_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS brain_embeddings_vector_hnsw_idx ON public.brain_embeddings USING hnsw (vector public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: brain_kb_links_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS brain_kb_links_client_idx ON public.brain_kb_links USING btree (client_id);


--
-- Name: brain_kb_links_from_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS brain_kb_links_from_idx ON public.brain_kb_links USING btree (from_note_id);


--
-- Name: brain_kb_links_to_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS brain_kb_links_to_idx ON public.brain_kb_links USING btree (to_note_id);


--
-- Name: brain_note_templates_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS brain_note_templates_client_idx ON public.brain_note_templates USING btree (client_id);


--
-- Name: brain_note_templates_client_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS brain_note_templates_client_name_idx ON public.brain_note_templates USING btree (client_id, name);


--
-- Name: mcp_rollups_client_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS mcp_rollups_client_day_idx ON public.mcp_tool_call_daily_rollups USING btree (client_id, day);


--
-- Name: mcp_rollups_day_client_tool_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX IF NOT EXISTS mcp_rollups_day_client_tool_uq ON public.mcp_tool_call_daily_rollups USING btree (day, client_id, tool_name);


--
-- Name: mcp_rollups_day_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS mcp_rollups_day_idx ON public.mcp_tool_call_daily_rollups USING btree (day);


--
-- Name: mcp_tool_calls_client_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS mcp_tool_calls_client_created_idx ON public.mcp_tool_calls USING btree (client_id, created_at);


--
-- Name: mcp_tool_calls_tool_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS mcp_tool_calls_tool_created_idx ON public.mcp_tool_calls USING btree (tool_name, created_at);


--
-- Name: oauth_access_tokens_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS oauth_access_tokens_client_idx ON public.oauth_access_tokens USING btree (client_id);


--
-- Name: oauth_access_tokens_oauth_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS oauth_access_tokens_oauth_client_idx ON public.oauth_access_tokens USING btree (oauth_client_id);


--
-- Name: oauth_authorization_codes_expires_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX IF NOT EXISTS oauth_authorization_codes_expires_at_idx ON public.oauth_authorization_codes USING btree (expires_at);


--
-- Name: brain_custom_field_values brain_custom_field_values_custom_field_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.brain_custom_field_values
    ADD CONSTRAINT brain_custom_field_values_custom_field_id_fkey FOREIGN KEY (custom_field_id) REFERENCES public.brain_custom_fields(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: brain_custom_fields brain_custom_fields_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.brain_custom_fields
    ADD CONSTRAINT brain_custom_fields_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: brain_embedding_jobs brain_embedding_jobs_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.brain_embedding_jobs
    ADD CONSTRAINT brain_embedding_jobs_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: brain_embeddings brain_embeddings_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.brain_embeddings
    ADD CONSTRAINT brain_embeddings_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: brain_kb_links brain_kb_links_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.brain_kb_links
    ADD CONSTRAINT brain_kb_links_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: brain_kb_links brain_kb_links_from_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.brain_kb_links
    ADD CONSTRAINT brain_kb_links_from_note_id_fkey FOREIGN KEY (from_note_id) REFERENCES public.brain_notes(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: brain_kb_links brain_kb_links_to_note_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.brain_kb_links
    ADD CONSTRAINT brain_kb_links_to_note_id_fkey FOREIGN KEY (to_note_id) REFERENCES public.brain_notes(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: brain_note_templates brain_note_templates_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.brain_note_templates
    ADD CONSTRAINT brain_note_templates_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: brain_note_templates brain_note_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.brain_note_templates
    ADD CONSTRAINT brain_note_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: mcp_tool_call_daily_rollups mcp_tool_call_daily_rollups_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.mcp_tool_call_daily_rollups
    ADD CONSTRAINT mcp_tool_call_daily_rollups_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: mcp_tool_calls mcp_tool_calls_api_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.mcp_tool_calls
    ADD CONSTRAINT mcp_tool_calls_api_key_id_fkey FOREIGN KEY (api_key_id) REFERENCES public.portal_api_keys(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: mcp_tool_calls mcp_tool_calls_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.mcp_tool_calls
    ADD CONSTRAINT mcp_tool_calls_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: mcp_tool_calls mcp_tool_calls_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.mcp_tool_calls
    ADD CONSTRAINT mcp_tool_calls_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: oauth_access_tokens oauth_access_tokens_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.oauth_access_tokens
    ADD CONSTRAINT oauth_access_tokens_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: oauth_access_tokens oauth_access_tokens_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.oauth_access_tokens
    ADD CONSTRAINT oauth_access_tokens_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES public.oauth_clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: oauth_access_tokens oauth_access_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.oauth_access_tokens
    ADD CONSTRAINT oauth_access_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: oauth_authorization_codes oauth_authorization_codes_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.oauth_authorization_codes
    ADD CONSTRAINT oauth_authorization_codes_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: oauth_authorization_codes oauth_authorization_codes_oauth_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.oauth_authorization_codes
    ADD CONSTRAINT oauth_authorization_codes_oauth_client_id_fkey FOREIGN KEY (oauth_client_id) REFERENCES public.oauth_clients(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- Name: oauth_authorization_codes oauth_authorization_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
ALTER TABLE ONLY public.oauth_authorization_codes
    ADD CONSTRAINT oauth_authorization_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object OR duplicate_table OR invalid_table_definition THEN NULL;
END $$;


--
-- PostgreSQL database dump complete
--




-- ─── 4. Verification ───────────────────────────────────────────────────────

DO $$
DECLARE
  expected_tables text[] := ARRAY[
    'brain_custom_field_values','brain_custom_fields','brain_embedding_jobs',
    'brain_embeddings','brain_kb_links','brain_note_templates',
    'mcp_tool_call_daily_rollups','mcp_tool_calls',
    'oauth_access_tokens','oauth_authorization_codes','oauth_clients'
  ];
  missing_tables text[];
  expected_cols text[] := ARRAY[
    'client_websites.custom_css','client_websites.custom_js',
    'post_types.custom_css','post_types.custom_js','post_types.template',
    'survey_responses.form_name'
  ];
  missing_cols text[];
BEGIN
  SELECT array_agg(t)
    INTO missing_tables
    FROM unnest(expected_tables) t
    WHERE NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = t AND schemaname = 'public');
  IF missing_tables IS NOT NULL THEN
    RAISE EXCEPTION 'Missing tables after sync: %', missing_tables;
  END IF;

  SELECT array_agg(c)
    INTO missing_cols
    FROM unnest(expected_cols) c
    WHERE NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name   = split_part(c, '.', 1)
         AND column_name  = split_part(c, '.', 2)
    );
  IF missing_cols IS NOT NULL THEN
    RAISE EXCEPTION 'Missing columns after sync: %', missing_cols;
  END IF;

  RAISE NOTICE 'sync-prod-schema-to-staging: 11 tables + 6 columns verified.';
END $$;

COMMIT;
