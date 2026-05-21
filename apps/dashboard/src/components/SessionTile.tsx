import React from 'react';
import { FreshnessChip, ViewerCountBadge } from './HeroStrip';
import {
  formatRelativeTime,
  sparklineBars,
  type NormalizedSession,
} from './sessionViewModel';

type SessionTileProps = {
  session: NormalizedSession;
  localMachine: string;
  restoreState?: 'idle' | 'restoring' | 'error';
  restoreError?: string;
  jumpDisabled?: boolean;
  jumpLabel?: string;
  onJump: (session: NormalizedSession) => void;
  onOpen: (session: NormalizedSession) => void;
};

const STATUS_LABELS: Record<NormalizedSession['status'], string> = {
  live: 'Live',
  'tmux-detached': 'Detached',
  'crash-recoverable': 'Recoverable',
  closed: 'Closed',
};

export function SessionTile({ session, localMachine, restoreState = 'idle', restoreError, jumpDisabled = false, jumpLabel = '↗ Jump', onJump, onOpen }: SessionTileProps) {
  const isLocal = Boolean(localMachine && session.machine === localMachine);
  const activities = session.summaryBullets.length > 0 ? session.summaryBullets : ['Summary pending'];

  return (
    <article className="session-tile" data-testid={`session-tile-${session.id}`}>
      <button
        type="button"
        className="session-tile-body"
        onClick={() => onOpen(session)}
        aria-label={`Open ${session.workspace} details`}
      >
        <div className="session-tile-topline">
          <span className={`status-dot status-${session.status}`} aria-hidden="true" />
          <span className="status-label">{STATUS_LABELS[session.status]}</span>
          {isLocal && <span className="local-star" aria-label="local machine">★</span>}
          <span className="machine-pill">{session.machine}</span>
        </div>
        <div className="session-title-row">
          <strong>{session.workspace}</strong>
          <span>{session.cwdBasename}</span>
        </div>
        <p className="cwd-line">{session.cwd}</p>
        <p className={`session-summary ${session.summaryOne ? '' : 'summary-skeleton'}`}>
          {session.summaryOne ?? 'Summary pending'}
        </p>
        <ul className="session-activities">
          {activities.slice(0, 5).map((activity) => (
            <li key={activity}>{activity}</li>
          ))}
        </ul>
        <div className="session-sparkline" aria-label={`${session.messageCount} messages`}>
          {sparklineBars(session).map((height, index) => (
            <span key={index} style={{ height }} />
          ))}
        </div>
      </button>

      <div className="session-meta-grid">
        <span>
          <strong>{session.messageCount}</strong>
          msgs
        </span>
        <span>
          <strong>{formatRelativeTime(session.lastActiveAt)}</strong>
          active
        </span>
        <span>
          <strong>{formatRelativeTime(session.launchedAt)}</strong>
          launched
        </span>
        <span>
          <strong>{session.tmuxName ?? 'none'}</strong>
          tmux
        </span>
        <span>
          <strong>{session.pid ? `${session.pid}${session.tty ? ` ${session.tty}` : ''}` : 'none'}</strong>
          pid / tty
        </span>
      </div>

      <div className="session-actions">
        <FreshnessChip state={session.summaryStale ? 'stale' : session.summaryOne ? 'fresh' : 'never'} />
        <ViewerCountBadge count={session.attachClients} />
        <button
          type="button"
          className="jump-button"
          disabled={restoreState === 'restoring' || jumpDisabled}
          onClick={() => onJump(session)}
          data-testid={`jump-${session.id}`}
        >
          {restoreState === 'restoring' ? 'Opening' : jumpLabel}
        </button>
      </div>
      {restoreError && <p className="restore-error" role="alert">{restoreError}</p>}
    </article>
  );
}
