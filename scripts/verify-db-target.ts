import * as dotenv from 'dotenv';

// `.env.local` is the per-developer override and MUST win over `.env`.
// Without override:true the second call is a no-op when bun/Next have
// already injected `.env`, and staging URLs in `.env` silently win.
dotenv.config({ path: '.env', override: true });
dotenv.config({ path: '.env.local', override: true });

// DRIZZLE_DATABASE_URL is the un-overridable channel (same contract as
// drizzle.config.ts): inside Docker the repo's .env.local is bind-mounted and
// its localhost placeholder would clobber the compose-injected DATABASE_URL,
// so compose passes the container-network URL through this variable instead.
const url = process.env.DRIZZLE_DATABASE_URL ?? process.env.DATABASE_URL ?? '';
if (!url) {
  console.error('[verify-db-target] DATABASE_URL is not set.');
  process.exit(1);
}

// PROD_DB_HOSTS: optional comma-separated list of hostname[:port] fragments
// that identify production database proxies. Set this in your deployment
// environment if your infra uses named proxy hostnames. Example:
//   PROD_DB_HOSTS=db-prod.example.com:5432,db-prod-replica.example.com:5432
// When unset (e.g. open-source / local dev), only RAILWAY_ENVIRONMENT_NAME
// is used for production detection.
const PROD_INDICATORS: string[] = (process.env.PROD_DB_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

const hitProd = PROD_INDICATORS.some((p) => url.includes(p)) || process.env.RAILWAY_ENVIRONMENT_NAME === 'production';
const override = process.env.ALLOW_PROD === '1';
const redacted = url.replace(/:\/\/[^@]*@/, '://[REDACTED]@');

if (hitProd && !override) {
  console.error('');
  console.error('  REFUSING to run destructive DB command against production.');
  console.error('');
  console.error(`  DATABASE_URL → ${redacted}`);
  console.error('');
  console.error('  If this is truly intentional, re-run with ALLOW_PROD=1 in your env.');
  console.error('  Set PROD_DB_HOSTS to the hostname:port of your production DB proxy,');
  console.error('  or set RAILWAY_ENVIRONMENT_NAME=production in your Railway environment.');
  console.error('');
  process.exit(1);
}

console.log(`[verify-db-target] OK → ${redacted}${hitProd ? ' (prod override active via ALLOW_PROD=1)' : ''}`);
