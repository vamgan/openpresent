import { useState } from 'react';
import { defineDeck } from '@openpresent/core';
import {
  AnimatedBackground,
  Architecture,
  BarChart,
  BrowserMockup,
  Card,
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
  Reveal,
  SectionHeader,
  Sequence,
  Slide,
  Split,
  TextReveal,
  Timeline,
  type ChartDatum,
} from '@openpresent/components';
import { showcaseTheme } from './design-system';

const code = `import { defineDeck } from '@openpresent/core';
import { Hero, Slide } from '@openpresent/components';

export const deck = defineDeck({
  metadata: { id: 'launch', title: 'Launch' },
  slides: [
    <Slide id="opening" title="The opening" transition="scale">
      <Hero title="Ideas, rendered." />
    </Slide>
  ]
});`;

const flowNodes = [
  { id: 'intent', label: 'Any agent', description: 'brief + evidence' },
  { id: 'skill', label: 'Design skill', description: 'taste + constraints', tone: 'accent' as const },
  { id: 'tsx', label: 'Typed TSX', description: 'primitives or freeform' },
  { id: 'static', label: 'Static HTML', description: 'host anywhere' },
];

const flowEdges = [
  { from: 'intent', to: 'skill', label: 'direct' },
  { from: 'skill', to: 'tsx', label: 'compose' },
  { from: 'tsx', to: 'static', label: 'build' },
];

const adoption: ChartDatum[] = [
  { label: 'Draft', value: 22 },
  { label: 'Review', value: 48 },
  { label: 'Rehearse', value: 71 },
  { label: 'Ship', value: 94 },
];

const velocity: ChartDatum[] = [
  { label: 'Draft', value: 84 },
  { label: 'Review', value: 57 },
  { label: 'Rehearse', value: 35 },
  { label: 'Ship', value: 18 },
];

function InteractiveSignal() {
  const [mode, setMode] = useState<'adoption' | 'minutes'>('adoption');
  const [selected, setSelected] = useState(3);
  const data = mode === 'adoption' ? adoption : velocity;
  return (
    <div className="signal-demo" data-op-validate>
      <div className="signal-toolbar">
        <div>
          <span className="micro-label">Illustrative data control</span>
          <strong>{mode === 'adoption' ? 'Sample confidence' : 'Sample iteration time'}</strong>
        </div>
        <div className="segment-control" role="group" aria-label="Choose chart story">
          <button aria-pressed={mode === 'adoption'} onClick={() => { setMode('adoption'); setSelected(3); }}>Confidence</button>
          <button aria-pressed={mode === 'minutes'} onClick={() => { setMode('minutes'); setSelected(3); }}>Time</button>
        </div>
      </div>
      <BarChart
        data={data}
        label={mode === 'adoption' ? 'Illustrative confidence by workflow stage' : 'Illustrative minutes per workflow stage'}
        selectedIndex={selected}
        onSelect={(_, index) => setSelected(index)}
        valueFormatter={(value) => mode === 'adoption' ? `${value}%` : `${value}m`}
      />
      <div className="signal-readout" aria-live="polite">
        <span>{data[selected].label}</span>
        <strong>{mode === 'adoption' ? `${data[selected].value}% confidence` : `${data[selected].value} minutes`}</strong>
      </div>
    </div>
  );
}

