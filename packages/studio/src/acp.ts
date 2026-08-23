import { randomUUID } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { Readable, Writable } from 'node:stream';
import * as acp from '@agentclientprotocol/sdk';
import { resolveProjectPath } from './security';
import { sha256 } from './checkpoints';
import type { AgentProfile, AgentTranscriptItem, PendingPermission } from './types';

export interface AcpMcpServer {
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
}

export interface AcpManagerCallbacks {
  onLifecycle(lifecycle: 'connecting' | 'ready' | 'running' | 'cancelling' | 'disconnected' | 'error', error?: string): void;
  onSession(sessionId: string | undefined): void;
  onTranscript(item: AgentTranscriptItem): void;
  writeFile(path: string, content: string, expectedSha256: string): string;
  /** Resolve with the chosen optionId, or with an unknown value to reject. */
  requestApproval(request: PendingPermission): Promise<string>;
}

function transcript(role: AgentTranscriptItem['role'], text: string, status?: AgentTranscriptItem['status'], eventId?: string): AgentTranscriptItem {
  return { id: randomUUID(), at: new Date().toISOString(), role, text, status, ...(eventId ? { eventId } : {}) };
}

function extractPaths(value: unknown, paths: string[] = []): string[] {
  if (!value || typeof value !== 'object') return paths;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if ((key === 'path' || key.endsWith('Path')) && typeof child === 'string') paths.push(child);
    else extractPaths(child, paths);
  }
  return paths;
}

export interface PermissionAssessment { outside: boolean; destructive: boolean }

export function assessPermission(params: acp.RequestPermissionRequest, projectRoot: string): PermissionAssessment {
  const description = JSON.stringify(params.toolCall);
  const destructive = /\b(delete|remove|erase|destroy|format|reset|force)\b/i.test(`${params.toolCall.title ?? ''} ${description}`);
  let outside = false;
  for (const path of extractPaths(params.toolCall)) {
    try { resolveProjectPath(projectRoot, path); } catch { outside = true; }
  }
  return { outside, destructive };
}

function pickOption(params: acp.RequestPermissionRequest, allow: boolean) {
  const kind = allow ? 'allow_once' : 'reject_once';
  const selected = params.options.find((option) => option.kind === kind)
    ?? params.options.find((option) => allow ? option.kind.startsWith('allow') : option.kind.startsWith('reject'))
    ?? params.options[0];
  if (!selected) throw new Error('ACP permission request did not provide any choices.');
  return selected;
}

function statusFromTool(value: string | null | undefined): AgentTranscriptItem['status'] {
  if (value === 'failed') return 'error';
  if (value === 'completed') return 'complete';
  return 'pending';
}

function transcriptFromUpdate(update: acp.SessionUpdate): AgentTranscriptItem | undefined {
  if (update.sessionUpdate === 'agent_message_chunk' && update.content.type === 'text') {
    return transcript('agent', update.content.text, 'pending', `agent:${update.messageId ?? 'stream'}`);
  }
  if (update.sessionUpdate === 'agent_thought_chunk' && update.content.type === 'text') {
    return transcript('system', update.content.text, 'pending', `thought:${update.messageId ?? 'stream'}`);
  }
  if (update.sessionUpdate === 'tool_call') {
    return transcript('tool', `${update.title}${update.status ? ` · ${update.status}` : ''}`, statusFromTool(update.status), `tool:${update.toolCallId}`);
  }
  if (update.sessionUpdate === 'tool_call_update') {
    return transcript('tool', `${update.title ?? `Tool ${update.toolCallId}`}${update.status ? ` · ${update.status}` : ' updated'}`, statusFromTool(update.status), `tool:${update.toolCallId}`);
  }
  if (update.sessionUpdate === 'plan') return transcript('system', `Plan received with ${update.entries.length} step${update.entries.length === 1 ? '' : 's'}.`, 'complete', 'plan');
  return;
}

