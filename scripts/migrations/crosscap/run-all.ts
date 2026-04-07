import { execSync } from 'child_process';
import * as path from 'path';

const dir = __dirname;
const run = (script: string) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Running: ${script}`);
  console.log('='.repeat(60));
  execSync(`npx tsx ${path.join(dir, script)}`, { stdio: 'inherit', cwd: path.resolve(dir, '../../..') });
};

run('setup-client.ts');
run('import-home.ts');
run('import-navigation.ts');
run('publish-home.ts');

console.log('\n\n=== MIGRATION COMPLETE ===');
console.log('Preview: http://localhost:3000/sites/crosscap-advisors.simplerdevelopment.com');
