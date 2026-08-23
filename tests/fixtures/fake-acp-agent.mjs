#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import { Client as McpClient } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const from = option('--from', 'Original phrase');
const to = option('--to', 'Directed phrase');
const logPath = option('--log');
const destructive = process.argv.includes('--destructive');
const outside = process.argv.includes('--outside');
let cancelled = false;
let attachedClient;
let attachedTransport;

function record(event, value = {}) {
  if (logPath) appendFileSync(logPath, `${JSON.stringify({ event, ...value })}\n`);
}

function promptText(prompt) {
  return prompt.flatMap((block) => block.type === 'text' ? [block.text] : []).join('\n');
}

async function attachMcp(config, cwd) {
  if (!config || !('command' in config)) return;
  const env = { ...process.env, ...Object.fromEntries(config.env.map(({ name, value }) => [name, value])) };
  attachedTransport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env,
    cwd,
    stderr: 'pipe',
  });
  attachedClient = new McpClient({ name: 'openpresent-fake-acp', version: '1.0.0' });
  await attachedClient.connect(attachedTransport);
  const listed = await attachedClient.listTools();
  const state = await attachedClient.callTool({ name: 'get_state', arguments: {} });
  record('mcp-attached', { command: config.command, args: config.args, tools: listed.tools.map((tool) => tool.name), stateError: state.isError ?? false });
}

const app = acp.agent({ name: 'openpresent-fake-acp' })
  .onRequest(acp.methods.agent.initialize, ({ params }) => {
    record('initialize', { protocolVersion: params.protocolVersion });
    return {
      protocolVersion: acp.PROTOCOL_VERSION,
      agentCapabilities: {
        promptCapabilities: { image: false, audio: false, embeddedContext: true },
        sessionCapabilities: { resume: {} },
      },
      agentInfo: { name: 'OpenPresent deterministic fake agent', version: '1.0.0' },
    };
  })
  .onRequest(acp.methods.agent.session.resume, ({ params }) => {
    record('session-resume', { sessionId: params.sessionId, cwd: params.cwd });
    if (params.sessionId !== 'fake-session') throw new Error('unknown session');
    return {};
  })
  .onRequest(acp.methods.agent.session.new, async ({ params }) => {
    record('session-new', { cwd: params.cwd, mcpCount: params.mcpServers.length });
    await attachMcp(params.mcpServers[0], params.cwd);
    return { sessionId: 'fake-session' };
  })
  .onRequest(acp.methods.agent.session.prompt, async ({ params, client }) => {
    cancelled = false;
    const text = promptText(params.prompt);
    record('prompt', { text });
    await client.notify(acp.methods.client.session.update, {
      sessionId: params.sessionId,
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'I inspected the authoritative TSX and the selected slide context.' } },
    });
    if (text.includes('FAKE_CANCEL')) {
      while (!cancelled) await new Promise((resolve) => setTimeout(resolve, 20));
      await client.notify(acp.methods.client.session.update, {
        sessionId: params.sessionId,
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Cancelled cleanly.' } },
      });
      record('prompt-cancelled');
      return { stopReason: 'cancelled' };
    }

    const entryMatch = text.match(/^Authoritative deck entry: (.+)$/m);
    if (!entryMatch) throw new Error('Fake agent did not receive the authoritative deck entry.');
    const path = entryMatch[1].trim();
    const read = await client.request(acp.methods.client.fs.readTextFile, { sessionId: params.sessionId, path });
    if (!read.content.includes(from)) throw new Error(`Fake edit source phrase was not found: ${from}`);
    const permissionPath = outside ? '/tmp/openpresent-outside.tsx' : path;
    const permission = await client.request(acp.methods.client.session.requestPermission, {
      sessionId: params.sessionId,
      toolCall: {
        toolCallId: 'fake-edit',
        title: `${destructive ? 'Delete' : 'Edit'} ${permissionPath}`,
        kind: 'edit',
        status: 'pending',
        locations: [{ path: permissionPath }],
      },
      options: [
        { optionId: 'allow', name: 'Allow once', kind: 'allow_once' },
        { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
      ],
    });
    if (permission.outcome.outcome !== 'selected' || permission.outcome.optionId !== 'allow') {
      record('permission-denied', { destructive, outside });
      await client.notify(acp.methods.client.session.update, {
        sessionId: params.sessionId,
        update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'The client rejected the proposed unsafe action.' } },
      });
      return { stopReason: 'refusal' };
    }
    await client.notify(acp.methods.client.session.update, {
      sessionId: params.sessionId,
      update: { sessionUpdate: 'tool_call', toolCallId: 'fake-edit', title: `Editing ${path}`, kind: 'edit', status: 'in_progress', locations: [{ path }] },
    });
    await client.request(acp.methods.client.fs.writeTextFile, { sessionId: params.sessionId, path, content: read.content.replace(from, to) });
    await client.notify(acp.methods.client.session.update, {
      sessionId: params.sessionId,
      update: { sessionUpdate: 'tool_call_update', toolCallId: 'fake-edit', status: 'completed' },
    });
    await client.notify(acp.methods.client.session.update, {
      sessionId: params.sessionId,
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: `Changed “${from}” to “${to}” and returned control for validation.` } },
    });
    record('edit-complete', { path });
    return { stopReason: 'end_turn' };
  })
  .onNotification(acp.methods.agent.session.cancel, ({ params }) => {
    cancelled = true;
    record('cancel', { sessionId: params.sessionId });
  });

const stream = acp.ndJsonStream(
  Writable.toWeb(process.stdout),
  Readable.toWeb(process.stdin),
);
const connection = app.connect(stream);
await connection.closed;
await attachedClient?.close().catch(() => undefined);
await attachedTransport?.close().catch(() => undefined);
record('exit');
