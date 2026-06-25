import { useMemo, useState } from 'react'
import type { Answer, Graph, TalkThread } from '../types'
import { toSlideSpec } from '../lib/slideModel'
import { SlideView } from './SlideView'

function mmss(s?: number): string {
  return typeof s === 'number' ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : ''
}

/** One talk's thread: its contiguous segments on the topic, with read-more + watch links. */
function ThreadCard({ group, onCite }: { group: TalkThread; onCite?: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false)
  const segs = group.segments
  const shown = expanded ? segs : segs.slice(0, 1)
  const watch = (ts?: number) =>
    group.videoUrl ? `${group.videoUrl}${typeof ts === 'number' ? `&t=${Math.floor(ts)}s` : ''}` : undefined

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 14 }}>
      <button
        onClick={() => onCite?.(group.talkId)}
        title="Highlight in graph"
        style={{ background: 'none', border: 'none', padding: 0, textAlign: 'left', cursor: 'pointer' }}
      >
        <span style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 15 }}>◆ {group.label}</span>
        {group.year ? <span className="faint" style={{ fontSize: 12 }}>  · {group.year}</span> : null}
      </button>

      {shown.map((seg, i) => (
        <div key={i} style={{ margin: '8px 0 0' }}>
          <p style={{ margin: '0 0 4px', lineHeight: 1.55 }}>{seg.text}</p>
          {watch(seg.startTs) && (
            <a className="watch" href={watch(seg.startTs)} target="_blank" rel="noreferrer">
              ▶ watch from {mmss(seg.startTs)}
            </a>
          )}
        </div>
      ))}

      {segs.length > 1 && (
        <button className="readmore" onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'Show less' : `Read more — ${segs.length - 1} more passage${segs.length > 2 ? 's' : ''} from this talk`}
        </button>
      )}
    </div>
  )
}

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

  const groups = answer.groups ?? []

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
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
          <p className="faint" style={{ fontSize: 13, margin: '6px 0 0' }}>
            {groups.length > 0
              ? `What ${groups.length} talk${groups.length > 1 ? 's' : ''} said about this — grouped by talk, in the speaker's own words:`
              : 'From the talks:'}
          </p>
          {groups.length > 0
            ? groups.map((g) => <ThreadCard key={g.talkId} group={g} onCite={onCite} />)
            : answer.claims.map((c, i) => (
                <p key={i} style={{ margin: '12px 0 0' }}>{c.text}</p>
              ))}
        </div>
      ) : (
        <SlideView spec={spec} />
      )}
    </div>
  )
}
