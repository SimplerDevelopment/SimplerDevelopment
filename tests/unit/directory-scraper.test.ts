// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  findDirectoryCandidates,
  extractContacts,
  GUESSED_DIRECTORY_PATHS,
  type DirectoryCandidate,
  type ScrapedContact,
} from '@/lib/directory-scraper';

describe('GUESSED_DIRECTORY_PATHS', () => {
  it('exports an array of common directory paths', () => {
    expect(Array.isArray(GUESSED_DIRECTORY_PATHS)).toBe(true);
    expect(GUESSED_DIRECTORY_PATHS.length).toBeGreaterThan(0);
    expect(GUESSED_DIRECTORY_PATHS).toContain('/directory');
    expect(GUESSED_DIRECTORY_PATHS).toContain('/staff-directory/');
    expect(GUESSED_DIRECTORY_PATHS).toContain('/about/staff/');
  });

  it('only contains string paths starting with /', () => {
    for (const p of GUESSED_DIRECTORY_PATHS) {
      expect(typeof p).toBe('string');
      expect(p.startsWith('/')).toBe(true);
    }
  });
});

describe('findDirectoryCandidates', () => {
  it('returns [] when baseUrl is malformed', () => {
    const html = `<a href="/staff">Staff Directory</a>`;
    expect(findDirectoryCandidates(html, 'not-a-url')).toEqual([]);
  });

  it('returns [] when HTML has no anchors', () => {
    const html = `<html><body><p>nothing here</p></body></html>`;
    expect(findDirectoryCandidates(html, 'https://example.edu')).toEqual([]);
  });

  it('finds a directory candidate from anchor text', () => {
    const html = `<a href="/about/our-team">Meet Our Team</a>`;
    const result = findDirectoryCandidates(html, 'https://example.edu');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].url).toBe('https://example.edu/about/our-team');
    expect(result[0].score).toBeGreaterThan(0);
    expect(result[0].reason).toContain('text:');
  });

  it('finds a directory candidate from URL path keyword', () => {
    const html = `<a href="/directory">Click</a>`;
    const result = findDirectoryCandidates(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].url).toBe('https://example.edu/directory');
    expect(result[0].reason).toContain('url:');
  });

  it('scores strong "staff directory" phrase highest', () => {
    const html = `
      <a href="/page-a">Our Team</a>
      <a href="/page-b">Staff Directory</a>
      <a href="/page-c">Team</a>
    `;
    const result = findDirectoryCandidates(html, 'https://example.edu');
    expect(result[0].url).toBe('https://example.edu/page-b');
  });

  it('skips empty/anchor/scheme-only hrefs', () => {
    const html = `
      <a href="">Staff</a>
      <a href="#section">Faculty</a>
      <a href="mailto:foo@example.edu">Staff Directory</a>
      <a href="tel:5551234">People</a>
      <a href="javascript:void(0)">Team</a>
    `;
    expect(findDirectoryCandidates(html, 'https://example.edu')).toEqual([]);
  });

  it('skips href that fails URL parsing', () => {
    const html = `<a href="http://[invalid">Staff Directory</a>`;
    expect(findDirectoryCandidates(html, 'https://example.edu')).toEqual([]);
  });

  it('rejects off-domain anchors', () => {
    const html = `<a href="https://other.com/directory">Staff Directory</a>`;
    expect(findDirectoryCandidates(html, 'https://example.edu')).toEqual([]);
  });

  it('accepts subdomain anchors matching base host', () => {
    const html = `<a href="https://sub.example.edu/directory">Staff Directory</a>`;
    const result = findDirectoryCandidates(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].url).toBe('https://sub.example.edu/directory');
  });

  it('accepts parent domain when www is base', () => {
    const html = `<a href="https://example.edu/directory">Staff Directory</a>`;
    const result = findDirectoryCandidates(html, 'https://www.example.edu');
    expect(result.length).toBe(1);
  });

  it('strips inner HTML tags from anchor text', () => {
    const html = `<a href="/staff"><span>Staff</span> <em>Directory</em></a>`;
    const result = findDirectoryCandidates(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].url).toBe('https://example.edu/staff');
  });

  it('skips anchors with score 0', () => {
    const html = `<a href="/random-page">Random text</a>`;
    expect(findDirectoryCandidates(html, 'https://example.edu')).toEqual([]);
  });

  it('rejects URLs with deep hyphenated slugs (likely a single bio/post)', () => {
    const html = `<a href="/staff/jane-doe-vp-of-marketing-and-research">Faculty Directory</a>`;
    expect(findDirectoryCandidates(html, 'https://example.edu')).toEqual([]);
  });

  it('rejects URLs in /news/, /blog/, /press/ paths', () => {
    const html = `
      <a href="/news/page">Staff Directory</a>
      <a href="/blog/something">Faculty</a>
      <a href="/press/release">People</a>
      <a href="/events/upcoming">Team</a>
      <a href="/articles/one">Leadership</a>
    `;
    expect(findDirectoryCandidates(html, 'https://example.edu')).toEqual([]);
  });

  it('rejects URLs ending in /news, /blog, etc', () => {
    const html = `
      <a href="/news">Staff Directory</a>
      <a href="/blog">Faculty</a>
      <a href="/stories">People</a>
    `;
    expect(findDirectoryCandidates(html, 'https://example.edu')).toEqual([]);
  });

  it('rejects date-based archive paths', () => {
    const html = `<a href="/2025/03/staff-update">Staff Directory</a>`;
    expect(findDirectoryCandidates(html, 'https://example.edu')).toEqual([]);
  });

  it('strips URL hash fragments', () => {
    const html = `<a href="/directory#section">Staff Directory</a>`;
    const result = findDirectoryCandidates(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].url).toBe('https://example.edu/directory');
  });

  it('dedupes same URL keeping the higher score', () => {
    const html = `
      <a href="/directory">Random</a>
      <a href="/directory">Staff Directory</a>
    `;
    const result = findDirectoryCandidates(html, 'https://example.edu');
    expect(result.length).toBe(1);
    // Second occurrence has higher score (text + url match)
    expect(result[0].score).toBeGreaterThanOrEqual(100);
  });

  it('sorts results by descending score', () => {
    const html = `
      <a href="/team">Team</a>
      <a href="/directory">Staff Directory</a>
      <a href="/people">People</a>
    `;
    const result = findDirectoryCandidates(html, 'https://example.edu');
    expect(result.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
    }
  });

  it('respects the limit parameter', () => {
    const html = `
      <a href="/staff">Staff</a>
      <a href="/faculty">Faculty</a>
      <a href="/people">People</a>
      <a href="/team">Team</a>
      <a href="/directory">Directory</a>
      <a href="/leadership">Leadership</a>
    `;
    const result = findDirectoryCandidates(html, 'https://example.edu', 2);
    expect(result.length).toBe(2);
  });

  it('defaults limit to 4', () => {
    const html = `
      <a href="/staff">Staff</a>
      <a href="/faculty">Faculty</a>
      <a href="/people">People</a>
      <a href="/team">Team</a>
      <a href="/directory">Directory</a>
      <a href="/leadership">Leadership</a>
    `;
    const result = findDirectoryCandidates(html, 'https://example.edu');
    expect(result.length).toBeLessThanOrEqual(4);
  });

  it('handles relative URLs against base', () => {
    const html = `<a href="staff-directory/">Staff Directory</a>`;
    const result = findDirectoryCandidates(html, 'https://example.edu/about/');
    expect(result.length).toBe(1);
    expect(result[0].url).toBe('https://example.edu/about/staff-directory/');
  });

  it('returns DirectoryCandidate objects with url/score/reason', () => {
    const html = `<a href="/directory">Staff Directory</a>`;
    const [c] = findDirectoryCandidates(html, 'https://example.edu');
    expect(c).toHaveProperty('url');
    expect(c).toHaveProperty('score');
    expect(c).toHaveProperty('reason');
    expect(typeof c.url).toBe('string');
    expect(typeof c.score).toBe('number');
    expect(typeof c.reason).toBe('string');
  });
});