async function startupRace<T>(operation: Promise<T>, exit: Promise<never>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      exit,
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(message)), timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class AcpManager {
  /** When true, non-destructive requests whose paths stay inside the project are approved without asking. */
  autoApproveSafe = true;
  private child?: ChildProcessWithoutNullStreams;
  private connection?: acp.ClientConnection;
  /**
   * The session is tracked by ID rather than through the SDK's `ActiveSession`,
   * whose constructor is private and which can only ever be produced by
   * `session/new`. Owning the ID is what allows `session/resume` to continue an
   * earlier conversation instead of always starting a fresh one.
   */
  private sessionIdValue?: string;
  private resumable = false;
  private profile?: AgentProfile;
  private modelId?: string;
  private readVersions = new Map<string, string>();
  private stderr = '';

  constructor(private readonly projectRoot: string, private readonly callbacks: AcpManagerCallbacks) {}

  get profileId() { return this.profile?.id; }
  get activeModelId() { return this.modelId; }
  get pid() { return this.child?.pid; }
  get sessionId() { return this.sessionIdValue; }
  get canResume() { return this.resumable; }

  async start(profile: AgentProfile, mcpServer?: AcpMcpServer, modelId?: string, resumeSessionId?: string): Promise<void> {
    if (this.sessionIdValue && this.profile?.id === profile.id && this.modelId === modelId) return;
    await this.stop();
    this.callbacks.onLifecycle('connecting');
    this.profile = profile;
    this.modelId = modelId;
    this.stderr = '';
    // Stable ACP v1 has no model negotiation, so the choice is applied to the
    // process itself. When agents ship v2 this becomes session/set_model and the
    // restart goes away.
    const args = modelId && profile.modelFlag ? [...profile.args, profile.modelFlag, modelId] : profile.args;
    const child = spawn(profile.command, args, {
      cwd: this.projectRoot,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    child.stderr.on('data', (chunk) => {
      this.stderr = `${this.stderr}${String(chunk)}`.slice(-8000);
    });
    const exit = new Promise<never>((_, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => reject(new Error(`ACP agent exited during startup (${signal ?? `code ${code}`}). ${this.stderr.trim()}`.trim())));
    });
    try {
      const stream = acp.ndJsonStream(
        Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
        Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
      );
      const app = acp.client({ name: 'openpresent-studio' })
        .onRequest(acp.methods.client.session.requestPermission, ({ params }) => this.handlePermission(params))
        .onRequest(acp.methods.client.fs.readTextFile, ({ params }) => this.readTextFile(params))
        .onRequest(acp.methods.client.fs.writeTextFile, ({ params }) => this.writeTextFile(params))
        // Updates arrive as notifications now that we own the session directly.
        .onNotification(acp.methods.client.session.update, ({ params }) => {
          if (params.sessionId !== this.sessionIdValue) return;
          const item = transcriptFromUpdate(params.update);
          if (item) this.callbacks.onTranscript(item);
        });
      const connection = app.connect(stream);
      this.connection = connection;
      const timeoutMs = profile.adapter ? 60_000 : 30_000;
      const initialized = await startupRace(
        connection.agent.request(acp.methods.agent.initialize, {
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
          clientInfo: { name: 'OpenPresent Studio', version: '0.3.0' },
        }),
        exit,
        timeoutMs,
        `ACP initialize timed out after ${timeoutMs / 1000} seconds. First adapter launch may need a network download; retry after confirming provider authentication.`,
      );
      // Agents answer with the version they will actually speak, which is the
      // lower of the two. Anything at or below what we offered is usable;
      // demanding equality would reject every agent the moment we offer a newer
      // version than they implement.
      if (initialized.protocolVersion > acp.PROTOCOL_VERSION) {
        throw new Error(`Agent negotiated ACP protocol version ${initialized.protocolVersion}, which is newer than this client supports (${acp.PROTOCOL_VERSION}).`);
      }
      // Stable ACP v1 identifies stdio MCP by its command/args/env shape; it
      // intentionally has no `type` discriminator (that field belongs to v2).
      const mcpServers = mcpServer ? [mcpServer] : [];
      this.resumable = Boolean(
        (initialized.agentCapabilities as { sessionCapabilities?: { resume?: unknown } } | undefined)?.sessionCapabilities?.resume,
      );

      let resumed = false;
      if (resumeSessionId && this.resumable) {
        try {
          await startupRace(
            connection.agent.request(acp.methods.agent.session.resume, { sessionId: resumeSessionId, cwd: this.projectRoot }),
            exit,
            timeoutMs,
            `ACP session resume timed out after ${timeoutMs / 1000} seconds.`,
          );
          this.sessionIdValue = resumeSessionId;
          resumed = true;
        } catch {
          // The agent may have expired or discarded the session; a fresh one is
          // always an acceptable outcome, so this is never fatal.
          resumed = false;
        }
      }

      if (!resumed) {
        const created = await startupRace<{ sessionId: string }>(
          connection.agent.request(acp.methods.agent.session.new, { cwd: this.projectRoot, mcpServers }) as Promise<{ sessionId: string }>,
          exit,
          timeoutMs,
          `ACP session start timed out after ${timeoutMs / 1000} seconds.`,
        );
        this.sessionIdValue = created.sessionId;
      }

      this.callbacks.onSession(this.sessionIdValue);
      this.callbacks.onLifecycle('ready');
      this.callbacks.onTranscript(transcript(
        'system',
        resumed
          ? `Resumed the previous ${profile.label} conversation over stable ACP v1.`
          : `Connected to ${profile.label} over stable ACP v1.`,
        'complete',
      ));
    } catch (error) {
      const raw = `${error instanceof Error ? error.message : String(error)}${this.stderr.trim() ? `\n${this.stderr.trim()}` : ''}`;
      const message = /authentication required/i.test(raw)
        ? `Authentication required for ${profile.label}. Sign in with the provider CLI, then retry.\n${raw}`
        : raw;
      this.callbacks.onLifecycle('error', message);
      await this.stop(false);
      throw new Error(`Could not start ${profile.label}. Confirm the command is installed and the agent is authenticated. ${message}`);
    }
  }

  async prompt(value: string, displayValue = value): Promise<acp.PromptResponse> {
    const sessionId = this.sessionIdValue;
    const connection = this.connection;
    if (!sessionId || !connection) throw new Error('No ACP session is ready. Select and start an agent first.');
    this.callbacks.onLifecycle('running');
    this.callbacks.onTranscript(transcript('user', displayValue, 'complete'));
    try {
      // Streaming arrives through the session/update handler registered at
      // connect, so the turn is just one request that settles with its reason.
      const response = await connection.agent.request(acp.methods.agent.session.prompt, {
        sessionId,
        prompt: [{ type: 'text', text: value }],
      });
      this.callbacks.onLifecycle('ready');
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.callbacks.onLifecycle('error', message);
      throw error;
    }
  }

  async cancel() {
    if (!this.sessionIdValue || !this.connection) throw new Error('There is no running ACP session to cancel.');
    this.callbacks.onLifecycle('cancelling');
    await this.connection.agent.notify(acp.methods.agent.session.cancel, { sessionId: this.sessionIdValue });
    this.callbacks.onTranscript(transcript('system', 'Cancellation sent to the local agent.', 'complete'));
  }

  async stop(report = true) {
    this.sessionIdValue = undefined;
    this.resumable = false;
    this.callbacks.onSession(undefined);
    this.connection?.close();
    this.connection = undefined;
    const child = this.child;
    this.child = undefined;
    if (child && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([
        new Promise<void>((resolve) => child.once('exit', () => resolve())),
        new Promise<void>((resolve) => setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); resolve(); }, 1200)),
      ]);
    }
    this.profile = undefined;
    this.modelId = undefined;
    this.readVersions.clear();
    if (report) this.callbacks.onLifecycle('disconnected');
  }

  private async handlePermission(params: acp.RequestPermissionRequest): Promise<acp.RequestPermissionResponse> {
    const { outside, destructive } = assessPermission(params, this.projectRoot);
    const title = params.toolCall.title ?? 'Agent tool call';
    if (outside) {
      const rejected = pickOption(params, false);
      this.callbacks.onTranscript(transcript('permission', `${title}: rejected because a proposed path leaves the project root.`, 'denied'));
      return { outcome: { outcome: 'selected', optionId: rejected.optionId } };
    }
    if (!destructive && this.autoApproveSafe) {
      const allowed = pickOption(params, true);
      const auto = allowed.kind.startsWith('allow');
      this.callbacks.onTranscript(transcript('permission', `${title}: ${auto ? 'allowed once inside the project boundary' : 'rejected because the agent offered no allow option'}.`, auto ? 'complete' : 'denied'));
      return { outcome: { outcome: 'selected', optionId: allowed.optionId } };
    }
    const request: PendingPermission = {
      id: randomUUID(),
      title,
      toolKind: typeof params.toolCall.kind === 'string' ? params.toolCall.kind : undefined,
      risk: destructive ? 'destructive' : 'safe',
      options: params.options.map(({ optionId, kind, name }) => ({ optionId, kind, name })),
      requestedAt: new Date().toISOString(),
    };
    const optionId = await this.callbacks.requestApproval(request);
    const selected = params.options.find((option) => option.optionId === optionId) ?? pickOption(params, false);
    const allowed = selected.kind.startsWith('allow');
    this.callbacks.onTranscript(transcript('permission', `${title}: ${allowed ? 'approved by you' : 'rejected by you'} (${selected.name}).`, allowed ? 'complete' : 'denied'));
    return { outcome: { outcome: 'selected', optionId: selected.optionId } };
  }

  private readTextFile(params: acp.ReadTextFileRequest): acp.ReadTextFileResponse {
    const path = resolveProjectPath(this.projectRoot, params.path, { mustExist: true });
    const content = readFileSync(path, 'utf8');
    this.readVersions.set(path, sha256(content));
    const lines = content.split('\n');
    const start = Math.max(0, (params.line ?? 1) - 1);
    const end = params.limit ? start + Math.max(0, params.limit) : lines.length;
    this.callbacks.onTranscript(transcript('tool', `Read ${relative(this.projectRoot, path)}.`, 'complete'));
    return { content: lines.slice(start, end).join('\n') };
  }

  private writeTextFile(params: acp.WriteTextFileRequest): acp.WriteTextFileResponse {
    const path = resolveProjectPath(this.projectRoot, params.path, { mustExist: true, editable: true });
    const expected = this.readVersions.get(path);
    if (!expected) throw new Error(`ACP write denied: ${relative(this.projectRoot, path)} must be read through the client before it can be written.`);
    const changed = this.callbacks.writeFile(path, params.content, expected);
    this.readVersions.set(path, sha256(params.content));
    this.callbacks.onTranscript(transcript('tool', `Wrote checkpointed source file ${changed}.`, 'complete'));
    return {};
  }
}
