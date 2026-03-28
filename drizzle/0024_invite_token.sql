ALTER TABLE "users" ADD COLUMN "invite_token" varchar(255);
ALTER TABLE "users" ADD COLUMN "invite_expires_at" timestamp;