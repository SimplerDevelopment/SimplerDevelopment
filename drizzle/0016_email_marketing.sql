CREATE TABLE "email_lists" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "description" text,
  "client_id" integer,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "email_subscribers" (
  "id" serial PRIMARY KEY NOT NULL,
  "list_id" integer NOT NULL,
  "email" varchar(255) NOT NULL,
  "name" varchar(255),
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "unsubscribe_token" varchar(64) NOT NULL,
  "metadata" json,
  "subscribed_at" timestamp DEFAULT now() NOT NULL,
  "unsubscribed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "email_subscribers_unsubscribe_token_unique" UNIQUE("unsubscribe_token")
);

CREATE TABLE "email_campaigns" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(255) NOT NULL,
  "subject" varchar(255) NOT NULL,
  "preview_text" varchar(255),
  "from_name" varchar(255) NOT NULL,
  "from_email" varchar(255) NOT NULL,
  "reply_to" varchar(255),
  "list_id" integer NOT NULL,
  "client_id" integer,
  "html_content" text NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "scheduled_at" timestamp,
  "sent_at" timestamp,
  "total_recipients" integer DEFAULT 0 NOT NULL,
  "total_sent" integer DEFAULT 0 NOT NULL,
  "total_opened" integer DEFAULT 0 NOT NULL,
  "total_clicked" integer DEFAULT 0 NOT NULL,
  "total_bounced" integer DEFAULT 0 NOT NULL,
  "total_unsubscribed" integer DEFAULT 0 NOT NULL,
  "created_by" integer,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "email_campaign_sends" (
  "id" serial PRIMARY KEY NOT NULL,
  "campaign_id" integer NOT NULL,
  "subscriber_id" integer NOT NULL,
  "resend_email_id" varchar(255),
  "sent_at" timestamp,
  "opened_at" timestamp,
  "clicked_at" timestamp,
  "bounced_at" timestamp,
  "complained_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "email_lists" ADD CONSTRAINT "email_lists_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "email_lists" ADD CONSTRAINT "email_lists_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "email_subscribers" ADD CONSTRAINT "email_subscribers_list_id_email_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."email_lists"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_list_id_email_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."email_lists"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "email_campaigns" ADD CONSTRAINT "email_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
ALTER TABLE "email_campaign_sends" ADD CONSTRAINT "email_campaign_sends_campaign_id_email_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."email_campaigns"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "email_campaign_sends" ADD CONSTRAINT "email_campaign_sends_subscriber_id_email_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."email_subscribers"("id") ON DELETE cascade ON UPDATE no action;
