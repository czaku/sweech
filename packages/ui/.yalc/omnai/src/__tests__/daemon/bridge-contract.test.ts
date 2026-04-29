import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, clearEstateCache, setDaemonLifecycleState } from '../../daemon/server.js';
import type { ModelRunner } from '../../types.js';
import * as selectModule from '../../select.js';
import {
  STREAM_KIND_DAEMON,
  STREAM_KIND_UI,
  STREAM_PROTOCOL,
  STREAM_PROTOCOL_VERSION,
} from '../../stream-contract.js';
import { streamAgentEvents } from '../../../../ui/src/server/bridge.js';
import { parseOmnaiUIEvent } from '../../../../ui/src/utils/parse.js';

vi.mock('@vykeai/fed', () => ({
  FedEventClient: class { publish() { return Promise.resolve({}); } },
}));

vi.mock('../../detect.js', () => ({
  detectEngines: vi.fn().mockResolvedValue([
    { engine: 'claude-code', available: true, binaryPath: '/usr/bin/claude', providers: ['claude'] },
    { engine: 'codex', available: true, binaryPath: '/usr/bin/codex', providers: ['codex'] },
    { engine: 'pi-mono', available: true, binaryPath: '/usr/bin/pi', providers: ['openai'] },
  ]),
}));

vi.mock('../../select.js', async () => {
  const actual = await vi.importActual<typeof import('../../select.js')>('../../select.js');
  return {
    ...actual,
    makeRunner: vi.fn(),
  };
});

type RunnerEvent = Awaited<ReturnType<ModelRunner['run']>> extends AsyncGenerator<infer T> ? T : never;

function createMockRunner(engine: 'claude-code' | 'pi-mono' | 'copilot' | 'codex', events: RunnerEvent[]): ModelRunner {
  return {
    engine,
    async isAvailable() {
      return true;
    },
    async *run() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

function extractSseEnvelopes(raw: string): Array<Record<string, unknown>> {
  return raw
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);
}

describe('daemon bridge contract', () => {
  beforeEach(() => {
    clearEstateCache();
    setDaemonLifecycleState('ready');
    vi.restoreAllMocks();
  });

  it('preserves canonical daemon and UI stream envelopes across the run path', async () => {
    const app = createApp({
      estate: {
        version: 1,
        accounts: {
          'claude-rai': {
            provider: 'claude',
            engine: 'claude-code',
            type: 'subscription',
            configDir: '/Users/luke/.claude-rai',
          },
        },
        failoverOrder: ['claude-rai'],
      },
    });

    const runnerEvents: RunnerEvent[] = [
      { type: 'text', content: 'hello from runner' },
      {
        type: 'result',
        output: 'done',
        usage: { inputTokens: 10, outputTokens: 5 },
        costUsd: 0.01,
        durationMs: 50,
      },
    ];

    vi.spyOn(selectModule, 'makeRunner').mockReturnValueOnce(createMockRunner('claude-code', runnerEvents));

    const selectRes = await app.request('/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account: 'claude-rai' }),
    });
    expect(selectRes.status).toBe(200);
    expect(await selectRes.json()).toEqual({ engine: 'claude-code', account: 'claude-rai' });

    const runRes = await app.request('/run', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-request-id': 'request-123',
        'x-trace-id': 'trace-123',
      },
      body: JSON.stringify({ prompt: 'hello', account: 'claude-rai' }),
    });

    expect(runRes.status).toBe(200);
    const daemonFrames = extractSseEnvelopes(await runRes.text());

    expect(daemonFrames).toHaveLength(2);
    expect(daemonFrames.every((frame) => frame.schema === STREAM_PROTOCOL)).toBe(true);
    expect(daemonFrames.every((frame) => frame.version === STREAM_PROTOCOL_VERSION)).toBe(true);
    expect(daemonFrames.every((frame) => frame.kind === STREAM_KIND_DAEMON)).toBe(true);
    expect(daemonFrames.every((frame) => frame.requestId === 'request-123')).toBe(true);
    expect(daemonFrames.every((frame) => frame.traceId === 'trace-123')).toBe(true);
    expect(daemonFrames.every((frame) => frame.componentId === 'core.daemon.run')).toBe(true);
    expect(daemonFrames.every((frame) => typeof frame.correlationId === 'string')).toBe(true);
    expect(daemonFrames.map((frame) => frame.sequence)).toEqual([1, 2]);
    expect((daemonFrames[0]?.event as { type?: string } | undefined)?.type).toBe('text');
    expect(daemonFrames[1]?.event).toMatchObject({
      type: 'result',
      account: 'claude-rai',
      provider: 'claude',
    });

    const bridgeEvents = [];
    for await (const event of streamAgentEvents({
      runner: createMockRunner('claude-code', runnerEvents),
      prompt: 'hello',
      taskId: 'task-1',
      title: 'Bridge test',
    })) {
      const parsed = parseOmnaiUIEvent(JSON.stringify({
        schema: STREAM_PROTOCOL,
        version: STREAM_PROTOCOL_VERSION,
        kind: STREAM_KIND_UI,
        streamId: 'stream-1',
        requestId: 'request-bridge',
        traceId: 'trace-bridge',
        sequence: bridgeEvents.length + 1,
        severity: 'info',
        componentId: 'ui.bridge.sse',
        correlationId: 'stream-1',
        ts: '2026-04-03T10:00:00.000Z',
        event,
      }));
      bridgeEvents.push(parsed?.type);
    }

    expect(bridgeEvents).toEqual([
      'session_started',
      'task_started',
      'task_output',
      'cost_update',
      'task_completed',
      'session_completed',
    ]);
  });

  it('returns typed unsupported_event payloads on schema drift and bridge failure paths', async () => {
    const failingRunner: ModelRunner = {
      engine: 'codex',
      async isAvailable() {
        return true;
      },
      async *run() {
        throw new Error('bridge exploded');
      },
    };

    const observedTypes = [];
    for await (const event of streamAgentEvents({
      runner: failingRunner,
      prompt: 'fail',
      taskId: 'task-error',
      title: 'Bridge failure',
    })) {
      observedTypes.push(event.type);
    }

    expect(observedTypes).toEqual(['session_started', 'task_started', 'session_failed']);

    const unsupported = parseOmnaiUIEvent(JSON.stringify({
      schema: STREAM_PROTOCOL,
      version: 999,
      kind: STREAM_KIND_UI,
      streamId: 'stream-unsupported',
      ts: '2026-04-03T10:05:00.000Z',
      event: { type: 'session_started' },
    }));

    expect(unsupported).toMatchObject({
      type: 'unsupported_event',
      kind: 'unsupported_event',
      streamKind: STREAM_KIND_UI,
      reason: 'unsupported_envelope',
    });
  });

  it('applies readiness gating consistently to health and execution surfaces', async () => {
    const app = createApp();
    setDaemonLifecycleState('booting', 'warming');

    const healthRes = await app.request('/healthz');
    expect(healthRes.status).toBe(503);
    expect(await healthRes.json()).toMatchObject({
      ok: false,
      state: 'booting',
      reason: 'warming',
    });

    const selectRes = await app.request('/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'claude' }),
    });
    expect(selectRes.status).toBe(503);
    expect(await selectRes.json()).toMatchObject({
      ok: false,
      state: 'booting',
      reason: 'warming',
    });

    const runRes = await app.request('/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'blocked' }),
    });
    expect(runRes.status).toBe(503);
    expect(await runRes.json()).toMatchObject({
      ok: false,
      state: 'booting',
      reason: 'warming',
    });
  });
});
