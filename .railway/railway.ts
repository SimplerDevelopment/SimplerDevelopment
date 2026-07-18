import { defineRailway, github, image, project, service, volume } from "railway/iac";

const text = (description, defaultValue) => ({
  description,
  preserveExisting: true,
  ...(defaultValue !== undefined ? { defaultValue } : {}),
});

const secret = (description, defaultValue) => ({
  description,
  isSealed: true,
  preserveExisting: true,
  ...(defaultValue !== undefined ? { defaultValue } : {}),
});

// Template variable functions — evaluated by Railway at deploy time, so a
// fresh deploy needs no manual values. Alphabets are format-constrained where
// the app validates: 64 hex chars for AES-256 keys, 43 base64 chars → 32 bytes.
const ALNUM = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const genSecret = (len, alphabet = ALNUM) => `\${{ secret(${len}, "${alphabet}") }}`;

export default defineRailway(() => {
  const postgresVolume = volume("postgres-volume", {
    sizeMB: 5000,
    region: "us-west2",
    allowOnlineResize: true,
    alerts: {
      usage: {
        80: {},
        95: {},
        100: {},
      },
    },
  });

  const postgres = service("Postgres", {
    source: image("ghcr.io/railwayapp-templates/postgres-ssl:18"),
    volumeMounts: {
      "postgres-volume": {
        mountPath: "/var/lib/postgresql/data",
      },
    },
    env: {
      PGDATA: text("Postgres data directory used by the container."),
      PGHOST: text("Internal hostname for Postgres connections inside Railway."),
      PGPORT: text("Internal Postgres port used for service-to-service connections."),
      PGUSER: text("Default Postgres username used by client connections."),
      PGDATABASE: text("Default Postgres database name."),
      PGPASSWORD: secret("Password for the default Postgres user."),
      POSTGRES_DB: text("Bootstrap database name used when the Postgres container starts."),
      DATABASE_URL: secret("Internal Postgres connection string used by application services."),
      POSTGRES_USER: text("Bootstrap username used when the Postgres container starts."),
      SSL_CERT_DAYS: text("Lifetime, in days, for the generated SSL certificate."),
      POSTGRES_PASSWORD: secret("Bootstrap password used when the Postgres container starts."),
      DATABASE_PUBLIC_URL: secret("Public TCP connection string for external clients."),
      RAILWAY_DEPLOYMENT_DRAINING_SECONDS: text("Grace period Railway gives the database before shutdown."),
    },
  });

  const realtime = service("realtime", {
    source: github("SimplerDevelopment/SimplerDevelopment", {
      branch: "main",
      rootDirectory: "/packages/realtime-server",
      checkSuites: false,
    }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    start: "node node_modules/.bin/tsx src/server.ts",
    healthcheckPath: "/health",
    healthcheckTimeout: 30,
    env: {
      PORT: text("Railway-injected listen port for the realtime server."),
      DATABASE_URL: secret("Internal Postgres connection string used to persist realtime snapshots."),
      REALTIME_JWT_SECRET: secret("JWT signing secret shared with the app service.", genSecret(64)),
      REALTIME_INTERNAL_SECRET: secret("Shared secret for app-to-realtime internal requests.", genSecret(64)),
    },
  });

  const agents = service("agents", {
    source: github("SimplerDevelopment/SimplerDevelopment", {
      branch: "main",
      rootDirectory: "/simplerdevelopment-agents",
      checkSuites: false,
    }),
    build: {
      builder: "DOCKERFILE",
      dockerfilePath: "Dockerfile",
    },
    env: {
      PORT: text("Railway-injected listen port for the Mastra agents service.", "4111"),
      SD_MCP_URL: text("Public portal MCP endpoint used by the agents service."),
      SD_AGENTS_INTERNAL_SECRET: secret("Shared secret for internal app-to-agents requests.", genSecret(64)),
    },
  });

  const app = service("app", {
    source: github("SimplerDevelopment/SimplerDevelopment", {
      branch: "main",
      checkSuites: false,
    }),
    build: "bun run build",
    start: "bun run start",
    healthcheckPath: "/api/health",
    healthcheckTimeout: 300,
    env: {
      S3_REGION: text("S3-compatible storage region identifier.", "${{media.REGION}}"),
      AUTH_SECRET: secret("Auth.js secret used to sign sessions and tokens.", genSecret(64)),
      S3_ENDPOINT: text("S3-compatible storage endpoint URL."),
      DATABASE_URL: secret("Internal Postgres connection string used by the app."),
      NEXTAUTH_URL: text("Canonical public app URL used by NextAuth."),
      SD_AGENTS_URL: text("Public app URL used by agents for MCP access."),
      PORTAL_KMS_KEY: secret("Base64-encoded KMS key used to encrypt portal secrets.", genSecret(43)),
      S3_BUCKET_NAME: text("Object storage bucket name used for uploaded media."),
      AUTH_TRUST_HOST: text("Tells Auth.js to trust Railway proxy headers.", "true"),
      NEXTAUTH_SECRET: secret("NextAuth secret used to sign sessions.", "${{AUTH_SECRET}}"),
      S3_ACCESS_KEY_ID: secret("Access key used for S3-compatible object storage."),
      OAUTH_STATE_SECRET: secret("Secret used to protect OAuth state values.", genSecret(64)),
      NEXT_PUBLIC_APP_URL: text("Public browser-facing URL for the app."),
      REALTIME_JWT_SECRET: secret("JWT signing secret shared with the realtime service."),
      NEXT_PUBLIC_SITE_URL: text("Public site URL used in rendered links."),
      S3_SECRET_ACCESS_KEY: secret("Secret key paired with the S3 access key."),
      REALTIME_INTERNAL_URL: text("Private URL used by the app to reach realtime."),
      NEXT_PUBLIC_REALTIME_URL: text("Public WebSocket URL for the realtime service."),
      REALTIME_INTERNAL_SECRET: secret("Shared secret for internal app-to-realtime requests."),
      SD_AGENTS_INTERNAL_SECRET: secret("Shared secret for internal app-to-agents requests."),
      WORKSPACE_TENANT_SECRETS_KEY: secret("Workspace-level key used to encrypt tenant secrets.", genSecret(64, "0123456789abcdef")),
    },
  });

  return project("simplerdevelopment-template", {
    resources: [app, realtime, agents, postgres, postgresVolume],
  });
});
