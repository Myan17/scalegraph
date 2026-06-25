import { useMemo, useState } from 'react'
import type { Answer, Graph } from '../types'
import { toSlideSpec } from '../lib/slideModel'
import { SlideView } from './SlideView'

export function AnswerView({
  answer, graph, onCite,
}: {
  answer: Answer
  graph: Graph
  onCite?: (talkId: string) => void
}) {
  const [tab, setTab] = useState<'answer' | 'slide'>('answer')
  const spec = useMemo(() => toSlideSpec(answer, graph), [answer, graph])

  if (answer.refused) {
    return (
      <div className="card">
        <div className="refusal">
          <strong>I won't guess.</strong>
          <p style={{ margin: '8px 0 0' }} className="muted">{answer.note}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div className="tabs" style={{ margin: 0 }}>
          <button aria-pressed={tab === 'answer'} onClick={() => setTab('answer')}>Answer</button>
          <button aria-pressed={tab === 'slide'} onClick={() => setTab('slide')}>Slide</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} title="Groundedness">
          <span className="faint" style={{ fontSize: 12 }}>grounded</span>
          <div className="meter"><span style={{ width: `${Math.round(answer.groundedness * 100)}%` }} /></div>
        </div>
      </div>

      {tab === 'answer' ? (
        <div>
          <h3 style={{ marginTop: 0, fontSize: 19, letterSpacing: '-0.01em' }}>{answer.title}</h3>
          {answer.claims.map((c, i) => (
            <p key={i} style={{ margin: '0 0 14px' }}>
              {c.text}{' '}
              {c.citations.map((cit, j) => (
                <button
                  key={j}
                  className="chip"
                  onClick={() => onCite?.(cit.talkId)}
                  title="Highlight in graph"
                >
                  ◆ {cit.label}{typeof cit.ts === 'number' ? ` @${Math.floor(cit.ts / 60)}:${String(cit.ts % 60).padStart(2, '0')}` : ''}
                </button>
              ))}
            </p>
          ))}
        </div>
      ) : (
        <SlideView spec={spec} />
      )}
    </div>
  )
}
