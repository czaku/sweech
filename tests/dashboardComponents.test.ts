/// <reference path="../apps/dashboard/src/types/react-shim.d.ts" />
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FreshnessChip, HeroStrip, ViewerCountBadge } from '../apps/dashboard/src/components/HeroStrip';
import {
  deriveHeroStats,
  formatUsd,
  freshnessChipCopy,
  viewerBadgeLabel,
} from '../apps/dashboard/src/components/heroStats';

describe('dashboard hero components', () => {
  const now = Date.UTC(2026, 4, 20, 12);

  test('deriveHeroStats counts live and recoverable sessions', () => {
    expect(deriveHeroStats([
      { status: 'live' },
      { status: 'live' },
      { status: 'tmux-detached' },
      { status: 'crash-recoverable' },
      { status: 'closed' },
    ], [], now)).toMatchObject({ liveCount: 2, recoverableCount: 1 });
  });

  test('deriveHeroStats sums only current-month positive session costs', () => {
    const stats = deriveHeroStats([
      { status: 'live', summaryCostUsd: 1.25, summaryAt: Date.UTC(2026, 4, 1) },
      { status: 'closed', summaryCostUsd: 0.75, launchedAt: Date.UTC(2026, 4, 2) },
      { status: 'closed', summaryCostUsd: 99, summaryAt: Date.UTC(2026, 3, 30) },
      { status: 'closed', summaryCostUsd: -5, summaryAt: Date.UTC(2026, 4, 3) },
    ], [], now);

    expect(stats.costMtdUsd).toBe(2);
  });

  test('deriveHeroStats counts warning and error doctor checks', () => {
    const stats = deriveHeroStats([], [
      { status: 'ok' },
      { status: 'warning' },
      { severity: 'error' },
      { ok: false },
    ], now);

    expect(stats.doctorIssueCount).toBe(3);
  });

  test('freshnessChipCopy exposes all R13 states', () => {
    expect(freshnessChipCopy('fresh').label).toBe('Fresh');
    expect(freshnessChipCopy('muted').label).toBe('Muted');
    expect(freshnessChipCopy('stale').label).toBe('Stale');
    expect(freshnessChipCopy('never').label).toBe('Never');
  });

  test('ViewerCountBadge hides for one or fewer viewers', () => {
    expect(renderToStaticMarkup(React.createElement(ViewerCountBadge, { count: 1 }))).toBe('');
    expect(viewerBadgeLabel(0)).toBeNull();
  });

  test('ViewerCountBadge renders plural count above one', () => {
    const html = renderToStaticMarkup(React.createElement(ViewerCountBadge, { count: 3 }));

    expect(html).toContain('viewer-count-badge');
    expect(html).toContain('3 viewers');
  });

  test('FreshnessChip renders state class and label', () => {
    const html = renderToStaticMarkup(React.createElement(FreshnessChip, { state: 'stale' }));

    expect(html).toContain('freshness-chip freshness-stale');
    expect(html).toContain('Stale');
    expect(html).toContain('Data needs a refresh');
  });

  test('HeroStrip renders live, recoverable, cost MTD, and doctor metrics', () => {
    const html = renderToStaticMarkup(React.createElement(HeroStrip, {
      connected: true,
      stats: { liveCount: 4, recoverableCount: 2, costMtdUsd: 3.5, doctorIssueCount: 1 },
    }));

    expect(html).toContain('Dashboard summary');
    expect(html).toContain('Doctor');
    expect(html).toContain('Live');
    expect(html).toContain('Recoverable');
    expect(html).toContain('Cost MTD');
    expect(html).toContain('$3.50');
    expect(html).toContain('streaming');
  });

  test('formatUsd always prints cents for dashboard metrics', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(12.5)).toBe('$12.50');
  });
});
