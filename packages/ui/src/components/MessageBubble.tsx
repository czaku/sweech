import React, { useState } from 'react'
import type { Message } from '../types/index.js'

const TOOL_ICONS: Record<string, string> = {
  Write: '📝', Edit: '✏️', MultiEdit: '✏️', NotebookEdit: '📓',
  Bash: '💻', Read: '📖', Glob: '🔍', Grep: '🔎',
  WebFetch: '🌐', WebSearch: '🔎', Task: '🤖',
}
function toolIcon(name: string): string { return TOOL_ICONS[name] ?? '⚙️' }

function PromptBubble({ message }: { message: Message }) {
  const parts = message.content.split('\n')
  const title = parts[0].replace(/^\*\*|\*\*$/g, '')
  const body = parts.slice(1).join('\n').trim()
  return (
    <div className="sweech-row sweech-row--right">
      <div className="sweech-bubble sweech-bubble--prompt">
        <div className="sweech-bubble__label">Prompt</div>
        <div className="sweech-bubble__title">{title}</div>
        {body && <div className="sweech-bubble__body">{body}</div>}
      </div>
    </div>
  )
}

function ReplyBubble({ message }: { message: Message }) {
  return (
    <div className="sweech-row sweech-row--left">
      <div className={`sweech-bubble sweech-bubble--reply${message.type === 'success' ? ' sweech-bubble--success' : ''}`}>
        {message.taskId && <div className="sweech-bubble__label">[{message.taskId}]</div>}
        <div className="sweech-bubble__text">{message.content}</div>
      </div>
    </div>
  )
}

function ToolCallPill({ message }: { message: Message }) {
  const [open, setOpen] = useState(false)
  const icon = toolIcon(message.toolName ?? '')
  let formatted = message.content
  let hint = message.toolHint ?? ''
  try {
    const parsed = JSON.parse(message.content)
    if (!hint) hint = String(parsed.file_path ?? parsed.command ?? parsed.path ?? parsed.url ?? parsed.pattern ?? '')
    formatted = Object.entries(parsed).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n')
  } catch { /* keep raw */ }

  return (
    <div className="sweech-row sweech-row--center">
      <div className={`sweech-pill sweech-pill--tool${open ? ' sweech-pill--open' : ''}`} onClick={() => setOpen(o => !o)}>
        <span className="sweech-pill__icon">{icon}</span>
        <span className="sweech-pill__name">{message.toolName}</span>
        {hint && !open && <span className="sweech-pill__hint">{hint.length > 55 ? hint.slice(0, 55) + '…' : hint}</span>}
        {message.taskId && <span className="sweech-pill__task">[{message.taskId}]</span>}
        <span className="sweech-pill__chevron">{open ? '▲' : '▼'}</span>
      </div>
      {open && <div className="sweech-pill__body"><pre className="sweech-pre">{formatted}</pre></div>}
    </div>
  )
}

function ToolResultPill({ message }: { message: Message }) {
  const [open, setOpen] = useState(false)
  const preview = message.content.split('\n')[0].slice(0, 60)
  const lineCount = message.content.split('\n').length
  return (
    <div className="sweech-row sweech-row--center">
      <div className={`sweech-pill sweech-pill--result${message.isError ? ' sweech-pill--error' : ''}${open ? ' sweech-pill--open' : ''}`} onClick={() => setOpen(o => !o)}>
        <span className="sweech-pill__icon">{message.isError ? '✗' : '↩'}</span>
        <span className="sweech-pill__name">{message.toolName ? `${message.toolName} result` : 'Result'}</span>
        {!open && <span className="sweech-pill__hint">{preview}{lineCount > 1 ? ` …+${lineCount - 1} lines` : ''}</span>}
        <span className="sweech-pill__chevron">{open ? '▲' : '▼'}</span>
      </div>
      {open && <div className="sweech-pill__body"><pre className="sweech-pre">{message.content}</pre></div>}
    </div>
  )
}

function ThinkingBubble({ message }: { message: Message }) {
  const [open, setOpen] = useState(false)
  const lines = message.content.split('\n')
  const preview = lines[0].slice(0, 80) + (message.content.length > 80 ? '…' : '')
  return (
    <div className="sweech-row sweech-row--left">
      <div className={`sweech-thinking${open ? ' sweech-thinking--open' : ''}`}>
        <div className="sweech-thinking__header" onClick={() => setOpen(o => !o)}>
          <span className="sweech-thinking__icon">◈</span>
          <span className="sweech-thinking__label">Thinking</span>
          {!open && <span className="sweech-thinking__preview">{preview}</span>}
          <span className="sweech-thinking__chevron">{open ? '▲' : '▼'}</span>
        </div>
        {open && <pre className="sweech-thinking__body">{message.content}</pre>}
      </div>
    </div>
  )
}

function EventPill({ message }: { message: Message }) {
  return (
    <div className="sweech-row sweech-row--center">
      <div className={`sweech-event${message.type === 'error' ? ' sweech-event--error' : ''}`}>
        {message.taskId && <span className="sweech-pill__task">[{message.taskId}]</span>}
        <span>{message.content}</span>
      </div>
    </div>
  )
}

export interface MessageBubbleProps { message: Message }

export function MessageBubble({ message }: MessageBubbleProps) {
  switch (message.type) {
    case 'prompt':      return <PromptBubble message={message} />
    case 'text':        return <ReplyBubble message={message} />
    case 'success':     return <ReplyBubble message={message} />
    case 'tool_call':   return <ToolCallPill message={message} />
    case 'tool_result': return <ToolResultPill message={message} />
    case 'thinking':    return <ThinkingBubble message={message} />
    default:            return <EventPill message={message} />
  }
}
