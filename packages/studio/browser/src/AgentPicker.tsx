import { useRef } from 'react';
import type { DiscoveredAgentProfile } from '../../src/types';
import { AgentLogo } from './AgentLogo';

function availabilityLabel(availability: DiscoveredAgentProfile['availability']) {
  if (availability === 'missing') return 'not installed';
  if (availability === 'adapter-available') return 'via adapter';
  return 'ready';
}

export interface AgentPickerProps {
  agents: readonly DiscoveredAgentProfile[];
  value: string;
  onChange(id: string): void;
  disabled?: boolean;
  labelledBy: string;
  className?: string;
}

/** Shared agent chooser, so picking an agent works the same wherever it appears. */
export function AgentPicker({ agents, value, onChange, disabled, labelledBy, className }: AgentPickerProps) {
  const picker = useRef<HTMLDetailsElement>(null);
  const active = agents.find((item) => item.id === value);
  const anyInstalled = agents.some((item) => item.availability !== 'missing');
  return (
    <details className={['agent-picker', className].filter(Boolean).join(' ')} ref={picker}>
      <summary aria-haspopup="listbox" aria-labelledby={labelledBy} aria-disabled={disabled || undefined}>
        <AgentLogo profileId={active?.id ?? ''} />
        <span>{active ? active.label : anyInstalled ? 'Choose an agent' : 'No agents installed'}</span>
        <i aria-hidden="true" />
      </summary>
      <div role="listbox" aria-label="Agent profile">
        {agents.map((item) => (
          <button
            key={item.id}
            type="button"
            role="option"
            aria-selected={item.id === value}
            disabled={item.availability === 'missing'}
            onClick={() => { onChange(item.id); picker.current?.removeAttribute('open'); }}
          >
            <AgentLogo profileId={item.id} />
            <span>{item.label}</span>
            <small>{availabilityLabel(item.availability)}</small>
          </button>
        ))}
      </div>
    </details>
  );
}
