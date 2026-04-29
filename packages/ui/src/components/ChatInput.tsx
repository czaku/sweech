import React, { useState, useRef } from 'react'

const EFFORT_OPTIONS = [
  { id: 'low',    label: 'Low' },
  { id: 'medium', label: 'Normal' },
  { id: 'high',   label: 'High' },
  { id: 'max',    label: 'Max' },
]

const THINKING_OPTIONS = [
  { id: 'off',     label: 'Off' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'low',     label: 'Low' },
  { id: 'medium',  label: 'Medium' },
  { id: 'high',    label: 'High' },
  { id: 'xhigh',   label: 'Extended' },
]

export interface ChatInputProps {
  onSubmit: (text: string) => void
  placeholder?: string
  disabled?: boolean
  showButton?: boolean
  effort?: string
  onEffortChange?: (v: string) => void
  thinking?: string
  onThinkingChange?: (v: string) => void
  supportsEffort?: boolean
  supportsThinking?: boolean
}

export function ChatInput({
  onSubmit,
  placeholder = 'Message…',
  disabled = false,
  showButton = true,
  effort = 'medium',
  onEffortChange,
  thinking = 'off',
  onThinkingChange,
  supportsEffort = false,
  supportsThinking = false,
}: ChatInputProps) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  function submit() {
    const text = value.trim()
    if (!text || disabled) return
    onSubmit(text)
    setValue('')
    ref.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  const showControls = supportsEffort || supportsThinking

  return (
    <div className="sweech-input">
      {showControls && (
        <div className="sweech-input__controls">
          {supportsEffort && onEffortChange && (
            <div className="sweech-input__control">
              <span className="sweech-input__control-label">Effort</span>
              <div className="sweech-input__chips">
                {EFFORT_OPTIONS.map(o => (
                  <button
                    key={o.id}
                    type="button"
                    className={`sweech-chip${effort === o.id ? ' sweech-chip--active' : ''}`}
                    onClick={() => onEffortChange(o.id)}
                    disabled={disabled}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          {supportsThinking && onThinkingChange && (
            <div className="sweech-input__control">
              <span className="sweech-input__control-label">Thinking</span>
              <div className="sweech-input__chips">
                {THINKING_OPTIONS.map(o => (
                  <button
                    key={o.id}
                    type="button"
                    className={`sweech-chip${thinking === o.id ? ' sweech-chip--active' : ''}${o.id !== 'off' && thinking !== 'off' && thinking === o.id ? ' sweech-chip--active-thinking' : ''}`}
                    onClick={() => onThinkingChange(o.id)}
                    disabled={disabled}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="sweech-input__row">
        <textarea
          ref={ref}
          className="sweech-input__textarea"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
        />
        {showButton && (
          <button
            className="sweech-btn sweech-btn--primary sweech-input__send"
            onClick={submit}
            disabled={disabled || !value.trim()}
          >
            Send
          </button>
        )}
      </div>
    </div>
  )
}
