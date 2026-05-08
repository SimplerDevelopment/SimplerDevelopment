import type { Config } from 'tailwindcss';

// Tailwind 4 is mostly CSS-first; this file is kept for explicit content paths
// in case tools want them. The actual theme is defined in src/styles/tailwind.css.
const config: Config = {
  content: [
    './src/**/*.{ts,tsx,html}',
  ],
};

export default config;
