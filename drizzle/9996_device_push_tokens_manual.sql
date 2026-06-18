-- P0.4: registered mobile device push tokens (Expo). Manual migration
-- (drizzle journal is out of sync in this repo; apply directly).
CREATE TABLE IF NOT EXISTS device_push_tokens (
  id           serial PRIMARY KEY,
  client_id    integer NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id      integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token        varchar(256) NOT NULL UNIQUE,
  platform     varchar(16),
  created_at   timestamp NOT NULL DEFAULT now(),
  last_seen_at timestamp NOT NULL DEFAULT now(),
  revoked_at   timestamp
);
CREATE INDEX IF NOT EXISTS device_push_tokens_client_user_idx
  ON device_push_tokens (client_id, user_id);
