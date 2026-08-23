export { defineDeck, getSlideMetadata } from './model';
export { Presentation, resolveTransition, type PresentationProps, type ResolvedTransition } from './Presentation';
export { Slide } from './Slide';
export {
  AUTHORING_PROTOCOL_VERSION,
  postAuthoringMessage,
  resolveAuthoringMode,
  type AuthoringBounds,
  type AuthoringInboundMessage,
  type AuthoringMode,
  type AuthoringModeOptions,
  type AuthoringNavigationMessage,
  type AuthoringOutboundMessage,
  type AuthoringSelectionMessage,
} from './authoring';
export {
  ThemeProvider,
  defaultTheme,
  mergeTheme,
  themeToCssVariables,
  useOpenPresentTheme,
  type ThemeProviderProps,
} from './theme';
export type {
  ColorTokens,
  DeckDefinition,
  DeckMetadata,
  DeckSlide,
  DeepPartial,
  DefinedDeck,
  JsonPrimitive,
  JsonValue,
  MotionTokens,
  RadiusTokens,
  ShadowTokens,
  SlideMetadata,
  SlideProps,
  SpacingTokens,
  Theme,
  ThemeInput,
  TransitionName,
  TransitionSpec,
  TypographyTokens,
} from './types';
