import type { AppendMessage, ThreadMessageLike } from '@assistant-ui/react';
import type { AgentLifecycle, AgentTranscriptItem } from '../../src/types';

export interface OpenPresentChatAction {
  id: string;
  kind: 'tool' | 'permission' | 'thought';
  text: string;
  status: AgentTranscriptItem['status'];
  at: string;
}

export interface OpenPresentChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  createdAt: string;
  status: 'running' | 'complete' | 'error';
  actions: OpenPresentChatAction[];
}

function isAction(item: AgentTranscriptItem) {
  return item.role === 'tool' || item.role === 'permission'
    || (item.role === 'system' && (item.eventId === 'plan' || item.eventId?.startsWith('thought:')));
}

function actionKind(item: AgentTranscriptItem): OpenPresentChatAction['kind'] {
  if (item.role === 'permission') return 'permission';
  if (item.role === 'system') return 'thought';
  return 'tool';
}

export function transcriptToChatMessages(
  transcript: readonly AgentTranscriptItem[],
  lifecycle: AgentLifecycle,
): OpenPresentChatMessage[] {
  const messages: OpenPresentChatMessage[] = [];
  let assistant: OpenPresentChatMessage | undefined;
  const flush = () => {
    if (!assistant) return;
    messages.push(assistant);
    assistant = undefined;
  };
  const ensureAssistant = (item: AgentTranscriptItem) => {
    assistant ??= {
      id: `assistant:${item.id}`,
      role: 'assistant',
      text: '',
      createdAt: item.at,
      status: 'complete',
      actions: [],
    };
    return assistant;
  };

  for (const item of transcript) {
    if (item.role === 'user') {
      flush();
      messages.push({ id: item.id, role: 'user', text: item.text, createdAt: item.at, status: 'complete', actions: [] });
    } else if (item.role === 'agent') {
      const message = ensureAssistant(item);
      message.text = [message.text, item.text].filter(Boolean).join('\n\n');
      if (item.status === 'error') message.status = 'error';
    } else if (isAction(item)) {
      const message = ensureAssistant(item);
      message.actions.push({ id: item.id, kind: actionKind(item), text: item.text, status: item.status, at: item.at });
      if (item.status === 'error') message.status = 'error';
    } else {
      flush();
      messages.push({ id: item.id, role: 'system', text: item.text, createdAt: item.at, status: item.status === 'error' ? 'error' : 'complete', actions: [] });
    }
  }
  flush();

  const lastAssistant = [...messages].reverse().find((message) => message.role === 'assistant');
  if (lastAssistant && (lifecycle === 'running' || lifecycle === 'cancelling')) lastAssistant.status = 'running';
  return messages;
}

export function toAssistantUiMessage(message: OpenPresentChatMessage): ThreadMessageLike {
  const common = {
    id: message.id,
    role: message.role,
    content: message.text ? [{ type: 'text' as const, text: message.text }] : [],
    createdAt: new Date(message.createdAt),
    // assistant-ui only carries `status` on assistant messages, so failures on
    // other roles travel in metadata to stay visible in the transcript.
    metadata: { custom: { openpresentActions: message.actions, openpresentFailed: message.status === 'error' } },
  };
  if (message.role !== 'assistant') return common;
  return {
    ...common,
    role: 'assistant',
    status: message.status === 'running'
      ? { type: 'running' }
      : message.status === 'error'
        ? { type: 'incomplete', reason: 'error', error: 'ACP turn failed' }
        : { type: 'complete', reason: 'stop' },
  };
}

export function appendMessageText(message: AppendMessage): string {
  return message.content
    .flatMap((part) => part.type === 'text' ? [part.text] : [])
    .join('\n')
    .trim();
}

export function readOpenPresentActions(value: unknown): OpenPresentChatAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is OpenPresentChatAction => Boolean(
    item && typeof item === 'object'
      && typeof (item as OpenPresentChatAction).id === 'string'
      && ['tool', 'permission', 'thought'].includes((item as OpenPresentChatAction).kind)
      && typeof (item as OpenPresentChatAction).text === 'string',
  ));
}
