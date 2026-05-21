import React from 'react';
import { Card } from '@vykeai/vysual-react';
import { type DashboardWorkspace, formatWorkspaceLastUsed, workspaceStatus } from '../components/panelViewModel';

export function WorkspacesPanel({
  workspaces,
  onWorkspaceSaved,
}: {
  workspaces: DashboardWorkspace[];
  onWorkspaceSaved?: (workspace: DashboardWorkspace) => void;
}) {
  const [editing, setEditing] = React.useState<DashboardWorkspace | null>(null);
  const sorted = [...workspaces].sort((a, b) => Number(Boolean(a.hidden || a.disabled)) - Number(Boolean(b.hidden || b.disabled)) || a.commandName.localeCompare(b.commandName));
  return (
    <>
      <Card className="panel data-panel">
        <div className="panel-heading">
          <div>
            <h2>Workspaces</h2>
            <span>{sorted.length} configured profiles</span>
          </div>
        </div>
        {sorted.length === 0 ? (
          <div className="empty-state compact">
            <strong>No workspaces</strong>
            <p>Create a profile to see launch health here.</p>
          </div>
        ) : (
          <div className="workspace-card-grid">
            {sorted.map((workspace) => {
              const status = workspaceStatus(workspace);
              return (
                <button
                  className="workspace-card"
                  data-testid={`workspace-card-${workspace.commandName}`}
                  key={workspace.commandName}
                  type="button"
                  aria-label={`Edit ${workspace.commandName}`}
                  onClick={() => setEditing(workspace)}
                >
                  <span className={`pill pill-${status.tone}`} data-testid={`workspace-status-${workspace.commandName}`}>
                    {status.label}
                  </span>
                  <strong>{workspace.commandName}</strong>
                  <span>{workspace.provider} · {workspace.cliType}</span>
                  <dl>
                    <div>
                      <dt>sharedWith</dt>
                      <dd>{workspace.sharedWith || 'none'}</dd>
                    </div>
                    <div>
                      <dt>last used</dt>
                      <dd>{formatWorkspaceLastUsed(workspace.lastUsed)}</dd>
                    </div>
                  </dl>
                  <span className="panel-action">Edit</span>
                </button>
              );
            })}
          </div>
        )}
      </Card>
      {editing ? <WorkspaceEditDialog workspace={editing} onClose={() => setEditing(null)} onSaved={onWorkspaceSaved} /> : null}
    </>
  );
}

function WorkspaceEditDialog({
  workspace,
  onClose,
  onSaved,
}: {
  workspace: DashboardWorkspace;
  onClose: () => void;
  onSaved?: (workspace: DashboardWorkspace) => void;
}) {
  const status = workspaceStatus(workspace);
  const [model, setModel] = React.useState(workspace.model ?? '');
  const [baseUrl, setBaseUrl] = React.useState(workspace.baseUrl ?? '');
  const [smallFastModel, setSmallFastModel] = React.useState(workspace.smallFastModel ?? '');
  const [saveState, setSaveState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = React.useState<string | null>(null);

  async function saveWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveState('saving');
    setError(null);
    try {
      const response = await fetch(`/dashboard/workspaces/${encodeURIComponent(workspace.commandName)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, baseUrl, smallFastModel }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : 'Workspace update failed');
      }
      const profile = payload.profile && typeof payload.profile === 'object' ? payload.profile as Partial<DashboardWorkspace> : {};
      onSaved?.({
        ...workspace,
        ...profile,
        commandName: workspace.commandName,
        model: typeof profile.model === 'string' ? profile.model : model || undefined,
        baseUrl: typeof profile.baseUrl === 'string' ? profile.baseUrl : baseUrl || undefined,
        smallFastModel: typeof profile.smallFastModel === 'string' ? profile.smallFastModel : smallFastModel || undefined,
      });
      setSaveState('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaveState('error');
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <dialog className="session-detail-dialog workspace-edit-dialog" aria-label={`Edit ${workspace.commandName}`} open onClick={(event) => event.stopPropagation()}>
        <div className="dialog-heading">
          <div>
            <h2>Edit {workspace.commandName}</h2>
            <p>{workspace.provider} · {workspace.cliType}</p>
          </div>
          <button className="icon-button" type="button" aria-label="Close workspace editor" onClick={onClose}>×</button>
        </div>
        <dl className="session-detail-grid">
          <div>
            <dt>Status</dt>
            <dd>{status.label}</dd>
          </div>
          <div>
            <dt>sharedWith</dt>
            <dd>{workspace.sharedWith || 'none'}</dd>
          </div>
          <div>
            <dt>Last used</dt>
            <dd>{formatWorkspaceLastUsed(workspace.lastUsed)}</dd>
          </div>
          <div>
            <dt>Directory</dt>
            <dd>{workspace.profileDirExists === false ? 'missing' : 'present'}</dd>
          </div>
        </dl>
        <form className="workspace-edit-form" onSubmit={saveWorkspace}>
          <label>
            Model
            <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="Provider default" />
          </label>
          <label>
            Base URL
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="Provider default" />
          </label>
          <label>
            Small fast model
            <input value={smallFastModel} onChange={(event) => setSmallFastModel(event.target.value)} placeholder="Claude default" />
          </label>
          <div className="workspace-edit-actions">
            <button className="jump-button" type="submit" disabled={saveState === 'saving'}>
              {saveState === 'saving' ? 'Saving' : 'Save'}
            </button>
            {saveState === 'saved' ? <span role="status">Saved</span> : null}
          </div>
          {error ? <p className="restore-error" role="alert">{error}</p> : null}
        </form>
      </dialog>
    </div>
  );
}
