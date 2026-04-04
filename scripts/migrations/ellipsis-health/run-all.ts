import { execSync } from 'child_process';
import * as path from 'path';

const scriptsDir = path.join(__dirname);

const steps = [
  { name: 'Client & Website Setup', file: 'setup-client.ts' },
  { name: 'Home Page', file: 'import-home.ts' },
  { name: 'Marketing Pages', file: 'import-marketing.ts' },
  { name: 'Navigation', file: 'import-navigation.ts' },
];

console.log('='.repeat(50));
console.log('  Ellipsis Health Migration');
console.log('='.repeat(50));
console.log();

for (const step of steps) {
  console.log(`--- ${step.name} ---`);
  try {
    execSync(`npx tsx ${path.join(scriptsDir, step.file)}`, {
      stdio: 'inherit',
      cwd: path.resolve(scriptsDir, '../../..'),
    });
    console.log(`[OK] ${step.name}\n`);
  } catch (err) {
    console.error(`[FAIL] ${step.name}`);
    process.exit(1);
  }
}

console.log('='.repeat(50));
console.log('  Migration Complete!');
console.log('  All pages created as drafts.');
console.log('  Review at: /admin/cms/websites');
console.log('='.repeat(50));
