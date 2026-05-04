// Shared types and constants for the brand profile editor and its tab components.

export interface ElementTypography {
  font?: string;
  size?: string;
  weight?: string;
  lineHeight?: string;
  letterSpacing?: string;
}

export interface DarkModeOverrides {
  primaryColor?: string;
  secondaryColor?: string;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  navBackground?: string;
  navTextColor?: string;
  logoUrl?: string;
  logoSquareUrl?: string;
  logoRectUrl?: string;
  logoIconUrl?: string;
}

export interface ButtonStyle {
  primaryBg?: string;
  primaryText?: string;
  primaryHoverBg?: string;
  secondaryBg?: string;
  secondaryText?: string;
  secondaryHoverBg?: string;
  borderRadius?: string;
  variant?: 'filled' | 'outline';
}

export interface ButtonPreset {
  id: string;
  name: string;
  backgroundColor?: string;
  color?: string;
  hoverBackgroundColor?: string;
  hoverColor?: string;
  borderColor?: string;
  borderWidth?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  borderRadius?: string;
  fontWeight?: string;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  letterSpacing?: string;
  paddingX?: string;
  paddingY?: string;
  description?: string;
}

export interface ProfileData {
  id: number;
  name: string;
  isDefault: boolean;
  logoUrl: string;
  logoAlt: string;
  logoSquareUrl: string;
  logoRectUrl: string;
  logoText: string;
  logoIconUrl: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  typography: Record<string, ElementTypography>;
  darkMode: DarkModeOverrides;
  navTemplate: string;
  navPosition: string;
  navBackground: string;
  navTextColor: string;
  borderRadius: string;
  linkColor: string;
  linkHoverColor: string;
  buttonStyle: ButtonStyle;
  buttonPresets: ButtonPreset[];
  faviconUrl: string;
  ogImageUrl: string;
}

export interface MessagingData {
  companyName: string;
  tagline: string;
  missionStatement: string;
  visionStatement: string;
  valueProposition: string;
  toneOfVoice: string;
  brandPersonality: string;
  writingStyle: string;
  elevatorPitch: string;
  boilerplate: string;
  keyDifferentiators: string[];
  targetAudience: string;
  industry: string;
  yearFounded: string;
  companySize: string;
  headquarters: string;
  websiteUrl: string;
  socialProof: string;
  keyClients: string;
  certifications: string;
  additionalContext: string;
  toneAxes: { formal?: number; playful?: number; traditional?: number; authoritative?: number };
  voiceSamples: Array<{ context: string; text: string }>;
}

export const DEFAULT_TYPOGRAPHY: Record<string, ElementTypography> = {
  h1: { size: '2.5rem', weight: '700', lineHeight: '1.2', letterSpacing: '-0.02em' },
  h2: { size: '2rem', weight: '600', lineHeight: '1.25', letterSpacing: '-0.01em' },
  h3: { size: '1.5rem', weight: '600', lineHeight: '1.3', letterSpacing: '0' },
  h4: { size: '1.25rem', weight: '600', lineHeight: '1.35', letterSpacing: '0' },
  h5: { size: '1.125rem', weight: '600', lineHeight: '1.4', letterSpacing: '0' },
  h6: { size: '1rem', weight: '600', lineHeight: '1.4', letterSpacing: '0.01em' },
  p: { size: '1rem', weight: '400', lineHeight: '1.6', letterSpacing: '0' },
  blockquote: { size: '1.125rem', weight: '400', lineHeight: '1.6', letterSpacing: '0' },
  button: { size: '0.875rem', weight: '500', lineHeight: '1.25', letterSpacing: '0.02em' },
  nav: { size: '0.875rem', weight: '500', lineHeight: '1.5', letterSpacing: '0.01em' },
  small: { size: '0.75rem', weight: '400', lineHeight: '1.5', letterSpacing: '0.01em' },
  caption: { size: '0.875rem', weight: '400', lineHeight: '1.4', letterSpacing: '0.01em' },
};

export const ELEMENT_LABELS: Record<
  string,
  { label: string; desc: string; category: 'heading' | 'body' | 'ui' }
> = {
  h1: { label: 'H1', desc: 'Main page title', category: 'heading' },
  h2: { label: 'H2', desc: 'Section heading', category: 'heading' },
  h3: { label: 'H3', desc: 'Sub-section heading', category: 'heading' },
  h4: { label: 'H4', desc: 'Card / block title', category: 'heading' },
  h5: { label: 'H5', desc: 'Small heading', category: 'heading' },
  h6: { label: 'H6', desc: 'Label heading', category: 'heading' },
  p: { label: 'Paragraph', desc: 'Body text', category: 'body' },
  blockquote: { label: 'Blockquote', desc: 'Quoted text', category: 'body' },
  small: { label: 'Small', desc: 'Fine print, captions', category: 'body' },
  caption: { label: 'Caption', desc: 'Image / table captions', category: 'body' },
  button: { label: 'Button', desc: 'Buttons and CTAs', category: 'ui' },
  nav: { label: 'Nav Link', desc: 'Navigation items', category: 'ui' },
};

export const WEIGHT_OPTIONS = [
  { value: '300', label: 'Light' },
  { value: '400', label: 'Regular' },
  { value: '500', label: 'Medium' },
  { value: '600', label: 'Semibold' },
  { value: '700', label: 'Bold' },
  { value: '800', label: 'Extra Bold' },
];

export const PROFILE_DEFAULTS: Omit<ProfileData, 'id' | 'name' | 'isDefault'> = {
  logoUrl: '',
  logoAlt: '',
  logoSquareUrl: '',
  logoRectUrl: '',
  logoText: '',
  logoIconUrl: '',
  primaryColor: '#2563eb',
  secondaryColor: '#1e40af',
  accentColor: '#f59e0b',
  backgroundColor: '#ffffff',
  textColor: '#111827',
  headingFont: '',
  bodyFont: '',
  typography: {},
  darkMode: {},
  navTemplate: 'classic',
  navPosition: 'top',
  navBackground: '#ffffff',
  navTextColor: '#111827',
  borderRadius: '8px',
  linkColor: '',
  linkHoverColor: '',
  buttonStyle: {},
  buttonPresets: [],
  faviconUrl: '',
  ogImageUrl: '',
};

export const EMPTY_MESSAGING: MessagingData = {
  companyName: '',
  tagline: '',
  missionStatement: '',
  visionStatement: '',
  valueProposition: '',
  toneOfVoice: '',
  brandPersonality: '',
  writingStyle: '',
  elevatorPitch: '',
  boilerplate: '',
  keyDifferentiators: [],
  targetAudience: '',
  industry: '',
  yearFounded: '',
  companySize: '',
  headquarters: '',
  websiteUrl: '',
  socialProof: '',
  keyClients: '',
  certifications: '',
  additionalContext: '',
  toneAxes: {},
  voiceSamples: [],
};

export const INPUT_CLASS =
  'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground focus:border-primary focus:ring-1 focus:ring-primary outline-none';
export const LABEL_CLASS = 'block text-xs font-medium text-muted-foreground mb-1.5';

export const VALID_TABS = ['logos', 'colors', 'typography', 'buttons', 'style', 'messaging'] as const;
export type TabId = (typeof VALID_TABS)[number];
