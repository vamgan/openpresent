import type { SlideProps } from './types';

export function Slide({ id, title, label, children, className, style }: SlideProps) {
  const accessibleLabel = label ?? title ?? `Slide ${id}`;
  return (
    <section
      id={id}
      data-openpresent-slide={id}
      data-openpresent-component="Slide"
      role="group"
      aria-roledescription="slide"
      aria-label={accessibleLabel}
      className={['op-slide', className].filter(Boolean).join(' ')}
      style={style}
    >
      {children}
    </section>
  );
}

Slide.displayName = 'OpenPresentSlide';
