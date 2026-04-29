import type {
  Message,
  SessionArchiveSnapshot,
  SessionRetentionPolicy,
} from '../types/index.js'
import {
  migrateSessionArchiveSnapshots,
  serializeSessionArchiveSnapshots,
} from '@sweech/engine'

export const DEFAULT_MAX_SESSION_MESSAGES = 200
export const DEFAULT_MAX_TOOL_INVOCATIONS = 100
export const DEFAULT_MAX_CONTEXT_SNAPSHOTS = 10

export interface NormalizedSessionRetentionPolicy {
  maxMessages: number
  maxToolInvocations: number
  maxContextSnapshots: number
  preservePinnedMessages: boolean
  archiveStore?: SessionRetentionPolicy['archiveStore']
}

export interface RetainedSessionMessages {
  messages: Message[]
  pruned: Message[]
}

function clampInteger(value: number | undefined, fallback: number, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(minimum, Math.floor(value))
}

function isToolMessage(message: Message): boolean {
  return message.type === 'tool_call' || message.type === 'tool_result'
}

function isProtectedMessage(message: Message, policy: NormalizedSessionRetentionPolicy): boolean {
  if (message.pinned) return true
  return policy.preservePinnedMessages && message.type === 'event' && !message.taskId
}

export function normalizeSessionRetentionPolicy(policy: SessionRetentionPolicy = {}): NormalizedSessionRetentionPolicy {
  return {
    maxMessages: clampInteger(policy.maxMessages, DEFAULT_MAX_SESSION_MESSAGES, 1),
    maxToolInvocations: clampInteger(policy.maxToolInvocations, DEFAULT_MAX_TOOL_INVOCATIONS),
    maxContextSnapshots: clampInteger(policy.maxContextSnapshots, DEFAULT_MAX_CONTEXT_SNAPSHOTS, 1),
    preservePinnedMessages: policy.preservePinnedMessages !== false,
    archiveStore: policy.archiveStore,
  }
}

export function retainSessionMessages(
  messages: Message[],
  policy?: SessionRetentionPolicy,
): RetainedSessionMessages {
  const normalized = normalizeSessionRetentionPolicy(policy)
  const keep = new Set<number>()
  let retainedMessages = 0
  let retainedToolInvocations = 0

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (isProtectedMessage(message, normalized)) {
      keep.add(index)
      continue
    }

    const toolMessage = isToolMessage(message)
    if (toolMessage && retainedToolInvocations >= normalized.maxToolInvocations) {
      continue
    }
    if (retainedMessages >= normalized.maxMessages) {
      continue
    }

    keep.add(index)
    retainedMessages += 1
    if (toolMessage) retainedToolInvocations += 1
  }

  const retained: Message[] = []
  const pruned: Message[] = []

  messages.forEach((message, index) => {
    if (keep.has(index)) {
      retained.push(message)
      return
    }
    pruned.push(message)
  })

  return { messages: retained, pruned }
}

function cloneSnapshot(snapshot: SessionArchiveSnapshot): SessionArchiveSnapshot {
  return {
    schemaVersion: snapshot.schemaVersion,
    createdAt: snapshot.createdAt,
    messages: snapshot.messages.map((message) => ({ ...message })),
  }
}

function isMessage(value: unknown): value is Message {
  return typeof value === 'object'
    && value !== null
    && 'id' in value
    && typeof value.id === 'string'
    && 'type' in value
    && typeof value.type === 'string'
    && 'content' in value
    && typeof value.content === 'string'
    && (!('taskId' in value) || value.taskId === undefined || typeof value.taskId === 'string')
    && (!('toolName' in value) || value.toolName === undefined || typeof value.toolName === 'string')
    && (!('toolHint' in value) || value.toolHint === undefined || typeof value.toolHint === 'string')
    && (!('isError' in value) || value.isError === undefined || typeof value.isError === 'boolean')
    && (!('pinned' in value) || value.pinned === undefined || typeof value.pinned === 'boolean')
    && (!('collapsed' in value) || value.collapsed === undefined || typeof value.collapsed === 'boolean')
    && (!('timestamp' in value) || value.timestamp === undefined || (typeof value.timestamp === 'number' && Number.isFinite(value.timestamp)))
}

export async function persistSessionArchiveSnapshots(
  policy: SessionRetentionPolicy | undefined,
  snapshots: SessionArchiveSnapshot[],
): Promise<void> {
  const normalized = normalizeSessionRetentionPolicy(policy)
  const store = normalized.archiveStore
  if (!store || snapshots.length === 0) return

  const existing = store.load
    ? migrateSessionArchiveSnapshots(await Promise.resolve(store.load()), isMessage, 'session archive store')
    : []
  const next = [...existing.map(cloneSnapshot), ...snapshots.map(cloneSnapshot)].slice(-normalized.maxContextSnapshots)
  await Promise.resolve(store.save(serializeSessionArchiveSnapshots(next)))
}

export async function rehydrateSessionArchive(policy: SessionRetentionPolicy | undefined): Promise<Message[]> {
  const store = policy?.archiveStore
  if (!store?.load) return []

  const snapshots = migrateSessionArchiveSnapshots(await Promise.resolve(store.load()), isMessage, 'session archive store')
  return snapshots.flatMap((snapshot) => snapshot.messages.map((message) => ({ ...message })))
}

export async function clearSessionArchive(policy: SessionRetentionPolicy | undefined): Promise<void> {
  const store = policy?.archiveStore
  if (!store) return
  if (store.clear) {
    await Promise.resolve(store.clear())
    return
  }
  await Promise.resolve(store.save([]))
}