export const deck = defineDeck({
  metadata: {
    id: 'openpresent-showcase',
    title: 'OpenPresent: Ideas, rendered',
    description: 'An executable tour of the open presentation stack for AI agents.',
    author: 'OpenPresent contributors',
    lang: 'en',
    version: '1.0',
    data: { audience: 'developers and agent builders', license: 'MIT' },
  },
  theme: showcaseTheme,
  slides: [
    <Slide id="opening" title="Ideas, rendered" transition="scale" className="slide-opening">
      <AnimatedBackground variant="mesh" />
      <span className="deck-index">ANY MODEL / LOCAL FIRST</span>
      <Hero
        eyebrow="Presentation stack for AI agents"
        title={<TextReveal delay={0.08}>Ideas, rendered.</TextReveal>}
        subtitle="A typed presentation runtime for agents who think in stories, not slide coordinates."
      >
        <div className="hero-meta"><span>React + TypeScript</span><span>Static by default</span><span>Motion with restraint</span></div>
      </Hero>
      <div className="corner-mark" aria-hidden="true">OP</div>
    </Slide>,

    <Slide id="problem" title="The blank canvas tax" transition="slide" className="slide-problem">
      <AnimatedBackground variant="grid" intensity={0.55} />
      <Split ratio="3:2" align="end">
        <Reveal>
          <div className="problem-statement">
            <span className="micro-label">The old workflow</span>
            <h2>Every deck begins by rebuilding the stage.</h2>
            <p>Layout plumbing, keyboard handlers, export hacks, and motion defaults arrive before the argument even starts.</p>
          </div>
        </Reveal>
        <Sequence start={0.2} step={0.14}>
          <Metric value="1600×900" label="Stable logical stage" detail="One coordinate system at every viewport" />
          <Metric value="0" label="Required cloud services" detail="Static output stays portable" />
        </Sequence>
      </Split>
    </Slide>,

    <Slide id="thesis" title="A system for the story" transition="fade" className="slide-thesis">
      <Hero eyebrow="The thesis" title="Give agents a system. Keep authors in React." subtitle="Structure where it compounds. A freeform escape hatch where the story demands it." />
      <div className="thesis-rule"><span /><strong>primitives</strong><span /><strong>runtime</strong><span /><strong>validation</strong></div>
    </Slide>,

    <Slide id="pipeline" title="From intent to static HTML" transition="slide">
      <SectionHeader kicker="The open pipeline" title="From intent to static HTML." description="No scene graph. No hosted renderer. Just typed authoring and a portable browser artifact." />
      <Architecture nodes={flowNodes} edges={flowEdges} label="OpenPresent build architecture" className="flow-stage" />
      <div className="footnote-row"><span>Serializable metadata</span><span>Arbitrary React children</span><span>Relative static assets</span></div>
    </Slide>,

    <Slide id="authoring" title="The authoring surface" transition="scale" className="slide-authoring">
      <Split ratio="2:3" align="center">
        <div className="authoring-copy">
          <span className="micro-label">One file can be enough</span>
          <h2>TSX is the authoring model.</h2>
          <p>Metadata stays inspectable. Children stay expressive. The API helps without trying to own every pixel.</p>
          <div className="api-chips"><span>defineDeck</span><span>Slide</span><span>theme</span></div>
        </div>
        <BrowserMockup url="localhost:5173/#opening" title="OpenPresent source preview">
          <CodeBlock title="src/deck.tsx" language="tsx" code={code} highlightLines={[4, 6, 7]} wrap />
        </BrowserMockup>
      </Split>
    </Slide>,

    <Slide id="primitives" title="Primitives with editorial intent" transition="slide">
      <SectionHeader kicker="Adoption ladder" title="Adopt at your altitude." description="Start with guidance alone, then take on as much runtime structure as the work needs." />
      <Grid columns={4} className="primitive-grid">
        <Card tone="accent"><span>Skill only</span><h3>Direct</h3><p>Give any agent a deck direction system.</p></Card>
        <Card><span>Starter + skill</span><h3>Launch</h3><p>Begin with a runnable design system.</p></Card>
        <Card><span>Typed stack</span><h3>Compose</h3><p>Use primitives, runtime, and validation.</p></Card>
        <Card><span>Headless React</span><h3>Freeform</h3><p>Own every pixel without an imposed IR.</p></Card>
      </Grid>
      <p className="primitive-note">High-level when the pattern repeats. Freeform HTML when it doesn’t.</p>
    </Slide>,

    <Slide id="comparison" title="A coherent default with an escape hatch" transition="fade">
      <SectionHeader kicker="Design posture" title="Systematic, not restrictive." description="The productive tension is not primitives versus custom work. It is repeated plumbing versus deliberate composition." />
      <Comparison
        className="comparison-stage"
        left={{ title: 'Blank canvas', subtitle: 'Freedom without leverage', items: ['Rebuild navigation', 'Reinvent scale behavior', 'Tune every transition'] }}
        right={{ title: 'OpenPresent', subtitle: 'A strong default, still React', accent: true, items: ['Compose known patterns', 'Override semantic tokens', 'Drop into freeform TSX'] }}
      />
    </Slide>,

    <Slide id="timeline" title="The author workflow" transition="slide">
      <SectionHeader kicker="One short loop" title="Prompt. Compose. Validate. Ship." description="The CLI keeps the author in motion while the runtime keeps the viewer oriented." />
      <Timeline
        className="timeline-stage"
        items={[
          { id: 'create', title: 'Create', description: 'Generate a typed, self-contained starter.', status: 'complete' },
          { id: 'compose', title: 'Compose', description: 'Mix primitives with ordinary React.', status: 'complete' },
          { id: 'validate', title: 'Validate', description: 'Catch IDs, overflow, density, and collisions.', status: 'current' },
          { id: 'ship', title: 'Build', description: 'Produce static assets for any host.', status: 'upcoming' },
        ]}
      />
      <code className="command-line">pnpm openpresent build</code>
    </Slide>,

    <Slide id="interactive-evidence" title="The evidence can answer back" transition="scale" className="slide-signal">
      <SectionHeader kicker="Inline interaction" title="The evidence can answer back." description="This live illustrative dataset demonstrates a component inside the deck. Toggle the story, then select a bar." />
      <InteractiveSignal />
    </Slide>,

    <Slide id="charts" title="Three chart forms one visual language" transition="fade">
      <SectionHeader kicker="Presentation-oriented charts" title="Three forms. One visual language." />
      <Grid columns="1.25fr 1fr" className="chart-grid">
        <Card className="chart-card"><span className="micro-label">Illustrative release trend</span><LineChart label="Illustrative completion trend over five cycles" data={[{ label: 'Brief', value: 18 }, { label: 'Draft', value: 31 }, { label: 'Review', value: 46 }, { label: 'Polish', value: 68 }, { label: 'Ship', value: 91 }]} valueFormatter={(v) => `${v}%`} /></Card>
        <Card className="chart-card"><span className="micro-label">Illustrative composition</span><DonutChart label="Illustrative deck composition" centerLabel="sample units" data={[{ label: 'Core', value: 44 }, { label: 'Motion', value: 31 }, { label: 'Story', value: 25 }]} /></Card>
      </Grid>
    </Slide>,

    <Slide id="visual" title="Images become narrative material" transition="slide" className="slide-visual">
      <Split ratio="1:1" align="center">
        <ImageReveal delay={0.08} radius={20} className="visual-image">
          <Image src="./openpresent-signal.svg" alt="Abstract coral signal travelling through a monochrome field" fit="cover" focalPosition="58% 50%" caption="A local SVG asset, portable with the static build." />
        </ImageReveal>
        <Reveal delay={0.3}>
          <div className="visual-copy">
            <span className="micro-label">Image + reveal</span>
            <h2>Images become narrative material.</h2>
            <p>Focal positioning, object fit, captions, and clip reveals are composable, not bolted onto the viewer.</p>
            <div className="visual-spec"><span>alt</span><span>fit</span><span>focalPosition</span><span>caption</span></div>
          </div>
        </Reveal>
      </Split>
    </Slide>,

    <Slide id="principle" title="The best tool disappears into the argument" transition="none" className="slide-quote">
      <AnimatedBackground variant="orbit" intensity={0.68} />
      <Quote attribution="OpenPresent design principle" role="open source">
        The best presentation tool disappears into the argument.
      </Quote>
      <span className="quote-aside">Accessible controls. Stable coordinates. Motivated motion.</span>
    </Slide>,

    <Slide id="validation" title="Validation before the room" transition="slide">
      <Split ratio="2:3" align="center">
        <div className="validation-copy">
          <span className="micro-label">A practical critic</span>
          <h2>Find the mistake before the room does.</h2>
          <p>Structured diagnostics name the rule, severity, slide, problem, and repair.</p>
          <div className="diagnostic"><span>WARNING</span><strong>dom.tiny-text</strong><p>Raise the font size or move detail to notes.</p></div>
        </div>
        <Flow
          direction="vertical"
          label="OpenPresent validation flow"
          nodes={[
            { id: 'model', label: 'Model rules', description: 'IDs + structures' },
            { id: 'browser', label: 'DOM rules', description: 'layout + density', tone: 'accent' },
            { id: 'action', label: 'Actionable fix', description: 'slide-specific' },
          ]}
          edges={[{ from: 'model', to: 'browser' }, { from: 'browser', to: 'action' }]}
        />
      </Split>
    </Slide>,

    <Slide id="closing" title="The stage is open" transition="scale" className="slide-closing">
      <AnimatedBackground variant="mesh" intensity={0.78} />
      <Hero align="center" eyebrow="MIT licensed / built in the open" title="The stage is open." subtitle="Give the next agent an argument, not a blank canvas.">
        <div className="closing-command">pnpm dlx @openpresent/cli create my-deck</div>
      </Hero>
      <div className="closing-footer"><span>Any agent or model</span><span>React to static HTML</span><span>MIT licensed</span><span>Created by Vamil</span></div>
    </Slide>,
  ],
});
