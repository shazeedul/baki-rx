export const colors = {
  primary: '#218868',
  primaryDark: '#1A6E54',
  danger: '#D92D20',
  background: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  textMuted: '#94A3B8',
  success: '#16A34A',
  successBg: '#DCFCE7',
  dangerBg: '#FEF2F2',
  warning: '#D97706',
  warningBg: '#FEF3C7',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
};

export const typography = {
  financialAmount: { fontSize: 20, fontWeight: '700' as const },
  label: { fontSize: 12, color: colors.textSecondary },
  body: { fontSize: 14 },
};
