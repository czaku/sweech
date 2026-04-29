import React from 'react'
import type { SessionStatus, CostSummary } from '../types/index.js'

export interface StatusBarProps {
  status: SessionStatus
  connected: boolean
  costSummary?: CostSummary | null
  startedAt?: number | null
  model?: string
}

export function StatusBar({ status, connected, costSummary, startedAt, model }: StatusBarProps) {
  const elapsedSec = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : null
  const fmtTime = (s: number) => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s` : s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
  const fmt = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)

  return (
    <div className={`sweech-status sweech-status--${status}`}>
      <span className={`sweech-status__dot sweech-status__dot--${connected ? 'connected' : 'disconnected'}`} />
      <span className="sweech-status__state">{status}</span>
      {model && <span className="sweech-status__model">{model}</span>}
      {elapsedSec !== null && status === 'running' && <span className="sweech-status__elapsed">{fmtTime(elapsedSec)}</span>}
      {costSummary && (
        <>
          <span className="sweech-status__sep">·</span>
          <span className="sweech-status__cost">${costSummary.totalUsd.toFixed(4)}</span>
          <span className="sweech-status__tokens">{fmt(costSummary.inputTokens + costSummary.outputTokens)} tokens</span>
        </>
      )}
      {!connected && <span className="sweech-status__offline">reconnecting…</span>}
    </div>
  )
}
