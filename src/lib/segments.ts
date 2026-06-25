// Comprehensive "what did the speaker actually say about X" retrieval.
//
// Instead of returning the few globally-highest-scoring lone sentences, this reconstructs the
// speaker's CONTIGUOUS SEGMENTS on the topic, grouped by talk. Key idea (hysteresis region-growing):
// a speaker discusses a topic for a stretch while saying the keyword only once, so we SEED at clearly
// relevant chunks and GROW outward to adjacent chunks while they stay semantically on-topic — even
// where the keyword never reappears — and stop when the speaker moves on.

import type { Graph, Chunk, GraphNode, Segment, TalkThread } from '../types'
import { scoreChunks, type ScoredItem } from './retrieve'

export interface SegmentResult {
  groups: TalkThread[]
  confidence: number
}

// Hysteresis thresholds on the raw semantic COSINE (measured separation: on-topic ≥0.40,
// off-topic ≤0.25). SEED = a chunk clearly about the topic; GROW = extend contiguously while still
// related, then stop (so a segment doesn't swallow the off-topic intro). Using cosine directly
// keeps these interpretable and prevents long transcripts from inflating via normalized scores.
const SEED_SEM = 0.40
const GROW_SEM = 0.28
const MAX_SEGMENTS_PER_TALK = 4

/** Order chunks within a talk by their transcript position (id suffix ::c<n>). */
function chunkIndex(chunk: Chunk): number {
  const m = /::c(\d+)$/.exec(chunk.id)
  return m ? Number(m[1]) : 0
}

function nodeFor(graph: Graph, talkId: string): GraphNode | undefined {
  return graph.nodes.find((n) => n.id === talkId)
}

export function buildSegments(
  query: string,
  graph: Graph,
  chunks: Chunk[],
  semantic?: Map<string, number>,
): SegmentResult {
  const { items } = scoreChunks(query, graph, chunks, semantic)

  // Group scored chunks by talk, ordered by transcript position.
  const byTalk = new Map<string, ScoredItem[]>()
  for (const it of items) {
    const arr = byTalk.get(it.chunk.talkId) ?? []
    arr.push(it)
    byTalk.set(it.chunk.talkId, arr)
  }

  const groups: TalkThread[] = []
  for (const [talkId, arr] of byTalk) {
    const node = nodeFor(graph, talkId)
    const ttype = node?.meta?.type as string | undefined
    if (ttype === 'session' || ttype === 'panel') continue // navigational, not a real "thread"

    arr.sort((a, b) => chunkIndex(a.chunk) - chunkIndex(b.chunk))
    const seeds = arr.filter((i) => i.sem >= SEED_SEM)
    if (!seeds.length) continue // talk doesn't meaningfully discuss the topic

    // Region-grow each seed outward while neighbors stay on-topic; merge overlapping ranges.
    const idxOf = new Map(arr.map((it, k) => [it.chunk.id, k]))
    const covered = new Set<number>()
    const ranges: [number, number][] = []
    for (const seed of seeds) {
      const k = idxOf.get(seed.chunk.id)!
      if (covered.has(k)) continue
      let lo = k, hi = k
      while (lo - 1 >= 0 && arr[lo - 1].sem >= GROW_SEM) lo--
      while (hi + 1 < arr.length && arr[hi + 1].sem >= GROW_SEM) hi++
      for (let j = lo; j <= hi; j++) covered.add(j)
      ranges.push([lo, hi])
    }
    // Merge overlapping/adjacent ranges.
    ranges.sort((a, b) => a[0] - b[0])
    const merged: [number, number][] = []
    for (const r of ranges) {
      const last = merged[merged.length - 1]
      if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1])
      else merged.push([...r])
    }

    const segments: Segment[] = merged.map(([lo, hi]) => {
      const slice = arr.slice(lo, hi + 1)
      return {
        text: slice.map((s) => s.chunk.text).join(' '),
        startTs: slice[0].chunk.ts,
        score: Math.max(...slice.map((s) => s.score)),
      }
    })
    segments.sort((a, b) => b.score - a.score)

    // Rank by PEAK relevance (most on-topic moment) × talk-type weight, with a small bonus for
    // sustained discussion — so the talk actually about the topic leads, not whichever has the most
    // chunks, and keynotes are gently demoted vs focused talks.
    const peak = Math.max(...seeds.map((s) => s.sem))
    const score = peak * (seeds[0].tw ?? 1) + Math.min(0.1, 0.01 * seeds.length)
    groups.push({
      talkId,
      label: node?.label ?? talkId,
      year: node?.year,
      videoUrl: node?.meta?.videoUrl as string | undefined,
      videoId: node?.meta?.videoId as string | undefined,
      segments: segments.slice(0, MAX_SEGMENTS_PER_TALK),
      score,
    })
  }

  groups.sort((a, b) => b.score - a.score)

  // Informational confidence (refusal itself is decided by the shared retrieve/judge gate in
  // composeAnswer). Strongest seed across all talks.
  const confidence = Math.min(1, Math.max(0, ...groups.map((g) => g.score)))
  return { groups, confidence }
}
