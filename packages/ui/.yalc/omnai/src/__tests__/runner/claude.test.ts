import { describe, expect, it, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: queryMock,
}));

import { ClaudeRunner } from '../../runner/claude.js';

describe('ClaudeRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats aborted SDK runs as graceful completion', async () => {
    queryMock.mockReturnValueOnce((async function* () {
      throw new Error('Operation aborted');
    })());

    const runner = new ClaudeRunner('/usr/local/bin/claude');
    const ac = new AbortController();
    ac.abort();

    const events = [];
    for await (const event of runner.run('ignored', { cwd: '/tmp', abortSignal: ac.signal })) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect((events[0] as any).type).toBe('result');
    expect((events[0] as any).output).toBe('');
  });

  it('still throws non-abort SDK errors', async () => {
    queryMock.mockReturnValueOnce((async function* () {
      throw new Error('unexpected failure');
    })());

    const runner = new ClaudeRunner('/usr/local/bin/claude');

    await expect(async () => {
      for await (const _event of runner.run('ignored', { cwd: '/tmp' })) {
        // no-op
      }
    }).rejects.toThrow('unexpected failure');
  });

  it('does not register process-level exception listeners', async () => {
    const prependSpy = vi.spyOn(process, 'prependListener');
    const removeSpy = vi.spyOn(process, 'removeListener');

    queryMock.mockReturnValueOnce((async function* () {
      yield {
        type: 'assistant',
        message: {
          content: [{ type: 'text', text: 'done' }],
        },
      };
      yield {
        type: 'result',
        total_cost_usd: 0,
        usage: { input_tokens: 1, output_tokens: 2 },
      };
    })());

    const runner = new ClaudeRunner('/usr/local/bin/claude');
    const events = [];
    for await (const event of runner.run('ignored', { cwd: '/tmp' })) {
      events.push(event);
    }

    expect(prependSpy).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();
    expect(events.some(event => event.type === 'result')).toBe(true);
  });
});
