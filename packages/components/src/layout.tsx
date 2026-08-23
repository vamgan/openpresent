import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Slide } from '@openpresent/core';

export { Slide };

type Align = 'left' | 'center' | 'right';

export interface HeroProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: Align;
  children?: ReactNode;
}

export function Hero({ eyebrow, title, subtitle, align = 'left', children, className, ...props }: HeroProps) {
  return (
    <div className={['op-hero', `op-align-${align}`, className].filter(Boolean).join(' ')} {...props} data-openpresent-component="Hero">
      {eyebrow && <div className="op-eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {children && <div className="op-hero-content">{children}</div>}
    </div>
  );
}

export interface MetricProps extends HTMLAttributes<HTMLDivElement> {
  value: ReactNode;
  label: ReactNode;
  detail?: ReactNode;
  trend?: 'up' | 'down' | 'neutral';
}

export function Metric({ value, label, detail, trend = 'neutral', className, ...props }: MetricProps) {
  return (
    <div className={['op-metric', `op-trend-${trend}`, className].filter(Boolean).join(' ')} {...props} data-openpresent-component="Metric">
      <div className="op-metric-value">{value}</div>
      <div className="op-metric-label">{label}</div>
      {detail && <div className="op-metric-detail">{detail}</div>}
    </div>
  );
}

export const BigNumber = Metric;

export interface SplitProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  ratio?: '1:1' | '2:1' | '1:2' | '3:2' | '2:3';
  gap?: number | string;
  align?: CSSProperties['alignItems'];
}

export function Split({ children, ratio = '1:1', gap, align = 'stretch', className, style, ...props }: SplitProps) {
  return (
    <div
      className={['op-split', className].filter(Boolean).join(' ')}
      data-ratio={ratio}
      style={{ gap, alignItems: align, ...style }}
      {...props}
      data-openpresent-component="Split"
    >
      {children}
    </div>
  );
}

export interface GridProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  columns?: 2 | 3 | 4 | string;
  gap?: number | string;
}

export function Grid({ children, columns = 3, gap, className, style, ...props }: GridProps) {
  const template = typeof columns === 'number' ? `repeat(${columns}, minmax(0, 1fr))` : columns;
  return (
    <div className={['op-grid', className].filter(Boolean).join(' ')} style={{ gridTemplateColumns: template, gap, ...style }} {...props} data-openpresent-component="Grid">
      {children}
    </div>
  );
}

export interface QuoteProps extends Omit<HTMLAttributes<HTMLElement>, 'role'> {
  children: ReactNode;
  attribution?: ReactNode;
  role?: ReactNode;
  mark?: boolean;
}

export function Quote({ children, attribution, role, mark = true, className, ...props }: QuoteProps) {
  return (
    <figure className={['op-quote', className].filter(Boolean).join(' ')} {...props} data-openpresent-component="Quote">
      {mark && <span className="op-quote-mark" aria-hidden="true">“</span>}
      <blockquote>{children}</blockquote>
      {attribution && <figcaption>{attribution}{role && <span>, {role}</span>}</figcaption>}
    </figure>
  );
}

export interface ImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'alt'> {
  src: string;
  alt: string;
  fit?: 'cover' | 'contain' | 'fill';
  focalPosition?: string;
  caption?: ReactNode;
  frame?: boolean;
}

export function Image({ src, alt, fit = 'cover', focalPosition = '50% 50%', caption, frame = false, className, style, ...props }: ImageProps) {
  return (
    <figure className={['op-image', frame && 'is-framed', className].filter(Boolean).join(' ')} data-openpresent-component="Image">
      <img src={src} alt={alt} style={{ objectFit: fit, objectPosition: focalPosition, ...style }} {...props} />
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

export interface SectionHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  kicker?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
}

export function SectionHeader({ kicker, title, description, className, ...props }: SectionHeaderProps) {
  return (
    <header className={['op-section-header', className].filter(Boolean).join(' ')} {...props} data-openpresent-component="SectionHeader">
      {kicker && <span className="op-eyebrow">{kicker}</span>}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </header>
  );
}

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'quiet';
}

export function Card({ children, tone = 'default', className, ...props }: CardProps) {
  return <div className={['op-card', `op-card-${tone}`, className].filter(Boolean).join(' ')} {...props} data-openpresent-component="Card">{children}</div>;
}
