/**
 * Architecture fitness functions for simplerdevelopment2026.
 *
 * These encode the load-bearing invariants from CLAUDE.md as machine-checked rules so
 * humans AND Sonnet workers literally cannot merge a violation. Run via:
 *   bunx depcruise app lib components --config .dependency-cruiser.cjs
 *
 * Severity policy: structural invariants that should already hold = `error`;
 * pre-existing debt we want to ratchet down (cycles) = `warn`.
 *
 * @type {import('dependency-cruiser').IConfiguration}
 */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-route-tree',
      comment:
        'Three audiences, three route trees (admin / portal / sites+s). They must not import ' +
        'each other — share code via lib/ or components/. (CLAUDE.md architecture invariant.)',
      severity: 'error',
      from: { path: '^app/(admin|portal|sites|s)/' },
      to: { path: '^app/(admin|portal|sites|s)/', pathNot: '^app/$1/' },
    },
    {
      name: 'blocks-are-universal',
      comment:
        'Blocks are universal building blocks and must never depend on a route tree. ' +
        'They may use lib/ + components/ only. (lib/blocks/CLAUDE.md invariant.)',
      severity: 'error',
      from: { path: '^(lib/blocks|components/blocks)/' },
      to: { path: '^app/' },
    },
    {
      name: 'lib-must-not-import-app',
      comment: 'lib/ is the shared core; it must not reach up into app/ route trees.',
      severity: 'error',
      from: { path: '^lib/', pathNot: '\\.(test|spec)\\.[tj]sx?$' },
      to: { path: '^app/' },
    },
    {
      name: 'no-circular',
      comment:
        'Circular deps slow typecheck and block code-splitting. Currently a WARNING so it ' +
        "doesn't block; tighten to error once the count is driven to zero.",
      severity: 'warn',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'Unreferenced modules are usually dead code — confirm with knip, then delete.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)(index|page|layout|route|loading|error|not-found|template|default|middleware|instrumentation)\\.[tj]sx?$',
          '\\.(test|spec)\\.[tj]sx?$',
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(^|/)node_modules/|^\\.next/|(^|/)__tests__/' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    progress: { type: 'none' },
  },
};
