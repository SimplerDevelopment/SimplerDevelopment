# Where the code lives, what it is called, and how it is licensed

Type: grilling
Status: open

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
