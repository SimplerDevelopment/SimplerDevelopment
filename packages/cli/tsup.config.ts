import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  platform: 'node',
  target: 'node22',
  banner: {
    js: '#!/usr/bin/env node',
  },
});
