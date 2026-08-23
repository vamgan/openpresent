import { createContext, useContext, useMemo, type CSSProperties, type PropsWithChildren } from 'react';
import type { DeepPartial, Theme, ThemeInput } from './types';

export const defaultTheme: Theme = {
  typography: {
    fontFamily: 'system-ui, sans-serif',
    monoFamily: 'ui-monospace, monospace',
    baseSize: 28,
    scale: 1.25,
    lineHeight: 1.35,
    headingWeight: 700,
    bodyWeight: 430,
  },
  colors: {
    background: '#0b0b0c',
    surface: '#141416',
    surfaceElevated: '#1d1d20',
    text: '#f7f5f2',
    textMuted: '#aaa7a3',
    accent: '#ff5d50',
    accentContrast: '#160302',
    border: '#303034',
    danger: '#ff7b72',
  },
  spacing: { xs: 8, sm: 16, md: 28, lg: 44, xl: 72, xxl: 112 },
  radii: { sm: 6, md: 14, lg: 28, pill: 999 },
  shadows: {
    soft: '0 12px 40px rgba(0, 0, 0, 0.22)',
    elevated: '0 28px 90px rgba(0, 0, 0, 0.42)',
  },
  stage: { padding: 76 },
  motion: { defaultTransition: 'fade', duration: 0.45, ease: 'easeOut' },
};

function mergeRecord<T extends Record<string, unknown>>(base: T, override?: DeepPartial<T>): T {
  if (!override) return { ...base };
  const output = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const baseValue = output[key];
    output[key] =
      typeof baseValue === 'object' && baseValue !== null && !Array.isArray(baseValue) &&
      typeof value === 'object' && value !== null && !Array.isArray(value)
        ? mergeRecord(baseValue as Record<string, unknown>, value as DeepPartial<Record<string, unknown>>)
        : value;
  }
  return output as T;
}

export function mergeTheme(...overrides: Array<ThemeInput | undefined>): Theme {
  return overrides.reduce<Theme>(
    (resolved, override) => mergeRecord(
      resolved as unknown as Record<string, unknown>,
      override as DeepPartial<Record<string, unknown>>,
    ) as unknown as Theme,
    mergeRecord(defaultTheme as unknown as Record<string, unknown>) as unknown as Theme,
  );
}

export function themeToCssVariables(theme: Theme): CSSProperties {
  const vars: Record<string, string | number> = {
    '--op-font-family': theme.typography.fontFamily,
    '--op-font-mono': theme.typography.monoFamily,
    '--op-font-size': `${theme.typography.baseSize}px`,
    '--op-type-scale': theme.typography.scale,
    '--op-line-height': theme.typography.lineHeight,
    '--op-heading-weight': theme.typography.headingWeight,
    '--op-body-weight': theme.typography.bodyWeight,
    '--op-color-bg': theme.colors.background,
    '--op-color-surface': theme.colors.surface,
    '--op-color-surface-raised': theme.colors.surfaceElevated,
    '--op-color-text': theme.colors.text,
    '--op-color-muted': theme.colors.textMuted,
    '--op-color-accent': theme.colors.accent,
    '--op-color-accent-contrast': theme.colors.accentContrast,
    '--op-color-border': theme.colors.border,
    '--op-color-danger': theme.colors.danger,
    '--op-space-xs': `${theme.spacing.xs}px`,
    '--op-space-sm': `${theme.spacing.sm}px`,
    '--op-space-md': `${theme.spacing.md}px`,
    '--op-space-lg': `${theme.spacing.lg}px`,
    '--op-space-xl': `${theme.spacing.xl}px`,
    '--op-space-xxl': `${theme.spacing.xxl}px`,
    '--op-radius-sm': `${theme.radii.sm}px`,
    '--op-radius-md': `${theme.radii.md}px`,
    '--op-radius-lg': `${theme.radii.lg}px`,
    '--op-radius-pill': `${theme.radii.pill}px`,
    '--op-shadow-soft': theme.shadows.soft,
    '--op-shadow-elevated': theme.shadows.elevated,
    '--op-stage-padding': `${theme.stage.padding}px`,
    '--op-motion-duration': `${theme.motion.duration}s`,
  };
  return vars as CSSProperties;
}

const ThemeContext = createContext<Theme>(defaultTheme);

export interface ThemeProviderProps extends PropsWithChildren {
  theme?: ThemeInput;
  className?: string;
}

export function ThemeProvider({ theme: input, children, className }: ThemeProviderProps) {
  const theme = useMemo(() => mergeTheme(input), [input]);
  return (
    <ThemeContext.Provider value={theme}>
      <div className={['op-theme', className].filter(Boolean).join(' ')} style={themeToCssVariables(theme)}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useOpenPresentTheme(): Theme {
  return useContext(ThemeContext);
}
