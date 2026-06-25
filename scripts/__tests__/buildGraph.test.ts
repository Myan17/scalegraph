import { describe, it, expect } from 'vitest'
import { build } from '../buildGraph'

describe('build', () => {
  it('produces a graph from the real agenda with >=15 Talk nodes and non-empty chunks', async () => {
    const { graph, chunks } = await build()
    const talks = graph.nodes.filter((n) => n.type === 'Talk')
    expect(talks.length).toBeGreaterThanOrEqual(15)
    expect(chunks.length).toBeGreaterThan(0)
    // Mitra talk present and themed
    expect(graph.nodes.find((n) => n.id === 'talk:mitra-fight-fires-2026')).toBeTruthy()
    expect(graph.nodes.find((n) => n.type === 'Theme' && n.label === 'Reliability')).toBeTruthy()
  })
})
