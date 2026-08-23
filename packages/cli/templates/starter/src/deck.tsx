import { defineDeck } from '@openpresent/core';
import { AnimatedBackground, CodeBlock, Grid, Hero, Metric, Slide } from '@openpresent/components';

export const deck = defineDeck({
  metadata: {
    id: '__PROJECT_NAME__',
    title: 'The idea worth presenting',
    description: 'A small OpenPresent starter deck.',
  },
  theme: { colors: { accent: '#ff5d50' } },
  slides: [
    <Slide id="opening" title="The idea worth presenting" transition="scale">
      <AnimatedBackground />
      <Hero eyebrow="OpenPresent starter" title="The idea worth presenting" subtitle="Make the argument visual, direct, and alive." />
    </Slide>,
    <Slide id="evidence" title="Evidence in three signals" transition="slide">
      <h2 className="starter-title">Evidence in three signals</h2>
      <Grid columns={3} className="starter-grid">
        <Metric value="1600×900" label="Logical stage" detail="One stable composition space." />
        <Metric value="4" label="Transition modes" detail="Fade, slide, scale, or none." />
        <Metric value="0" label="Cloud dependencies" detail="Static by default." />
      </Grid>
    </Slide>,
    <Slide id="authoring" title="One TSX authoring surface" transition="fade">
      <CodeBlock
        title="src/deck.tsx"
        language="tsx"
        highlightLines={[2, 3]}
        code={`export const deck = defineDeck({\n  metadata: { id: 'demo', title: 'Demo' },\n  slides: [<Slide id="opening">…</Slide>]\n});`}
      />
    </Slide>,
  ],
});
