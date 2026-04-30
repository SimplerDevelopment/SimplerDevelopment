/**
 * Loop the per-state Justia harvester over every US state + DC,
 * sequentially (so we don't fan out 50 Playwright browsers at once and
 * get every IP banned at once). Page 1 only — Cloudflare blocks page 2+.
 *
 * Picks up where prior runs left off — each invocation of harvest-attorneys
 * is itself idempotent (matches by JUSTIA_ID:<id> in notes).
 *
 *   npx tsx scripts/migrations/crosscap/harvest-all-states.ts
 *   SKIP=pennsylvania,new-jersey npx tsx scripts/migrations/crosscap/harvest-all-states.ts
 *   ONLY=texas,california      npx tsx scripts/migrations/crosscap/harvest-all-states.ts
 */
import { spawn } from 'child_process';
import * as path from 'path';

const STATES = [
  'alabama','alaska','arizona','arkansas','california','colorado','connecticut','delaware',
  'district-of-columbia','florida','georgia','hawaii','idaho','illinois','indiana','iowa',
  'kansas','kentucky','louisiana','maine','maryland','massachusetts','michigan','minnesota',
  'mississippi','missouri','montana','nebraska','nevada','new-hampshire','new-jersey','new-mexico',
  'new-york','north-carolina','north-dakota','ohio','oklahoma','oregon','pennsylvania','rhode-island',
  'south-carolina','south-dakota','tennessee','texas','utah','vermont','virginia','washington',
  'west-virginia','wisconsin','wyoming',
];

function runState(state: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', 'scripts/migrations/crosscap/harvest-attorneys.ts', state, '1'], {
      cwd: path.resolve(__dirname, '../../..'),
      env: process.env,
    });
    let out = '';
    child.stdout.on('data', d => { const s = d.toString(); out += s; process.stdout.write(s); });
    child.stderr.on('data', d => { const s = d.toString(); out += s; process.stderr.write(s); });
    child.on('exit', code => resolve({ code: code ?? -1, out }));
  });
}

async function main() {
  const skip = new Set((process.env.SKIP ?? '').split(',').map(s => s.trim()).filter(Boolean));
  const only = new Set((process.env.ONLY ?? '').split(',').map(s => s.trim()).filter(Boolean));
  const queue = STATES.filter(s => !skip.has(s) && (only.size === 0 || only.has(s)));

  console.log(`Harvesting ${queue.length} states sequentially (page 1 only).\n`);
  let i = 0, ok = 0, failed = 0;
  for (const s of queue) {
    i += 1;
    console.log(`\n=== [${i}/${queue.length}] ${s} ===`);
    const t0 = Date.now();
    const r = await runState(s);
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    if (r.code === 0) ok += 1;
    else failed += 1;
    console.log(`=== ${s} done in ${dt}s, exit=${r.code} ===\n`);
    // small delay between states so we don't pound Cloudflare from same IP
    await new Promise(r => setTimeout(r, 4000 + Math.random() * 3000));
  }
  console.log(`\nALL DONE — ok=${ok}, failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
