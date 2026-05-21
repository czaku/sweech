import React from 'react';
import { Card } from '@vykeai/vysual-react';
import { FreshnessChip } from '../components/HeroStrip';
import {
  accountTokenStatus,
  type DashboardAccount,
  formatMessageWindow,
  freshnessFromTimestamp,
  utilizationPercent,
} from '../components/panelViewModel';

export function AccountsPanel({ accounts }: { accounts: DashboardAccount[] }) {
  const sorted = [...accounts].sort((a, b) => a.commandName.localeCompare(b.commandName));
  return (
    <Card className="panel data-panel">
      <div className="panel-heading">
        <div>
          <h2>Accounts</h2>
          <span>{sorted.length} usage windows</span>
        </div>
      </div>
      {sorted.length === 0 ? (
        <div className="empty-state compact">
          <strong>No accounts</strong>
          <p>Import or create an account to track limits.</p>
        </div>
      ) : (
        <div className="account-list">
          {sorted.slice(0, 5).map((account) => {
            const token = accountTokenStatus(account);
            return (
              <article className="account-card" data-testid={`account-card-${account.commandName}`} key={account.commandName}>
                <div className="account-card-top">
                  <div>
                    <strong>{account.commandName}</strong>
                    <span>{account.plan || account.provider || account.cliType}</span>
                  </div>
                  <span className={`pill pill-${token.tone}`} data-testid={`token-status-${account.commandName}`}>{token.label}</span>
                </div>
                <div className="freshness-row">
                  <FreshnessChip state={freshnessFromTimestamp(account.freshnessAt ?? account.lastActive)} />
                  <span>{account.resetLabel ? `${account.resetLabel} reset` : 'reset unknown'}</span>
                </div>
                <UsageBar testId={`usage-bar-${account.commandName}-5h`} label={formatMessageWindow(account.messages5h, '5h')} percent={utilizationPercent(account.utilization5h)} />
                <UsageBar testId={`usage-bar-${account.commandName}-7d`} label={formatMessageWindow(account.messages7d, '7d')} percent={utilizationPercent(account.utilization7d)} />
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function UsageBar({ label, percent, testId }: { label: string; percent: number; testId: string }) {
  return (
    <div className="usage-bar" data-testid={testId}>
      <div>
        <span>{label}</span>
        <strong>{percent}%</strong>
      </div>
      <span className="usage-track" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </span>
    </div>
  );
}
