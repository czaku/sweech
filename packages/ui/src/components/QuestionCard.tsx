import React, { useState } from 'react'
import type { QuestionRequest } from '../types/index.js'

export interface QuestionCardProps {
  request: QuestionRequest
  onAnswer: (id: string, answer: string) => void
}

export function QuestionCard({ request, onAnswer }: QuestionCardProps) {
  const [selected, setSelected] = useState('')
  const [text, setText] = useState('')
  const hasOptions = request.options && request.options.length > 0
  function submit() { const answer = hasOptions ? selected : text.trim(); if (answer) onAnswer(request.id, answer) }

  return (
    <div className="sweech-question-overlay">
      <div className="sweech-question">
        <div className="sweech-question__header">
          <span className="sweech-question__icon">?</span>
          <span className="sweech-question__label">Claude is asking</span>
        </div>
        <div className="sweech-question__text">{request.question}</div>
        {hasOptions ? (
          <div className="sweech-question__options">
            {request.options!.map(opt => (
              <label key={opt.value} className={`sweech-question__option${selected === opt.value ? ' sweech-question__option--selected' : ''}`}>
                <input type="radio" name="sweech-question" value={opt.value} checked={selected === opt.value} onChange={() => setSelected(opt.value)} />
                {opt.label}
              </label>
            ))}
          </div>
        ) : (
          <input className="sweech-question__input" type="text" placeholder="Your answer…" value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} autoFocus />
        )}
        <div className="sweech-question__actions">
          <button className="sweech-btn sweech-btn--primary" onClick={submit} disabled={hasOptions ? !selected : !text.trim()}>Answer</button>
        </div>
      </div>
    </div>
  )
}
