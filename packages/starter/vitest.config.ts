import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Pinned so the globs below can never escape this package — without it,
  // running vitest from a parent directory sweeps the whole monorepo.
  root: import.meta.dirname,
  test: {
    include: ['lib/**/*.test.ts', 'components/**/*.test.tsx'],
    exclude: ['**/node_modules/**', '**/.next/**'],
    environment: 'node',
  },
});