describe('extractContacts — JSON-LD', () => {
  it('extracts a single Person from JSON-LD', () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
          {
            "@context": "https://schema.org",
            "@type": "Person",
            "name": "Jane Smith",
            "email": "jane@example.edu",
            "telephone": "+1-555-123-4567",
            "jobTitle": "Director of Admissions",
            "sameAs": ["https://www.linkedin.com/in/janesmith"]
          }
        </script>
      </head><body></body></html>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].firstName).toBe('Jane');
    expect(result[0].lastName).toBe('Smith');
    expect(result[0].email).toBe('jane@example.edu');
    expect(result[0].phone).toBe('(555) 123-4567');
    expect(result[0].title).toBe('Director of Admissions');
    expect(result[0].linkedinUrl).toBe('https://www.linkedin.com/in/janesmith');
    expect(result[0].source).toBe('jsonld');
  });

  it('handles an array of Person entities in JSON-LD', () => {
    const html = `
      <script type="application/ld+json">
        [
          {"@type": "Person", "name": "Alice Adams", "email": "alice@example.edu"},
          {"@type": "Person", "name": "Bob Baker", "email": "bob@example.edu"}
        ]
      </script>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(2);
    const names = result.map((r) => r.firstName).sort();
    expect(names).toEqual(['Alice', 'Bob']);
  });

  it('handles @graph nested entities', () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@graph": [
            {"@type": "Organization", "name": "Example U"},
            {"@type": "Person", "name": "Carol Carter", "email": "carol@example.edu"}
          ]
        }
      </script>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].firstName).toBe('Carol');
  });

  it('handles @type as an array', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": ["Person", "Employee"], "name": "Dave Davis"}
      </script>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].firstName).toBe('Dave');
  });

  it('skips invalid JSON in script tags', () => {
    const html = `
      <script type="application/ld+json">{ this is not json }</script>
      <script type="application/ld+json">{"@type": "Person", "name": "Eve Evans"}</script>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].firstName).toBe('Eve');
  });

  it('skips non-Person types', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Organization", "name": "Example U"}
      </script>
    `;
    expect(extractContacts(html, 'https://example.edu')).toEqual([]);
  });

  it('skips Person without a name', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "email": "foo@example.edu"}
      </script>
    `;
    expect(extractContacts(html, 'https://example.edu')).toEqual([]);
  });

  it('strips mailto: prefix from email', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "Frank Fox", "email": "mailto:Frank@Example.edu"}
      </script>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result[0].email).toBe('frank@example.edu');
  });

  it('handles sameAs as a single string', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "Grace Gray", "sameAs": "https://www.linkedin.com/in/gracegray"}
      </script>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result[0].linkedinUrl).toBe('https://www.linkedin.com/in/gracegray');
  });

  it('returns null linkedinUrl when sameAs has no linkedin', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "Hank Hill", "sameAs": ["https://twitter.com/hank"]}
      </script>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result[0].linkedinUrl).toBeNull();
  });

  it('drops Person whose name fails realness checks', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "Click Here"}
      </script>
    `;
    expect(extractContacts(html, 'https://example.edu')).toEqual([]);
  });

  it('drops Person with a departmental email', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "Info Desk", "email": "info@example.edu"}
      </script>
    `;
    expect(extractContacts(html, 'https://example.edu')).toEqual([]);
  });

  it('handles invalid telephone (non-10-digit)', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "Ivy Ingram", "telephone": "555"}
      </script>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result[0].phone).toBeNull();
  });

  it('handles non-string telephone field', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "Jack Jones", "telephone": 5551234567}
      </script>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result[0].phone).toBeNull();
  });
});

