// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { AgentTranscriptItem } from '../../src/types';
import { appendMessageText, readOpenPresentActions, toAssistantUiMessage, transcriptToChatMessages } from './chat-adapter';

const at = '2026-08-22T00:00:00.000Z';
const item = (id: string, role: AgentTranscriptItem['role'], text: string, status: AgentTranscriptItem['status'] = 'complete', eventId?: string): AgentTranscriptItem => ({
  id, role, text, status, at, ...(eventId ? { eventId } : {}),
});

describe('assistant-ui ACP transcript adapter', () => {
  it('maps one ACP turn into user and assistant messages with one action group', () => {
    const messages = transcriptToChatMessages([
      item('connected', 'system', 'Connected over ACP v1.'),
      item('user', 'user', 'Repair this slide.'),
      item('intro', 'agent', 'I inspected the selected slide.'),
      item('read', 'tool', 'Read src/deck.tsx.'),
      item('permission', 'permission', 'Edit allowed once.'),
      item('thought', 'system', 'Checking the diagnostic.', 'pending', 'thought:1'),
      item('write', 'tool', 'Wrote src/deck.tsx.'),
      item('done', 'agent', 'The repair is complete.'),
    ], 'ready');

    expect(messages.map(({ role }) => role)).toEqual(['system', 'user', 'assistant']);
    expect(messages[2]).toMatchObject({
      text: 'I inspected the selected slide.\n\nThe repair is complete.',
      status: 'complete',
      actions: [
        { kind: 'tool', text: 'Read src/deck.tsx.' },
        { kind: 'permission', text: 'Edit allowed once.' },
        { kind: 'thought', text: 'Checking the diagnostic.' },
        { kind: 'tool', text: 'Wrote src/deck.tsx.' },
      ],
    });
    const converted = toAssistantUiMessage(messages[2]!);
    expect(converted).toMatchObject({ role: 'assistant', status: { type: 'complete' } });
    expect(readOpenPresentActions(converted.metadata?.custom?.openpresentActions)).toHaveLength(4);
  });

  it('reflects running and failed ACP lifecycle without creating a transport', () => {
    const running = transcriptToChatMessages([item('user', 'user', 'Continue.'), item('agent', 'agent', 'Working', 'pending')], 'running');
    expect(toAssistantUiMessage(running[1]!)).toMatchObject({ status: { type: 'running' } });
    const failed = transcriptToChatMessages([item('user', 'user', 'Continue.'), item('agent', 'agent', 'Failed', 'error')], 'error');
    expect(toAssistantUiMessage(failed[1]!)).toMatchObject({ status: { type: 'incomplete', reason: 'error' } });
  });

  it('extracts only user text from assistant-ui append messages', () => {
    const text = appendMessageText({
      role: 'user', parentId: null, sourceId: null, runConfig: undefined,
      content: [{ type: 'text', text: 'First line' }, { type: 'text', text: 'Second line' }],
      attachments: [], metadata: { custom: {} }, createdAt: new Date(at),
    });
    expect(text).toBe('First line\nSecond line');
  });
});
