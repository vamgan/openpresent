export type DiagnosticSeverity = 'error' | 'warning' | 'info';

export type RuleId =
  | 'model.empty-deck'
  | 'model.duplicate-slide-id'
  | 'model.invalid-slide-id'
  | 'model.missing-slide-label'
  | 'model.invalid-structured-data'
  | 'dom.off-canvas'
  | 'dom.overflow'
  | 'dom.tiny-text'
  | 'dom.collision'
  | 'dom.density';

export interface Diagnostic {
  ruleId: RuleId;
  severity: DiagnosticSeverity;
  slideId?: string;
  message: string;
  hint: string;
  element?: string;
}

export interface ValidatorConfig {
  minFontSize: number;
  maxElementsPerSlide: number;
  collisionOverlapRatio: number;
  viewportPadding: number;
  viewportWidth: number;
  viewportHeight: number;
  disabledRules: RuleId[];
  severities: Partial<Record<RuleId, DiagnosticSeverity | 'off'>>;
}

export interface ModelSlide {
  id?: string;
  title?: string;
  label?: string;
  structures?: StructuredPrimitive[];
}

export interface ModelDeck {
  metadata?: { id?: string; title?: string };
  slides?: ModelSlide[];
}

export type StructuredPrimitive =
  | { type: 'chart'; data: unknown }
  | { type: 'timeline'; items: unknown }
  | { type: 'comparison'; left: unknown; right: unknown }
  | { type: 'flow'; nodes: unknown; edges: unknown };

export interface ValidationResult {
  valid: boolean;
  diagnostics: Diagnostic[];
  errorCount: number;
  warningCount: number;
}
