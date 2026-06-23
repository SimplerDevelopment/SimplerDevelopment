// Tailwind 4 ships its own PostCSS plugin. Vite uses @tailwindcss/vite directly,
// so this file is only here for tool compatibility (e.g. IDE plugins).
export default {
  plugins: {
    '@tailwindcss/postcss': {},
    autoprefixer: {},
  },
};
