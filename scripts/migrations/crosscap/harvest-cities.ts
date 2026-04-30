/**
 * Harvest Justia family-law attorneys at the *city* level for the largest
 * legal markets. Each city page is a distinct page-1 listing — Cloudflare
 * lets us through fresh page-1 fetches even though it blocks page 2+.
 *
 * Idempotent: harvest-attorneys.ts matches by JUSTIA_ID.
 *
 *   npx tsx scripts/migrations/crosscap/harvest-cities.ts
 */
import { spawn } from 'child_process';
import * as path from 'path';

interface StateCities { state: string; cities: string[] }

// Top family-law markets by metro size + Crossover Capital reach.
// Cities are kebab-cased to match Justia's URL slug convention.
const TARGETS: StateCities[] = [
  { state: 'california',     cities: ['los-angeles','san-francisco','san-diego','san-jose','sacramento','oakland','beverly-hills','irvine','long-beach','santa-monica'] },
  { state: 'texas',          cities: ['houston','dallas','austin','san-antonio','fort-worth','plano','el-paso','arlington'] },
  { state: 'new-york',       cities: ['new-york-city','manhattan','brooklyn','queens','buffalo','rochester','syracuse','white-plains','albany'] },
  { state: 'florida',        cities: ['miami','orlando','tampa','jacksonville','fort-lauderdale','west-palm-beach','st-petersburg','naples','sarasota'] },
  { state: 'illinois',       cities: ['chicago','naperville','rockford','peoria','springfield','schaumburg','wheaton','arlington-heights'] },
  { state: 'pennsylvania',   cities: ['philadelphia','pittsburgh','harrisburg','allentown','reading','erie','lancaster','scranton','king-of-prussia'] },
  { state: 'ohio',           cities: ['columbus','cleveland','cincinnati','toledo','akron','dayton'] },
  { state: 'georgia',        cities: ['atlanta','savannah','augusta','marietta','alpharetta','athens'] },
  { state: 'north-carolina', cities: ['charlotte','raleigh','greensboro','durham','winston-salem','fayetteville','asheville'] },
  { state: 'michigan',       cities: ['detroit','grand-rapids','ann-arbor','lansing','warren','sterling-heights','troy','bloomfield-hills'] },
  { state: 'new-jersey',     cities: ['newark','jersey-city','paterson','elizabeth','edison','toms-river','morristown','princeton','hackensack'] },
  { state: 'virginia',       cities: ['arlington','virginia-beach','richmond','norfolk','alexandria','fairfax','reston','tysons-corner'] },
  { state: 'washington',     cities: ['seattle','spokane','tacoma','bellevue','kirkland','redmond'] },
  { state: 'massachusetts',  cities: ['boston','cambridge','worcester','springfield','newton','quincy','framingham'] },
  { state: 'arizona',        cities: ['phoenix','tucson','scottsdale','mesa','chandler','glendale','tempe'] },
  { state: 'colorado',       cities: ['denver','colorado-springs','aurora','boulder','fort-collins','lakewood'] },
  { state: 'minnesota',      cities: ['minneapolis','saint-paul','rochester','duluth','bloomington','plymouth','edina'] },
  { state: 'maryland',       cities: ['baltimore','rockville','bethesda','columbia','silver-spring','annapolis','frederick'] },
  { state: 'tennessee',      cities: ['nashville','memphis','knoxville','chattanooga','franklin'] },
  { state: 'missouri',       cities: ['kansas-city','st-louis','springfield','columbia','independence'] },
  { state: 'wisconsin',      cities: ['milwaukee','madison','green-bay','kenosha','waukesha'] },
  { state: 'nevada',         cities: ['las-vegas','henderson','reno','sparks'] },
  { state: 'oregon',         cities: ['portland','salem','eugene','hillsboro','beaverton'] },
  { state: 'connecticut',    cities: ['hartford','new-haven','stamford','bridgeport','greenwich','norwalk','danbury'] },
  { state: 'utah',           cities: ['salt-lake-city','provo','sandy','ogden','park-city'] },
];

function runCity(state: string, city: string): Promise<{ code: number }> {
  return new Promise((resolve) => {
    const slug = `${state}/${city}`;
    const child = spawn('npx', ['tsx', 'scripts/migrations/crosscap/harvest-attorneys.ts', slug, '1'], {
      cwd: path.resolve(__dirname, '../../..'),
      env: process.env,
    });
    child.stdout.on('data', d => process.stdout.write(d));
    child.stderr.on('data', d => process.stderr.write(d));
    child.on('exit', code => resolve({ code: code ?? -1 }));
  });
}

async function main() {
  let total = 0;
  for (const t of TARGETS) total += t.cities.length;
  console.log(`Harvesting ${total} city pages across ${TARGETS.length} states.\n`);

  let i = 0, ok = 0, failed = 0;
  for (const t of TARGETS) {
    for (const c of t.cities) {
      i += 1;
      console.log(`\n=== [${i}/${total}] ${t.state}/${c} ===`);
      const t0 = Date.now();
      const r = await runCity(t.state, c);
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      if (r.code === 0) ok += 1; else failed += 1;
      console.log(`=== ${t.state}/${c} done in ${dt}s, exit=${r.code} ===\n`);
      await new Promise(r => setTimeout(r, 3000 + Math.random() * 3000));
    }
  }
  console.log(`\nALL DONE — ok=${ok}, failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
