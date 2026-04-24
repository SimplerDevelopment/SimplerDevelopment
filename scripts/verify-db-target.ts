import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const url = process.env.DATABASE_URL ?? '';
if (!url) {
  console.error('[verify-db-target] DATABASE_URL is not set.');
  process.exit(1);
}

const PROD_INDICATORS = [
  'tramway.proxy.rlwy.net:43167',
];

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
  console.error('  Otherwise update .env to point at staging (nozomi.proxy.rlwy.net).');
  console.error('');
  process.exit(1);
}

console.log(`[verify-db-target] OK → ${redacted}${hitProd ? ' (prod override active via ALLOW_PROD=1)' : ''}`);
