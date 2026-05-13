// Orchestrate full robingoffman.com migration end-to-end. Idempotent — safe
// to re-run; each step checks for existing records and updates rather than
// duplicating.

import { spawnSync } from 'child_process';
import * as path from 'path';

const steps = [
  'setup-client.ts',
  'extract-pages.ts',
  'import-assets.ts',
  'setup-branding.ts',
  'import-home.ts',
  'import-about.ts',
  'import-contact.ts',
  'import-portfolio.ts',
  'toggle-public.ts',
];

for (const step of steps) {
  const scriptPath = path.join(__dirname, step);
  console.log(`\n━━━ ${step} ━━━`);
  const result = spawnSync('npx', ['tsx', scriptPath, ...(step === 'toggle-public.ts' ? ['on'] : [])], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`Step ${step} failed with exit code ${result.status}`);
    process.exit(result.status || 1);
  }
}

console.log('\n✓ Full robingoffman migration complete');
