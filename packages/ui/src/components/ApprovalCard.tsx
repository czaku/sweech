import React, { useState } from 'react'
import type { ApprovalRequest, ApprovalAction } from '../types/index.js'

export interface ApprovalCardProps {
  request: ApprovalRequest
  onRespond: (taskId: string, action: ApprovalAction, hint?: string) => void
}

export function ApprovalCard({ request, onRespond }: ApprovalCardProps) {
  const [showHint, setShowHint] = useState(false)
  const [hint, setHint] = useState('')
  const label = request.stage === 'pre_task' ? 'Approval Required' : 'Failure Escalation'
  function sendHint() { if (hint.trim()) onRespond(request.taskId, 'retry_with_hint', hint.trim()) }

  return (
    <div className="sweech-approval-overlay">
      <div className="sweech-approval">
        <div className="sweech-approval__header">
          <span className="sweech-approval__stage">{label}</span>
          <span className="sweech-approval__task">{request.taskId}: {request.title}</span>
        </div>
        {request.context && <div className="sweech-approval__context">{request.context.split('\n')[0]}</div>}
        {showHint && (
          <div className="sweech-approval__hint-row">
            <input className="sweech-approval__hint-input" type="text" placeholder="Enter hint for Claude…" value={hint} onChange={e => setHint(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendHint()} autoFocus />
          </div>
        )}
        <div className="sweech-approval__actions">
          <button className="sweech-btn sweech-btn--approve" onClick={() => onRespond(request.taskId, 'approved')}>Approve</button>
          <button className="sweech-btn sweech-btn--skip" onClick={() => onRespond(request.taskId, 'skipped')}>Skip</button>
          <button className="sweech-btn sweech-btn--halt" onClick={() => onRespond(request.taskId, 'halt')}>Halt</button>
          <button className="sweech-btn sweech-btn--retry" onClick={() => setShowHint(s => !s)}>Retry with hint</button>
          {showHint && <button className="sweech-btn sweech-btn--send" onClick={sendHint}>Send</button>}
        </div>
      </div>
    </div>
  )
}
