import React, { useEffect, useState } from 'react'
import type { ClaudeAccountInfo } from '@sweech/engine'

export interface UsageBarProps {
  /** Pre-fetched account info. If not provided, will attempt to fetch via /api/usage. */
  accounts?: ClaudeAccountInfo[]
  /** Fetch URL for account info JSON (default: '/api/sweech/usage'). Used only if accounts not provided. */
  fetchUrl?: string
  /** Poll interval in ms. 0 = no polling. Default: 60000 (1 min). */
  pollInterval?: number
  /** Show as collapsed pill by default */
  collapsed?: boolean
}

function pct(v?: number) {
  if (v === undefined) return null
  return Math.round(v * 100)
}

function countdown(secs?: number): string {
  if (!secs) return '—'
  const diff = secs - Math.floor(Date.now() / 1000)
  if (diff <= 0) return 'now'
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function Bar({ value, label, resetAt }: { value?: number; label: string; resetAt?: number }) {
  const pctVal = pct(value)
  const colorClass =
    pctVal === null ? 'sweech-usage__bar--unknown'
    : pctVal >= 90 ? 'sweech-usage__bar--critical'
    : pctVal >= 70 ? 'sweech-usage__bar--warning'
    : 'sweech-usage__bar--ok'

  return (
    <div className="sweech-usage__row">
      <span className="sweech-usage__row-label">{label}</span>
      <div className={`sweech-usage__track ${colorClass}`}>
        <div
          className="sweech-usage__fill"
          style={{ width: pctVal !== null ? `${pctVal}%` : '0%' }}
        />
      </div>
      <span className="sweech-usage__pct">{pctVal !== null ? `${pctVal}%` : '—'}</span>
      {resetAt && (
        <span className="sweech-usage__reset">resets {countdown(resetAt)}</span>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status?: string }) {
  if (!status) return null
  const cls =
    status === 'allowed' ? 'sweech-usage__badge--ok'
    : status === 'allowed_warning' ? 'sweech-usage__badge--warning'
    : 'sweech-usage__badge--critical'
  const label =
    status === 'allowed' ? 'OK'
    : status === 'allowed_warning' ? 'Warning'
    : 'Rejected'
  return <span className={`sweech-usage__badge ${cls}`}>{label}</span>
}

function AccountPanel({ a }: { a: ClaudeAccountInfo }) {
  const label = a.displayName ?? a.commandName
  const hasLive = !!a.live

  return (
    <div className="sweech-usage__account">
      <div className="sweech-usage__account-header">
        <span className="sweech-usage__account-name">{label}</span>
        {a.billingType && <span className="sweech-usage__plan">{a.billingType}</span>}
        {hasLive && <StatusBadge status={a.live?.status} />}
      </div>

      {hasLive ? (
        <div className="sweech-usage__bars">
          <Bar value={a.live?.utilization5h} label="5h" resetAt={a.live?.reset5hAt} />
          <Bar value={a.live?.utilization7d} label="7d" resetAt={a.live?.reset7dAt} />
        </div>
      ) : (
        <div className="sweech-usage__bars">
          <div className="sweech-usage__row">
            <span className="sweech-usage__row-label">5h</span>
            <span className="sweech-usage__msg-count">{a.messages5h} msgs</span>
            {a.minutesUntilFirstCapacity !== undefined && (
              <span className="sweech-usage__reset">slot opens in {a.minutesUntilFirstCapacity}m</span>
            )}
          </div>
          <div className="sweech-usage__row">
            <span className="sweech-usage__row-label">7d</span>
            <span className="sweech-usage__msg-count">{a.messages7d} msgs</span>
            {a.hoursUntilWeeklyReset !== undefined && (
              <span className="sweech-usage__reset">resets in {a.hoursUntilWeeklyReset}h</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function UsageBar({ accounts: propAccounts, fetchUrl = '/api/sweech/usage', pollInterval = 60_000, collapsed: initCollapsed = true }: UsageBarProps) {
  const [accounts, setAccounts] = useState<ClaudeAccountInfo[]>(propAccounts ?? [])
  const [open, setOpen] = useState(!initCollapsed)
  const [tick, setTick] = useState(0) // for countdown re-render

  useEffect(() => {
    if (propAccounts) { setAccounts(propAccounts); return }
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(fetchUrl)
        if (!res.ok) return
        const data = await res.json() as ClaudeAccountInfo[]
        if (!cancelled) setAccounts(data)
      } catch { /* ignore */ }
    }
    load()
    if (pollInterval > 0) {
      const id = setInterval(load, pollInterval)
      return () => { cancelled = true; clearInterval(id) }
    }
    return () => { cancelled = true }
  }, [propAccounts, fetchUrl, pollInterval])

  // Re-render countdown every 30s
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  if (accounts.length === 0) return null

  const primary = accounts[0]
  const hasCritical = accounts.some(a => a.live?.status === 'rejected')
  const hasWarning = accounts.some(a => a.live?.status === 'allowed_warning')
  const pillCls = hasCritical
    ? 'sweech-usage__pill--critical'
    : hasWarning
    ? 'sweech-usage__pill--warning'
    : 'sweech-usage__pill--ok'

  // Pill summary: show primary account 5h pct if live, else message count
  const summaryText = primary.live?.utilization5h !== undefined
    ? `${Math.round(primary.live.utilization5h * 100)}% used`
    : `${primary.messages5h} / 5h`

  return (
    <div className="sweech-usage" data-tick={tick}>
      <button className={`sweech-usage__pill ${pillCls}`} onClick={() => setOpen(o => !o)} type="button">
        <span className="sweech-usage__pill-icon">◑</span>
        <span className="sweech-usage__pill-text">{summaryText}</span>
        <span className="sweech-usage__pill-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="sweech-usage__panel">
          {accounts.map(a => (
            <AccountPanel key={a.commandName} a={a} />
          ))}
        </div>
      )}
    </div>
  )
}