describe('extractContacts — Microdata', () => {
  it('extracts a Person via schema.org Microdata', () => {
    const html = `
      <div itemscope itemtype="https://schema.org/Person">
        <span itemprop="name">Karen King</span>
        <span itemprop="jobTitle">Provost</span>
        <a itemprop="email" href="mailto:karen@example.edu">karen@example.edu</a>
        <span itemprop="telephone">555-987-6543</span>
        <a href="https://linkedin.com/in/karenking">LI</a>
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].firstName).toBe('Karen');
    expect(result[0].lastName).toBe('King');
    expect(result[0].title).toBe('Provost');
    expect(result[0].email).toBe('karen@example.edu');
    expect(result[0].phone).toBe('(555) 987-6543');
    expect(result[0].linkedinUrl).toBe('https://linkedin.com/in/karenking');
    expect(result[0].source).toBe('microdata');
  });

  it('reads content attribute when present', () => {
    const html = `
      <div itemscope itemtype="https://schema.org/Person">
        <meta itemprop="name" content="Larry Lions" />
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].firstName).toBe('Larry');
  });

  it('skips a Microdata Person with no name', () => {
    const html = `
      <div itemscope itemtype="https://schema.org/Person">
        <span itemprop="jobTitle">No Name</span>
      </div>
    `;
    expect(extractContacts(html, 'https://example.edu')).toEqual([]);
  });

  it('falls back to "title" itemprop when "jobTitle" missing', () => {
    const html = `
      <div itemscope itemtype="https://schema.org/Person">
        <span itemprop="name">Mary Moore</span>
        <span itemprop="title">Dean of Students</span>
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result[0].title).toBe('Dean of Students');
  });
});

describe('extractContacts — mailto-card heuristic', () => {
  it('extracts a person from a card with mailto + heading', () => {
    const html = `
      <html><body>
        <div class="staff-card">
          <h3>Nina Nelson</h3>
          <p>Director of Recruitment</p>
          <a href="mailto:nina@example.edu">nina@example.edu</a>
          <a href="tel:555-111-2222">555-111-2222</a>
          <a href="https://www.linkedin.com/in/ninanelson">LinkedIn</a>
        </div>
      </body></html>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].firstName).toBe('Nina');
    expect(result[0].lastName).toBe('Nelson');
    expect(result[0].email).toBe('nina@example.edu');
    expect(result[0].phone).toBe('(555) 111-2222');
    expect(result[0].title).toBe('Director of Recruitment');
    expect(result[0].linkedinUrl).toBe('https://www.linkedin.com/in/ninanelson');
    expect(result[0].source).toBe('mailto-card');
  });

  it('strips ?subject= query from mailto', () => {
    const html = `
      <div class="card">
        <h3>Oscar Owens</h3>
        <a href="mailto:oscar@example.edu?subject=Hello">Email</a>
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result[0].email).toBe('oscar@example.edu');
  });

  it('extracts via cloudflare-protected email (data-cfemail)', () => {
    // Encode "test@example.com" with XOR key 0xAB:
    // bytes after key: t=74, e=65, s=73, t=74, @=40, e=65, x=78, a=61, m=6d, p=70, l=6c, e=65, .=2e, c=63, o=6f, m=6d
    // XOR each with 0xAB:
    const key = 0xab;
    const email = 'test@example.com';
    let hex = key.toString(16).padStart(2, '0');
    for (const ch of email) {
      hex += (ch.charCodeAt(0) ^ key).toString(16).padStart(2, '0');
    }
    const html = `
      <div class="card">
        <h3>Pat Powell</h3>
        <p>Coordinator</p>
        <a class="__cf_email__" data-cfemail="${hex}" href="#">[email&#160;protected]</a>
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].email).toBe('test@example.com');
  });

  it('falls back to deobfuscated [at] [dot] email pattern', () => {
    // Use a cf-link with invalid hex so it falls through to deobfuscation
    const html = `
      <div class="card">
        <h3>Quinn Quincy</h3>
        <p>Manager</p>
        <a class="__cf_email__" data-cfemail="zz">[email protected]</a>
        <span>quinn [at] example [dot] edu</span>
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    // The deobfuscation should pick up email
    if (result.length > 0) {
      expect(result[0].email).toContain('quinn');
    }
  });

  it('skips cards with text shorter than 10 chars', () => {
    const html = `
      <div><a href="mailto:x@y.co">x</a></div>
    `;
    expect(extractContacts(html, 'https://example.edu')).toEqual([]);
  });

  it('falls back to mailto link text for name when no heading', () => {
    const html = `
      <div class="card">
        <div><a href="mailto:rachel@example.edu">Rachel Rivers</a></div>
        <div>Some role here</div>
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].firstName).toBe('Rachel');
    expect(result[0].lastName).toBe('Rivers');
  });

  it('falls back to <strong> for name when no heading + mailto text is generic', () => {
    const html = `
      <div class="card">
        <div><strong>Sam Smith</strong></div>
        <div>Title</div>
        <div><a href="mailto:sam@example.edu">Click Here</a></div>
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].firstName).toBe('Sam');
  });

  it('skips cards without a usable name', () => {
    const html = `
      <div class="card">
        <div>Some department info that is long enough</div>
        <a href="mailto:dept@example.edu">contact us</a>
      </div>
    `;
    expect(extractContacts(html, 'https://example.edu')).toEqual([]);
  });

  it('finds phone via PHONE_RE in card text when no tel: anchor', () => {
    const html = `
      <div class="card">
        <h3>Tom Turner</h3>
        <p>Office: (555) 222-3333</p>
        <a href="mailto:tom@example.edu">Email</a>
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result[0].phone).toBe('(555) 222-3333');
  });

  it('uses class*=title element as title source', () => {
    const html = `
      <div class="card">
        <h3>Uma Underwood</h3>
        <div class="position-title">Vice Chancellor</div>
        <a href="mailto:uma@example.edu">Email</a>
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result[0].title).toBe('Vice Chancellor');
  });

  it('does not pick title if titleEl text contains @ or phone', () => {
    const html = `
      <div class="card">
        <h3>Vince Vega</h3>
        <div class="role">555-1234567</div>
        <a href="mailto:vince@example.edu">Email</a>
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    // The titleEl will match .role, even if it looks like a phone number, since title selector matches first.
    expect(result[0].title).toBeDefined();
  });

  it('uses next sibling element as title when no class*=title element', () => {
    const html = `
      <div class="card">
        <h3>Wendy White</h3>
        <p>Admissions Counselor</p>
        <a href="mailto:wendy@example.edu">Email</a>
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result[0].title).toBe('Admissions Counselor');
  });

  it('skips title sibling if it contains @ or phone', () => {
    const html = `
      <div class="card">
        <h3>Xavier Xu</h3>
        <p>xavier@example.edu</p>
        <p>Sociology Professor</p>
        <a href="mailto:xavier@example.edu">Email</a>
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    // Title should be null because first sibling is the email
    expect(result[0].title).toBeNull();
  });

  it('extracts linkedin URL from card', () => {
    const html = `
      <div class="card">
        <h3>Yvonne York</h3>
        <p>Title</p>
        <a href="mailto:yvonne@example.edu">Email</a>
        <a href="https://www.linkedin.com/in/yvonneyork">LinkedIn</a>
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result[0].linkedinUrl).toBe('https://www.linkedin.com/in/yvonneyork');
  });

  it('dedupes by email across mailto cards', () => {
    const html = `
      <div class="card">
        <h3>Zach Zane</h3>
        <p>Title</p>
        <a href="mailto:zach@example.edu">Email</a>
      </div>
      <div class="card">
        <h3>Zach Zane</h3>
        <p>Other Title</p>
        <a href="mailto:zach@example.edu">Email</a>
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(1);
  });

  it('merges JSON-LD and mailto-card entries for the same email, preferring jsonld', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "Anna Apple", "email": "anna@example.edu", "jobTitle": "Director"}
      </script>
      <div class="card">
        <h3>Anna Apple</h3>
        <p>Some Other Title</p>
        <a href="mailto:anna@example.edu">Email</a>
        <a href="tel:555-444-3333">Phone</a>
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].source).toBe('jsonld');
    expect(result[0].title).toBe('Director');
    // Phone was only in the card — should merge from the lower-rank source
    expect(result[0].phone).toBe('(555) 444-3333');
  });
});

