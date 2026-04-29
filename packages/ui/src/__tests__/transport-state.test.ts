import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WEB_SESSION_RECONNECT_POLICY,
  getEnvelopeReplayKey,
  getReconnectDelayMs,
  isTerminalSessionEvent,
  registerReplayKey,
  resolveReconnectPolicy,
} from '../hooks/transport-state.js'

describe('transport-state helpers', () => {
  it('resolves reconnect policies with safe defaults', () => {
    expect(resolveReconnectPolicy()).toEqual(DEFAULT_WEB_SESSION_RECONNECT_POLICY)
    expect(resolveReconnectPolicy(false)).toMatchObject({ enabled: false })
    expect(resolveReconnectPolicy({ maxAttempts: 3, jitterMs: 0 })).toMatchObject({
      enabled: true,
      maxAttempts: 3,
      jitterMs: 0,
    })
  })

  it('computes bounded exponential reconnect delays', () => {
    const policy = resolveReconnectPolicy({ jitterMs: 100, maxDelayMs: 4000 })
    expect(getReconnectDelayMs(1, policy, 0)).toBe(1000)
    expect(getReconnectDelayMs(2, policy, 0)).toBe(2000)
    expect(getReconnectDelayMs(3, policy, 0)).toBe(4000)
    expect(getReconnectDelayMs(4, policy, 0.5)).toBe(4050)
  })

  it('deduplicates replayed envelopes with a bounded key window', () => {
    const first = registerReplayKey([], 'stream-1:1', 2)
    expect(first).toEqual({ duplicate: false, next: ['stream-1:1'] })

    const duplicate = registerReplayKey(first.next, 'stream-1:1', 2)
    expect(duplicate).toEqual({ duplicate: true, next: ['stream-1:1'] })

    const second = registerReplayKey(first.next, 'stream-1:2', 2)
    const third = registerReplayKey(second.next, 'stream-1:3', 2)
    expect(third.next).toEqual(['stream-1:2', 'stream-1:3'])
  })

  it('derives replay keys and terminal-session state from parsed envelopes', () => {
    expect(getEnvelopeReplayKey({ streamId: 'stream-2', sequence: 9 })).toBe('stream-2:9')
    expect(getEnvelopeReplayKey({ streamId: 'stream-2' })).toBeNull()
    expect(isTerminalSessionEvent({ type: 'session_completed', durationMs: 1 })).toBe(true)
    expect(isTerminalSessionEvent({ type: 'connection_lost' })).toBe(false)
  })
})
