import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useExternalStoreRuntime,
} from '@assistant-ui/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { AgentState, DiscoveredAgentProfile, PendingPermission } from '../../src/types';
import { AgentPicker } from './AgentPicker';
import {
  appendMessageText,
  readOpenPresentActions,
  toAssistantUiMessage,
  transcriptToChatMessages,
} from './chat-adapter';

function MarkdownText({ text }: { text: string }) {
  return (
    <div className="md">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{ a: (props) => <a {...props} target="_blank" rel="noreferrer noopener" /> }}
      >{text}</Markdown>
    </div>
  );
}

function ChatMessage() {
  const role = useAuiState((state) => state.message.role);
  const createdAt = useAuiState((state) => state.message.createdAt);
  const status = useAuiState((state) => state.message.status);
  const actionMetadata = useAuiState((state) => state.message.metadata.custom.openpresentActions);
  const failed = useAuiState((state) => state.message.metadata.custom.openpresentFailed);
  const actions = useMemo(() => readOpenPresentActions(actionMetadata), [actionMetadata]);
  const label = role === 'assistant' ? 'Agent' : role;
  const statusName = status?.type ?? 'complete';
  return (
    <MessagePrimitive.Root className={`message is-${role} is-${statusName}${failed ? ' is-failed' : ''}`}>
      <header><span>{label}</span><time>{createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></header>
      <MessagePrimitive.Content components={{ Text: MarkdownText }} />
      {actions.length > 0 && <details className="action-group">
        <summary>{actions.length} action{actions.length === 1 ? '' : 's'}</summary>
        <ol>{actions.map((action) => <li key={action.id} className={`is-${action.status ?? 'complete'}`}>
          <span>{action.kind}</span><p>{action.text}</p><small>{action.status ?? 'complete'}</small>
        </li>)}</ol>
      </details>}
    </MessagePrimitive.Root>
  );
}

const MESSAGE_COMPONENTS = {
  UserMessage: ChatMessage,
  AssistantMessage: ChatMessage,
  SystemMessage: ChatMessage,
};

function friendlyOption(kind: string, name: string) {
  if (name) return name;
  if (kind === 'allow_once') return 'Allow once';
  if (kind === 'allow_always') return 'Always allow';
  if (kind === 'reject_once') return 'Reject';
  if (kind === 'reject_always') return 'Always reject';
  return kind;
}

export interface PromptSeed { id: number; value: string }

export interface ChatThreadProps {
  agent: AgentState;
  agents: readonly DiscoveredAgentProfile[];
  selectedAgent: string;
  onSelectAgent(id: string): void;
  busy?: string;
  connecting: boolean;
  working: boolean;
  statusLabel: string;
  activeSlideId?: string;
  selectionComponent?: string;
  selectionTag?: string;
  promptSeed?: PromptSeed;
  onSend(text: string): Promise<void>;
  onCancel(): Promise<void>;
  onClear(): Promise<void>;
  onStopLaunch(): Promise<void>;
  onSelectModel(modelId: string): Promise<void>;
  onPermission(requestId: string, optionId: string): Promise<void>;
  onAutoApprove(value: boolean): Promise<void>;
}

function PermissionCard({ permission, onPermission }: { permission: PendingPermission; onPermission: ChatThreadProps['onPermission'] }) {
  return (
    <div className="permission-card" role="group" aria-label="Tool approval required">
      <header>
        <strong>Approval needed</strong>
        {permission.risk === 'destructive' && <span className="permission-risk">destructive</span>}
      </header>
      <p>{permission.title}</p>
      <div className="permission-options">
        {permission.options.map((option) => (
          <button
            key={option.optionId}
            type="button"
            className={option.kind.startsWith('allow') ? 'allow' : 'reject'}
            onClick={() => void onPermission(permission.id, option.optionId)}
          >{friendlyOption(option.kind, option.name)}</button>
        ))}
      </div>
    </div>
  );
}

export function ChatThread({
  agent,
  agents,
  selectedAgent,
  onSelectAgent,
  busy,
  connecting,
  working,
  statusLabel,
  activeSlideId,
  selectionComponent,
  selectionTag,
  promptSeed,
  onSend,
  onCancel,
  onClear,
  onStopLaunch,
  onSelectModel,
  onPermission,
  onAutoApprove,
}: ChatThreadProps) {
  const messages = useMemo(() => transcriptToChatMessages(agent.transcript, agent.lifecycle), [agent.lifecycle, agent.transcript]);
  const handleNew = useCallback(async (message: Parameters<typeof appendMessageText>[0]) => {
    const text = appendMessageText(message);
    if (text) await onSend(text);
  }, [onSend]);
  const handleCancel = useCallback(async () => { await onCancel(); }, [onCancel]);
  const runtime = useExternalStoreRuntime({
    messages,
    convertMessage: toAssistantUiMessage,
    isRunning: working,
    isSendDisabled: !selectedAgent || connecting || Boolean(busy),
    onNew: handleNew,
    onCancel: handleCancel,
  });
  const input = useRef<HTMLTextAreaElement>(null);
  const modelMenu = useRef<HTMLDetailsElement>(null);
  const models = agents.find((item) => item.id === selectedAgent)?.models ?? [];
  const activeModel = models.find((model) => model.id === agent.modelId);
  const customModel = agent.modelId && !activeModel ? agent.modelId : undefined;
  const appliedSeed = useRef<number | undefined>(undefined);
  const lastUserPrompt = [...agent.transcript].reverse().find((item) => item.role === 'user')?.text;
  const runningDetail = working
    ? [...agent.transcript].reverse().find((item) => item.role === 'tool' && item.status === 'pending')?.text
    : undefined;
  const fillPrompt = useCallback((value: string) => {
    runtime.thread.composer.setText(value);
    input.current?.focus();
  }, [runtime]);

  useEffect(() => {
    if (!promptSeed || appliedSeed.current === promptSeed.id) return;
    appliedSeed.current = promptSeed.id;
    fillPrompt(promptSeed.value);
  }, [fillPrompt, promptSeed]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="conversation-section">
        <div className="chat-header">
          <span className="chat-title">Agent</span>
          <span className={`agent-state is-${agent.lifecycle}`}><i />{agent.lifecycle === 'cancelling' ? 'Stopping' : statusLabel}</span>
          <label className="auto-approve" title="Approve safe edits in this presentation without asking">
            <input
              type="checkbox"
              checked={agent.autoApproveSafe}
              onChange={(event) => void onAutoApprove(event.target.checked)}
            />
            Auto-approve safe edits
          </label>
        </div>
        <ThreadPrimitive.Viewport className="transcript" role="log" aria-label="Agent activity" aria-live="polite">
          <ThreadPrimitive.Empty>
            <div className="welcome-chat">
              <h2>Ask for a change</h2>
              <p>The current slide and your selection are sent with every prompt.</p>
              <button type="button" onClick={() => fillPrompt('Inspect this slide, run validation, and make the smallest safe repair.')}>
                <strong>Inspect and repair</strong><span>Check the slide, then fix only what is broken.</span>
              </button>
            </div>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={MESSAGE_COMPONENTS} />
          {working && !agent.pendingPermission && (
            <div className="working-indicator" aria-label="Agent is working">
              <span className="working-dots" aria-hidden="true"><i /><i /><i /></span>
              <span className="working-text">{runningDetail ?? (connecting ? 'Connecting to the agent' : 'Thinking')}</span>
            </div>
          )}
        </ThreadPrimitive.Viewport>

        {agent.error && <div className="inline-error" role="alert">{agent.error}</div>}
        {agent.pendingPermission && <PermissionCard permission={agent.pendingPermission} onPermission={onPermission} />}

        <div className="quick-actions" aria-label="Prompt suggestions">
          <button type="button" onClick={() => fillPrompt('Tighten the hierarchy and narrative on this slide without inventing facts.')}>Tighten slide</button>
          <button type="button" onClick={() => fillPrompt('Inspect this slide, run validation, and make the smallest safe repair.')}>Inspect and repair</button>
          {selectionComponent && <button type="button" onClick={() => fillPrompt(`Revise the selected ${selectionComponent} while preserving its evidence.`)}>Use selection</button>}
          {lastUserPrompt && <button type="button" onClick={() => fillPrompt(lastUserPrompt)}>Retry last</button>}
          {agent.transcript.length > 0 && <button type="button" onClick={() => void onClear()}>Clear activity</button>}
        </div>

        <ComposerPrimitive.Root className="prompt-box">
          <div className="composer-agent">
            <span className="composer-agent-label" id="agent-profile-label">Agent profile</span>
            <AgentPicker
              agents={agents}
              value={selectedAgent}
              onChange={onSelectAgent}
              labelledBy="agent-profile-label"
            />
            {models.length > 0 && (
              <details className="model-picker" ref={modelMenu}>
                <summary aria-haspopup="listbox" aria-label="Model" title="Model">
                  <span>{activeModel?.label ?? customModel ?? 'Default model'}</span>
                  <i aria-hidden="true" />
                </summary>
                <div role="listbox" aria-label="Model">
                  {models.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      role="option"
                      aria-selected={model.id === agent.modelId}
                      onClick={() => { void onSelectModel(model.id); modelMenu.current?.removeAttribute('open'); }}
                    >{model.label}</button>
                  ))}
                  {customModel && (
                    <button
                      type="button"
                      role="option"
                      aria-selected
                      onClick={() => modelMenu.current?.removeAttribute('open')}
                    >{customModel}</button>
                  )}
                  {/* No bundled list stays current, so any model the CLI accepts can be typed. */}
                  <form
                    className="model-custom"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const value = new FormData(event.currentTarget).get('model');
                      const next = typeof value === 'string' ? value.trim() : '';
                      if (!next) return;
                      void onSelectModel(next);
                      event.currentTarget.reset();
                      modelMenu.current?.removeAttribute('open');
                    }}
                  >
                    <input name="model" type="text" placeholder="Other model name" aria-label="Use another model" />
                    <button type="submit">Use</button>
                  </form>
                </div>
              </details>
            )}
            {connecting && <button type="button" className="cancel-launch" onClick={() => void onStopLaunch()}>Cancel launch</button>}
          </div>
          <label htmlFor="studio-prompt">Ask the agent to create or change this presentation</label>
          <ComposerPrimitive.Input
            ref={input}
            id="studio-prompt"
            submitMode="enter"
            placeholder={selectionComponent ? `Direct a change to this ${selectionComponent}` : 'Describe the next presentation change'}
            rows={4}
          />
          <div>
            <span aria-label="Attached context">{activeSlideId ?? 'No slide'} / {selectionComponent ? `${selectionComponent} / ${selectionTag ?? 'element'}` : 'whole slide'}</span>
            {working
              ? <ComposerPrimitive.Cancel className="send-button secondary">{agent.lifecycle === 'cancelling' ? 'Stopping' : 'Stop'}</ComposerPrimitive.Cancel>
              : <ComposerPrimitive.Send className="send-button">{busy === 'Sending prompt' || connecting ? 'Connecting' : 'Send'}</ComposerPrimitive.Send>}
          </div>
        </ComposerPrimitive.Root>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
