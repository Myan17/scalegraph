import { describe, it, expect } from 'vitest'
import { buildRows } from '../Timeline'
import type { Graph } from '../../types'

const graph: Graph = {
  nodes: [
    { id: 'talk:a', type: 'Talk', label: 'A', year: 2024 },
    { id: 'talk:b', type: 'Talk', label: 'B', year: 2026 },
    { id: 'theme:reliability', type: 'Theme', label: 'Reliability' },
  ],
  edges: [
    { source: 'talk:a', target: 'theme:reliability', rel: 'about' },
    { source: 'talk:b', target: 'theme:reliability', rel: 'about' },
  ],
}

describe('buildRows', () => {
  it('places a theme present in two years across two year columns', () => {
    const { rows, years } = buildRows(graph)
    expect(years).toEqual([2024, 2026])
    const rel = rows.find((r) => r.themeId === 'theme:reliability')!
    expect(rel.byYear.get(2024)!.map((t) => t.id)).toEqual(['talk:a'])
    expect(rel.byYear.get(2026)!.map((t) => t.id)).toEqual(['talk:b'])
  })
})
