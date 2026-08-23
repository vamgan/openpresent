import { Children, type HTMLAttributes, type ReactNode } from 'react';
import { motion, useReducedMotion, type HTMLMotionProps } from 'motion/react';

export type RevealProps = Omit<HTMLMotionProps<'div'>, 'children' | 'initial' | 'animate' | 'transition'> & {
  children: ReactNode;
  delay?: number;
  duration?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
};

const offsets = {
  up: { y: 24 },
  down: { y: -24 },
  left: { x: 24 },
  right: { x: -24 },
  none: {},
};

export function Reveal({ children, delay = 0, duration = 0.55, direction = 'up', className, ...props }: RevealProps) {
  const reduced = Boolean(useReducedMotion());
  return (
    <motion.div
      className={['op-reveal', className].filter(Boolean).join(' ')}
      initial={reduced ? false : { opacity: 0, ...offsets[direction] }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ delay: reduced ? 0 : delay, duration: reduced ? 0 : duration, ease: [0.2, 0.8, 0.2, 1] }}
      {...props}
      data-openpresent-component="Reveal"
    >
      {children}
    </motion.div>
  );
}

export interface TextRevealProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  children: string;
  delay?: number;
  duration?: number;
  stagger?: number;
}

export function TextReveal({ children, delay = 0, duration = 0.45, stagger = 0.055, className, ...props }: TextRevealProps) {
  const reduced = Boolean(useReducedMotion());
  const words = children.split(/(\s+)/);
  return (
    <span className={['op-text-reveal', className].filter(Boolean).join(' ')} aria-label={children} {...props} data-openpresent-component="TextReveal">
      {words.map((word, index) => word.trim() ? (
        <motion.span
          aria-hidden="true"
          key={`${word}-${index}`}
          initial={reduced ? false : { opacity: 0, y: '0.45em' }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduced ? 0 : delay + index * stagger, duration: reduced ? 0 : duration }}
        >{word}</motion.span>
      ) : <span aria-hidden="true" key={`space-${index}`}>{word}</span>)}
    </span>
  );
}

export interface ImageRevealProps extends RevealProps {
  radius?: number | string;
}

export function ImageReveal({ children, delay, duration, radius, className, ...props }: ImageRevealProps) {
  const reduced = Boolean(useReducedMotion());
  return (
    <motion.div
      className={['op-image-reveal', className].filter(Boolean).join(' ')}
      style={{ borderRadius: radius }}
      initial={reduced ? false : { clipPath: 'inset(0 100% 0 0)' }}
      animate={{ clipPath: 'inset(0 0% 0 0)' }}
      transition={{ delay: reduced ? 0 : delay, duration: reduced ? 0 : duration ?? 0.8, ease: [0.76, 0, 0.24, 1] }}
      {...props}
      data-openpresent-component="ImageReveal"
    >{children}</motion.div>
  );
}

export interface SequenceProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  start?: number;
  step?: number;
}

export function Sequence({ children, start = 0.1, step = 0.14, className, ...props }: SequenceProps) {
  return (
    <div className={['op-sequence', className].filter(Boolean).join(' ')} {...props} data-openpresent-component="Sequence">
      {Children.map(children, (child, index) => <Reveal delay={start + index * step}>{child}</Reveal>)}
    </div>
  );
}

export interface AnimatedBackgroundProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'mesh' | 'grid' | 'orbit';
  intensity?: number;
}

export function AnimatedBackground({ variant = 'mesh', intensity = 1, className, ...props }: AnimatedBackgroundProps) {
  const reduced = Boolean(useReducedMotion());
  return (
    <div
      className={['op-animated-background', `is-${variant}`, reduced && 'is-static', className].filter(Boolean).join(' ')}
      data-reduced-motion={reduced || undefined}
      style={{ '--op-bg-intensity': intensity } as React.CSSProperties}
      aria-hidden="true"
      {...props}
      data-openpresent-component="AnimatedBackground"
    >
      <span /><span /><span />
    </div>
  );
}

export const GradientBackground = AnimatedBackground;
