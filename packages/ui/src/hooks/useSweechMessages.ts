import { useState, useCallback, useRef } from 'react'
import type { Message, MessageType } from '../types/index.js'

let _seq = 0
function nextId() { return `pm-${++_seq}-${Date.now()}` }

export interface PushOptions {
  stream?: boolean
  toolName?: string
  toolHint?: string
  isError?: boolean
  taskId?: string
}

export interface UseSweechMessagesReturn {
  messages: Message[]
  push: (type: MessageType, content: string, opts?: PushOptions) => void
  finalize: () => void
  clear: () => void
}

export function useSweechMessages(): UseSweechMessagesReturn {
  const [messages, setMessages] = useState<Message[]>([])
  const streamingId = useRef<string | null>(null)

  const push = useCallback((type: MessageType, content: string, opts: PushOptions = {}) => {
    const { stream = false, toolName, toolHint, isError, taskId } = opts
    setMessages((prev: Message[]) => {
      if (stream && streamingId.current) {
        const last = prev[prev.length - 1]
        if (last && last.id === streamingId.current && last.type === type) {
          return [...prev.slice(0, -1), { ...last, content: last.content + content }]
        }
      }
      const id = nextId()
      if (stream) streamingId.current = id
      return [...prev, { id, type, content, toolName, toolHint, isError, taskId }]
    })
  }, [])

  const finalize = useCallback(() => { streamingId.current = null }, [])
  const clear = useCallback(() => { setMessages([]); streamingId.current = null }, [])

  return { messages, push, finalize, clear }
}
