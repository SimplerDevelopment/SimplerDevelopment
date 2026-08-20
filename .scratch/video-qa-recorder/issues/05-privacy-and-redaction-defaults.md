# Privacy and redaction defaults

Type: grilling
Status: resolved

## Question

This tool records real sessions against real apps and writes the result to disk
as plain files, then hands those files to an AI coding agent. Everything below
is a default that ships to strangers, so it needs deciding rather than
discovering:

- **Typed input.** Do keystrokes get captured at all? Skreno records that keys
  were typed but not the characters. Passwords, API keys and customer PII all go
  through `<input>`. What is the default, and how is a password field detected
  beyond `type="password"`?
- **Request/response bodies.** These routinely carry bearer tokens, cookies,
  session ids and customer records. Are `Authorization`/`Cookie`/`Set-Cookie`
  headers stripped by default? Are bodies captured for successful requests at
  all, or only failures?
- **The video.** It shows whatever was on screen, including other tabs' content
  reflected in the page, and any secrets rendered in the UI.
- **Is there an allowlist?** Does recording only work on origins the user
  explicitly enables, or on any tab?
- **Does redaction happen at capture time or review time?** Capturing then
  redacting means the raw secret existed on disk; redacting at capture means
  irreversibly losing data you may have needed.
- What does the README have to say out loud so a user does not hand a session
  full of production tokens to a third-party model?

## Answer

**Redact in memory before serialization, preserving shape. Typed values off by
default. No allowlist, no persistent content script. The session folder reports
on its own redaction.**

---

### 0. Threat model — who this is defending against

**Not an attacker. The user's own next action.** The artifact leaves the machine
by their own hand: pasted into a coding agent, attached to a GitHub issue,
dropped into Slack. Nothing here is defending a boundary; it is shaping what a
folder contains at the moment someone decides to share it.

So the goal is: **the default artifact is safe to hand over without thinking,
and the unsafe version requires an explicit act.**

### 1. Capture-time vs review-time is a false choice

The question as posed conflates two different things — *when redaction runs*
and *whether the raw value ever persists*. The answer is neither option as
stated: **redact in memory, before serialization. The raw never reaches disk.**

