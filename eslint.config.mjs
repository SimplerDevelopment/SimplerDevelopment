import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Not first-party source — vendored skills, throwaway probes, generated artifacts:
    ".agents/**",
    ".claude/**",
    ".planning/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    // Test suites are not production code, are not linted by `next build`, and
    // carry pre-existing fixture-style violations (heavy `any`, `@ts` comments).
    // They remain typechecked (tsc) and executed (vitest/playwright); only the
    // prod-style lint gate skips them.
    "tests/**",
    "**/*.test.{ts,tsx,js,jsx,mjs,cjs}",
    "**/*.spec.{ts,tsx,js,jsx,mjs,cjs}",
    // Non-shipped build/dev tooling and separate sub-projects with their own
    // toolchains — not part of the Next app's production lint surface.
    "scripts/**",
    "sd-chat-mobile/**",
    "simplerdevelopment-agents/**",
    "extension/**",
    // Legacy design-tool god-files carry `// @ts-nocheck` and predate the lint
    // baseline; kept out of the prod lint surface (still compiled by the build).
    "components/product-designer/**",
  ]),
  // Structural "blunt-hammer" guardrail (harness-engineering, AI DevCon 2026):
  // a coarse file-size signal that nudges agents to decompose god-files instead
  // of growing them. `no-explicit-any` is already error via the Next TS preset,
  // so the only missing structural lint was a line ceiling.
  // ponytail: warn, not error — the repo has documented god-files
  // (lib/mcp/CLAUDE.md: cms.ts 2216, crm.ts 1670, kanban.ts 1484, approvals.ts
  // 1193, mcp-sdk-adapter.ts 5630) that predate this. A hard error would brick
  // the changed-files QA gate on every edit to them; warn surfaces bloat
  // just-in-time so *new* growth gets split. Upgrade to error + a ratchet
  // (e.g. betterer) once the god-files are actually broken up.
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
    // Tests are exempt: exhaustive table-driven suites are encouraged, not bloat.
    ignores: ["tests/**", "**/*.test.{ts,tsx,js,jsx}", "**/*.spec.{ts,tsx,js,jsx}"],
    rules: {
      "max-lines": ["warn", { max: 800, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // React Compiler rules (eslint-plugin-react-hooks v7, new in the React 19 /
    // Next 16 era) flag the codebase's ubiquitous `useEffect` + `setState`
    // data-fetch pattern across 80+ files. "Fixing" them means migrating to
    // SWR/React Query — a deliberate, tracked refactor, not a deploy-gate task.
    // Downgraded to `warn` so they stay visible as tech-debt without blocking the
    // production build, mirroring the unconditional `typescript.ignoreBuildErrors`
    // posture already in next.config.ts. See the prod-promotion notes.
    // The plugin must be registered in the same flat-config object that
    // references its rules (same instance as eslint-config-next uses).
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/refs": "warn",
    },
  },
]);

export default eslintConfig;
