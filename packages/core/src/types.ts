import type { ReactElement, ReactNode } from 'react';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type TransitionName = 'fade' | 'slide' | 'scale' | 'none';

export interface TransitionSpec {
  type: TransitionName;
  duration?: number;
  ease?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}

export interface DeckMetadata {
  id: string;
  title: string;
  description?: string;
  author?: string;
  lang?: string;
  version?: string;
  data?: Record<string, JsonValue>;
}

export interface SlideMetadata {
  id: string;
  title?: string;
  label?: string;
  notes?: string;
  transition?: TransitionName | TransitionSpec;
  data?: Record<string, JsonValue>;
}

export interface SlideProps extends SlideMetadata {
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export type DeckSlide = ReactElement<SlideProps>;

export interface DeckDefinition {
  metadata: DeckMetadata;
  slides: DeckSlide[];
  theme?: ThemeInput;
}

export interface DefinedDeck extends DeckDefinition {
  readonly slideIds: readonly string[];
}

export interface TypographyTokens {
  fontFamily: string;
  monoFamily: string;
  baseSize: number;
  scale: number;
  lineHeight: number;
  headingWeight: number;
  bodyWeight: number;
}

export interface ColorTokens {
  background: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textMuted: string;
  accent: string;
  accentContrast: string;
  border: string;
  danger: string;
}

export interface SpacingTokens {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
}

export interface RadiusTokens {
  sm: number;
  md: number;
  lg: number;
  pill: number;
}

export interface ShadowTokens {
  soft: string;
  elevated: string;
}

export interface MotionTokens {
  defaultTransition: TransitionName;
  duration: number;
  ease: TransitionSpec['ease'];
}

export interface Theme {
  typography: TypographyTokens;
  colors: ColorTokens;
  spacing: SpacingTokens;
  radii: RadiusTokens;
  shadows: ShadowTokens;
  stage: { padding: number };
  motion: MotionTokens;
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type ThemeInput = DeepPartial<Theme>;
