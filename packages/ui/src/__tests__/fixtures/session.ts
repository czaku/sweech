import type { Message, SessionArchiveSnapshot, SessionArchiveStore } from '../../types/index.js'

export function createMessage(index: number, overrides: Partial<Message> = {}): Message {
  return {
    id: `msg-${index}`,
    type: 'text',
    content: `message-${index}`,
    timestamp: index,
    ...overrides,
  }
}

export function createMessages(count: number, overrides: Partial<Message> = {}): Message[] {
  return Array.from({ length: count }, (_, index) => createMessage(index, overrides))
}

export class MemorySessionArchiveStore implements SessionArchiveStore {
  private snapshots: unknown = []

  save(snapshots: SessionArchiveSnapshot[]): void {
    this.snapshots = snapshots.map((snapshot) => ({
      schemaVersion: snapshot.schemaVersion,
      createdAt: snapshot.createdAt,
      messages: snapshot.messages.map((message) => ({ ...message })),
    }))
  }

  load(): SessionArchiveSnapshot[] {
    return Array.isArray(this.snapshots)
      ? this.snapshots.map((snapshot) => {
          const entry = snapshot as SessionArchiveSnapshot
          return {
            schemaVersion: entry.schemaVersion,
            createdAt: entry.createdAt,
            messages: entry.messages.map((message) => ({ ...message })),
          }
        })
      : []
  }

  seed(raw: unknown): void {
    this.snapshots = raw
  }

  clear(): void {
    this.snapshots = []
  }
}
