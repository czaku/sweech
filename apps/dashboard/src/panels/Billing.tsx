import React from 'react';
import { Card } from '@vykeai/vysual-react';
import { billingDayTone, safeTestId, type DashboardBillingState } from '../components/panelViewModel';

export function BillingPanel({ billing }: { billing: DashboardBillingState }) {
  const entries = [...(billing.entries ?? [])].sort((a, b) => (a.daysUntilNextBill ?? 9999) - (b.daysUntilNextBill ?? 9999));
  return (
    <Card className="panel data-panel billing-panel">
      <div className="panel-heading">
        <h2>Billing</h2>
        <span>30-day calendar</span>
      </div>
      <div className="billing-calendar" data-testid="billing-calendar">
        {(billing.days ?? []).slice(0, 30).map((day) => (
          <div className={`billing-day billing-day-${billingDayTone(day)}`} data-testid={`billing-day-${day.date}`} key={day.date}>
            <span>{day.date.slice(8, 10)}</span>
            {day.count > 0 ? <strong>{day.count}</strong> : null}
          </div>
        ))}
      </div>
      <div className="billing-list">
        {entries.length === 0 ? (
          <p className="empty-state compact">No billing days tracked.</p>
        ) : entries.slice(0, 4).map((entry) => (
          <div className="billing-row" data-testid={`billing-entry-${safeTestId(entry.vendor)}-${safeTestId(entry.email)}`} key={`${entry.vendor}-${entry.email}`}>
            <div>
              <strong>{entry.vendor}</strong>
              <span>{entry.email}</span>
            </div>
            <div className="row-actions">
              <span className="pill pill-muted">day {entry.billingDay ?? '?'}</span>
              <span>{entry.daysUntilNextBill === 0 ? 'today' : `${entry.daysUntilNextBill ?? '?'}d`}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
