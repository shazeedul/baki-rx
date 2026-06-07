import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0F172A',
    background: '#F8FAFC',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E2E8F0',
    textSecondary: '#64748B',
  },
  dark: {
    text: '#ffffff',
    background: '#0f172a',
    backgroundElement: '#1e293b',
    backgroundSelected: '#334155',
    textSecondary: '#94a3b8',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

// Design system tokens as specified in AGENTS.md Section 8
export const colors = {
  primary:        '#218868',   // Deep Healthcare Green — buttons, headers, positive states
  primaryDark:    '#1A6E54',   // Pressed state
  danger:         '#D92D20',   // Due balances, errors, overdue badges — ONLY for these
  background:     '#F8FAFC',   // Screen backgrounds
  surface:        '#FFFFFF',   // Cards, inputs
  border:         '#E2E8F0',   // Dividers, input borders
  textPrimary:    '#0F172A',
  textSecondary:  '#64748B',
  textMuted:      '#94A3B8',
  success:        '#16A34A',
  successBg:      '#DCFCE7',
  dangerBg:       '#FEF2F2',
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32,
};

export const radius = {
  sm: 6, md: 10, lg: 14, xl: 20,
};

export const typography = {
  financialAmount: { fontSize: 20, fontWeight: '700' as const, fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-condensed' },
  label:           { fontSize: 12, color: colors.textSecondary },
  body:            { fontSize: 14 },
};

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

