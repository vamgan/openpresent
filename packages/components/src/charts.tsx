import type { HTMLAttributes } from 'react';

export interface ChartDatum {
  label: string;
  value: number;
  color?: string;
}

interface BaseChartProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  data: ChartDatum[];
  label: string;
  valueFormatter?: (value: number) => string;
}

function summary(data: ChartDatum[], formatter: (value: number) => string) {
  return data.map((item) => `${item.label}: ${formatter(item.value)}`).join(', ');
}

export interface BarChartProps extends BaseChartProps {
  onSelect?: (datum: ChartDatum, index: number) => void;
  selectedIndex?: number;
}

export function BarChart({ data, label, valueFormatter = String, onSelect, selectedIndex, className, ...props }: BarChartProps) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return (
    <div className={['op-chart', 'op-bar-chart', className].filter(Boolean).join(' ')} {...props} data-openpresent-component="BarChart">
      <svg viewBox="0 0 1000 470" role="img" aria-label={label}>
        <title>{label}</title><desc>{summary(data, valueFormatter)}</desc>
        <line x1="76" y1="400" x2="950" y2="400" className="op-chart-axis" />
        {data.map((item, index) => {
          const slot = 840 / Math.max(1, data.length);
          const width = Math.min(110, slot * 0.62);
          const height = (item.value / max) * 310;
          const x = 92 + index * slot + (slot - width) / 2;
          return (
            <g
              key={item.label}
              className={selectedIndex === index ? 'is-selected' : undefined}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={`${item.label}: ${valueFormatter(item.value)}`}
              onClick={() => onSelect?.(item, index)}
              onKeyDown={(event) => { if (onSelect && (event.key === 'Enter' || event.key === ' ')) onSelect(item, index); }}
            >
              <rect x={x} y={400 - height} width={width} height={height} rx="10" style={{ fill: item.color }} />
              <text x={x + width / 2} y={382 - height} textAnchor="middle" className="op-chart-value">{valueFormatter(item.value)}</text>
              <text x={x + width / 2} y="438" textAnchor="middle" className="op-chart-label">{item.label}</text>
            </g>
          );
        })}
      </svg>
      <p className="op-sr-only">{summary(data, valueFormatter)}</p>
    </div>
  );
}

export interface LinePoint { label: string; value: number }
export interface LineChartProps extends Omit<BaseChartProps, 'data'> { data: LinePoint[] }

export function LineChart({ data, label, valueFormatter = String, className, ...props }: LineChartProps) {
  const values = data.map((item) => item.value);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const range = Math.max(1, max - min);
  const points = data.map((item, index) => ({
    ...item,
    x: 84 + (index * 850) / Math.max(1, data.length - 1),
    y: 390 - ((item.value - min) / range) * 300,
  }));
  const path = points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');
  return (
    <div className={['op-chart', 'op-line-chart', className].filter(Boolean).join(' ')} {...props} data-openpresent-component="LineChart">
      <svg viewBox="0 0 1000 470" role="img" aria-label={label}>
        <title>{label}</title><desc>{summary(data, valueFormatter)}</desc>
        {[0, 1, 2, 3].map((line) => <line key={line} x1="74" y1={100 + line * 100} x2="950" y2={100 + line * 100} className="op-chart-gridline" />)}
        <path d={path} className="op-chart-line" />
        {points.map((point) => (
          <g key={point.label}>
            <circle cx={point.x} cy={point.y} r="7" />
            <text x={point.x} y="438" textAnchor="middle" className="op-chart-label">{point.label}</text>
          </g>
        ))}
      </svg>
      <p className="op-sr-only">{summary(data, valueFormatter)}</p>
    </div>
  );
}

export interface DonutChartProps extends BaseChartProps {
  centerLabel?: string;
}

export function DonutChart({ data, label, centerLabel, valueFormatter = String, className, ...props }: DonutChartProps) {
  const total = data.reduce((sum, item) => sum + Math.max(0, item.value), 0) || 1;
  let offset = 0;
  return (
    <div className={['op-chart', 'op-donut-chart', className].filter(Boolean).join(' ')} {...props} data-openpresent-component="DonutChart">
      <svg viewBox="0 0 700 480" role="img" aria-label={label}>
        <title>{label}</title><desc>{summary(data, valueFormatter)}</desc>
        <g transform="rotate(-90 240 240)">
          <circle cx="240" cy="240" r="142" className="op-donut-track" />
          {data.map((item, index) => {
            const fraction = Math.max(0, item.value) / total;
            const dash = `${fraction * 892} ${892 - fraction * 892}`;
            const dashOffset = -offset * 892;
            offset += fraction;
            return <circle key={item.label} cx="240" cy="240" r="142" className={`op-donut-segment segment-${index}`} style={{ stroke: item.color, strokeDasharray: dash, strokeDashoffset: dashOffset }} />;
          })}
        </g>
        <text x="240" y="230" textAnchor="middle" className="op-donut-total">{valueFormatter(data.reduce((sum, item) => sum + item.value, 0))}</text>
        <text x="240" y="268" textAnchor="middle" className="op-chart-label">{centerLabel ?? 'total'}</text>
        {data.map((item, index) => (
          <g key={item.label} transform={`translate(460 ${122 + index * 62})`}>
            <circle r="7" style={{ fill: item.color }} />
            <text x="20" y="7" className="op-chart-label">{item.label}</text>
            <text x="196" y="7" textAnchor="end" className="op-chart-value">{valueFormatter(item.value)}</text>
          </g>
        ))}
      </svg>
      <p className="op-sr-only">{summary(data, valueFormatter)}</p>
    </div>
  );
}

export type ChartProps =
  | ({ variant: 'bar' } & BarChartProps)
  | ({ variant: 'line' } & LineChartProps)
  | ({ variant: 'donut' } & DonutChartProps);

export function Chart(props: ChartProps) {
  if (props.variant === 'bar') { const { variant: _, ...rest } = props; return <BarChart {...rest} />; }
  if (props.variant === 'line') { const { variant: _, ...rest } = props; return <LineChart {...rest} />; }
  const { variant: _, ...rest } = props;
  return <DonutChart {...rest} />;
}
