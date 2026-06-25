// Client-side lexical retrieval over chunks, plus a 1-hop subgraph of the matched talks.
// Pluggable: a future embedding-based retriever can implement the same signature.

import type { Graph, GraphNode, Chunk } from '../types'

export interface ScoredChunk { chunk: Chunk; score: number }
export interface Retrieval {
  rankedChunks: ScoredChunk[]
  subgraph: Graph
  confidence: number
}

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'at', 'by',
  'is', 'are', 'how', 'does', 'do', 'what', 'which', 'that', 'this', 'it', 'as', 'we',
  'i', 'you', 'me', 'my', 'our', 'about', 'can', 'will', 'be',
])

/** Crude singular stemmer: drop a trailing plural 's' (not 'ss') for tokens longer than 3. */
function stem(t: string): string {
  return t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t
}

export function tokenize(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem)
}

/** Build idf weights over the chunk corpus (smoothed). */
function idf(chunks: Chunk[]): Map<string, number> {
  const df = new Map<string, number>()
  for (const c of chunks) {
    for (const term of new Set(tokenize(c.text))) df.set(term, (df.get(term) ?? 0) + 1)
  }
  const N = chunks.length || 1
  const out = new Map<string, number>()
  for (const [term, d] of df) out.set(term, Math.log(1 + N / d))
  return out
}

export function retrieve(query: string, graph: Graph, chunks: Chunk[], k = 6): Retrieval {
  const qTerms = tokenize(query)
  const weights = idf(chunks)
  const qSet = new Set(qTerms)

  const scored: ScoredChunk[] = chunks.map((chunk) => {
    const terms = tokenize(chunk.text)
    let score = 0
    const counted = new Set<string>()
    for (const t of terms) {
      if (qSet.has(t) && !counted.has(t)) {
        counted.add(t)
        score += weights.get(t) ?? 0
      }
    }
    // length-normalize so long chunks don't dominate
    return { chunk, score: score / Math.sqrt(terms.length || 1) }
  })

  const rankedChunks = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)

  // Subgraph: matched talks + their 1-hop neighbors.
  const matchedTalkIds = new Set(rankedChunks.map((s) => s.chunk.talkId))
  const keep = new Set<string>(matchedTalkIds)
  for (const e of graph.edges) {
    if (keep.has(e.source)) keep.add(e.target)
    if (keep.has(e.target)) keep.add(e.source)
  }
  const nodes = graph.nodes.filter((n) => keep.has(n.id))
  const edges = graph.edges.filter((e) => keep.has(e.source) && keep.has(e.target))

  // Confidence: normalize the top score against a soft ceiling.
  const top = rankedChunks[0]?.score ?? 0
  const confidence = Math.min(1, top / 2.5)

  return { rankedChunks, subgraph: { nodes, edges }, confidence }
}
