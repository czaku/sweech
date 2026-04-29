import { describe, expect, it, vi } from 'vitest'
import { initialWebSessionState, reduceWebSessionState } from '../hooks/web-session-state.js'

describe('web session state', () => {
  it('tracks stream lifecycle, approvals, questions, and cost updates', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-03T10:00:00Z'))

    let state = reduceWebSessionState(initialWebSessionState, {
      type: 'EVENT',
      event: { type: 'session_started' },
    })

    state = reduceWebSessionState(state, {
      type: 'EVENT',
      event: { type: 'task_started', taskId: 'task-1', title: 'Audit bridge', attempt: 1, maxAttempts: 2 },
    })
    state = reduceWebSessionState(state, {
      type: 'EVENT',
      event: { type: 'task_output', taskId: 'task-1', text: 'first line\nsecond line' },
    })
    state = reduceWebSessionState(state, {
      type: 'EVENT',
      event: {
        type: 'approval_requested',
        taskId: 'task-1',
        title: 'Approve shell command',
        stage: 'pre_task',
        context: 'needs shell access',
        timeoutSec: 30,
      },
    })
    state = reduceWebSessionState(state, {
      type: 'EVENT',
      event: {
        type: 'question_asked',
        id: 'question-1',
        question: 'Continue?',
        options: [
          { value: 'yes', label: 'Yes' },
          { value: 'no', label: 'No' },
        ],
      },
    })
    state = reduceWebSessionState(state, {
      type: 'EVENT',
      event: {
        type: 'cost_update',
        totalUsd: 1.25,
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 5,
        byModel: { 'gpt-5': 1.25 },
      },
    })

    expect(state.status).toBe('running')
    expect(state.startedAt).toBe(new Date('2026-04-03T10:00:00Z').getTime())
    expect(state.messages).toHaveLength(2)
    expect(state.messages[0]?.content).toContain('Task started: Audit bridge')
    expect(state.messages[1]?.content).toContain('first line')
    expect(state.messages[1]?.content).toContain('second line')
    expect(state.approval?.title).toBe('Approve shell command')
    expect(state.question?.id).toBe('question-1')
    expect(state.cost?.totalUsd).toBe(1.25)

    vi.useRealTimers()
  })

  it('captures tool results, failure states, connection transitions, and clear', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-03T10:05:00Z'))

    let state = reduceWebSessionState(initialWebSessionState, {
      type: 'CONNECTED',
      connected: true,
    })
    state = reduceWebSessionState(state, {
      type: 'EVENT',
      event: {
        type: 'task_tool_call',
        taskId: 'task-2',
        toolName: 'exec_command',
        toolInput: { cmd: 'pwd' },
      },
    })
    state = reduceWebSessionState(state, {
      type: 'EVENT',
      event: {
        type: 'task_tool_result',
        taskId: 'task-2',
        toolName: 'exec_command',
        content: 'output'.repeat(600),
        isError: true,
      },
    })
    state = reduceWebSessionState(state, {
      type: 'EVENT',
      event: {
        type: 'task_failed',
        taskId: 'task-2',
        title: 'Run command',
        error: 'permission denied',
        willRetry: true,
      },
    })
    state = reduceWebSessionState(state, {
      type: 'EVENT',
      event: { type: 'connection_lost' },
    })
    state = reduceWebSessionState(state, {
      type: 'EVENT',
      event: { type: 'connection_restored' },
    })

    expect(state.connected).toBe(true)
    expect(state.messages).toHaveLength(3)
    expect(state.messages[0]?.type).toBe('tool_call')
    expect(state.messages[1]?.type).toBe('tool_result')
    expect(state.messages[1]?.content.length).toBe(2000)
    expect(state.messages[1]?.isError).toBe(true)
    expect(state.messages[2]?.type).toBe('error')
    expect(state.messages[2]?.content).toContain('retrying')

    const cleared = reduceWebSessionState(state, { type: 'CLEAR' })
    expect(cleared).toEqual(initialWebSessionState)

    vi.useRealTimers()
  })
})