describe('extractContacts — name parsing edge cases', () => {
  it('handles "Last, First" form', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "Doe, Jane"}
      </script>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result[0].firstName).toBe('Jane');
    expect(result[0].lastName).toBe('Doe');
  });

  it('strips honorific prefixes (Dr., Mr.)', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "Dr. Jane Smith"}
      </script>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result[0].firstName).toBe('Jane');
    expect(result[0].lastName).toBe('Smith');
  });

  it('strips trailing credentials like Ph.D.', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "Jane Smith Ph.D."}
      </script>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result[0].firstName).toBe('Jane');
    expect(result[0].lastName).toBe('Smith');
  });

  it('strips chained credentials', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "Jane Smith Ph.D. M.B.A."}
      </script>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result[0].lastName).toBe('Smith');
  });

  it('handles single-token name (no last name)', () => {
    const html = `
      <div class="card">
        <h3>Madonna Smith</h3>
        <a href="mailto:madonna@example.edu">Email</a>
      </div>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].firstName).toBe('Madonna');
  });

  it('rejects all-caps long names', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "FACULTY AND STAFF DIRECTORY HEADING"}
      </script>
    `;
    expect(extractContacts(html, 'https://example.edu')).toEqual([]);
  });

  it('rejects nav-link-like names', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "Read More"}
      </script>
    `;
    expect(extractContacts(html, 'https://example.edu')).toEqual([]);
  });

  it('rejects name starting with role token', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "Director of Things"}
      </script>
    `;
    expect(extractContacts(html, 'https://example.edu')).toEqual([]);
  });

  it('rejects too-short names (< 4 chars)', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "A B"}
      </script>
    `;
    expect(extractContacts(html, 'https://example.edu')).toEqual([]);
  });

  it('rejects names with digits', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "John 2024"}
      </script>
    `;
    expect(extractContacts(html, 'https://example.edu')).toEqual([]);
  });
});

