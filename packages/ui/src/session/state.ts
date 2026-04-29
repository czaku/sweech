import type {
  Message,
  SessionArchiveSnapshot,
  SessionRetentionPolicy,
  SessionState,
} from '../types/index.js'
import { retainSessionMessages } from './retention.js'

export interface OmnaiSessionStateInternal extends SessionState {
  pendingArchive: SessionArchiveSnapshot[]
}

export type OmnaiSessionStateAction =
  | { type: 'STARTED' }
  | { type: 'MESSAGES'; messages: Message[]; retention?: SessionRetentionPolicy }
  | { type: 'COST'; inputTokens: number; outputTokens: number; costUsd: number }
  | { type: 'COMPLETED' }
  | { type: 'FAILED'; error: string }
  | { type: 'CLEAR' }
  | { type: 'ARCHIVE_FLUSHED'; count: number }
  | { type: 'REHYDRATED'; messages: Message[]; retention?: SessionRetentionPolicy }

export const initialOmnaiSessionStateInternal: OmnaiSessionStateInternal = {
  status: 'idle',
  messages: [],
  approval: null,
  question: null,
  cost: null,
  startedAt: null,
  error: null,
  connected: true,
  pendingArchive: [],
}

function appendMessages(
  state: OmnaiSessionStateInternal,
  nextMessages: Message[],
  retention?: SessionRetentionPolicy,
): OmnaiSessionStateInternal {
  if (nextMessages.length === 0) return state

  const retained = retainSessionMessages([...state.messages, ...nextMessages], retention)
  const nextPendingArchive = retained.pruned.length > 0
    ? [
        ...state.pendingArchive,
        {
          schemaVersion: 2 as const,
          createdAt: Date.now(),
          messages: retained.pruned,
        },
      ]
    : state.pendingArchive

  return {
    ...state,
    messages: retained.messages,
    pendingArchive: nextPendingArchive,
  }
}

function prependMessages(
  state: OmnaiSessionStateInternal,
  archivedMessages: Message[],
  retention?: SessionRetentionPolicy,
): OmnaiSessionStateInternal {
  if (archivedMessages.length === 0) return state

  const retained = retainSessionMessages([...archivedMessages, ...state.messages], retention)
  const nextPendingArchive = retained.pruned.length > 0
    ? [
        ...state.pendingArchive,
        {
          schemaVersion: 2 as const,
          createdAt: Date.now(),
          messages: retained.pruned,
        },
      ]
    : state.pendingArchive

  return {
    ...state,
    messages: retained.messages,
    pendingArchive: nextPendingArchive,
  }
}

export function reduceOmnaiSessionState(
  state: OmnaiSessionStateInternal,
  action: OmnaiSessionStateAction,
): OmnaiSessionStateInternal {
  switch (action.type) {
    case 'STARTED':
      return { ...state, status: 'running', startedAt: Date.now(), error: null }
    case 'MESSAGES':
      return appendMessages(state, action.messages, action.retention)
    case 'COST':
      return {
        ...state,
        cost: {
          totalUsd: action.costUsd,
          inputTokens: action.inputTokens,
          outputTokens: action.outputTokens,
          cacheReadTokens: state.cost?.cacheReadTokens ?? 0,
          byModel: state.cost?.byModel ?? {},
        },
      }
    case 'COMPLETED':
      return { ...state, status: 'completed' }
    case 'FAILED':
      return { ...state, status: 'failed', error: action.error }
    case 'CLEAR':
      return { ...initialOmnaiSessionStateInternal }
    case 'ARCHIVE_FLUSHED':
      if (action.count <= 0) return state
      return {
        ...state,
        pendingArchive: state.pendingArchive.slice(action.count),
      }
    case 'REHYDRATED':
      return prependMessages(state, action.messages, action.retention)
    default:
      return state
  }
}

export function toPublicSessionState(state: OmnaiSessionStateInternal): SessionState {
  const { pendingArchive, ...session } = state
  return session
}
