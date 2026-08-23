const chartData = [
  { label: 'Draft', value: 1 },
  { label: 'Ship', value: 2 },
] as const;
const nodes = [{ id: 'brief', label: 'Brief' }, { id: 'deck', label: 'Deck' }];
const edges = [{ from: 'brief', to: 'deck' }];

export const slides = (
  <Slide id="structured" title="Structured primitives">
    <BarChart data={chartData} label="A clean chart" />
    <Timeline items={[{ id: 'draft', title: 'Draft' }, { id: 'ship', title: 'Ship' }]} />
    <Comparison
      left={{ title: 'Before', items: ['Manual'] }}
      right={{ title: 'After', items: ['Typed'] }}
    />
    <Architecture nodes={nodes} edges={edges} />
  </Slide>
);