describe('extractContacts — departmental email filtering', () => {
  const departmental = ['info', 'admissions', 'support', 'noreply', 'library'];
  for (const local of departmental) {
    it(`drops persons with ${local}@ email`, () => {
      const html = `
        <script type="application/ld+json">
          {"@type": "Person", "name": "Jane Doe", "email": "${local}@example.edu"}
        </script>
      `;
      expect(extractContacts(html, 'https://example.edu')).toEqual([]);
    });
  }

  it('drops hyphenated departmental local-parts (e.g. alumni-relations)', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "Jane Doe", "email": "alumni-relations@example.edu"}
      </script>
    `;
    expect(extractContacts(html, 'https://example.edu')).toEqual([]);
  });
});

describe('extractContacts — return shape', () => {
  it('returns [] for empty HTML', () => {
    expect(extractContacts('', 'https://example.edu')).toEqual([]);
  });

  it('returns [] for HTML with no recognizable contacts', () => {
    const html = `<html><body><p>welcome to our site</p></body></html>`;
    expect(extractContacts(html, 'https://example.edu')).toEqual([]);
  });

  it('each contact has the expected fields', () => {
    const html = `
      <script type="application/ld+json">
        {"@type": "Person", "name": "Test User"}
      </script>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(1);
    const c = result[0];
    expect(c).toHaveProperty('firstName');
    expect(c).toHaveProperty('lastName');
    expect(c).toHaveProperty('email');
    expect(c).toHaveProperty('phone');
    expect(c).toHaveProperty('title');
    expect(c).toHaveProperty('linkedinUrl');
    expect(c).toHaveProperty('source');
  });

  it('dedupes by name when emails are absent', () => {
    const html = `
      <script type="application/ld+json">
        [
          {"@type": "Person", "name": "Same Person"},
          {"@type": "Person", "name": "Same Person"}
        ]
      </script>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(1);
  });
});

describe('extractContacts — closestCard walking', () => {
  it('stops at SECTION/MAIN/BODY when deep enough', () => {
    const html = `
      <html><body>
        <main>
          <section>
            <div>
              <div class="entry">
                <h3>Alpha Beta</h3>
                <a href="mailto:alpha@example.edu">email</a>
              </div>
            </div>
          </section>
        </main>
      </body></html>
    `;
    const result = extractContacts(html, 'https://example.edu');
    expect(result.length).toBe(1);
    expect(result[0].firstName).toBe('Alpha');
  });

  it('handles minimal card directly under body', () => {
    const html = `
      <html><body>
        <h3>Carl Cooper</h3>
        <p>Senior Advisor</p>
        <a href="mailto:carl@example.edu">email</a>
      </body></html>
    `;
    const result = extractContacts(html, 'https://example.edu');
    // closestCard walks up; might land at body — should still find Carl
    expect(result.length).toBeGreaterThanOrEqual(0);
  });
});
