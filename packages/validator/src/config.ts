import type { Diagnostic, DiagnosticSeverity, RuleId, ValidatorConfig } from './types';

export const defaultValidatorConfig: ValidatorConfig = {
  minFontSize: 18,
  maxElementsPerSlide: 85,
  collisionOverlapRatio: 0.35,
  viewportPadding: 0,
  viewportWidth: 1440,
  viewportHeight: 900,
  disabledRules: [],
  severities: {},
};

export type ValidatorConfigInput = Partial<Omit<ValidatorConfig, 'severities'>> & {
  severities?: Partial<Record<RuleId, DiagnosticSeverity | 'off'>>;
};

export function resolveConfig(input: ValidatorConfigInput = {}): ValidatorConfig {
  return {
    ...defaultValidatorConfig,
    ...input,
    disabledRules: [...(input.disabledRules ?? defaultValidatorConfig.disabledRules)],
    severities: { ...defaultValidatorConfig.severities, ...input.severities },
  };
}

export function createDiagnostic(
  config: ValidatorConfig,
  ruleId: RuleId,
  defaultSeverity: DiagnosticSeverity,
  data: Omit<Diagnostic, 'ruleId' | 'severity'>,
): Diagnostic | undefined {
  const configured = config.severities[ruleId];
  if (config.disabledRules.includes(ruleId) || configured === 'off') return undefined;
  return { ruleId, severity: configured ?? defaultSeverity, ...data };
}

export function resultFromDiagnostics(diagnostics: Diagnostic[]) {
  const errorCount = diagnostics.filter((item) => item.severity === 'error').length;
  const warningCount = diagnostics.filter((item) => item.severity === 'warning').length;
  return { valid: errorCount === 0, diagnostics, errorCount, warningCount };
}
