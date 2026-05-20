import React from 'react';
import {
  type DashboardFreshnessState,
  type HeroStats,
  formatUsd,
  freshnessChipCopy,
  viewerBadgeLabel,
} from './heroStats';

export function HeroStrip({ connected, stats }: { connected: boolean; stats: HeroStats }) {
  return React.createElement(
    'section',
    { className: 'hero-strip', 'aria-label': 'Dashboard summary' },
    React.createElement(
      'div',
      null,
      React.createElement('p', { className: 'eyebrow' }, 'sweech control panel'),
      React.createElement('h1', null, 'Sessions, accounts, routing, and recovery'),
    ),
    React.createElement(Metric, {
      label: 'Doctor',
      value: String(stats.doctorIssueCount),
      detail: connected ? 'streaming' : 'waiting',
      tone: stats.doctorIssueCount > 0 ? 'warning' : 'success',
    }),
    React.createElement(Metric, { label: 'Live', value: String(stats.liveCount), detail: 'sessions' }),
    React.createElement(Metric, {
      label: 'Recoverable',
      value: String(stats.recoverableCount),
      detail: 'sessions',
      tone: stats.recoverableCount > 0 ? 'warning' : 'neutral',
    }),
    React.createElement(Metric, { label: 'Cost MTD', value: formatUsd(stats.costMtdUsd), detail: 'summary spend' }),
  );
}

export function FreshnessChip({ state }: { state: DashboardFreshnessState }) {
  const copy = freshnessChipCopy(state);
  return React.createElement(
    'span',
    {
      className: `freshness-chip freshness-${state}`,
      title: copy.title,
    },
    copy.label,
  );
}

export function ViewerCountBadge({ count }: { count: number }) {
  const label = viewerBadgeLabel(count);
  if (!label) return null;
  return React.createElement('span', { className: 'viewer-count-badge', title: label }, label);
}

function Metric({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'neutral' | 'success' | 'warning';
}) {
  return React.createElement(
    'div',
    { className: `metric metric-${tone}` },
    React.createElement('span', null, label),
    React.createElement('strong', null, value),
    React.createElement('small', null, detail),
  );
}
