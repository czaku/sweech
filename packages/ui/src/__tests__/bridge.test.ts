import type { ServerResponse } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import type { ModelRunner } from '../types/index.js'
import { handleAgentSse, streamAgentEvents } from '../server/bridge.js'

describe('streamAgentEvents', () => {
  it('emits canonical ui event variants for a runner session', async () => {
    const runner: ModelRunner = {
      engine: 'codex',
      async isAvailable() {
        return true
      },
      async *run() {
        yield { type: 'text', content: 'hello' } as const
        yield {
          type: 'result',
          output: 'done',
          usage: { inputTokens: 4, outputTokens: 2 },
          costUsd: 0.01,
          durationMs: 42,
        } as const
      },
    }

    const events = []
    for await (const event of streamAgentEvents({
      runner,
      prompt: 'hi',
      taskId: 'task-1',
      title: 'Agent',
    })) {
      events.push(event.type)
    }

    expect(events).toEqual([
      'session_started',
      'task_started',
      'task_output',
      'cost_update',
      'task_completed',
      'session_completed',
    ])
  })

  it('writes replay-safe sse envelopes with trace metadata', async () => {
    const runner: ModelRunner = {
      engine: 'codex',
      async isAvailable() {
        return true
      },
      async *run() {
        yield { type: 'text', content: 'hello' } as const
        yield {
          type: 'result',
          output: 'done',
          usage: { inputTokens: 4, outputTokens: 2 },
          costUsd: 0.01,
          durationMs: 42,
        } as const
      },
    }

    const writes: string[] = []
    const res = {
      writeHead: vi.fn(),
      write(chunk: string) {
        writes.push(String(chunk))
        return true
      },
      end: vi.fn(),
    } as unknown as ServerResponse

    await handleAgentSse(res, {
      runner,
      prompt: 'hi',
      taskId: 'task-1',
      streamId: 'stream-1',
      requestId: 'request-1',
      traceId: 'trace-1',
      correlationId: 'corr-1',
    })

    const raw = writes.join('')
    expect(raw).toContain('retry: 1000')
    expect(raw).toContain('id: 1')
    expect(raw).toContain('id: 6')

    const envelopes = raw
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>)

    expect(envelopes).toHaveLength(6)
    expect(envelopes.every((frame) => frame.traceId === 'trace-1')).toBe(true)
    expect(envelopes.every((frame) => frame.requestId === 'request-1')).toBe(true)
    expect(envelopes.every((frame) => frame.componentId === 'ui.bridge.sse')).toBe(true)
    expect(envelopes.map((frame) => frame.sequence)).toEqual([1, 2, 3, 4, 5, 6])
  })
})
