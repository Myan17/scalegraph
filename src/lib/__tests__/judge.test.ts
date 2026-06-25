import { describe, it, expect } from 'vitest'
import { judge } from '../judge'
import type { Retrieval } from '../retrieve'

const empty: Retrieval = { rankedChunks: [], subgraph: { nodes: [], edges: [] }, confidence: 0 }
const strong: Retrieval = {
  rankedChunks: [
    { chunk: { id: 'c1', talkId: 't', text: 'a' }, score: 2 },
    { chunk: { id: 'c2', talkId: 't', text: 'b' }, score: 1.5 },
    { chunk: { id: 'c3', talkId: 't', text: 'c' }, score: 1 },
  ],
  subgraph: { nodes: [], edges: [] },
  confidence: 0.9,
}

describe('judge', () => {
  it('refuses empty retrieval', () => {
    expect(judge(empty).refuse).toBe(true)
  })

  it('accepts strong retrieval with groundedness > 0.5', () => {
    const v = judge(strong)
    expect(v.refuse).toBe(false)
    expect(v.groundedness).toBeGreaterThan(0.5)
  })
})
