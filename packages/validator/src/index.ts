export { defaultValidatorConfig, resolveConfig, type ValidatorConfigInput } from './config';
export { collectDomDiagnostics, validateDom } from './dom';
export { extractModelFromSource, validateModel, validateSource } from './model';
export { validateTarget, validateUrl } from './target';
export type {
  Diagnostic,
  DiagnosticSeverity,
  ModelDeck,
  ModelSlide,
  RuleId,
  StructuredPrimitive,
  ValidationResult,
  ValidatorConfig,
} from './types';
