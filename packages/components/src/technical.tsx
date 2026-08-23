import { useId, type HTMLAttributes, type ReactNode } from 'react';

export interface BrowserMockupProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  url?: string;
  title?: string;
  dark?: boolean;
}

export function BrowserMockup({ children, url = 'openpresent.dev', title = 'Browser preview', dark = true, className, ...props }: BrowserMockupProps) {
  return (
    <div className={['op-browser', dark && 'is-dark', className].filter(Boolean).join(' ')} aria-label={title} {...props} data-openpresent-component="BrowserMockup">
      <div className="op-browser-chrome" aria-hidden="true">
        <span className="op-browser-dots"><i /><i /><i /></span>
        <span className="op-browser-url">{url}</span>
        <span className="op-browser-menu">•••</span>
      </div>
      <div className="op-browser-content">{children}</div>
    </div>
  );
}

export interface CodeBlockProps extends HTMLAttributes<HTMLDivElement> {
  code: string;
  language?: string;
  title?: string;
  wrap?: boolean;
  highlightLines?: number[];
}

export function CodeBlock({ code, language = 'text', title, wrap = false, highlightLines = [], className, ...props }: CodeBlockProps) {
  const highlighted = new Set(highlightLines);
  return (
    <div className={['op-code', wrap && 'is-wrapped', className].filter(Boolean).join(' ')} {...props} data-openpresent-component="CodeBlock">
      <header><span>{title ?? language}</span><small>{title ? language : 'OpenPresent'}</small></header>
      <pre aria-label={`${language} code example`}><code>
        {code.replace(/\n$/, '').split('\n').map((line, index) => (
          <span className={highlighted.has(index + 1) ? 'is-highlighted' : undefined} key={`${index}-${line}`}>
            <i aria-hidden="true">{String(index + 1).padStart(2, '0')}</i>{line || ' '}
          </span>
        ))}
      </code></pre>
    </div>
  );
}

export interface TimelineItem {
  id: string;
  date?: string;
  title: string;
  description?: string;
  status?: 'complete' | 'current' | 'upcoming';
}

export interface TimelineProps extends HTMLAttributes<HTMLOListElement> {
  items: TimelineItem[];
  orientation?: 'horizontal' | 'vertical';
}

export function Timeline({ items, orientation = 'horizontal', className, ...props }: TimelineProps) {
  return (
    <ol className={['op-timeline', `is-${orientation}`, className].filter(Boolean).join(' ')} {...props} data-openpresent-component="Timeline">
      {items.map((item, index) => (
        <li key={item.id} className={`is-${item.status ?? 'upcoming'}`}>
          <span className="op-timeline-index" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          {item.date && <time>{item.date}</time>}
          <strong>{item.title}</strong>
          {item.description && <p>{item.description}</p>}
        </li>
      ))}
    </ol>
  );
}

export interface ComparisonSide {
  title: string;
  subtitle?: string;
  items: string[];
  accent?: boolean;
}

export interface ComparisonProps extends HTMLAttributes<HTMLDivElement> {
  left: ComparisonSide;
  right: ComparisonSide;
  versusLabel?: string;
}

export function Comparison({ left, right, versusLabel = 'vs', className, ...props }: ComparisonProps) {
  const renderSide = (side: ComparisonSide) => (
    <section className={side.accent ? 'is-accent' : undefined}>
      <h3>{side.title}</h3>
      {side.subtitle && <p>{side.subtitle}</p>}
      <ul>{side.items.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
  );
  return (
    <div className={['op-comparison', className].filter(Boolean).join(' ')} {...props} data-openpresent-component="Comparison">
      {renderSide(left)}
      <span className="op-versus" aria-hidden="true">{versusLabel}</span>
      {renderSide(right)}
    </div>
  );
}

export interface FlowNode {
  id: string;
  label: string;
  description?: string;
  tone?: 'default' | 'accent' | 'muted';
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowProps extends HTMLAttributes<HTMLDivElement> {
  nodes: FlowNode[];
  edges: FlowEdge[];
  label?: string;
  direction?: 'horizontal' | 'vertical';
}

export function Flow({ nodes, edges, label = 'Architecture flow', direction = 'horizontal', className, ...props }: FlowProps) {
  const markerId = `op-arrow-${useId().replace(/:/g, '')}`;
  const nodeMap = new Map(nodes.map((node, index) => [node.id, index]));
  const width = 1320;
  const height = 430;
  const horizontal = direction === 'horizontal';
  const point = (index: number) => horizontal
    ? { x: 120 + (index * (width - 240)) / Math.max(1, nodes.length - 1), y: height / 2 }
    : { x: width / 2, y: 70 + (index * (height - 140)) / Math.max(1, nodes.length - 1) };
  return (
    <div className={['op-flow', className].filter(Boolean).join(' ')} role="img" aria-label={label} {...props} data-openpresent-component="Flow">
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        <defs>
          <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" />
          </marker>
        </defs>
        <g className="op-flow-edges">
          {edges.map((edge) => {
            const from = nodeMap.get(edge.from);
            const to = nodeMap.get(edge.to);
            if (from === undefined || to === undefined) return null;
            const a = point(from);
            const b = point(to);
            const dx = horizontal ? Math.sign(b.x - a.x) * 112 : 0;
            const dy = horizontal ? 0 : Math.sign(b.y - a.y) * 52;
            return (
              <g key={`${edge.from}-${edge.to}-${edge.label ?? ''}`}>
                <line x1={a.x + dx} y1={a.y + dy} x2={b.x - dx} y2={b.y - dy} markerEnd={`url(#${markerId})`} />
                {edge.label && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 12} textAnchor="middle">{edge.label}</text>}
              </g>
            );
          })}
        </g>
        <g className="op-flow-nodes">
          {nodes.map((node, index) => {
            const { x, y } = point(index);
            return (
              <g key={node.id} className={`is-${node.tone ?? 'default'}`} transform={`translate(${x - 106} ${y - 52})`}>
                <rect width="212" height="104" rx="16" />
                <text x="106" y={node.description ? 45 : 58} textAnchor="middle" className="op-flow-title">{node.label}</text>
                {node.description && <text x="106" y="70" textAnchor="middle" className="op-flow-description">{node.description}</text>}
              </g>
            );
          })}
        </g>
      </svg>
      <span className="op-sr-only">{nodes.map((node) => `${node.label}${node.description ? `: ${node.description}` : ''}`).join('; ')}</span>
    </div>
  );
}

export const Architecture = Flow;
