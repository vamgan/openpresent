import type { DiscoveredAgentProfile, StudioState } from '../../src/types';
import type { SlideTemplateRecipe } from '../../src/templates';
import { AgentPicker } from './AgentPicker';
import { TemplatePreview, relativeTime, type LibraryEntry } from './studio-shared';

export interface StartScreenProps {
  state: StudioState;
  library: readonly LibraryEntry[];
  openPath: string;
  documentsRoot: string;
  templates: readonly SlideTemplateRecipe[];
  agents: readonly DiscoveredAgentProfile[];
  selectedAgent: string;
  onSelectAgent(id: string): void;
  newName: string;
  onNewName(value: string): void;
  startPrompt: string;
  onStartPrompt(value: string): void;
  busy?: string;
  copied?: string;
  onContinue(): void;
  onOpen(entry: LibraryEntry): void;
  onForget(id: string): void;
  onCreateWithPrompt(): void;
  onCreateFromTemplate(templateId: string): void;
  onCopyCommand(label: string, command: string): void;
}

/**
 * The library view: everything the author sees before a presentation is open.
 * Kept apart from the workspace because the two share no layout and almost no
 * state, and mixing them made a single component responsible for both.
 */
export function StartScreen({
  state,
  library,
  openPath,
  documentsRoot,
  templates,
  agents,
  selectedAgent,
  onSelectAgent,
  newName,
  onNewName,
  startPrompt,
  onStartPrompt,
  busy,
  copied,
  onContinue,
  onOpen,
  onForget,
  onCreateWithPrompt,
  onCreateFromTemplate,
  onCopyCommand,
}: StartScreenProps) {
  return (
    <main className="studio-start" aria-labelledby="studio-start-title">
      <header><span>OpenPresent</span><span>Local Studio</span></header>
      <section className="start-intro">
        <p>Everything runs on this machine</p>
        <h1 id="studio-start-title">Where do you want to start?</h1>
        <p>Everything saves as you go, and anything can be undone.</p>
        <div className="start-actions">
          <button type="button" className="start-primary" onClick={onContinue}>Continue editing</button>
        </div>
      </section>
      {library.length > 0 && <section className="start-create" aria-label="Your presentations">
        <h2>Your presentations</h2>
        <ul className="start-library">
          {library.map((entry) => (
            <li key={entry.id} className={entry.missing ? 'is-missing' : undefined}>
              <button
                type="button"
                disabled={Boolean(busy) || entry.missing}
                onClick={() => onOpen(entry)}
              >
                <span className="library-name">
                  {entry.title}
                  {entry.path === openPath && <em>open</em>}
                </span>
                <span className="library-meta">
                  {entry.missing
                    ? 'Folder moved or deleted'
                    : `${entry.slideCount} ${entry.slideCount === 1 ? 'slide' : 'slides'} · edited ${relativeTime(entry.lastOpenedAt)}`}
                </span>
                <span className="library-path">{entry.path}</span>
              </button>
              <button type="button" className="library-forget" aria-label={`Remove ${entry.title} from the list`} onClick={() => onForget(entry.id)}>Remove</button>
            </li>
          ))}
        </ul>
      </section>}
      <section className="start-create" aria-label="Start a new presentation">
        <h2>New presentation</h2>
        <p>Saved to {documentsRoot || 'your documents'}.</p>
        <label className="start-name">
          <span>Name</span>
          <input
            type="text"
            value={newName}
            onChange={(event) => onNewName(event.target.value)}
            placeholder="Q3 strategy review"
            maxLength={60}
          />
        </label>
        <div className="start-prompt">
          <textarea
            value={startPrompt}
            onChange={(event) => onStartPrompt(event.target.value)}
            rows={3}
            placeholder="Describe the presentation you want: audience, argument, and the evidence to use."
            aria-label="Describe the presentation you want"
          />
          <div className="start-prompt-actions">
            <span className="start-agent">
              <span id="start-agent-label">Agent</span>
              <AgentPicker
                agents={agents}
                value={selectedAgent}
                onChange={onSelectAgent}
                labelledBy="start-agent-label"
              />
            </span>
            <button
              type="button"
              className="start-primary"
              disabled={!startPrompt.trim() || !selectedAgent || Boolean(busy)}
              onClick={onCreateWithPrompt}
            >{busy === 'Creating presentation' ? 'Creating' : 'Create with AI'}</button>
          </div>
        </div>
      </section>
      <section className="start-create" aria-label="Start with a template">
        <h2>…or start from a template</h2>
        <div className="start-templates">
          {templates.map((template) => (
            <button key={template.id} type="button" disabled={Boolean(busy)} onClick={() => onCreateFromTemplate(template.id)}>
              <TemplatePreview template={template} />
              <span>{template.label}</span><small>{template.description}</small>
            </button>
          ))}
          {templates.length === 0 && <p className="start-templates-empty">Templates are loading.</p>}
        </div>
      </section>
      <section className="start-paths" aria-label="Other ways to start">
        {[
          ['New presentation', 'npx -y @openpresent/cli studio ./my-deck --create --open'],
          ['Use a local skill', 'npx -y @openpresent/cli studio ./my-deck --create --skill deck-direction --open'],
          ['Open existing deck', 'npx -y @openpresent/cli studio . --open'],
        ].map(([label, command]) => <div key={label}>
          <span><strong>{label}</strong><code>{command}</code></span>
          <button type="button" onClick={() => onCopyCommand(label, command)}>{copied === label ? 'Copied' : 'Copy command'}</button>
        </div>)}
      </section>
      <footer>Slides are plain React files. Nothing leaves this machine.</footer>
    </main>
  );
}
