/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Mirrors lib/theme.ts T tokens for class-based usage where convenient.
        'bg-app': '#F0F1F4',
        'bg-card': '#FFFFFF',
        'bg-subtle': '#F0F1F4',
        'bg-chip': '#EBEDF1',
        'text-primary': '#0B0F19',
        'text-secondary': '#5E6473',
        'text-tertiary': '#9CA0AB',
        border: '#E6E8EC',
        'border-light': '#EFF0F3',
        'row-divider': '#ECECEF',
        brand: '#0F172A',
        ai: '#5B5BD6',
        'ai-dark': '#4338CA',
        'ai-soft': '#EEEFFE',
        'ai-border': '#C7CCFB',
        'ai-tint': '#F5F5FE',
        success: '#10B981',
        warning: '#F59E0B',
        danger: '#EF4444',
      },
    },
  },
  plugins: [],
};
