# SimplerDevelopment 2026 — Agent Notes

## Skills vendored in this repo

### `huashu-design` (`.agents/skills/huashu-design/`)

Third-party design skill (alchaincyf/huashu-design) for producing hi-fi single-file HTML — interactive prototypes, slide decks, motion design, infographics, design-direction explorations. **Agent-facing** (used by Claude Code / Cursor / etc. during authoring); **not** a runtime library and **not** invokable by portal end users.

**When to invoke it (developer workflow only):**

- Scaffolding a brand-new block type — generate 2–3 hi-fi HTML mockups with different design philosophies before committing to one. Pairs with the `simplerdev-block-type` skill (huashu produces the visual; `simplerdev-block-type` produces the block boilerplate).
- Onboarding a new client site — produce a hi-fi landing page mockup from the client's brand assets before block-by-block translation. Pairs with the `site-migration` skill.
- Resolving "design feels generic / AI slop" feedback — run huashu's 5-dimension expert review (`c6-expert-review*.html`) for a punch list.
- Stuck on direction with a vague brief — invoke its design-direction advisor mode for 3 differentiated options drawn from its 20-philosophy library.

**Hard rule: huashu output is inspiration, not paste-able into the CMS.** It produces freeform HTML/CSS/JS files. Translation to typed block JSON (the schemas in `lib/blocks/registry.ts`) is always manual — never lift huashu HTML into a block via copy-paste.

**Local install (other developers):**

```bash
ln -s "$(pwd)/.agents/skills/huashu-design" ~/.claude/skills/huashu-design
```

This makes the vendored copy discoverable to Claude Code without an `npx skills add` round trip; the symlink is per-machine and not committed.
