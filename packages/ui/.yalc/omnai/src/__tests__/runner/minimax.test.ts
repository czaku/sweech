import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiniMaxRunner } from '../../runner/minimax.js';

function mockStreamResponse(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  let chunkIndex = 0;

  return new Response(
    new ReadableStream({
      pull(controller) {
        if (chunkIndex < chunks.length) {
          controller.enqueue(encoder.encode(chunks[chunkIndex]));
          chunkIndex++;
        } else {
          controller.close();
        }
      },
    }),
    {
      status,
      headers: { 'Content-Type': 'text/event-stream' },
    }
  );
}

describe('MiniMaxRunner', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('isAvailable returns true when API key is set', async () => {
    const runner = new MiniMaxRunner('test-key');
    expect(await runner.isAvailable()).toBe(true);
  });

  it('isAvailable returns false when API key is empty', async () => {
    const runner = new MiniMaxRunner('');
    expect(await runner.isAvailable()).toBe(false);
  });

  it('streams text content from Anthropic-style SSE', async () => {
    const chunks = [
      'data: {"type":"message_start","message":{"id":"msg_1","usage":{"input_tokens":12}}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello "}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"MiniMax"}}\n\n',
      'data: {"type":"message_delta","usage":{"output_tokens":6}}\n\n',
      'data: [DONE]\n\n',
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockStreamResponse(chunks));

    const runner = new MiniMaxRunner('test-key');
    const events = [];
    for await (const event of runner.run('test prompt', {})) {
      events.push(event);
    }

    const textEvents = events.filter(e => e.type === 'text');
    expect(textEvents).toHaveLength(2);
    expect(textEvents[0].type === 'text' && textEvents[0].content).toBe('Hello ');
    expect(textEvents[1].type === 'text' && textEvents[1].content).toBe('MiniMax');

    const result = events.find(e => e.type === 'result');
    expect(result).toBeDefined();
    expect(result!.type === 'result' && result!.output).toBe('Hello MiniMax');
    expect(result!.type === 'result' && result!.usage.inputTokens).toBe(12);
    expect(result!.type === 'result' && result!.usage.outputTokens).toBe(6);
  });

  it('handles thinking block before text block (reasoning model)', async () => {
    const chunks = [
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":"Reasoning step..."}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"More thinking"}}\n\n',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Final answer"}}\n\n',
      'data: [DONE]\n\n',
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockStreamResponse(chunks));

    const runner = new MiniMaxRunner('test-key');
    const events = [];
    for await (const event of runner.run('test', {})) {
      events.push(event);
    }

    const thinkingEvents = events.filter(e => e.type === 'thinking');
    expect(thinkingEvents).toHaveLength(2);
    expect(thinkingEvents[0].type === 'thinking' && thinkingEvents[0].content).toBe('Reasoning step...');
    expect(thinkingEvents[1].type === 'thinking' && thinkingEvents[1].content).toBe('More thinking');

    const textEvents = events.filter(e => e.type === 'text');
    expect(textEvents).toHaveLength(1);
    expect(textEvents[0].type === 'text' && textEvents[0].content).toBe('Final answer');
  });

  it('sends correct headers and URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockStreamResponse(['data: [DONE]\n\n'])
    );

    const runner = new MiniMaxRunner('mm-key');
    for await (const _ of runner.run('test', {})) {}

    const [url, reqInit] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.minimax.io/anthropic/v1/messages');
    const headers = reqInit!.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('mm-key');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  it('yields error on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Server Error', { status: 500 })
    );

    const runner = new MiniMaxRunner('test-key');
    const events = [];
    for await (const event of runner.run('test', {})) {
      events.push(event);
    }

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('error');
    expect(events[0].type === 'error' && events[0].message).toContain('500');
  });

  it('resolves model aliases', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockStreamResponse(['data: [DONE]\n\n'])
    );

    const runner = new MiniMaxRunner('test-key');
    for await (const _ of runner.run('test', { model: 'm2.5' })) {}

    const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
    expect(body.model).toBe('MiniMax-M2.5');
  });
});
