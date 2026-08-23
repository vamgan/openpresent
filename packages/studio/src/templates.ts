/**
 * One shape in a template's schematic preview, laid out on a 160×90 logical
 * canvas that mirrors the 16:9 stage. Rendered as flat SVG so the gallery needs
 * no live iframes.
 */
export interface TemplatePreviewBlock {
  x: number;
  y: number;
  w: number;
  h: number;
  role: 'title' | 'text' | 'accent' | 'accent-surface' | 'surface' | 'media' | 'dark' | 'line';
  /** Rounds the shape into a pill or dot. */
  pill?: boolean;
}

export interface SlideTemplateRecipe {
  id: 'blank' | 'hero' | 'metric' | 'split' | 'comparison' | 'timeline' | 'flow' | 'code' | 'quote' | 'image';
  label: string;
  description: string;
  defaultTitle: string;
  imports: string[];
  body: string;
  preview: TemplatePreviewBlock[];
}

export const SLIDE_TEMPLATES: readonly SlideTemplateRecipe[] = [
  {
    id: 'blank', label: 'Blank', description: 'A freeform TSX starting point.', defaultTitle: 'Untitled slide', imports: [],
    body: '<div><h2>Untitled slide</h2><p>Add a specific claim and the evidence that supports it.</p></div>',
    preview: [
      { x: 14, y: 24, w: 60, h: 7, role: 'title' },
      { x: 14, y: 40, w: 88, h: 3.5, role: 'text' },
      { x: 14, y: 48, w: 72, h: 3.5, role: 'text' },
    ],
  },
  {
    id: 'hero', label: 'Hero', description: 'One decisive idea with supporting context.', defaultTitle: 'The central idea', imports: ['Hero'],
    body: '<Hero title="The central idea" subtitle="State the implication in one clear sentence." />',
    preview: [
      { x: 14, y: 14, w: 22, h: 3, role: 'accent' },
      { x: 14, y: 28, w: 108, h: 11, role: 'title' },
      { x: 14, y: 43, w: 74, h: 11, role: 'title' },
      { x: 14, y: 64, w: 58, h: 3.5, role: 'text' },
    ],
  },
  {
    id: 'metric', label: 'Metric', description: 'Three verified signals, explicitly awaiting evidence.', defaultTitle: 'Evidence in three signals', imports: ['Grid', 'Metric'],
    body: '<><h2>Evidence in three signals</h2><Grid columns={3}><Metric value="Add verified value" label="Signal one" /><Metric value="Add verified value" label="Signal two" /><Metric value="Add verified value" label="Signal three" /></Grid></>',
    preview: [
      { x: 14, y: 16, w: 54, h: 5, role: 'title' },
      { x: 14, y: 34, w: 26, h: 13, role: 'accent' },
      { x: 14, y: 52, w: 36, h: 3, role: 'text' },
      { x: 62, y: 34, w: 26, h: 13, role: 'accent' },
      { x: 62, y: 52, w: 36, h: 3, role: 'text' },
      { x: 110, y: 34, w: 26, h: 13, role: 'accent' },
      { x: 110, y: 52, w: 36, h: 3, role: 'text' },
    ],
  },
  {
    id: 'split', label: 'Split', description: 'A claim beside its supporting detail.', defaultTitle: 'Claim and evidence', imports: ['Card', 'Split'],
    body: '<><h2>Claim and evidence</h2><Split><Card><h3>The claim</h3><p>Write the conclusion the audience should retain.</p></Card><Card tone="quiet"><h3>The evidence</h3><p>Add source-backed detail here.</p></Card></Split></>',
    preview: [
      { x: 14, y: 15, w: 52, h: 5, role: 'title' },
      { x: 14, y: 28, w: 63, h: 47, role: 'surface' },
      { x: 21, y: 36, w: 32, h: 5, role: 'title' },
      { x: 21, y: 48, w: 46, h: 3, role: 'text' },
      { x: 21, y: 55, w: 38, h: 3, role: 'text' },
      { x: 83, y: 28, w: 63, h: 47, role: 'surface' },
      { x: 90, y: 36, w: 32, h: 5, role: 'accent' },
      { x: 90, y: 48, w: 46, h: 3, role: 'text' },
      { x: 90, y: 55, w: 40, h: 3, role: 'text' },
    ],
  },
  {
    id: 'comparison', label: 'Comparison', description: 'Two explicit sides with parallel criteria.', defaultTitle: 'Compare the options', imports: ['Comparison'],
    body: '<><h2>Compare the options</h2><Comparison left={{ title: "Option one", items: ["Criterion one", "Criterion two"] }} right={{ title: "Option two", items: ["Criterion one", "Criterion two"], accent: true }} /></>',
    preview: [
      { x: 14, y: 15, w: 56, h: 5, role: 'title' },
      { x: 14, y: 28, w: 63, h: 47, role: 'surface' },
      { x: 21, y: 35, w: 30, h: 4, role: 'title' },
      { x: 21, y: 47, w: 44, h: 3, role: 'text' },
      { x: 21, y: 54, w: 44, h: 3, role: 'text' },
      { x: 21, y: 61, w: 32, h: 3, role: 'text' },
      { x: 83, y: 28, w: 63, h: 47, role: 'accent-surface' },
      { x: 90, y: 35, w: 30, h: 4, role: 'accent' },
      { x: 90, y: 47, w: 44, h: 3, role: 'text' },
      { x: 90, y: 54, w: 44, h: 3, role: 'text' },
      { x: 90, y: 61, w: 32, h: 3, role: 'text' },
    ],
  },
  {
    id: 'timeline', label: 'Timeline', description: 'A paced sequence with clear status.', defaultTitle: 'How the story unfolds', imports: ['Timeline'],
    body: '<><h2>How the story unfolds</h2><Timeline items={[{ id: "step-one", title: "First beat", description: "Establish the context.", status: "complete" }, { id: "step-two", title: "Current beat", description: "Show what changes now.", status: "current" }, { id: "step-three", title: "Next beat", description: "Name the decision ahead.", status: "upcoming" }]} /></>',
    preview: [
      { x: 14, y: 16, w: 58, h: 5, role: 'title' },
      { x: 20, y: 45, w: 120, h: 1.5, role: 'line' },
      { x: 20, y: 41, w: 9, h: 9, role: 'accent', pill: true },
      { x: 20, y: 58, w: 30, h: 3, role: 'text' },
      { x: 71, y: 41, w: 9, h: 9, role: 'accent', pill: true },
      { x: 66, y: 58, w: 30, h: 3, role: 'text' },
      { x: 122, y: 41, w: 9, h: 9, role: 'title', pill: true },
      { x: 112, y: 58, w: 30, h: 3, role: 'text' },
    ],
  },
  {
    id: 'flow', label: 'Flow / architecture', description: 'A semantic node and edge system.', defaultTitle: 'How the system connects', imports: ['Architecture'],
    body: '<><h2>How the system connects</h2><Architecture nodes={[{ id: "input", label: "Input" }, { id: "system", label: "System", tone: "accent" }, { id: "output", label: "Output" }]} edges={[{ from: "input", to: "system" }, { from: "system", to: "output" }]} /></>',
    preview: [
      { x: 14, y: 16, w: 60, h: 5, role: 'title' },
      { x: 16, y: 40, w: 36, h: 21, role: 'surface' },
      { x: 24, y: 48, w: 20, h: 4, role: 'text' },
      { x: 54, y: 50, w: 8, h: 1.5, role: 'line' },
      { x: 64, y: 40, w: 36, h: 21, role: 'accent' },
      { x: 72, y: 48, w: 20, h: 4, role: 'title' },
      { x: 102, y: 50, w: 8, h: 1.5, role: 'line' },
      { x: 112, y: 40, w: 36, h: 21, role: 'surface' },
      { x: 120, y: 48, w: 20, h: 4, role: 'text' },
    ],
  },
  {
    id: 'code', label: 'Code', description: 'A focused implementation excerpt.', defaultTitle: 'The implementation', imports: ['CodeBlock'],
    body: '<><h2>The implementation</h2><CodeBlock title="src/deck.tsx" language="tsx" code={`// Replace with the smallest relevant excerpt.\nconst evidence = await verify(source);`} /></>',
    preview: [
      { x: 14, y: 14, w: 48, h: 5, role: 'title' },
      { x: 14, y: 26, w: 132, h: 50, role: 'dark' },
      { x: 22, y: 34, w: 44, h: 3, role: 'accent' },
      { x: 22, y: 42, w: 84, h: 3, role: 'text' },
      { x: 30, y: 50, w: 66, h: 3, role: 'text' },
      { x: 30, y: 58, w: 74, h: 3, role: 'text' },
      { x: 22, y: 66, w: 38, h: 3, role: 'text' },
    ],
  },
  {
    id: 'quote', label: 'Quote', description: 'A sourced voice with attribution.', defaultTitle: 'A source worth hearing', imports: ['Quote'],
    body: '<Quote attribution="Add the real source" role="Add source context">Replace this with a verified quotation.</Quote>',
    preview: [
      { x: 16, y: 22, w: 11, h: 13, role: 'accent' },
      { x: 34, y: 24, w: 108, h: 7, role: 'title' },
      { x: 34, y: 36, w: 92, h: 7, role: 'title' },
      { x: 34, y: 48, w: 64, h: 7, role: 'title' },
      { x: 34, y: 66, w: 40, h: 3, role: 'text' },
    ],
  },
  {
    id: 'image', label: 'Image', description: 'A source-directed visual with meaningful alt text.', defaultTitle: 'A visual proof point', imports: ['Image'],
    body: '<><h2>A visual proof point</h2><Image src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'1200\' height=\'600\'%3E%3Crect width=\'1200\' height=\'600\' fill=\'%23eceae5\'/%3E%3C/svg%3E" alt="Replace with a source-backed image and precise alternative text" caption="Replace this placeholder with a sourced visual." /></>',
    preview: [
      { x: 14, y: 12, w: 132, h: 56, role: 'media' },
      { x: 14, y: 76, w: 68, h: 3.5, role: 'text' },
    ],
  },
] as const;

function cloneTemplate(template: SlideTemplateRecipe): SlideTemplateRecipe {
  return {
    ...template,
    imports: [...template.imports],
    preview: template.preview.map((block) => ({ ...block })),
  };
}

export function listSlideTemplates(): readonly SlideTemplateRecipe[] {
  return SLIDE_TEMPLATES.map(cloneTemplate);
}

export function resolveSlideTemplate(id: string): SlideTemplateRecipe {
  const template = SLIDE_TEMPLATES.find((candidate) => candidate.id === id);
  if (!template) throw new Error(`Unknown slide template "${id}". Available: ${SLIDE_TEMPLATES.map((item) => item.id).join(', ')}.`);
  return cloneTemplate(template);
}
