-- ChatGPT CIMD clients use an HTTPS metadata URL as client_id.
-- Those URLs can exceed the original 64-character limit intended for oc_...
-- dynamic-registration IDs, so widen storage to match redirect/resource URLs.
ALTER TABLE "oauth_clients"
  ALTER COLUMN "client_id" TYPE varchar(500);
