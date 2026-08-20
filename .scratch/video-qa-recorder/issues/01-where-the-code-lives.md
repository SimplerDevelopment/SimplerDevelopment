# Where the code lives, what it is called, and how it is licensed

Type: grilling
Status: resolved

## Question

The destination is a published OSS repo. Does this become:

- **its own repo** (`video-qa-recorder` or similar) under a personal or
  SimplerDevelopment org, or
- a top-level directory inside the public `SimplerDevelopment/SimplerDevelopment`
  monorepo, alongside the existing `extension/`?

The monorepo is public and already carries CI, `.dependency-cruiser.cjs`
boundaries, a `.file-budget.baseline.json`, git hooks, and a ~10-minute pre-push
typecheck — all of which an unrelated OSS dev tool would inherit and none of
which it needs. Against that: `extension/` already proves out MV3 + Vite +
@crxjs + React 19 + Tailwind 4, and copying that scaffold is free.

Resolve together, since they are one identity decision:

- Repo location, and whether `extension/`'s build setup is copied or re-derived.
- The tool's name (it is user-facing and goes on the Web Store listing).
- License (MIT vs Apache-2.0 — the latter's patent grant matters if this ever
  touches Chrome APIs commercially).
- Whether CLAUDE.md's board-153 `PUX-###` ledger rule applies to the build work,
  or whether the new repo's own issues become the ledger.

## Answer

**`SimplerDevelopment/bugcast`. MIT. The new repo's own issues are the ledger.**

---

### Repo: its own, under the SimplerDevelopment org

Not a directory in the monorepo. A contributor to a browser extension would
otherwise clone a 357k-line multi-tenant SaaS platform to get it, and inherit
CI, `.dependency-cruiser.cjs` boundaries, `.file-budget.baseline.json`, git
hooks and a ~10-minute pre-push typecheck — all built for entirely different
constraints, none of which this needs. Issues would land in a stream that is
mostly about the portal.

It also now has to house **two publishable artifacts** with independent release
cadences — a Web Store listing and an npm package (ticket 11) — which a
subdirectory of an application monorepo serves badly.

Under the **SD org** rather than personal: company association helps adoption
for a dev-tools-adjacent business, and it keeps the project near where it was
designed.

**The scaffold is copied from `extension/`, not re-derived.** MV3 + Vite +
@crxjs + React 19 + Tailwind 4 + zod is already proven there. Strip the
SD-specific parts: the portal API client, the tenant coupling, and the manifest's
permission set (which ticket 05 replaced with `activeTab` + programmatic
injection, no `<all_urls>`).

Worth noting explicitly, because it was the monorepo's only real argument:
**copying a scaffold never required co-location.** It works fine across repos,
so that case dissolves rather than being outweighed.

### Name: `bugcast`

Verified free on npm at decision time (`flightrec`, `sessioncast` and `handoff`
were all taken; `qacast`, `qatape`, `blackbox-qa` and `video-qa-recorder` were
also free).

Short, brandable, and descriptive of the actual loop — record a bug, cast it to
whoever fixes it. Serves as repo name, extension name, and npm package name for
the MCP server.

**Discoverability is handled separately, not traded away:** the Web Store
listing title can read *"Bugcast — Video QA Recorder"*, so the searchable words
are present without a long package name. A short name and a descriptive listing
are not in tension.

### License: MIT

The dominant norm in the JS, extension and npm ecosystems — the lowest-friction
choice for adoption and the one contributors assume without reading.

The Apache-2.0 patent-grant argument is thin here: this tool is documented
browser APIs plus an off-the-shelf model, not a patentable technique.

**Dependency licensing composes cleanly:** transformers.js is Apache-2.0, which
distributes fine inside an MIT project provided its notices are retained;
Whisper model weights are MIT/Apache. **No copyleft anywhere in the set**, so
nothing forces a license change later.

### Ledger: the new repo's issues, plus one card on board 153

CLAUDE.md's rule that "no code work in this repo happens off-ledger" is scoped
to **this** repo. `bugcast` is a different repo, and an open-source project
whose issue tracker lives in a portal strangers cannot see is broken by
construction.

So:

- **Primary ledger: GitHub issues on `SimplerDevelopment/bugcast`.** Public,
  linkable, contributable.
- **One `PUX-###` card on board 153** tracking the initiative, so the work stays
  visible from SD's side without splitting the detail across two systems.

### The map ships with the repo

The wayfinder map and its thirteen tickets move into `bugcast` as design
documentation. They are already written, and they are unusually good onboarding
material: every decision with its reasoning *and its rejected alternatives*,
including the ones that turned out wrong — the whisper.cpp sidecar that had no
macOS binary, the MAIN-world injection that bought nothing, the frames-only
artifact that would have missed every between-event bug.

Most projects cannot answer "why is it built this way" a year later. This one
can, for free, because the answering was the work.

---

### Consequences for other tickets

- **12 (install and distribution)** — **now unblocked**, and inherits the name,
  the two-artifact release problem (Web Store + npm), and the fact that CI has to
  be built from scratch rather than inherited.
- **Everything already decided** carries over unchanged; this ticket settles
  identity, not architecture.
