import type { SlideTemplateRecipe } from '../../src/templates';

/** Small pieces the start screen and the workspace both render. */

export interface LibraryEntry {
  id: string;
  path: string;
  title: string;
  slideCount: number;
  createdAt: string;
  lastOpenedAt: string;
  missing?: boolean;
}

export function relativeTime(iso: string): string {
  const elapsed = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(elapsed / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(iso).toLocaleDateString();
}

/** A template's layout drawn as flat shapes, so the gallery needs no live iframes. */
export function TemplatePreview({ template }: { template: SlideTemplateRecipe }) {
  return (
    <span className="template-preview" aria-hidden="true">
      <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid meet">
        <rect className="tp-page" x="0" y="0" width="160" height="90" />
        {template.preview.map((block, index) => (
          <rect
            key={index}
            className={`tp-${block.role}`}
            x={block.x}
            y={block.y}
            width={block.w}
            height={block.h}
            rx={block.pill ? Math.min(block.w, block.h) / 2 : 1.5}
          />
        ))}
      </svg>
    </span>
  );
}
