import { defineConfig } from 'vitest/config';

// Deliberately standalone — do NOT extend the monorepo root vitest.config.ts.
// That config pulls in @vitejs/plugin-react, jsdom, and next-auth wiring that
// this package (a plain framework-agnostic fetch client) has no use for.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
