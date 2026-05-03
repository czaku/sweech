#!/usr/bin/env node
// T-LU-859 — Live e2e probe for the sweech daemon tier-routing fail-loud
// behavior. Spawns the daemon's request handler in-process (no port
// binding, no daemon-restart side effect on the live machine), preloads
// a providers config with ONLY subscription accounts, and asserts that
// `tier: 'cheap'` (which maps to the api-key account type) returns a
// structured 503 no-engine-for-tier instead of silently routing to the
// subscription account.
//
// Usage:
//   bun run scripts/probe-tier-fail-loud.ts
// or
//   node --experimental-strip-types scripts/probe-tier-fail-loud.ts
//
// Exit codes: 0 = expected 503 returned; 1 = silent fallback observed
// (the bug T-LU-859 fixes); 2 = transport error.

import { createApp, preloadEstate, setDaemonLifecycleState, preloadProviders } from '../src/daemon/server.js'

interface ProbeResult {
  ok: boolean
  reason: string
  status: number
  body: unknown
  expected: number
  rttMs: number
}

async function runProbe(): Promise<ProbeResult> {
  // Estate has only a subscription account — no api-key candidate.
  const estate = {
    version: 1 as const,
    accounts: {
      'claude-pole': { provider: 'claude', engine: 'claude-code' as const, type: 'subscription' as const },
    },
    failoverOrder: ['claude-pole'],
  }
  preloadEstate(estate)
  preloadProviders({
    version: 1,
    accounts: {
      'claude-pole': { provider: 'claude', engine: 'claude-code', type: 'subscription', enabled: true },
    },
    failoverOrder: ['claude-pole'],
  })
  setDaemonLifecycleState('ready')

  const app = createApp()
  const startedAt = Date.now()
  const res = await app.request('/select', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tier: 'cheap' }),
  })
  const rttMs = Date.now() - startedAt
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null

  if (res.status === 503 && body && body.code === 'no-engine-for-tier') {
    return { ok: true, reason: 'fail-loud (T-LU-859 fix in effect)', status: 503, body, expected: 503, rttMs }
  }
  return {
    ok: false,
    reason:
      res.status === 200
        ? 'silent fallback to non-tier account — T-LU-859 regression returned'
        : `unexpected status ${res.status}`,
    status: res.status,
    body,
    expected: 503,
    rttMs,
  }
}

const result = await runProbe()
console.log(JSON.stringify({ source: 'sweech.tier.probe', task: 'T-LU-859', ...result }))
process.exit(result.ok ? 0 : 1)
