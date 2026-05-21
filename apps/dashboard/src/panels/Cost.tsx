import React from 'react';
import { Card } from '@vykeai/vysual-react';
import { costSparklineBars, type DashboardCostState, formatUsd } from '../components/panelViewModel';

export function CostPanel({ cost }: { cost: DashboardCostState }) {
  const providers = [...(cost.providers ?? [])].sort((a, b) => b.spent7dUsd - a.spent7dUsd || b.estCostPerCallUsd - a.estCostPerCallUsd);
  return (
    <Card className="panel data-panel">
      <div className="panel-heading">
        <div>
          <h2>Cost</h2>
          <span>7-day spend and provider mix</span>
        </div>
      </div>
      <div className="cost-summary">
        <div>
          <span>Spent 7d</span>
          <strong>{formatUsd(cost.spent7dUsd ?? 0)}</strong>
        </div>
        <div>
          <span>Lowest / call</span>
          <strong>{formatUsd(cost.estCostPerCallUsd ?? 0)}</strong>
        </div>
      </div>
      <div className="cost-sparkline" data-testid="cost-sparkline-provider-mix" aria-label="7 day provider cost mix">
        {costSparklineBars(cost).map((height, index) => <span key={index} style={{ height }} />)}
      </div>
      <div className="provider-breakdown">
        {providers.length === 0 ? (
          <p>No provider spend yet.</p>
        ) : providers.slice(0, 5).map((provider) => (
          <div className="provider-row" data-testid={`cost-provider-${provider.provider}`} key={provider.provider}>
            <strong>{provider.provider}</strong>
            <span>{provider.profiles} profiles</span>
            <em>{formatUsd(provider.spent7dUsd)}</em>
          </div>
        ))}
      </div>
    </Card>
  );
}
