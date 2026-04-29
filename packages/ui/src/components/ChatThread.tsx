import React, { useRef, useEffect, useState, useMemo } from 'react'
import type { Message, CostSummary } from '../types/index.js'
import { MessageBubble } from './MessageBubble.js'

type FilterType = 'all' | 'prompt' | 'text' | 'tools' | 'events' | 'errors'

const FILTERS: { id: FilterType; label: string }[] = [
  { id: 'all',    label: 'All' },
  { id: 'prompt', label: 'Prompts' },
  { id: 'text',   label: 'Replies' },
  { id: 'tools',  label: 'Tools' },
  { id: 'events', label: 'Events' },
  { id: 'errors', label: 'Errors' },
]

function matchFilter(msg: Message, filter: FilterType): boolean {
  if (filter === 'all')    return true
  if (filter === 'prompt') return msg.type === 'prompt'
  if (filter === 'text')   return msg.type === 'text' || msg.type === 'success' || msg.type === 'thinking'
  if (filter === 'tools')  return msg.type === 'tool_call' || msg.type === 'tool_result'
  if (filter === 'events') return msg.type === 'event'
  if (filter === 'errors') return msg.type === 'error'
  return true
}

export interface ChatThreadProps {
  messages: Message[]
  failedTaskId?: string | null
  costSummary?: CostSummary | null
  startedAt?: number | null
  onClear?: () => void
  fill?: boolean
  hideFilters?: boolean
  maxMessages?: number
  emptyState?: React.ReactNode
}

export function ChatThread({
  messages,
  failedTaskId,
  costSummary,
  startedAt,
  onClear,
  fill = false,
  hideFilters = false,
  maxMessages = 600,
  emptyState,
}: ChatThreadProps) {
  const logRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useState<FilterType>('all')
  const [height, setHeight] = useState(380)
  const [collapsed, setCollapsed] = useState(false)
  const isDragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartH = useRef(0)
  const lastFailedId = useRef<string | null>(null)

  const errorCount = useMemo(() => messages.filter(m => m.type === 'error').length, [messages])

  const visible = useMemo(() => {
    const filtered = filter === 'all' ? messages : messages.filter(m => matchFilter(m, filter))
    return filtered.slice(-maxMessages)
  }, [messages, filter, maxMessages])

  useEffect(() => {
    if (!logRef.current || collapsed) return
    const el = logRef.current
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight
  }, [visible, collapsed])

  useEffect(() => {
    if (!failedTaskId || failedTaskId === lastFailedId.current) return
    lastFailedId.current = failedTaskId
    setCollapsed(false)
    requestAnimationFrame(() => {
      const el = logRef.current?.querySelector<HTMLElement>('.sweech-event--error')
      el ? el.scrollIntoView({ behavior: 'smooth', block: 'center' })
         : (logRef.current!.scrollTop = logRef.current!.scrollHeight)
    })
  }, [failedTaskId])

  function onMouseDown(e: React.MouseEvent) {
    isDragging.current = true
    dragStartY.current = e.clientY
    dragStartH.current = height
    e.preventDefault()
  }
  useEffect(() => {
    const onMove = (e: MouseEvent) => { if (!isDragging.current) return; setHeight(Math.max(60, Math.min(900, dragStartH.current + dragStartY.current - e.clientY))) }
    const onUp = () => { isDragging.current = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  const elapsedSec = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : null
  const fmtTime = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`

  return (
    <div className={`sweech-thread${collapsed && !fill ? ' sweech-thread--collapsed' : ''}${fill ? ' sweech-thread--fill' : ''}`} style={fill || collapsed ? undefined : { height }}>
      {!fill && <div className="sweech-resize-handle" onMouseDown={onMouseDown} />}
      {!hideFilters && (
        <div className="sweech-thread__header">
          <div className="sweech-thread__header-left">
            <span className="sweech-thread__title">Conversation</span>
            <span className="sweech-thread__count">{messages.length}</span>
            <div className="sweech-filters">
              {FILTERS.map(f => (
                <button key={f.id} className={`sweech-filter${filter === f.id ? ' sweech-filter--active' : ''}${f.id === 'errors' && errorCount > 0 ? ' sweech-filter--has-badge' : ''}`} onClick={() => setFilter(f.id)}>
                  {f.label}
                  {f.id === 'errors' && errorCount > 0 && <span className="sweech-filter__badge">{errorCount}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="sweech-thread__actions">
            {elapsedSec !== null && <span className="sweech-thread__elapsed">{fmtTime(elapsedSec)}</span>}
            {costSummary && <span className="sweech-thread__cost">${costSummary.totalUsd.toFixed(4)}</span>}
            {!fill && <button className="sweech-btn sweech-btn--ghost" onClick={() => setCollapsed(c => !c)}>{collapsed ? '▲' : '▼'}</button>}
            {onClear && <button className="sweech-btn sweech-btn--ghost" onClick={onClear}>Clear</button>}
          </div>
        </div>
      )}
      {!collapsed && (
        <div className="sweech-thread__body">
          <div className="sweech-thread__log" ref={logRef}>
            {visible.length === 0 && (
              <div className="sweech-thread__empty">
                {filter === 'all' && emptyState ? emptyState : filter === 'all' ? 'Waiting for output…' : `No ${filter} lines yet`}
              </div>
            )}
            {visible.map(msg => <MessageBubble key={msg.id} message={msg} />)}
          </div>
        </div>
      )}
    </div>
  )
}
