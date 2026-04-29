import React from 'react'
import { MODEL_OPTIONS, getModelCapabilities } from '@sweech/engine'
import type { ModelOption } from '@sweech/engine'

export interface ModelSelectProps {
  value: string
  onChange: (modelId: string, caps: { supportsEffort: boolean; supportsThinking: boolean }) => void
  /** Subset of models to show. Defaults to MODEL_OPTIONS from sweech engine (all models). */
  models?: ModelOption[]
  /** If true, group options by provider with <optgroup> labels */
  grouped?: boolean
  style?: React.CSSProperties
  className?: string
}

const selectStyle: React.CSSProperties = {
  background: 'var(--sweech-surface)',
  border: '1px solid var(--sweech-pill-border, var(--sweech-border))',
  borderRadius: '8px',
  color: 'var(--sweech-text)',
  padding: '6px 10px',
  fontSize: '12px',
  cursor: 'pointer',
  outline: 'none',
}

export function ModelSelect({
  value,
  onChange,
  models = MODEL_OPTIONS,
  grouped = true,
  style,
  className,
}: ModelSelectProps) {
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value
    onChange(id, getModelCapabilities(id))
  }

  if (!grouped) {
    return (
      <select
        value={value}
        onChange={handleChange}
        style={{ ...selectStyle, ...style }}
        className={className}
      >
        {models.map(m => (
          <option key={m.id} value={m.id}>
            {m.label}{m.supportsThinking ? ' ◈' : ''}
          </option>
        ))}
      </select>
    )
  }

  const byProvider = new Map<string, ModelOption[]>()
  for (const m of models) {
    const group = byProvider.get(m.provider) ?? []
    group.push(m)
    byProvider.set(m.provider, group)
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      style={{ ...selectStyle, ...style }}
      className={className}
    >
      {Array.from(byProvider.entries()).map(([provider, opts]) => (
        <optgroup key={provider} label={provider}>
          {opts.map(m => (
            <option key={m.id} value={m.id}>
              {m.label}{m.supportsThinking ? ' ◈' : ''}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}
