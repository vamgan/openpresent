import type { ThemeInput } from '@openpresent/core';
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource-variable/jetbrains-mono';

export const showcaseTheme: ThemeInput = {
  colors: {
    background: '#ffffff',
    surface: '#f5f2fb',
    surfaceElevated: '#ffffff',
    text: '#1a1523',
    textMuted: '#6f6880',
    accent: '#7c3aed',
    accentContrast: '#faf8ff',
    border: '#e3ddf0',
    danger: '#dc2626',
  },
  typography: {
    fontFamily: '"IBM Plex Sans Variable", system-ui, sans-serif',
    monoFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
    headingWeight: 700,
  },
  stage: { padding: 76 },
  motion: { defaultTransition: 'fade', duration: 0.48, ease: 'easeOut' },
};

export const showcaseDesignSystem = {
  name: 'Violet Signal',
  accent: 'violet purple',
  dials: { variance: 2, motion: 2, density: 2 },
  minimumLogicalTextSize: 18,
  theme: showcaseTheme,
} as const;
