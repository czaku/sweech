import React from 'react';
import { Card } from '@vykeai/vysual-react';
import { formatCooldownRemaining, safeTestId, type DashboardFailoverState } from '../components/panelViewModel';

export function FailoverPanel({ failover, onCooldownCleared }: { failover: DashboardFailoverState; onCooldownCleared?: (commandName: string) => void }) {
  const cooldowns = [...(failover.cooldowns ?? [])].sort((a, b) => a.minutesRemaining - b.minutesRemaining);
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const clear = async (commandName: string) => {
    setPending(commandName);
    setError(null);
    try {
      const res = await fetch(`/dashboard/failover/cooldowns/${encodeURIComponent(commandName)}`, { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || 'Clear failed');
      onCooldownCleared?.(commandName);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  };

  return (
    <Card className="panel data-panel failover-panel">
      <div className="panel-heading">
        <h2>Failover</h2>
        <span>{cooldowns.length} cooldowns</span>
      </div>
      <div className="cooldown-list">
        {cooldowns.length === 0 ? (
          <p className="empty-state compact">No active cooldowns.</p>
        ) : cooldowns.slice(0, 5).map((cooldown) => (
          <div className="cooldown-row" data-testid={`cooldown-row-${safeTestId(cooldown.commandName)}`} key={cooldown.commandName}>
            <div>
              <strong>{cooldown.commandName}</strong>
              <span>{cooldown.reason}</span>
            </div>
            <div className="row-actions">
              <span className="pill pill-warning">{formatCooldownRemaining(cooldown)}</span>
              <button
                className="jump-button"
                data-testid={`cooldown-clear-${safeTestId(cooldown.commandName)}`}
                disabled={pending === cooldown.commandName}
                onClick={() => void clear(cooldown.commandName)}
                type="button"
              >
                {pending === cooldown.commandName ? 'Clearing' : 'Clear'}
              </button>
            </div>
          </div>
        ))}
      </div>
      {error ? <p className="restore-error">{error}</p> : null}
    </Card>
  );
}
