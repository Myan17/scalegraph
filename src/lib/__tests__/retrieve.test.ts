import { describe, it, expect, beforeAll } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { retrieve, tokenize } from '../retrieve'
import type { Graph, Chunk } from '../../types'

let graph: Graph
let chunks: Chunk[]

beforeAll(async () => {
  graph = JSON.parse(await readFile(join(process.cwd(), 'public/data/graph.json'), 'utf8'))
  chunks = JSON.parse(await readFile(join(process.cwd(), 'public/data/chunks.json'), 'utf8'))
})

describe('tokenize', () => {
  it('drops stopwords and short tokens', () => {
    expect(tokenize('How does the reliability agent work')).toEqual(['reliability', 'agent', 'work'])
  })
})

describe('retrieve', () => {
  it('surfaces the Mitra reliability talk for a reliability query with high confidence', () => {
    const r = retrieve('how does Meta handle reliability incidents with agents', graph, chunks)
    const talks = r.rankedChunks.map((s) => s.chunk.talkId)
    expect(talks).toContain('talk:mitra-fight-fires-2026')
    expect(r.confidence).toBeGreaterThan(0.5)
    expect(r.confidence).toBeLessThanOrEqual(1)
  })

  it('includes the matched talk node in the subgraph', () => {
    const r = retrieve('NCCL watchdog timeouts in distributed training', graph, chunks)
    expect(r.subgraph.nodes.find((n) => n.id === 'talk:liu-agentic-debug-2026')).toBeTruthy()
  })

  it('yields low confidence (below refusal threshold) for an off-topic query', () => {
    const r = retrieve('best pizza toppings in Naples', graph, chunks)
    // Coverage weighting keeps an incidental single-word match well under the 0.15 refusal floor.
    expect(r.confidence).toBeLessThan(0.15)
  })
})
