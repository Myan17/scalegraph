import { describe, it, expect } from 'vitest'
import { extractTalk, mergeGraphs, addCrossYearEdges, chunkText, chunkCues, type TalkInput } from '../extract'

const mitra: TalkInput = {
  id: 'mitra-fight-fires-2026',
  title: 'Teaching AI to Fight Fires: Autonomous Reliability Agents at Meta Scale',
  speakers: ['Gaurav Mitra'],
  company: 'Meta',
  type: 'talk',
  description:
    'Describes a reliability flywheel that encodes on-call engineer methods into an autonomous agent. The agent handled 1,000+ incidents with a 60% improvement in detection-to-mitigation time.',
}

describe('extractTalk', () => {
  const parts = extractTalk(mitra, 2026)

  it('creates a Talk node', () => {
    expect(parts.nodes.find((n) => n.type === 'Talk' && n.id === 'talk:mitra-fight-fires-2026')).toBeTruthy()
  })

  it('creates the Speaker node and presents edge', () => {
    expect(parts.nodes.find((n) => n.type === 'Speaker' && n.label === 'Gaurav Mitra')).toBeTruthy()
    expect(parts.edges.find((e) => e.rel === 'presents' && e.target === 'talk:mitra-fight-fires-2026')).toBeTruthy()
  })

  it('creates a Company node', () => {
    expect(parts.nodes.find((n) => n.type === 'Company' && n.label === 'Meta')).toBeTruthy()
  })

  it('tags Reliability and Agentic themes', () => {
    const themes = parts.nodes.filter((n) => n.type === 'Theme').map((n) => n.label)
    expect(themes).toContain('Reliability')
    expect(themes).toContain('Agentic Infrastructure')
  })

  it('captures metrics like "1,000+ incidents" and "60%"', () => {
    const metrics = parts.nodes.filter((n) => n.type === 'Metric').map((n) => n.label.toLowerCase())
    expect(metrics.some((m) => m.includes('incident'))).toBe(true)
    expect(metrics.some((m) => m.includes('%'))).toBe(true)
  })
})

describe('chunkText', () => {
  it('keeps chunks within a soft size cap', () => {
    const long = 'A sentence. '.repeat(60)
    for (const c of chunkText('t', long)) expect(c.text.length).toBeLessThanOrEqual(340)
  })

  it('chunkCues preserves a start timestamp per chunk from the covering cue', () => {
    // ~36-char cues that cross sentence boundaries, like real auto-captions. Enough to split.
    const cues = [
      { ts: 0, text: 'Welcome everyone to the talk today.' },
      { ts: 4, text: 'We will cover public cloud and how' },
      { ts: 7, text: 'we extend Meta into the public cloud.' },
      { ts: 11, text: 'It gives us multi-cloud optionality.' },
      { ts: 15, text: 'It also helps with GPU capacity and' },
      { ts: 18, text: 'fleet management across environments.' },
      { ts: 60, text: 'Now a totally different topic: storage' },
      { ts: 64, text: 'and how we keep exabytes of training' },
      { ts: 68, text: 'data spread across many data centers.' },
    ]
    const chunks = chunkCues('talk:x', cues)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(typeof c.ts).toBe('number')
    expect(chunks[0].ts).toBe(0) // first chunk starts at the first cue
    // timestamps are non-decreasing across chunks, and the last is well past the first
    for (let i = 1; i < chunks.length; i++) expect(chunks[i].ts!).toBeGreaterThanOrEqual(chunks[i - 1].ts!)
    expect(chunks[chunks.length - 1].ts!).toBeGreaterThan(0)
  })

  it('merges short filler sentences instead of emitting them alone', () => {
    const text =
      'This is a reasonably long opening sentence that comfortably clears the target chunk length on its own and then some. ' +
      'Short note. ' +
      'Another sufficiently long sentence follows here to make a second chunk of acceptable length for retrieval purposes.'
    const chunks = chunkText('t', text)
    // No chunk should be a tiny orphan fragment.
    for (const c of chunks) expect(c.text.length).toBeGreaterThanOrEqual(40)
    expect(chunks.some((c) => c.text.includes('Short note.'))).toBe(true)
  })
})

describe('mergeGraphs + addCrossYearEdges', () => {
  it('dedupes shared nodes and links same-theme talks across years', () => {
    const a = extractTalk({ ...mitra, id: 'a-2026' }, 2026)
    const b = extractTalk({ ...mitra, id: 'b-2024', title: 'Reliability agents, two years prior' }, 2024)
    const { graph } = mergeGraphs([a, b])
    // Meta company node deduped to one
    expect(graph.nodes.filter((n) => n.id === 'company:meta')).toHaveLength(1)
    addCrossYearEdges(graph)
    expect(graph.edges.find((e) => e.rel === 'evolves')).toBeTruthy()
  })
})
