import { describe, it, expect } from 'vitest'
import { buildSegments } from '../segments'
import type { Graph, Chunk } from '../../types'

const graph: Graph = {
  nodes: [
    { id: 'talk:a', type: 'Talk', label: 'Public Cloud Talk', year: 2025, meta: { videoUrl: 'https://youtube.com/watch?v=AAA', videoId: 'AAA' } },
    { id: 'talk:b', type: 'Talk', label: 'Storage Talk', year: 2025 },
  ],
  edges: [],
}

// Talk A: chunks 0..3 are a contiguous public-cloud segment; chunk 4 is off-topic.
const chunks: Chunk[] = [
  { id: 'talk:a::c0', talkId: 'talk:a', text: 'Intro to the public cloud strategy.', ts: 10 },
  { id: 'talk:a::c1', talkId: 'talk:a', text: 'We extend into it for capacity.', ts: 15 },
  { id: 'talk:a::c2', talkId: 'talk:a', text: 'Multi-cloud optionality matters.', ts: 20 },
  { id: 'talk:a::c3', talkId: 'talk:a', text: 'Fleet management across providers.', ts: 25 },
  { id: 'talk:a::c4', talkId: 'talk:a', text: 'Completely unrelated lunch logistics.', ts: 600 },
  { id: 'talk:b::c0', talkId: 'talk:b', text: 'We store exabytes of training data.', ts: 5 },
]

// Hand-crafted semantic scores: A's c0..c3 on-topic, c4 off-topic, B low.
const semantic = new Map<string, number>([
  ['talk:a::c0', 0.6], ['talk:a::c1', 0.45], ['talk:a::c2', 0.5], ['talk:a::c3', 0.35],
  ['talk:a::c4', 0.05], ['talk:b::c0', 0.1],
])

describe('buildSegments', () => {
  const res = buildSegments('public cloud', graph, chunks, semantic)

  it('groups by talk and ranks the public-cloud talk first', () => {
    expect(res.groups[0].talkId).toBe('talk:a')
  })

  it('reconstructs one contiguous segment that includes the non-keyword context but excludes the off-topic chunk', () => {
    const seg = res.groups[0].segments[0]
    expect(seg.text).toContain('public cloud')
    expect(seg.text).toContain('Multi-cloud optionality') // grown context, no keyword
    expect(seg.text).not.toContain('lunch logistics')     // grow stopped at topic change
  })

  it('carries the start timestamp and video info for deep-linking', () => {
    expect(res.groups[0].segments[0].startTs).toBe(10)
    expect(res.groups[0].videoId).toBe('AAA')
  })

  it('excludes talks with no seed (storage talk never clears the bar)', () => {
    expect(res.groups.find((g) => g.talkId === 'talk:b')).toBeUndefined()
  })
})
