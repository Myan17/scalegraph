import { useMemo } from 'react'
import type { Graph } from '../types'

interface Row { theme: string; themeId: string; byYear: Map<number, { id: string; label: string }[]> }

export function buildRows(graph: Graph): { rows: Row[]; years: number[] } {
  const talkById = new Map(graph.nodes.filter((n) => n.type === 'Talk').map((n) => [n.id, n]))
  const themeNodes = graph.nodes.filter((n) => n.type === 'Theme')
  const yearSet = new Set<number>()

  const rows: Row[] = themeNodes.map((theme) => {
    const byYear = new Map<number, { id: string; label: string }[]>()
    for (const e of graph.edges) {
      if (e.rel === 'about' && e.target === theme.id) {
        const talk = talkById.get(e.source)
        if (!talk?.year) continue
        yearSet.add(talk.year)
        const arr = byYear.get(talk.year) ?? []
        arr.push({ id: talk.id, label: talk.label })
        byYear.set(talk.year, arr)
      }
    }
    return { theme: theme.label, themeId: theme.id, byYear }
  })

  const years = [...yearSet].sort((a, b) => a - b)
  // Sort rows by total talks desc so the richest themes lead.
  rows.sort((a, b) => count(b) - count(a))
  return { rows: rows.filter((r) => r.byYear.size > 0), years }
}

function count(r: Row): number {
  let n = 0
  for (const v of r.byYear.values()) n += v.length
  return n
}

export function Timeline({ graph, onTalk }: { graph: Graph; onTalk?: (id: string) => void }) {
  const { rows, years } = useMemo(() => buildRows(graph), [graph])

  if (years.length <= 1) {
    return (
      <div className="card muted">
        <p style={{ margin: 0 }}>
          The timeline traces how a theme evolves across multiple @Scale years. This corpus currently
          holds a single year ({years[0] ?? '—'}). Add past talks via <code>config/videos.json</code> and
          rebuild to see cross-year threads light up.
        </p>
        <p className="faint" style={{ marginBottom: 0 }}>Showing this year's themes below as a preview.</p>
        <ThemeGrid rows={rows} years={years} onTalk={onTalk} />
      </div>
    )
  }
  return (
    <div className="card">
      <ThemeGrid rows={rows} years={years} onTalk={onTalk} />
    </div>
  )
}

function ThemeGrid({ rows, years, onTalk }: { rows: Row[]; years: number[]; onTalk?: (id: string) => void }) {
  const cols = years.length || 1
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `200px repeat(${cols}, 1fr)`, gap: 10, alignItems: 'center', marginTop: 14 }}>
      <div />
      {years.map((y) => (
        <div key={y} className="section-title" style={{ margin: 0, textAlign: 'center' }}>{y}</div>
      ))}
      {rows.map((r) => (
        <Fragmentish key={r.themeId} row={r} years={years} onTalk={onTalk} />
      ))}
    </div>
  )
}

function Fragmentish({ row, years, onTalk }: { row: Row; years: number[]; onTalk?: (id: string) => void }) {
  return (
    <>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{row.theme}</div>
      {years.map((y) => (
        <div key={y} style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'center' }}>
          {(row.byYear.get(y) ?? []).map((t) => (
            <button key={t.id} className="chip" title={t.label} onClick={() => onTalk?.(t.id)}>
              {t.label.length > 22 ? t.label.slice(0, 20) + '…' : t.label}
            </button>
          ))}
        </div>
      ))}
    </>
  )
}
