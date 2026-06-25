export type Mode = 'explore' | 'ask' | 'timeline'

const LABELS: Record<Mode, string> = {
  explore: 'Explore',
  ask: 'Ask',
  timeline: 'Timeline',
}

export function ModeNav({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <nav className="modenav" aria-label="View mode">
      {(Object.keys(LABELS) as Mode[]).map((m) => (
        <button
          key={m}
          aria-pressed={value === m}
          onClick={() => onChange(m)}
        >
          {LABELS[m]}
        </button>
      ))}
    </nav>
  )
}