The stated cost of capture-time redaction ("irreversibly losing data you may
have needed") mostly evaporates under **shape-preserving redaction**. Do not
drop the field; replace the value with a typed placeholder:

```jsonc
"authorization": "[redacted: Bearer ***]",
"apiKey":        "[redacted: 32-char hex]",
"email":         "[redacted: email]",
"password":      "[redacted: 14 chars]"
```

An agent debugging the session still sees that the field existed, was
populated, and was well-formed — which is nearly all of the debugging value.
What it loses is the only part that was dangerous.

### 2. Typed input — off by default, shape preserved, one toggle

Every `change` event (ticket 06) records field identity plus a descriptor —
`"[12 chars, email-shaped]"` — and never the characters. A **per-session
toggle** captures real values when they are wanted.

**Why this side of the heuristic:** the harm is asymmetric and the failure is
silent. A detector that misses one field writes a real credential to disk and
then into a model's context, with no undo once the folder is shared. The
failure mode of the safe default is a less useful artifact, which is repairable
by re-recording with the toggle on.

**Sensitive-field detection** (used to force redaction even when the toggle is
ON — the toggle relaxes the default, it does not disable detection):

1. `type="password"`.
2. **`autocomplete` tokens** — the best signal available, because it is
   standardised: `current-password`, `new-password`, `one-time-code`,
   `cc-number`, `cc-csc`, `cc-exp`. Check this before anything heuristic.
3. `name` / `id` / `aria-label` matching
   `/pass|pwd|secret|token|api[-_]?key|cvv|ssn|card|auth/i`.
4. **Value-shape scanning** regardless of field metadata: JWT (`eyJ…`), long
   high-entropy hex/base64, Luhn-valid card numbers.

Layer 4 is the one that matters, because it is the only layer that catches a
secret pasted into a field nobody labelled.

### 3. Headers and URLs

**Headers** — value redacted, name and length kept: `Authorization`, `Cookie`,
`Set-Cookie`, `Proxy-Authorization`, plus any header matching
`/auth|token|key|secret|session/i`.

**URLs get the same treatment, and this is the part people forget.** Query
parameters matching `/token|key|secret|password|signature/i`, plus
`access_token`, `api_key`, and OAuth `code` / `state`. URLs are a first-class
leak vector and they appear in *navigation events, every network metadata row,
and `Referer`* — three places, so redaction belongs in one shared URL
normaliser that all three call, not at each site.

### 4. Bodies

Ticket 06 already narrowed the surface to 4xx/5xx response bodies and
`postData` on failed requests. Within that surface:

- **JSON-key-aware redaction** — keys matching the sensitive pattern set get
  placeholder values, recursively.
- **Raw-text entropy scanning** over the whole body regardless of content type,
  so secrets in form-encoded, XML, or plain-text bodies are caught too.

The second exists because key-matching only finds secrets in shapes we
anticipated.

**The rejected same-origin-2xx body capture from ticket 06 stays rejected.** A
successful authenticated API response is the single worst thing to hand to a
third-party model, and this ticket is the reason.

### 5. Video and frames — no automatic redaction

There is no viable alternative, and pretending otherwise would be worse than
saying so:

- Password fields already render as dots, so the obvious target is already safe.
- An API key displayed in a settings page, or a customer record on screen, is
  unfindable heuristically.
- Blurring live via injected CSS would alter the page under test — a confound in
  a tool whose job is fidelity.

**Mitigations, such as they are:** `tabCapture` records only the tab (no other
tabs, no OS notifications, no other windows); video is a per-session toggle
(ticket 08) so it can be turned off for a screen showing secrets; and the
README says this in plain language.

Note frames inherit this exactly — a frame is as unredactable as the webm it
was extracted from.

### 6. No origin allowlist

Recording requires deliberately pressing record on a specific tab. An allowlist
would add friction on every new origin to prevent a mistake the UI already makes
hard, and friction on a safety mechanism is how safety mechanisms get disabled.
Paired with ticket 06's reframing of the `chrome.debugger` infobar as *the
recording indicator*, it is never ambiguous that recording is happening.

### 7. No persistent content script, no `<all_urls>`

Inject programmatically at record time via `activeTab` rather than declaring a
content script on every page the user ever visits. Better privacy posture,
materially less Web Store review friction, and nothing runs when not recording.

**Caveat, stated honestly:** ticket 06 wanted `document_start` injection to win
listener-registration order against the page's own capture-phase handlers.
Programmatic injection cannot give that for the *already-loaded first page*. So
also call `chrome.scripting.registerContentScripts` with `runAt:
"document_start"` for the remainder of the session, and unregister on stop.
The first page loses only against a page that registers a capture-phase
listener on `window` *and* stops propagation — rare, and it costs clicks, not
the session.

### 8. The artifact reports on its own redaction

The session folder is written directly on stop — no export gate — and carries a
**redaction summary**: counts by category, which headers and query params were
stripped, and warnings such as *"3 captured values matched high-entropy
patterns."*

No new UI to build, the artifact describes its own risk, and it is greppable
before handoff. A real pre-export review screen stays available as fog
(*post-session review*) rather than blocking ticket 09 on design work that has
not started.

*`ponytail:` a summary you have to remember to read is weaker than a gate that
stops you. Accepted deliberately — upgrade path is the review screen.*

### 9. What the README must say, near the top

Not in a footnote. Four things, plainly:

1. **A session may contain secrets even with redaction on.** Redaction is
   best-effort heuristics, not a guarantee.
2. **Handing a session folder to a hosted model uploads everything in it** —
   including the video, which cannot be redacted.
3. **Do not record production with real customer data.**
4. **Video and frames capture whatever was on screen in that tab.**

---

### Consequences for other tickets

- **09 (artifact contract)** — **now unblocked.** Inherits: shape-preserving
  placeholder syntax, the redaction-summary section, and the `change`-event
  value descriptor shape.
- **06** — the sensitive-field detector attaches to its `change` event; its
  rejected same-origin-2xx body capture is now rejected on privacy grounds too,
  not just scope.
- **08** — video/frames confirmed as the unredactable surface; the per-session
  video toggle acquires a second reason to exist.
- **12 (install and distribution)** — no `<all_urls>` content script materially
  eases Web Store review, which already flags `debugger` for manual inspection.
  The README requirements above are release-blocking, not nice-to-have.
- **Fog: post-session review** — sharpened into a specific upgrade path (a
  pre-export gate that would replace the summary), with a concrete reason to
  build it.
