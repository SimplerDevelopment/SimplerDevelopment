/**
 * Flag CRM companies as Slate-enabled.
 *
 * 1. Ensures the "Slate Enabled" boolean custom field exists on companies for
 *    the target client (default: 100 = Post Captain Consulting).
 * 2. Fuzzy-matches each name in SLATE_SCHOOLS against existing crmCompanies.
 * 3. Sets the custom field value to "true" on every matched company.
 *
 * Prints matched / ambiguous / unmatched so a human can reconcile the rest.
 *
 * Flags:
 *   --dry-run       Preview matches without writing
 *   --client-id N   Override clientId (default 100)
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const args = process.argv.slice(2);
function argVal(name: string, def?: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return def;
  return args[idx + 1];
}
const DRY_RUN = args.includes('--dry-run');
const CLIENT_ID = parseInt(argVal('--client-id', '100') ?? '100', 10);

// ── The list the user provided ─────────────────────────────────────────────
const SLATE_SCHOOLS: string[] = [
  "Abilene Christian University Undergraduate Admissions",
  "Acadia University - Undergraduate and Graduate Admissions",
  "Adelphi University - Undergraduate and Graduate Admissions",
  "Albion College", "Albright College", "Allegheny College", "Alvernia University",
  "American International College", "American University of Beirut",
  "Amherst College - Undergraduate Admissions",
  "Appalachian State University Undergraduate Admissions",
  "Aquinas College", "Arkansas State University", "Arkansas Tech University",
  "Asbury University", "Auburn University", "Augsburg University",
  "Augustana College", "Augustana University", "Aurora University", "Austin College",
  "Ave Maria University", "Azusa Pacific University", "Babson College",
  "Ball State University", "Bard College", "Bard College - Student Success",
  "Bard College at Simon's Rock", "Barnard College", "Bates College",
  "Baylor University - Undergraduate Admissions", "Bellarmine University",
  "Bellin College", "Belmont University", "Beloit College", "Benedictine College",
  "Bennington College", "Bentley University Undergraduate Admissions",
  "Bethany College - Kansas", "Bethany Lutheran College",
  "Binghamton University Undergraduate Admissions", "Boise State University",
  "Boston College - Undergraduate Admissions", "Bowdoin College",
  "Bowling Green State University - Undergraduate Admissions", "Bradley University",
  "Brandeis University - Undergraduate Admissions", "Bristol Community College",
  "Brown University Undergraduate Admissions",
  "Bryant University Undergraduate Admissions", "Bryn Mawr College",
  "Bucknell University", "Butler University Undergraduate Admission",
  "California Institute of Technology", "California Lutheran University",
  "Calvin University", "Canisius University", "Capital University",
  "Carleton College", "Carlow University",
  "Carnegie Mellon University Undergraduate Admissions",
  "Case Western Reserve University - Undergraduate Admissions", "Casper College",
  "Catawba College", "Cedarville University", "Centenary College of Louisiana",
  "Central Washington University Undergraduate Admissions", "Centre College",
  "Chaminade University of Honolulu", "Chapman University",
  "Charleston Southern University", "Chatham University",
  "Chattanooga State Community College", "Chestnut Hill College",
  "Chicago State University",
  "Christopher Newport University - Undergraduate Admissions",
  "Claremont McKenna College", "Clark State College", "Clark University",
  "Clarke University", "Clarkson University Undergraduate Admissions",
  "Clemson University - Undergraduate Admissions", "Cleveland Institute of Art",
  "Cleveland State University", "Coastal Carolina University", "Coe College",
  "Colby College", "Colgate University",
  "College of Saint Benedict / Saint John's University", "College of the Atlantic",
  "College of the Holy Cross",
  "College of William and Mary - Undergraduate Admissions",
  "Colorado College - Undergraduate Admissions", "Colorado Mesa University",
  "Colorado School of Mines - Undergraduate Admissions",
  "Colorado State University - Pueblo",
  "Colorado State University - Undergraduate Admissions",
  "Columbia College (South Carolina)", "Columbia College Chicago",
  "Columbia School of General Studies", "Columbia University Undergraduate Admissions",
  "Commonwealth University", "Community College of Philadelphia",
  "Community College of Vermont", "Concordia University, St. Paul",
  "Connecticut College", "Converse University", "Coppin State University",
  "Cornell College Undergraduate Admissions", "Cornell University",
  "Creighton University", "Cumberland University", "Curtis Institute of Music",
  "Dalton State College - Undergraduate Admissions", "Dartmouth College",
  "Davidson College", "Davidson-Davie Community College", "Dean College",
  "Denison University", "DePaul University Undergraduate Admission",
  "DePauw University", "Dickinson College", "Dordt University", "Drake University",
  "Drew University", "Drexel University",
  "Duke University Undergraduate Admissions", "Duquesne University",
  "Earlham College", "East Central University", "East Georgia State College",
  "East Texas Baptist University Undergraduate Admissions",
  "Eastern Arizona College", "Eastern Connecticut State University",
  "Eastern Kentucky University", "Eastern Michigan University",
  "Eastern Oregon University",
  "Eastern Washington University - Undergraduate and Graduate Admissions",
  "Eastman School of Music", "Eckerd College", "Edgewood College", "Elmira College",
  "Elon University Undergraduate Admissions", "Emerson College", "Emmanuel College",
  "Emory University Undergraduate Admission", "Endicott College",
  "Fairfield University Undergraduate Admissions", "Felician University",
  "Fisher College", "Fitchburg State University", "Florida Atlantic University",
  "Florida Institute of Technology", "Florida Southern College",
  "Florida State University - Undergraduate Admissions",
  "Fordham University Fordham College - Undergraduate Admission",
  "Fort Lewis College", "Franciscan Missionaries of Our Lady University",
  "Franklin & Marshall College", "Franklin University Switzerland",
  "Frederick Community College", "Furman University", "George Fox University",
  "Georgetown University - School of Foreign Service in Qatar",
  "Georgetown University - Undergraduate Admissions",
  "Georgia College & State University - Undergraduate Admissions",
  "Georgia Institute of Technology - Undergraduate Admissions",
  "Georgia Southern University Undergraduate Admissions",
  "Georgia State University Undergraduate Admissions", "Georgian Court University",
  "Gettysburg College", "Gonzaga University", "Gordon College",
  "Goucher College Undergraduate Admissions", "Governors State University",
  "Grace College", "Greensboro College", "Grinnell College", "Guilford College",
  "Hamilton College", "Hampden-Sydney College", "Hampshire College",
  "Hardin-Simmons University", "Harrisburg University of Science and Technology",
  "Hartwick College", "Harvard College", "Harvey Mudd College", "Haverford College",
  "Hendrix College", "High Point University", "Hilbert College",
  "Hillsdale College", "Hofstra University", "Hope College", "Houghton University",
  "Houston Christian University", "Howard University", "Hutchinson Community College",
  "Illinois Central College", "Illinois College", "Illinois State University",
  "Illinois Wesleyan University", "Indiana State University",
  "Indiana University Indianapolis - Undergraduate Admissions",
  "Indiana University of Pennsylvania",
  "Iona University - Undergraduate Admissions", "Ithaca College",
  "John Brown University",
  "John Carroll University Undergraduate Admissions",
  "Johns Hopkins University Undergraduate Admissions",
  "Johnson & Wales University", "Juniata College", "Kalamazoo College",
  "Kansas State University Undergraduate Admissions", "Kent State University",
  "Kentucky Wesleyan College", "Kenyon College", "Kettering University",
  "Keuka College", "Knox College", "Kutztown University of Pennsylvania",
  "La Sierra University", "Lamar University", "Lawrence Technological University",
  "Lawrence University", "Lenoir-Rhyne University", "Lewis & Clark College",
  "Lewis University Undergraduate Admissions", "Life Pacific University",
  "Lipscomb University Undergraduate Admissions", "Loras College",
  "Louisiana State University Undergraduate Admissions", "Louisiana Tech University",
  "Lourdes University",
  "Loyola Marymount University Undergraduate Admissions",
  "Loyola University Chicago Undergraduate Admissions",
  "Loyola University Maryland Undergraduate Admissions",
  "Loyola University New Orleans Undergraduate Admissions",
  "Lycoming College", "Lynn University", "Macalester College", "Madonna University",
  "Maine College of Art & Design", "Maine Maritime Academy",
  "Manhattanville College",
  "Marquette University Undergraduate Admissions", "Maryland Institute College of Art",
  "Marymount University Undergraduate Admissions", "Marywood University",
  "Massachusetts College of Art and Design", "McLennan Community College",
  "McMurry University", "Mercer University", "Mercyhurst University",
  "Meredith College", "Merrimack College Undergraduate Admissions",
  "Messiah University",
  "Miami University of Ohio - Undergraduate Admissions", "Michigan State University",
  "MidAmerica Nazarene University", "Middle Tennessee State University",
  "Middlebury College", "Midland University (Nebraska)",
  "Millersville University Undergraduate Admissions", "Millsaps College",
  "Mississippi State University", "Missouri State University",
  "Missouri University of Science and Technology",
  "Missouri Western State University", "Molloy University", "Monmouth College",
  "Monmouth University", "Monroe University",
  "Montclair State University Undergraduate Admissions",
  "Moore College of Art & Design", "Morehouse College", "Mount Aloysius College",
  "Mount Holyoke College - Undergraduate Admissions", "Mount Marty University",
  "Mount Mercy University", "Mount Saint Mary's University, Los Angeles",
  "Mount St. Joseph University", "Mount St. Mary's University (Maryland)",
  "Mount Vernon Nazarene University", "Muhlenberg College", "Muskingum University",
  "Nashville State Community College", "NC State Undergraduate Admissions",
  "Nebraska Wesleyan University", "Nelson University", "Neumann University",
  "New College of Florida", "New England Institute of Technology",
  "New Jersey Institute of Technology", "New Mexico Highlands University",
  "New York Conservatory for Dramatic Arts", "New York Institute of Technology",
  "Newberry College", "Newman University", "Niagara University",
  "North Carolina Agricultural and Technical State University - Undergraduate Admissions",
  "North Hennepin Community College", "Northeast State Community College",
  "Northeastern Illinois University", "Northwest Nazarene University",
  "Northwestern University Undergraduate Admissions",
  "NYU New York University - Undergraduate Admissions", "Oakland City University",
  "Oakwood University", "Oberlin College", "Occidental College",
  "Oglethorpe University", "Ohio Wesleyan University", "Oklahoma Baptist University",
  "Oklahoma Christian University", "Oklahoma City University",
  "Oklahoma State University - Undergraduate Admissions",
  "Oklahoma State University Institute of Technology",
  "Oregon Institute of Technology - Undergraduate and Graduate Admissions",
  "Oregon State University", "Otis College of Art and Design",
  "Ouachita Baptist University", "Pace University Undergraduate Admissions",
  "Pacific Lutheran University", "Palm Beach Atlantic University",
  "Pennsylvania College of Art & Design", "Pennsylvania Western University",
  "Pepperdine University - Seaver College", "Pitzer College", "Pomona College",
  "Portland State University - Undergraduate Admissions",
  "Prairie View A&M University", "Presbyterian College",
  "Prescott College - Undergraduate & Graduate Admissions",
  "Providence College Undergraduate Admissions", "Purdue University Fort Wayne",
  "Purdue University Northwest", "Purdue University Undergraduate Admissions",
  "Queens University of Charlotte Undergraduate Admissions",
  "Quinnipiac University Undergraduate Admissions", "Radford University",
  "Randolph College", "Randolph-Macon College", "Rhode Island College",
  "Rhode Island School of Design", "Rhodes College - Undergraduate Admissions",
  "Rice University Undergraduate Admissions", "Rider University", "Roanoke College",
  "Rochester Institute of Technology", "Rockhurst University",
  "Roger Williams University - Undergraduate Admissions", "Rollins College",
  "Roosevelt University", "Rose-Hulman Institute of Technology",
  "RPI Rensselaer Polytechnic Institute - Undergraduate Admissions",
  "Saginaw Valley State University", "Saint Anselm College",
  "Saint Joseph's University (Philadelphia)",
  "Saint Louis University Undergraduate Admissions", "Saint Martin's University",
  "Saint Mary's College", "Saint Xavier University", "Salisbury University",
  "Salve Regina University", "Samford University - Undergraduate Admissions",
  "Santa Clara University Undergraduate Admission", "Sarah Lawrence College",
  "Savannah State University", "Seattle Pacific University",
  "Seattle University Undergraduate Admissions", "Sewanee - The University of the South",
  "Shawnee State University", "Shippensburg University of Pennsylvania",
  "Simmons University", "Skidmore College", "Slippery Rock University",
  "Smith College - Undergraduate Admissions", "Soka University of America",
  "South Carolina State University", "Southeastern Louisiana University",
  "Southern Adventist University Undergraduate Admissions",
  "Southern Connecticut State University - Undergraduate & Graduate Admissions",
  "Southern Illinois University Carbondale",
  "Southern Methodist University Undergraduate Admissions",
  "Southern University A & M College", "Southern Utah University",
  "Southwestern University", "St. Bonaventure University", "St. Edward's University",
  "St. John Fisher University", "St. John's College",
  "St. John's University Undergraduate Admissions", "St. Lawrence University",
  "St. Mary's College of Maryland", "St. Mary's University", "St. Olaf College",
  "State Fair Community College", "Stetson University",
  "Stevenson University Undergraduate Admissions",
  "Suffolk University Undergraduate Admissions",
  "SUNY Alfred State College of Technology", "SUNY Brockport", "SUNY Buffalo State",
  "SUNY Cortland Undergraduate Admissions", "SUNY Dutchess Community College",
  "SUNY Farmingdale State College", "SUNY Geneseo", "SUNY Maritime College",
  "SUNY Old Westbury", "SUNY Oswego", "SUNY Purchase College",
  "SUNY Stony Brook University", "SUNY University at Albany",
  "Susquehanna University", "Swarthmore College",
  "Syracuse University Undergraduate Admissions", "Temple University",
  "Temple University - Japan",
  "Tennessee State University - Undergraduate and Graduate Admissions",
  "Texas A&M University Kingsville - Undergraduate Admissions",
  "Texas Christian University", "Texas Lutheran University",
  "Texas Wesleyan University", "The College of Idaho", "The College of New Jersey",
  "The College of Wooster", "The Cooper Union",
  "The George Washington University - Undergraduate Admissions",
  "The University of Akron", "The University of Alabama - Online",
  "The University of Alabama - Undergraduate Admissions", "The University of Kansas",
  "The University of Memphis", "The University of Mississippi",
  "The University of Tampa Undergraduate Admissions",
  "The University of Texas at Arlington",
  "The University of Texas at Austin - Undergraduate Admissions",
  "The University of Tulsa - Undergraduate Admissions",
  "The University of Vermont - Undergraduate Admissions", "Thomas College",
  "Towson University - Undergraduate Admissions", "Transylvania University",
  "Trinity College", "Truman State University",
  "Tufts University Undergraduate Admissions",
  "Tulane University - Undergraduate Admissions", "Tulsa Community College",
  "UC University of California - Berkeley Undergraduate Admissions",
  "UC University of California - Irvine Undergraduate Admissions",
  "UC University of California - Riverside Undergraduate Admissions",
  "UC University of California - San Diego Undergraduate Admissions",
  "UCONN University of Connecticut - Undergraduate Admissions", "UNC Asheville",
  "UNC The University of North Carolina at Chapel Hill - Undergraduate Admissions",
  "Union College", "United States Military Academy at West Point",
  "University of Arizona - Undergraduate Admissions",
  "University of Arkansas - Fort Smith", "University of Arkansas at Little Rock",
  "University of Arkansas Undergraduate Admissions", "University of Central Arkansas",
  "University of Central Florida Undergraduate Admissions",
  "University of Central Missouri", "University of Central Oklahoma",
  "University of Chicago College Admissions",
  "University of Cincinnati - Undergraduate Admissions",
  "University of Colorado Boulder Undergraduate Admissions",
  "University of Colorado Colorado Springs - Undergraduate and Graduate Admissions",
  "University of Delaware Undergraduate Admissions",
  "University of Denver Undergraduate Admissions", "University of Evansville",
  "University of Findlay", "University of Florida Freshman Admissions",
  "University of Hartford",
  "University of Holy Cross - Undergraduate and Graduate Admissions",
  "University of Houston",
  "University of Illinois at Chicago Undergraduate Admissions",
  "University of Illinois at Springfield", "University of Indianapolis",
  "University of Kentucky - Undergraduate Admissions", "University of Louisville",
  "University of Lynchburg",
  "University of Massachusetts Amherst Undergraduate Admissions",
  "University of Massachusetts Boston", "University of Massachusetts Lowell",
  "University of Miami - Undergraduate Admissions", "University of Minnesota Duluth",
  "University of Minnesota Rochester", "University of Minnesota Undergraduate Admissions",
  "University of Missouri (Mizzou)", "University of Missouri - St. Louis",
  "University of Missouri-Kansas City",
  "University of Montana - Undergraduate Admissions", "University of Nevada - Reno",
  "University of New Haven - Undergraduate Admissions",
  "University of North Carolina at Charlotte Undergraduate",
  "University of North Carolina at Greensboro - Undergraduate",
  "University of North Florida", "University of Northern Colorado",
  "University of Northwestern-St. Paul",
  "University of Notre Dame Undergraduate Admissions",
  "University of Oklahoma Undergraduate Admissions",
  "University of Oregon Undergraduate Admissions",
  "University of Pennsylvania Undergraduate Admissions",
  "University of Portland - Undergraduate Admissions", "University of Puget Sound",
  "University of Redlands Undergraduate Admissions",
  "University of Rhode Island - Undergraduate Admissions",
  "University of Richmond Undergraduate Admissions",
  "University of Rochester Undergraduate Admissions", "University of Saint Joseph",
  "University of San Francisco Undergraduate Admissions", "University of South Alabama",
  "University of South Carolina", "University of South Carolina Aiken",
  "University of South Carolina Beaufort", "University of Southern California",
  "University of Southern Mississippi Undergraduate Admissions",
  "University of the Pacific", "University of Utah",
  "University of Virginia Undergraduate Admission",
  "University of Washington Bothell Undergraduate Admissions",
  "University of Washington Tacoma",
  "University of West Florida Undergraduate Admissions", "University of West Georgia",
  "University of Wisconsin-Milwaukee", "Ursinus College", "Ursuline College",
  "USNH Plymouth State University", "USNH University of New Hampshire",
  "UT University of Tennessee - Knoxville - Undergraduate Admissions",
  "UT University of Tennessee - Martin - Undergraduate Admissions",
  "Utah Tech University", "Valparaiso University",
  "Vanderbilt University - Undergraduate Admissions",
  "Vanguard University Undergraduate Admissions", "Vassar College",
  "Villanova University Undergraduate Admissions", "Vincennes University",
  "Volunteer State Community College", "Wabash College",
  "Wake Forest University Undergraduate Admissions", "Washburn University",
  "Washington & Jefferson College", "Washington and Lee University",
  "Washington State University",
  "Washington University in St. Louis Undergraduate Admissions",
  "Wayland Baptist University", "Wayne State University Undergraduate Admissions",
  "Webster University", "Wellesley College", "Wesleyan University",
  "West Chester University of Pennsylvania Undergraduate Admissions",
  "Western Carolina University Undergraduate Admissions", "Western Colorado University",
  "Western New England University",
  "Western Oregon University - Undergraduate Admissions",
  "Western Washington University", "Westminster College (Pennsylvania)",
  "Westminster University (Utah)", "Wheaton College (Massachusetts)",
  "Whitman College", "Whittier College", "Whitworth University", "Widener University",
  "Wilkes University Undergraduate Admissions",
  "Willamette University - Undergraduate Admissions", "William Peace University",
  "Williams College", "Winthrop University Undergraduate Admissions",
  "Wittenberg University", "Wofford College", "Wright State University",
  "Xavier University - Undergraduate Admission", "Yale College",
  "York College of Pennsylvania - Undergraduate Admissions",
];

// Non-college entries in the user's list that should be skipped entirely
const SKIP_NAMES = new Set([
  "Slate Admissions Model",
  "Slate Admissions Showcase",
  "Slate Launchpad",
  "Slate Showcase",
]);

// ── Normalization ──────────────────────────────────────────────────────────
const STOP_WORDS = new Set([
  'undergraduate', 'graduate', 'admissions', 'admission', 'freshman', 'admissions',
  'the', 'and', 'of', 'at', 'in', 'to', 'on', 'for', 'a', 'an',
  'college', 'school', 'institute', 'program', 'programs',
  // state/system prefixes commonly absent in CSV name form:
  'uc', 'ut', 'unc', 'rpi', 'uconn', 'usnh', 'nyu', 'nc',
]);

// Boilerplate suffixes/prefixes that appear in the user's list but never in
// the IPEDS CSV. Stripped first so that the remaining "canonical" name can
// be matched against the CSV.
const BOILERPLATE_RE = /\b(undergraduate\s+and\s+graduate\s+admissions?|graduate\s+and\s+undergraduate\s+admissions?|undergraduate\s+&\s+graduate\s+admissions?|graduate\s+&\s+undergraduate\s+admissions?|undergraduate\s+admissions?|graduate\s+admissions?|freshman\s+admissions?|college\s+admissions?|school\s+of\s+foreign\s+service\s+in\s+qatar|online)\b/gi;

// Prefix aliases present in user's list but not in CSV names
const PREFIX_ALIASES: [RegExp, string][] = [
  [/^the\s+/i, ''],
  [/^uc\s+/i, ''],
  [/^ut\s+/i, ''],
  [/^unc\s+/i, ''],
  [/^rpi\s+/i, ''],
  [/^uconn\s+/i, ''],
  [/^usnh\s+/i, ''],
  [/^nyu\s+new\s+york\s+university/i, 'new york university'],
  [/^nc\s+state\s+/i, 'north carolina state university '],
];

function stripBoilerplate(s: string): string {
  let r = s;
  for (const [re, sub] of PREFIX_ALIASES) r = r.replace(re, sub);
  r = r.replace(BOILERPLATE_RE, ' ');
  // strip parenthetical qualifiers like "(South Carolina)" at the end
  r = r.replace(/\s*\([^)]*\)\s*$/g, '');
  return r;
}

function normalize(s: string): string {
  return stripBoilerplate(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/&/g, ' and ')
    .replace(/\bst\b/g, 'saint') // St. <-> Saint
    .replace(/[.,'()\/\-:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(' ').filter(t => t && !STOP_WORDS.has(t));
}

function tokenSet(s: string): Set<string> {
  return new Set(tokens(s));
}

function isSubsetOf(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0) return false;
  for (const t of a) if (!b.has(t)) return false;
  return true;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

async function run() {
  const { db } = await import('../lib/db');
  const { crmCompanies, crmCustomFields, crmCustomFieldValues } =
    await import('../lib/db/schema');
  const { and, eq } = await import('drizzle-orm');

  console.log(`Target client: ${CLIENT_ID}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE WRITE'}`);
  console.log(`Input list: ${SLATE_SCHOOLS.length} names`);

  // 1. Ensure the custom field exists
  let [field] = await db.select().from(crmCustomFields)
    .where(and(
      eq(crmCustomFields.clientId, CLIENT_ID),
      eq(crmCustomFields.entityType, 'company'),
      eq(crmCustomFields.fieldName, 'Slate Enabled'),
    ))
    .limit(1);

  if (!field) {
    if (DRY_RUN) {
      console.log('[would create field] Slate Enabled (boolean)');
    } else {
      [field] = await db.insert(crmCustomFields).values({
        clientId: CLIENT_ID,
        entityType: 'company',
        fieldName: 'Slate Enabled',
        fieldType: 'boolean',
        options: null,
        required: false,
        sortOrder: 23,
      }).returning();
      console.log(`[created field] Slate Enabled (id=${field.id})`);
    }
  } else {
    console.log(`[field exists] Slate Enabled (id=${field.id})`);
  }

  // 2. Load all companies for this client
  const companies = await db.select({ id: crmCompanies.id, name: crmCompanies.name })
    .from(crmCompanies)
    .where(eq(crmCompanies.clientId, CLIENT_ID));
  console.log(`Loaded ${companies.length} companies from CRM.`);

  // Pre-compute normalized strings + token sets
  const companyPrepped = companies.map(c => ({
    id: c.id,
    name: c.name,
    norm: normalize(c.name),
    ts: tokenSet(c.name),
  }));

  // 3. Match
  const results: { target: string; matches: { id: number; name: string; score: number }[] }[] = [];
  for (const target of SLATE_SCHOOLS) {
    if (SKIP_NAMES.has(target)) continue;

    const nT = normalize(target);
    const tTokens = tokenSet(target);
    if (!nT && tTokens.size === 0) {
      results.push({ target, matches: [] });
      continue;
    }

    const scored = companyPrepped
      .map(c => {
        // Exact normalized match — highest priority
        if (nT && c.norm === nT) return { id: c.id, name: c.name, score: 1.0 };
        // Prefix match on normalized string (e.g. "columbia university" matches
        // "columbia university in the city of new york")
        if (nT && c.norm.startsWith(nT + ' ')) {
          const lenDiff = c.norm.length - nT.length;
          return { id: c.id, name: c.name, score: 0.95 - Math.min(0.1, lenDiff / c.norm.length * 0.2) };
        }
        if (nT && nT.startsWith(c.norm + ' ')) {
          const lenDiff = nT.length - c.norm.length;
          return { id: c.id, name: c.name, score: 0.93 - Math.min(0.1, lenDiff / nT.length * 0.2) };
        }
        // Substring match on normalized string
        if (nT && c.norm.length > 8 && c.norm.includes(nT)) {
          return { id: c.id, name: c.name, score: 0.85 };
        }
        if (nT && nT.length > 8 && nT.includes(c.norm)) {
          return { id: c.id, name: c.name, score: 0.83 };
        }
        // Token subset (weaker than string-level matches)
        if (tTokens.size > 0 && (isSubsetOf(tTokens, c.ts) || isSubsetOf(c.ts, tTokens))) {
          return { id: c.id, name: c.name, score: 0.78 + Math.min(tTokens.size, c.ts.size) * 0.001 };
        }
        // Jaccard similarity
        return { id: c.id, name: c.name, score: jaccard(tTokens, c.ts) };
      })
      .filter(m => m.score >= 0.65)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    results.push({ target, matches: scored });
  }

  // 4. Decide and apply
  const matchedIds = new Set<number>();
  const unmatched: string[] = [];
  const ambiguous: { target: string; options: { id: number; name: string; score: number }[] }[] = [];

  function mainCampusBonus(name: string): number {
    const n = name.toLowerCase();
    if (/\bmain campus\b/.test(n)) return 0.06;
    if (/\bundergraduate\b/.test(n)) return 0.02;
    return 0;
  }

  function pickBest(matches: { id: number; name: string; score: number }[]): typeof matches {
    // Apply main-campus bonus as a tiebreaker, then prefer shorter (less specific) names
    return [...matches].sort((a, b) => {
      const sa = a.score + mainCampusBonus(a.name);
      const sb = b.score + mainCampusBonus(b.name);
      if (Math.abs(sa - sb) > 0.001) return sb - sa;
      return a.name.length - b.name.length;
    });
  }

  for (const r of results) {
    if (r.matches.length === 0) {
      unmatched.push(r.target);
      continue;
    }
    const ranked = pickBest(r.matches);
    const top = ranked[0];
    const second = ranked[1];

    // Auto-pick perfect match regardless of runner-up
    if (top.score >= 1.0) {
      matchedIds.add(top.id);
      // If more than one CSV row has the exact same normalized name, flag all of them
      for (const m of ranked.slice(1)) {
        if (m.score >= 1.0 && normalize(m.name) === normalize(top.name)) matchedIds.add(m.id);
      }
      continue;
    }
    // Auto-pick when top is high-confidence and clearly better than runner-up (after tiebreakers)
    const topAdj = top.score + mainCampusBonus(top.name);
    const secondAdj = second ? second.score + mainCampusBonus(second.name) : 0;
    if (topAdj >= 0.9 && (!second || topAdj - secondAdj > 0.04)) {
      matchedIds.add(top.id);
      continue;
    }
    if (topAdj >= 0.8 && (!second || topAdj - secondAdj > 0.1)) {
      matchedIds.add(top.id);
      continue;
    }
    // Otherwise treat as ambiguous and don't auto-pick
    ambiguous.push({ target: r.target, options: ranked });
  }

  // 5. Write values
  if (field && !DRY_RUN && matchedIds.size > 0) {
    let wrote = 0;
    for (const companyId of matchedIds) {
      await db.insert(crmCustomFieldValues).values({
        customFieldId: field.id,
        entityId: companyId,
        entityType: 'company',
        value: 'true',
        updatedAt: new Date(),
      }).onConflictDoUpdate({
        target: [crmCustomFieldValues.customFieldId, crmCustomFieldValues.entityId, crmCustomFieldValues.entityType],
        set: { value: 'true', updatedAt: new Date() },
      });
      wrote++;
    }
    console.log(`Wrote Slate Enabled=true on ${wrote} companies.`);
  } else if (DRY_RUN) {
    console.log(`[would write] Slate Enabled=true on ${matchedIds.size} companies.`);
  }

  // 6. Report
  console.log('\n── Summary ──');
  console.log(`Auto-matched:  ${matchedIds.size}`);
  console.log(`Ambiguous:     ${ambiguous.length}`);
  console.log(`Unmatched:     ${unmatched.length}`);
  console.log(`Skipped:       ${SLATE_SCHOOLS.filter(s => SKIP_NAMES.has(s)).length}`);

  if (ambiguous.length > 0) {
    console.log('\n── Ambiguous (top candidates per target, none auto-picked) ──');
    for (const a of ambiguous.slice(0, 30)) {
      console.log(`  "${a.target}"`);
      for (const o of a.options) console.log(`    → [${o.id}] ${o.name} (${o.score.toFixed(2)})`);
    }
    if (ambiguous.length > 30) console.log(`  ... ${ambiguous.length - 30} more`);
  }
  if (unmatched.length > 0) {
    console.log('\n── Unmatched (no candidate above threshold) ──');
    for (const u of unmatched) console.log(`  "${u}"`);
  }

  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
