import { describe, it, expect, beforeAll } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { composeAnswer } from '../answer'
import { validateAnswer, type Graph, type Chunk } from '../../types'

let graph: Graph
let chunks: Chunk[]

beforeAll(async () => {
  graph = JSON.parse(await readFile(join(process.cwd(), 'public/data/graph.json'), 'utf8'))
  chunks = JSON.parse(await readFile(join(process.cwd(), 'public/data/chunks.json'), 'utf8'))
})

describe('composeAnswer (LLM disabled by default in tests)', () => {
  it('produces a grounded answer where every claim is cited and validateAnswer passes', async () => {
    const a = await composeAnswer('how does Meta fight reliability incidents with agents', graph, chunks)
    expect(a.refused).toBe(false)
    expect(a.claims.length).toBeGreaterThan(0)
    for (const c of a.claims) expect(c.citations.length).toBeGreaterThanOrEqual(1)
    expect(validateAnswer(a)).toEqual([])
    expect(a.groundedness).toBeGreaterThan(0)
  })

  it('refuses (no fabricated claims) for an off-topic query', async () => {
    const a = await composeAnswer('best pizza toppings in Naples', graph, chunks)
    expect(a.refused).toBe(true)
    expect(a.claims).toEqual([])
    expect(a.note).toBeTruthy()
    expect(validateAnswer(a)).toEqual([])
  })

  it('cites the GB200 talk when asked about exascale racks', async () => {
    const a = await composeAnswer('exascale computer in a single rack GB200 NVL72', graph, chunks)
    const cited = a.claims.flatMap((c) => c.citations.map((x) => x.talkId))
    expect(cited).toContain('talk:nvidia-gb200-2026')
  })
})
