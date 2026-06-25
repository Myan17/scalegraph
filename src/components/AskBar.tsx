import { useState } from 'react'

const SUGGESTIONS = [
  'How does Meta use agents for reliability?',
  'What is the GB200 NVL72?',
  'How does Meta debug NCCL timeouts?',
  'How is Meta extending to the public cloud?',
]

export function AskBar({ onAsk, busy }: { onAsk: (q: string) => void; busy: boolean }) {
  const [q, setQ] = useState('')
  const submit = () => { if (q.trim()) onAsk(q.trim()) }
  return (
    <div>
      <div className="askbar">
        <input
          value={q}
          placeholder="Ask anything about the program…"
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          aria-label="Ask a question"
        />
        <button onClick={submit} disabled={busy || !q.trim()}>
          {busy ? '…' : 'Ask'}
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            className="chip"
            onClick={() => { setQ(s); onAsk(s) }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
