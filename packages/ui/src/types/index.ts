// Re-export core engine types so consumers only need @sweech/ui
export type { AgentEvent, ModelRunner, AgentRunner, RunOptions, TokenUsage, Provider, EngineId } from '@sweech/engine'
import {
  STREAM_PROTOCOL,
  STREAM_PROTOCOL_VERSION,
  STREAM_KIND_UI,
} from '@sweech/engine'
import type {
  ApprovalAction,
  ApprovalStage,
  OmnaiUiEvent,
  OmnaiUiStreamEnvelope,
  OmnaiSessionArchiveMessage,
  OmnaiSessionArchiveMessageType,
  OmnaiSessionArchiveSnapshot,
  OmnaiUnsupportedStreamEvent,
  QuestionOption,
} from '@sweech/engine'

export {
  STREAM_PROTOCOL,
  STREAM_PROTOCOL_VERSION,
  STREAM_KIND_UI,
} from '@sweech/engine'
export type {
  ApprovalAction,
  ApprovalStage,
  OmnaiUiEvent,
  OmnaiUiStreamEnvelope,
  OmnaiSessionArchiveMessage,
  OmnaiSessionArchiveMessageType,
  OmnaiSessionArchiveSnapshot,
  OmnaiUnsupportedStreamEvent,
  QuestionOption,
} from '@sweech/engine'

// ── Execution events (orchestrator → UI) ─────────────────────────────────────

export type OmnaiUIEvent = OmnaiUiEvent

export type OmnaiUIEventEnvelope = OmnaiUiStreamEnvelope

// ── Commands (UI → orchestrator) ─────────────────────────────────────────────

export type OmnaiUICommand =
  | { type: 'start' }
  | { type: 'stop' }
  | { type: 'approval_response'; taskId: string; action: ApprovalAction; hint?: string }
  | { type: 'question_response'; id: string; answer: string }
  | { type: 'user_message'; text: string }

// ── Approval ─────────────────────────────────────────────────────────────────

export interface ApprovalRequest {
  taskId: string
  title: string
  stage: ApprovalStage
  context?: string
  timeoutSec: number
}

// ── Question ─────────────────────────────────────────────────────────────────

export interface QuestionRequest {
  id: string
  question: string
  options?: QuestionOption[]
}

// ── Normalized message line (internal render model) ───────────────────────────

export type MessageType = OmnaiSessionArchiveMessageType

export interface Message extends OmnaiSessionArchiveMessage {}

// ── Cost summary ─────────────────────────────────────────────────────────────

export interface CostSummary {
  totalUsd: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  byModel: Record<string, number>
}

// ── Session state ─────────────────────────────────────────────────────────────

export type SessionStatus = 'idle' | 'running' | 'completed' | 'failed'

export interface SessionState {
  status: SessionStatus
  messages: Message[]
  approval: ApprovalRequest | null
  question: QuestionRequest | null
  cost: CostSummary | null
  startedAt: number | null
  error: string | null
  connected: boolean
}

export type SessionArchiveSnapshot = OmnaiSessionArchiveSnapshot<Message>

export interface SessionArchiveStore {
  save: (snapshots: SessionArchiveSnapshot[]) => void | Promise<void>
  load?: () => SessionArchiveSnapshot[] | Promise<SessionArchiveSnapshot[]>
  clear?: () => void | Promise<void>
}

export interface SessionRetentionPolicy {
  maxMessages?: number
  maxToolInvocations?: number
  maxContextSnapshots?: number
  preservePinnedMessages?: boolean
  archiveStore?: SessionArchiveStore
}
