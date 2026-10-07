import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

// Use Git Bash on Windows: the system bash can point at an unconfigured WSL.
const bash = process.platform === 'win32'
  ? ['C:/Program Files/Git/bin/bash.exe', 'C:/Program Files (x86)/Git/bin/bash.exe'].find(existsSync)
  : 'bash';
if (!bash) throw new Error('Install Git for Windows to run the repository test gates');
const [gate, ...args] = process.argv.slice(2);
const scripts: Record<string, string> = { test: 'scripts/test.sh', tenancy: 'scripts/run-tenancy.sh' };
if (!scripts[gate]) throw new Error('Expected gate test or tenancy');
const child = spawn(bash, [scripts[gate], ...args], { cwd: resolve(import.meta.dir, '..'), stdio: 'inherit', env: { ...process.env, TEST_RUN_ID: randomUUID() } });
child.on('error', error => { console.error(error); process.exit(1); });
child.on('exit', code => process.exit(code ?? 1));
