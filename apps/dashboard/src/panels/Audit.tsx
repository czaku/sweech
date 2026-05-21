import React from 'react';
import { Card } from '@vykeai/vysual-react';
import { auditFixLabel, auditTone, safeTestId, type DashboardAuditFinding, type DashboardAuditState } from '../components/panelViewModel';

export function AuditPanel({ audit, onAuditFixed }: { audit: DashboardAuditState; onAuditFixed?: (profile: string, action: NonNullable<DashboardAuditFinding['fixAction']>) => void }) {
  const findings = [...(audit.findings ?? [])].sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.profile.localeCompare(b.profile));
  const [pending, setPending] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const fixFinding = async (finding: DashboardAuditFinding) => {
    if (!finding.fixAction) return;
    const key = `${finding.profile}:${finding.fixAction}`;
    setPending(key);
    setError(null);
    try {
      const res = await fetch('/dashboard/audit/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: finding.profile, action: finding.fixAction }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.reason || body.error || 'Fix failed');
      onAuditFixed?.(finding.profile, finding.fixAction);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(null);
    }
  };

  return (
    <Card className="panel data-panel audit-panel">
      <div className="panel-heading">
        <h2>Audit</h2>
        <span>{audit.totalIssues} issues · {audit.fixable} fixable</span>
      </div>
      <div className="audit-list">
        {findings.length === 0 ? (
          <p className="empty-state compact">No profile findings.</p>
        ) : findings.slice(0, 5).map((finding) => {
          const tone = auditTone(finding);
          const pendingKey = `${finding.profile}:${finding.fixAction}`;
          return (
            <div className="audit-row" data-testid={`audit-finding-${safeTestId(finding.profile)}-${safeTestId(finding.kind)}`} key={`${finding.profile}-${finding.kind}`}>
              <div>
                <strong>{finding.profile}</strong>
                <span>{finding.kind.replace(/_/g, ' ')}</span>
                <p>{finding.detail}</p>
              </div>
              <div className="row-actions">
                <span className={`pill pill-${tone}`}>{finding.severity}</span>
                {finding.fixAction ? (
                  <button
                    className="jump-button"
                    data-testid={`audit-fix-${safeTestId(finding.profile)}-${safeTestId(finding.kind)}`}
                    disabled={pending === pendingKey}
                    onClick={() => void fixFinding(finding)}
                    type="button"
                  >
                    {pending === pendingKey ? 'Fixing' : auditFixLabel(finding.fixAction)}
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      {error ? <p className="restore-error">{error}</p> : null}
    </Card>
  );
}

function severityRank(severity: string): number {
  if (severity === 'critical') return 3;
  if (severity === 'warn') return 2;
  return 1;
}
