---
type: playbook
domain: go-to-market
status: planned
date: 2026-06-25
tags:
  - marketing
  - linkedin
  - content
  - personal-brand
---

# LinkedIn Content Operating System — Dan Coyle (personal) + SimplerDevelopment (company page)

Related: [[OSS Launch Playbook]] · [[LinkedIn Posting Integration]] · [[Go-To-Market — Self-Serve SaaS]]

Derived from a live deep-research pass (2026 LinkedIn data; verified + adversarially refuted). **Evidence-backed parts are marked [E]; practitioner-convention parts (research did NOT verify) are marked [C] — treat [C] as sensible defaults, not facts.**

## Core architecture — one engine, one satellite
- **Dan's personal profile is THE engine** [E]: personal profiles vastly out-reach company pages (pages now ~1–2% of feed). Primary goal = hiring / career optionality.
- **SimplerDevelopment company page is a SATELLITE** [E]: weak organic reach; its main growth lever is **founder amplification** — Dan's personal posts carry it (employee/founder posts ≈2.75× impressions / ≈5× engagement vs page posts).
- **Batch-once / repurpose-many** is the spine: ONE artifact/week → a carousel + a talking-head video + 1–2 text posts, split across both properties. Fits a 2–3 hr/week budget.

## Format mix (evidence-backed ranking) [E]
Carousels (PDF "document" posts) = highest engagement → **native video** = 2nd (Dan's face = credibility) → text = connective tissue → **avoid links in the post body** (~3.5× fewer reactions; just omit or drop in a comment — do NOT rely on the "first-comment recovers reach" trick, refuted). Hashtags: 3–5 max, as SEO keywords only.
> Priority formats: **carousel + talking-head video.** Video's *reach* upside is uncertain (the "80% reach" stat is unreliable; one 2026 study shows video reach down ~36% YoY) — keep it for credibility/face-building, don't set goals on its reach.

## Content pillars

### Dan (personal) — teach-first, hiring-oriented
1. **Agentic engineering in practice** — show-your-work: real Claude Code workflows (skills, MCP, subagent delegation), wins *and* failures. The credibility core.
2. **Understanding AI / mental models** — explainers (MCP, RAG, context management, evals) taught via a SimplerDevelopment example but generalizable. Not selling — teaching.
3. **Build-in-public** — "I shipped X / here's what I learned" tied to real SD work (feeds the auto-drafting routine from git commits).
4. **Contrarian/opinion takes on AI-assisted dev** — myths, where agentic coding breaks. Used sparingly, must be genuine.

### SimplerDevelopment (company page) — promotional
1. **"Open-source alternative to [the unbundled stack]"** feature comparisons.
2. **Feature spotlights** (visual editor, Company Brain RAG, 200+ MCP tools) — demo GIF/video.
3. **The 3-tier offer** — self-host (free OSS) · cloud-hosted · optional agency dev+design — presented as a simple ladder.
4. **Proof** — build-in-public metrics, the agent-first story, later case studies.

## Weekly cadence — ~2–3 hrs/week [C for the numbers]
- **Batch session (~90 min, 1×/week):** pick ONE artifact (shipped feature / coding session / research finding) → film one talking-head video (script + 1–2 takes), build one 6–8 slide carousel, draft 1–2 text posts.
- **Schedule (~20 min):** stagger across the week via LinkedIn's native scheduler; links in comments, not body.
- **Engage (~30–45 min across the week):** reply to every comment on your posts; comment thoughtfully on 3–5 others' posts/day in the niche. (Being present beats any refuted "golden-hour timer.")
- **Suggested volume [C]:** ~3 personal posts/week + ~2 company posts/week (mostly Dan amplifying). Consistency > volume.

## Templates

### A. Face-to-camera 60–90s video script [C]
```
HOOK (1 line, ~3 sec — say it first, no intro):
  "[Counterintuitive claim / specific result]."  e.g. "I shipped a 357k-line platform mostly by talking to AI agents. Here's the part nobody tells you."
CONTEXT (1–2 lines): the problem / why it matters.
PAYOFF (2–3 lines): what you actually did — the worked SimplerDevelopment example.
TAKEAWAY (1–2 lines): the generalizable lesson (this is the teach-first value).
SOFT CTA (1 line, a question): "How are you handling [X]?"  (drives comments)
```
Keep ~150–220 words. Burn in captions (most watch muted). Vertical. One idea per video.

### B. Text post [C]
```
HOOK line (specific, scroll-stopping).
[blank line]
2–5 short lines: the story or insight, one thought per line, generous whitespace.
[blank line]
TAKEAWAY: the lesson.
QUESTION (CTA). No link in body — drop it in the first comment if needed.
```

### C. Carousel (PDF document) [C]
```
Slide 1: Hook/title (big, one promise).
Slides 2–N: one idea per slide, minimal text, a visual/code snippet.
Final slide: recap + soft CTA ("Follow Dan for more on agentic engineering").
6–8 slides. Designed in Canva/Figma → export PDF → upload as native document.
```

## Profile optimization — tuned for hiring [C]
- **Headline:** outcome + proof, not "agency owner." e.g. *"Agentic Software Engineer · I build production software by orchestrating AI agents · creator of SimplerDevelopment (OSS)."*
- **About:** story → proof (the 357k-line agent-built platform, OSS) → what you're open to. First 2 lines matter (truncation).
- **Featured:** pin the GitHub repo, a demo, and your best post.
- **"Open to Work":** prefer the **recruiter-only / private** setting over the public green banner for a senior IC (the public banner's effect is unverified and can read as availability-pressure) [C].
- **Activity:** the content engine IS the profile proof — recruiters read recent posts.

## Company page setup + 3-tier offer
- Complete the page: logo, one-line tagline ("open-source, MCP-native all-in-one platform"), About, custom CTA button → site/booking.
- Pin a feature-spotlight post. Present the ladder plainly: **Self-host (free, OSS) → Cloud-hosted → Agency dev+design (optional).**
- **Growth = Dan's amplification** [E], not page-native posting. Reshare/quote page posts from the personal profile.
- **Paid LinkedIn ads** [C]: hold until organic message converts + a tracked landing page exists; ads amplify a proven offer, they don't find one.

## Goal ladder — consistency-driven, compounding [C benchmarks]
Optimize **leading indicators** (in your control); expect **lagging** ones to follow.
- **Leading:** posts shipped/week, comments made/week, batch sessions held.
- **Lagging:** followers, profile views, inbound DMs.

| Horizon | Achievable milestone (compounding) | Metric that matters |
|---|---|---|
| 30 days | Engine running: 3 posts/wk every week (~12), profile optimized, company page complete, batch habit locked | Consistency (posts shipped), not followers |
| 60 days | ~24+ posts; first real inbound signal (a target-type comment, recruiter/peer connection, profile-view bump) | Profile-views trend; "interesting" comments |
| 90 days | Cross the ~50-post / first-90-days threshold; 1–2 posts outperform → identify your resonant pillar + repeatable hook | 1–2 breakout posts; saves/comments by pillar |
| 6–12 mo | Recognizable POV; inbound DMs from recruiters/prospects; small but engaged following | **Inbound conversations/month** (the real goal) |

## Honesty / re-verify
Every surviving stat rests on secondary analytics blogs re-citing a few datasets (Socialinsider, AuthoredUp, van der Blom, Refine Labs n=7) — rankings/directions are reliable; exact multipliers are directional. **Refuted, do NOT use:** the precise golden-hour mechanic, 60% link penalty, link-in-first-comment recovery, the saves=5×-a-like weighting table. Re-verify format/algorithm specifics before locking a 6–12 month plan (Jan-2026 "Depth Score" change may stale reaction-based stats). **Unverified (convention only):** posting times/frequency, video length, carousel slide counts, Open-to-Work banner, paid-ads threshold.
