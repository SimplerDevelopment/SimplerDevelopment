/**
 * SD Chat — Design Tokens
 *
 * Ported verbatim from the canonical `T` object in
 * `~/Desktop/sd-chat-settings-mockup.html`.
 *
 * Gradient strings are CSS-only — React Native uses `expo-linear-gradient` with
 * a `[start, end]` color tuple. See `Gradients` and `linearGradientProps()` helper.
 *
 * Structure is light-only today, but every token lives under `light` so we can
 * add a `dark` palette later without touching consumers.
 */

export type ThemeColors = {
  bgApp: string;
  bgCard: string;
  bgSubtle: string;
  bgChip: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  borderLight: string;
  rowDivider: string;
  brand: string;
  ai: string;
  aiDark: string;
  aiSoft: string;
  aiBorder: string;
  aiTint: string;
  // CSS gradient kept for parity / debugging — do NOT pass to RN <View>.
  // Use `Gradients.ai` with `<LinearGradient>` instead.
  aiGradient: string;
  success: string;
  warning: string;
  danger: string;
  iosBlue: string;
  iosGreen: string;
  iosOrange: string;
  iosRed: string;
  iosPurple: string;
  iosPink: string;
  iosTeal: string;
  iosYellow: string;
};

// Palette matched to simplerdevelopment.com (portal globals.css :root):
// warm stone neutrals + a blue-600 primary, with amber/emerald accents.
// The `ai*` tokens are the app's accent surface — repointed from the old
// indigo/violet to the brand blue so the AI accent reads as "SimplerDev blue"
// app-wide.
export const lightColors: ThemeColors = {
  bgApp: '#F5F5F4', // stone-100 (warm app bg)
  bgCard: '#FFFFFF',
  bgSubtle: '#F5F5F4', // stone-100
  bgChip: '#E7E5E4', // stone-200
  textPrimary: '#1C1917', // stone-900 (site --foreground)
  textSecondary: '#78716C', // stone-500 (site --muted-foreground)
  textTertiary: '#A8A29E', // stone-400
  border: '#E7E5E4', // stone-200
  borderLight: '#F0EFEE',
  rowDivider: '#EDEBEA',
  brand: '#1C1917', // warm near-black (site --foreground)
  ai: '#2563EB', // blue-600 (site --primary)
  aiDark: '#1D4ED8', // blue-700
  aiSoft: '#DBEAFE', // blue-100
  aiBorder: '#BFDBFE', // blue-200
  aiTint: '#EFF6FF', // blue-50
  aiGradient: 'linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)',
  success: '#10B981', // site --accent-secondary
  warning: '#F59E0B', // site --accent-warm
  danger: '#EF4444',
  iosBlue: '#0A84FF',
  iosGreen: '#30D158',
  iosOrange: '#FF9500',
  iosRed: '#FF3B30',
  iosPurple: '#AF52DE',
  iosPink: '#FF2D92',
  iosTeal: '#5AC8FA',
  iosYellow: '#FFCC00',
};

// Dark palette placeholder — Phase 2/3 will populate. Structure exists so
// consumers can already write `theme.colors.textPrimary` without churn later.
export const darkColors: ThemeColors = {
  ...lightColors,
  bgApp: '#18181B', // zinc-900 (site dark --background)
  bgCard: '#1F1F23',
  bgSubtle: '#27272A', // zinc-800
  bgChip: '#2E2E33',
  textPrimary: '#EDEDED', // site dark --foreground
  textSecondary: '#A1A1AA', // zinc-400 (site dark --muted-foreground)
  textTertiary: '#71717A', // zinc-500
  border: '#3F3F46',
  borderLight: '#27272A',
  rowDivider: '#27272A',
  // Site bumps the primary brighter on dark (--primary #3b82f6).
  ai: '#3B82F6',
  aiDark: '#2563EB',
  aiSoft: '#1E3A5F',
  aiBorder: '#1E40AF',
  aiTint: '#172554',
};

export type GradientTuple = readonly [string, string] | readonly [string, string, string, string];

export const Gradients = {
  // Brand-blue accent gradient (was indigo→violet). blue-600 → blue-500.
  ai: ['#2563EB', '#3B82F6'] as const,
  aiSoft: ['#DBEAFE', '#EFF6FF'] as const,
  /** Full-bleed onboarding welcome gradient — brand blue, deep → light. */
  deep: ['#1E3A8A', '#2563EB', '#3B82F6', '#60A5FA'] as const,
} satisfies Record<string, GradientTuple>;

/**
 * Helper to spread standard 135deg-equivalent gradient props onto LinearGradient.
 * In RN, a 135deg CSS gradient ≈ start={{x:0,y:0}} end={{x:1,y:1}}.
 */
export const linearGradientProps = (colors: GradientTuple) => ({
  colors: colors as unknown as readonly [string, string, ...string[]],
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
});

/**
 * Vertical variant for full-bleed welcome backgrounds (160deg in the mockup
 * ≈ start={0,0} end={0,1} with a slight horizontal lean).
 */
export const verticalGradientProps = (colors: GradientTuple) => ({
  colors: colors as unknown as readonly [string, string, ...string[]],
  start: { x: 0.2, y: 0 },
  end: { x: 0.8, y: 1 },
});

export const Radii = {
  chip: 999,
  bubble: 18,
  card: 14,
  tile: 8,
  field: 12,
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const Typography = {
  largeTitle: { fontSize: 28, fontWeight: '700' as const, letterSpacing: -0.5 },
  title: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '400' as const, letterSpacing: -0.1 },
  callout: { fontSize: 14, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  micro: { fontSize: 11, fontWeight: '600' as const, letterSpacing: 0.5 },
};

export const theme = {
  colors: lightColors,
  dark: darkColors,
  gradients: Gradients,
  radii: Radii,
  spacing: Spacing,
  type: Typography,
};

export type Theme = typeof theme;
export default theme;

// Convenience re-export — most consumers in the mockups reference `T.*`.
export const T = lightColors;
