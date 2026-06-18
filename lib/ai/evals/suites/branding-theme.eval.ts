/**
 * Eval suite — Brand theme generator (`lib/branding/generators.ts`, extracted
 * from app/api/portal/branding/generate-theme).
 *
 * description → visual identity JSON (colors, fonts, button styles, dark mode).
 * Scores the contract + that the colors are real hex values (the prompt's most
 * common failure is non-hex / partial color strings).
 *
 *   bun run lib/ai/evals/runner.ts --suite=branding-theme --key=sk-ant-...
 */
import { z } from 'zod';
import { generateBrandTheme } from '@/lib/branding/generators';
import type { EvalSuite } from '../types';
import { zodConformance, requiredFields, predicate, latencyUnder } from '../scorers';

interface Input {
  description: string;
}
type Theme = Record<string, unknown>;

const HEX = /^#[0-9a-fA-F]{6}$/;

const themeSchema = z.object({
  primaryColor: z.string().min(1),
  secondaryColor: z.string().min(1),
  accentColor: z.string().min(1),
  backgroundColor: z.string().min(1),
  textColor: z.string().min(1),
  headingFont: z.string().min(1),
  bodyFont: z.string().min(1),
  buttonStyle: z.record(z.string(), z.unknown()),
});

const cases = [
  {
    id: 'fintech-trust',
    input: { description: 'A fintech that wants to feel trustworthy, modern, and calm. Deep blues, clean sans-serif.' },
    expected: {},
    mockOutput: {
      primaryColor: '#1E3A8A', secondaryColor: '#3B82F6', accentColor: '#10B981',
      backgroundColor: '#FFFFFF', textColor: '#0F172A', navBackground: '#1E3A8A', navTextColor: '#FFFFFF',
      headingFont: 'Inter', bodyFont: 'Inter', borderRadius: '8px', linkColor: '#2563EB', linkHoverColor: '#1D4ED8',
      buttonStyle: { primaryBg: '#1E3A8A', primaryText: '#FFFFFF', variant: 'filled' },
      darkMode: { primaryColor: '#3B82F6', backgroundColor: '#0F172A', textColor: '#F8FAFC', navBackground: '#0F172A', navTextColor: '#F8FAFC' },
    } as Theme,
  },
  {
    id: 'playful-kids',
    input: { description: 'A playful kids learning app — bright, friendly, rounded, energetic.' },
    expected: {},
    mockOutput: {
      primaryColor: '#FF6B6B', secondaryColor: '#FFD93D', accentColor: '#6BCB77',
      backgroundColor: '#FFFDF7', textColor: '#2D2A32', navBackground: '#FF6B6B', navTextColor: '#FFFFFF',
      headingFont: 'Baloo 2', bodyFont: 'Nunito', borderRadius: '9999px', linkColor: '#4D96FF', linkHoverColor: '#3A7BD5',
      buttonStyle: { primaryBg: '#FF6B6B', primaryText: '#FFFFFF', variant: 'filled', borderRadius: '9999px' },
      darkMode: { primaryColor: '#FF8787', backgroundColor: '#1A1726', textColor: '#FFF7E6', navBackground: '#1A1726', navTextColor: '#FFF7E6' },
    } as Theme,
  },
] as const;

export const brandingThemeSuite: EvalSuite<Input, Theme> = {
  id: 'branding-theme',
  description: 'Brand description → visual identity (colors, fonts, button styles, dark mode).',
  cases: cases as unknown as EvalSuite<Input, Theme>['cases'],
  scorers: [
    zodConformance<Theme>(themeSchema),
    requiredFields<Theme>(['primaryColor', 'backgroundColor', 'textColor', 'headingFont', 'bodyFont']),
    predicate<Input, Theme>('core-colors-are-hex', (t) => {
      const keys = ['primaryColor', 'secondaryColor', 'accentColor', 'backgroundColor', 'textColor'];
      const bad = keys.filter((k) => !HEX.test(String(t[k] ?? '')));
      return { pass: bad.length === 0, detail: bad.length ? `non-hex: ${bad.join(', ')}` : 'all hex' };
    }),
    latencyUnder(12_000),
  ],
  async run(input, env) {
    if (!env.anthropicApiKey) throw new Error('branding-theme suite needs an Anthropic key (or run --mock)');
    const { theme, inputTokens, outputTokens } = await generateBrandTheme(input.description, env.anthropicApiKey, env.promptOverride);
    return { output: theme, inputTokens, outputTokens };
  },
};
