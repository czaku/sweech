import React from 'react';
import { Card } from '@vykeai/vysual-react';
import { routeTone, safeTestId, type DashboardRouteCandidate, type DashboardRoutingState } from '../components/panelViewModel';

export function RoutingPanel({
  routing,
  onPinSet,
  onPinUnset,
}: {
  routing: DashboardRoutingState;
  onPinSet?: (candidate: DashboardRouteCandidate) => void;
  onPinUnset?: () => void;
}) {
  const selected = routing.selected;
  const candidates = [...(routing.candidates ?? [])];
  const pins = [...(routing.pins ?? [])];
  const pinnedProfile = routing.pin?.profile;
  return (
    <Card className="panel data-panel routing-panel">
      <div className="panel-heading">
        <h2>Routing</h2>
        <span>{routing.rejectedCount} rejected</span>
      </div>
      {routing.pin ? (
        <div className="routing-pin" data-testid="routing-pin-active">
          <div>
            <strong>{routing.pin.profile ?? routing.pin.cliType ?? 'Project pin'}</strong>
            <span>{routing.pin.projectRoot}</span>
          </div>
          {onPinUnset ? (
            <button type="button" className="jump-button" data-testid="routing-pin-unset" onClick={onPinUnset}>
              Unpin
            </button>
          ) : null}
        </div>
      ) : (
        <div className="routing-pin muted">
          <div>
            <strong>No project pin</strong>
            <span>Default route scoring is active.</span>
          </div>
        </div>
      )}
      <div className="routing-list" aria-label="Project pin mappings">
        {pins.length === 0 ? (
          <p className="empty-state compact">No active session cwd mappings.</p>
        ) : pins.map((pin) => (
          <div className="routing-row" data-testid={`routing-pin-map-${safeTestId(pin.cwd)}`} key={pin.cwd}>
            <div>
              <strong>{pin.workspace}</strong>
              <span>{pin.cwd}</span>
            </div>
            <div className="row-actions">
              <span className={`pill pill-${pin.pinned ? 'success' : 'muted'}`}>{pin.pinned ? (pin.profile ?? pin.cliType ?? 'pinned') : 'default'}</span>
              {pin.maxTier ? <span className="score-pill">{pin.maxTier}</span> : null}
            </div>
          </div>
        ))}
      </div>
      {selected ? (
        <div className="selected-route">
          <span>Selected</span>
          <strong>{selected.commandName}</strong>
          <em>{selected.provider}{selected.model ? ` · ${selected.model}` : ''}</em>
        </div>
      ) : null}
      <div className="routing-list">
        {candidates.length === 0 ? (
          <p className="empty-state compact">No route candidates.</p>
        ) : candidates.map((candidate) => (
          <div className="routing-row" data-testid={`routing-candidate-${safeTestId(candidate.commandName)}`} key={candidate.commandName}>
            <div>
              <strong>{candidate.commandName}</strong>
              <span>{candidate.cliType} · {candidate.provider}</span>
            </div>
            <div className="row-actions">
              <span className={`pill pill-${routeTone(candidate)}`}>{candidate.status}</span>
              <span className="score-pill">{candidate.score}</span>
              {onPinSet ? (
                <button
                  type="button"
                  className="jump-button"
                  data-testid={`routing-pin-set-${safeTestId(candidate.commandName)}`}
                  disabled={pinnedProfile === candidate.commandName}
                  onClick={() => onPinSet(candidate)}
                >
                  {pinnedProfile === candidate.commandName ? 'Pinned' : 'Pin'}
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
