// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  AnimatedBackground,
  BarChart,
  BrowserMockup,
  CodeBlock,
  Comparison,
  DonutChart,
  Flow,
  Grid,
  Hero,
  Image,
  ImageReveal,
  LineChart,
  Metric,
  Quote,
  Split,
  TextReveal,
  Timeline,
} from './index';

describe('component primitives', () => {
  it('renders the layout and editorial family with accessible semantics', () => {
    render(<Grid columns={2}>
      <Hero title="A hero" subtitle="Support" />
      <Metric value="42" label="Answer" />
      <Split><Quote attribution="Team">A quote</Quote><Image src="/image.png" alt="A meaningful diagram" caption="Local asset" /></Split>
    </Grid>);
    expect(screen.getByRole('heading', { name: 'A hero' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'A meaningful diagram' })).toHaveStyle({ objectFit: 'cover' });
    expect(screen.getByText('A quote')).toBeInTheDocument();
  });

  it('renders structured technical primitives', () => {
    render(<>
      <BrowserMockup title="Product"><CodeBlock code={'const value = 1;'} language="ts" title="demo.ts" /></BrowserMockup>
      <Timeline items={[{ id: 'one', title: 'First', status: 'current' }]} />
      <Comparison left={{ title: 'Before', items: ['Slow'] }} right={{ title: 'After', items: ['Fast'] }} />
      <Flow label="Data architecture" nodes={[{ id: 'a', label: 'Agent' }, { id: 'b', label: 'Browser' }]} edges={[{ from: 'a', to: 'b' }]} />
    </>);
    expect(screen.getByLabelText('Product')).toBeInTheDocument();
    expect(screen.getByLabelText('ts code example')).toHaveTextContent('const value = 1');
    expect(screen.getByRole('img', { name: 'Data architecture' })).toBeInTheDocument();
  });

  it('provides bar, line, and donut charts with summaries', () => {
    const data = [{ label: 'One', value: 10 }, { label: 'Two', value: 20 }];
    render(<><BarChart data={data} label="Bar evidence" /><LineChart data={data} label="Line evidence" /><DonutChart data={data} label="Donut evidence" /></>);
    expect(screen.getByRole('img', { name: 'Bar evidence' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Line evidence' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Donut evidence' })).toBeInTheDocument();
    expect(screen.getAllByText(/One: 10/).length).toBeGreaterThan(0);
  });

  it('renders reveal and background primitives without blocking interaction', () => {
    render(<><AnimatedBackground data-testid="background" /><TextReveal>Readable words</TextReveal><ImageReveal><button>Action</button></ImageReveal></>);
    expect(screen.getByTestId('background')).toHaveAttribute('aria-hidden', 'true');
    expect(document.querySelector('.op-text-reveal')).toHaveAttribute('aria-label', 'Readable words');
    expect(screen.getByRole('button', { name: 'Action' })).toBeEnabled();
  });
});
