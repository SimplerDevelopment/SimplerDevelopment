-- 9024: SEO module tables (seo_projects, seo_crawl_runs, seo_crawl_pages,
-- seo_page_links, seo_issues, seo_recommendations, seo_gsc_query_daily,
-- seo_gsc_page_daily). The module only ever reached dev DBs via drizzle-kit
-- push — no generated migration exists — so metro had none of it and every
-- /api/portal/seo/* route 500'd (operator report 2026-08-20). DDL captured by
-- pushing lib/db/schema/seo.ts to an empty scratch DB and dumping it; wrapped
-- to be re-runnable like every other *_manual.sql.

-- skipped: \restrict g0ngDGCAcg4gtftr9aY5FgXBSsdIxRgqyPVe6zYv56zc0qp3zKSNYM1cWzOsTlm

CREATE TABLE IF NOT EXISTS public.seo_crawl_pages (
    id bigint NOT NULL,
    run_id integer NOT NULL,
    project_id integer NOT NULL,
    client_id integer NOT NULL,
    url character varying(2048) NOT NULL,
    url_hash character varying(64) NOT NULL,
    http_status integer,
    final_url character varying(2048),
    redirect_chain jsonb DEFAULT '[]'::jsonb NOT NULL,
    content_type character varying(128),
    response_time_ms integer,
    response_bytes integer,
    depth integer DEFAULT 0 NOT NULL,
    discovered_from character varying(16) DEFAULT 'link'::character varying NOT NULL,
    indexable boolean,
    indexability_reason character varying(64),
    canonical_url character varying(2048),
    title text,
    meta_description text,
    h1 text,
    h1_count integer DEFAULT 0 NOT NULL,
    word_count integer DEFAULT 0 NOT NULL,
    lang character varying(16),
    content_hash character varying(64),
    internal_links_count integer DEFAULT 0 NOT NULL,
    external_links_count integer DEFAULT 0 NOT NULL,
    nofollow_links_count integer DEFAULT 0 NOT NULL,
    images_count integer DEFAULT 0 NOT NULL,
    images_missing_alt integer DEFAULT 0 NOT NULL,
    meta jsonb DEFAULT '{}'::jsonb NOT NULL,
    internal_rank real,
    incoming_links integer DEFAULT 0 NOT NULL,
    orphan boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.seo_crawl_pages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.seo_crawl_pages_id_seq OWNED BY public.seo_crawl_pages.id;

CREATE TABLE IF NOT EXISTS public.seo_crawl_runs (
    id integer NOT NULL,
    project_id integer NOT NULL,
    client_id integer NOT NULL,
    status character varying(16) DEFAULT 'queued'::character varying NOT NULL,
    pages_crawled integer DEFAULT 0 NOT NULL,
    state jsonb DEFAULT '{}'::jsonb NOT NULL,
    health_score integer,
    critical_count integer DEFAULT 0 NOT NULL,
    warning_count integer DEFAULT 0 NOT NULL,
    notice_count integer DEFAULT 0 NOT NULL,
    stats jsonb DEFAULT '{}'::jsonb NOT NULL,
    error text,
    started_at timestamp with time zone,
    heartbeat_at timestamp with time zone,
    finished_at timestamp with time zone,
    requested_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.seo_crawl_runs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.seo_crawl_runs_id_seq OWNED BY public.seo_crawl_runs.id;

CREATE TABLE IF NOT EXISTS public.seo_gsc_page_daily (
    id bigint NOT NULL,
    project_id integer NOT NULL,
    client_id integer NOT NULL,
    date character varying(10) NOT NULL,
    page character varying(2048) NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    impressions integer DEFAULT 0 NOT NULL,
    ctr real DEFAULT 0 NOT NULL,
    "position" real DEFAULT 0 NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.seo_gsc_page_daily_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.seo_gsc_page_daily_id_seq OWNED BY public.seo_gsc_page_daily.id;

CREATE TABLE IF NOT EXISTS public.seo_gsc_query_daily (
    id bigint NOT NULL,
    project_id integer NOT NULL,
    client_id integer NOT NULL,
    date character varying(10) NOT NULL,
    query character varying(512) NOT NULL,
    clicks integer DEFAULT 0 NOT NULL,
    impressions integer DEFAULT 0 NOT NULL,
    ctr real DEFAULT 0 NOT NULL,
    "position" real DEFAULT 0 NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.seo_gsc_query_daily_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.seo_gsc_query_daily_id_seq OWNED BY public.seo_gsc_query_daily.id;

CREATE TABLE IF NOT EXISTS public.seo_issues (
    id bigint NOT NULL,
    run_id integer NOT NULL,
    project_id integer NOT NULL,
    client_id integer NOT NULL,
    page_id bigint,
    rule_id character varying(64) NOT NULL,
    category character varying(32) NOT NULL,
    severity character varying(16) NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.seo_issues_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.seo_issues_id_seq OWNED BY public.seo_issues.id;

CREATE TABLE IF NOT EXISTS public.seo_page_links (
    id bigint NOT NULL,
    run_id integer NOT NULL,
    client_id integer NOT NULL,
    from_page_id bigint NOT NULL,
    to_url character varying(2048) NOT NULL,
    to_url_hash character varying(64) NOT NULL,
    to_page_id bigint,
    anchor_text character varying(512),
    is_internal boolean DEFAULT true NOT NULL,
    nofollow boolean DEFAULT false NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.seo_page_links_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.seo_page_links_id_seq OWNED BY public.seo_page_links.id;

CREATE TABLE IF NOT EXISTS public.seo_projects (
    id integer NOT NULL,
    client_id integer NOT NULL,
    website_id integer,
    name character varying(255) NOT NULL,
    domain character varying(255) NOT NULL,
    start_url character varying(500) NOT NULL,
    max_pages integer DEFAULT 200 NOT NULL,
    max_depth integer DEFAULT 5 NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_by integer,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.seo_projects_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.seo_projects_id_seq OWNED BY public.seo_projects.id;

CREATE TABLE IF NOT EXISTS public.seo_recommendations (
    id integer NOT NULL,
    project_id integer NOT NULL,
    client_id integer NOT NULL,
    run_id integer,
    title character varying(255) NOT NULL,
    body text NOT NULL,
    impact character varying(16) NOT NULL,
    effort character varying(16) NOT NULL,
    confidence real NOT NULL,
    opportunity_score real NOT NULL,
    evidence jsonb DEFAULT '{}'::jsonb NOT NULL,
    status character varying(16) DEFAULT 'open'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE SEQUENCE IF NOT EXISTS public.seo_recommendations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.seo_recommendations_id_seq OWNED BY public.seo_recommendations.id;

ALTER TABLE ONLY public.seo_crawl_pages ALTER COLUMN id SET DEFAULT nextval('public.seo_crawl_pages_id_seq'::regclass);

ALTER TABLE ONLY public.seo_crawl_runs ALTER COLUMN id SET DEFAULT nextval('public.seo_crawl_runs_id_seq'::regclass);

ALTER TABLE ONLY public.seo_gsc_page_daily ALTER COLUMN id SET DEFAULT nextval('public.seo_gsc_page_daily_id_seq'::regclass);

ALTER TABLE ONLY public.seo_gsc_query_daily ALTER COLUMN id SET DEFAULT nextval('public.seo_gsc_query_daily_id_seq'::regclass);

ALTER TABLE ONLY public.seo_issues ALTER COLUMN id SET DEFAULT nextval('public.seo_issues_id_seq'::regclass);

ALTER TABLE ONLY public.seo_page_links ALTER COLUMN id SET DEFAULT nextval('public.seo_page_links_id_seq'::regclass);

ALTER TABLE ONLY public.seo_projects ALTER COLUMN id SET DEFAULT nextval('public.seo_projects_id_seq'::regclass);

ALTER TABLE ONLY public.seo_recommendations ALTER COLUMN id SET DEFAULT nextval('public.seo_recommendations_id_seq'::regclass);

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_crawl_pages_pkey') THEN
ALTER TABLE ONLY public.seo_crawl_pages
    ADD CONSTRAINT seo_crawl_pages_pkey PRIMARY KEY (id);
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_crawl_runs_pkey') THEN
ALTER TABLE ONLY public.seo_crawl_runs
    ADD CONSTRAINT seo_crawl_runs_pkey PRIMARY KEY (id);
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_gsc_page_daily_pkey') THEN
ALTER TABLE ONLY public.seo_gsc_page_daily
    ADD CONSTRAINT seo_gsc_page_daily_pkey PRIMARY KEY (id);
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_gsc_query_daily_pkey') THEN
ALTER TABLE ONLY public.seo_gsc_query_daily
    ADD CONSTRAINT seo_gsc_query_daily_pkey PRIMARY KEY (id);
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_issues_pkey') THEN
ALTER TABLE ONLY public.seo_issues
    ADD CONSTRAINT seo_issues_pkey PRIMARY KEY (id);
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_page_links_pkey') THEN
ALTER TABLE ONLY public.seo_page_links
    ADD CONSTRAINT seo_page_links_pkey PRIMARY KEY (id);
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_projects_pkey') THEN
ALTER TABLE ONLY public.seo_projects
    ADD CONSTRAINT seo_projects_pkey PRIMARY KEY (id);
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_recommendations_pkey') THEN
ALTER TABLE ONLY public.seo_recommendations
    ADD CONSTRAINT seo_recommendations_pkey PRIMARY KEY (id);
END IF; END $$;

CREATE INDEX IF NOT EXISTS seo_crawl_pages_client_idx ON public.seo_crawl_pages USING btree (client_id);

CREATE INDEX IF NOT EXISTS seo_crawl_pages_project_idx ON public.seo_crawl_pages USING btree (project_id);

CREATE UNIQUE INDEX IF NOT EXISTS seo_crawl_pages_run_url_uq ON public.seo_crawl_pages USING btree (run_id, url_hash);

CREATE INDEX IF NOT EXISTS seo_crawl_runs_client_idx ON public.seo_crawl_runs USING btree (client_id);

CREATE INDEX IF NOT EXISTS seo_crawl_runs_project_idx ON public.seo_crawl_runs USING btree (project_id);

CREATE INDEX IF NOT EXISTS seo_crawl_runs_status_idx ON public.seo_crawl_runs USING btree (status);

CREATE INDEX IF NOT EXISTS seo_gsc_page_daily_client_idx ON public.seo_gsc_page_daily USING btree (client_id);

CREATE UNIQUE INDEX IF NOT EXISTS seo_gsc_page_daily_uq ON public.seo_gsc_page_daily USING btree (project_id, date, page);

CREATE INDEX IF NOT EXISTS seo_gsc_query_daily_client_idx ON public.seo_gsc_query_daily USING btree (client_id);

CREATE UNIQUE INDEX IF NOT EXISTS seo_gsc_query_daily_uq ON public.seo_gsc_query_daily USING btree (project_id, date, query);

CREATE INDEX IF NOT EXISTS seo_issues_client_idx ON public.seo_issues USING btree (client_id);

CREATE INDEX IF NOT EXISTS seo_issues_run_idx ON public.seo_issues USING btree (run_id);

CREATE INDEX IF NOT EXISTS seo_issues_run_rule_idx ON public.seo_issues USING btree (run_id, rule_id);

CREATE INDEX IF NOT EXISTS seo_page_links_from_idx ON public.seo_page_links USING btree (from_page_id);

CREATE INDEX IF NOT EXISTS seo_page_links_run_idx ON public.seo_page_links USING btree (run_id);

CREATE INDEX IF NOT EXISTS seo_page_links_run_to_hash_idx ON public.seo_page_links USING btree (run_id, to_url_hash);

CREATE UNIQUE INDEX IF NOT EXISTS seo_projects_client_domain_uq ON public.seo_projects USING btree (client_id, domain);

CREATE INDEX IF NOT EXISTS seo_projects_client_idx ON public.seo_projects USING btree (client_id);

CREATE INDEX IF NOT EXISTS seo_recommendations_client_idx ON public.seo_recommendations USING btree (client_id);

CREATE INDEX IF NOT EXISTS seo_recommendations_project_idx ON public.seo_recommendations USING btree (project_id);

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_crawl_pages_client_id_clients_id_fk') THEN
ALTER TABLE ONLY public.seo_crawl_pages
    ADD CONSTRAINT seo_crawl_pages_client_id_clients_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_crawl_pages_project_id_seo_projects_id_fk') THEN
ALTER TABLE ONLY public.seo_crawl_pages
    ADD CONSTRAINT seo_crawl_pages_project_id_seo_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.seo_projects(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_crawl_pages_run_id_seo_crawl_runs_id_fk') THEN
ALTER TABLE ONLY public.seo_crawl_pages
    ADD CONSTRAINT seo_crawl_pages_run_id_seo_crawl_runs_id_fk FOREIGN KEY (run_id) REFERENCES public.seo_crawl_runs(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_crawl_runs_client_id_clients_id_fk') THEN
ALTER TABLE ONLY public.seo_crawl_runs
    ADD CONSTRAINT seo_crawl_runs_client_id_clients_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_crawl_runs_project_id_seo_projects_id_fk') THEN
ALTER TABLE ONLY public.seo_crawl_runs
    ADD CONSTRAINT seo_crawl_runs_project_id_seo_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.seo_projects(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_crawl_runs_requested_by_users_id_fk') THEN
ALTER TABLE ONLY public.seo_crawl_runs
    ADD CONSTRAINT seo_crawl_runs_requested_by_users_id_fk FOREIGN KEY (requested_by) REFERENCES public.users(id) ON DELETE SET NULL;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_gsc_page_daily_client_id_clients_id_fk') THEN
ALTER TABLE ONLY public.seo_gsc_page_daily
    ADD CONSTRAINT seo_gsc_page_daily_client_id_clients_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_gsc_page_daily_project_id_seo_projects_id_fk') THEN
ALTER TABLE ONLY public.seo_gsc_page_daily
    ADD CONSTRAINT seo_gsc_page_daily_project_id_seo_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.seo_projects(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_gsc_query_daily_client_id_clients_id_fk') THEN
ALTER TABLE ONLY public.seo_gsc_query_daily
    ADD CONSTRAINT seo_gsc_query_daily_client_id_clients_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_gsc_query_daily_project_id_seo_projects_id_fk') THEN
ALTER TABLE ONLY public.seo_gsc_query_daily
    ADD CONSTRAINT seo_gsc_query_daily_project_id_seo_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.seo_projects(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_issues_client_id_clients_id_fk') THEN
ALTER TABLE ONLY public.seo_issues
    ADD CONSTRAINT seo_issues_client_id_clients_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_issues_project_id_seo_projects_id_fk') THEN
ALTER TABLE ONLY public.seo_issues
    ADD CONSTRAINT seo_issues_project_id_seo_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.seo_projects(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_issues_run_id_seo_crawl_runs_id_fk') THEN
ALTER TABLE ONLY public.seo_issues
    ADD CONSTRAINT seo_issues_run_id_seo_crawl_runs_id_fk FOREIGN KEY (run_id) REFERENCES public.seo_crawl_runs(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_page_links_client_id_clients_id_fk') THEN
ALTER TABLE ONLY public.seo_page_links
    ADD CONSTRAINT seo_page_links_client_id_clients_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_page_links_from_page_id_seo_crawl_pages_id_fk') THEN
ALTER TABLE ONLY public.seo_page_links
    ADD CONSTRAINT seo_page_links_from_page_id_seo_crawl_pages_id_fk FOREIGN KEY (from_page_id) REFERENCES public.seo_crawl_pages(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_page_links_run_id_seo_crawl_runs_id_fk') THEN
ALTER TABLE ONLY public.seo_page_links
    ADD CONSTRAINT seo_page_links_run_id_seo_crawl_runs_id_fk FOREIGN KEY (run_id) REFERENCES public.seo_crawl_runs(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_projects_client_id_clients_id_fk') THEN
ALTER TABLE ONLY public.seo_projects
    ADD CONSTRAINT seo_projects_client_id_clients_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_projects_created_by_users_id_fk') THEN
ALTER TABLE ONLY public.seo_projects
    ADD CONSTRAINT seo_projects_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_projects_website_id_client_websites_id_fk') THEN
ALTER TABLE ONLY public.seo_projects
    ADD CONSTRAINT seo_projects_website_id_client_websites_id_fk FOREIGN KEY (website_id) REFERENCES public.client_websites(id) ON DELETE SET NULL;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_recommendations_client_id_clients_id_fk') THEN
ALTER TABLE ONLY public.seo_recommendations
    ADD CONSTRAINT seo_recommendations_client_id_clients_id_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_recommendations_project_id_seo_projects_id_fk') THEN
ALTER TABLE ONLY public.seo_recommendations
    ADD CONSTRAINT seo_recommendations_project_id_seo_projects_id_fk FOREIGN KEY (project_id) REFERENCES public.seo_projects(id) ON DELETE CASCADE;
END IF; END $$;

DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seo_recommendations_run_id_seo_crawl_runs_id_fk') THEN
ALTER TABLE ONLY public.seo_recommendations
    ADD CONSTRAINT seo_recommendations_run_id_seo_crawl_runs_id_fk FOREIGN KEY (run_id) REFERENCES public.seo_crawl_runs(id) ON DELETE SET NULL;
END IF; END $$;

-- skipped: \unrestrict g0ngDGCAcg4gtftr9aY5FgXBSsdIxRgqyPVe6zYv56zc0qp3zKSNYM1cWzOsTlm
