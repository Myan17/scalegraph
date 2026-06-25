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

// Session-type weighting: panels/Q&A enumerate many topics and are keyword-dense, so they
// out-rank the focused deep-dive talk that actually answers the question. Down-weight them
// (and keynotes mildly) so the substantive talk wins.
const TYPE_WEIGHT: Record<string, number> = { panel: 0.35, session: 0.35, keynote: 0.7 }

function talkTypeWeight(graph: Graph, talkId: string): number {
  const t = graph.nodes.find((n) => n.id === talkId)?.meta?.type as string | undefined
  return t ? (TYPE_WEIGHT[t] ?? 1) : 1
}

export interface RetrieveOpts {
  k?: number
  /** Optional semantic (cosine) scores per chunk id — enables hybrid lexical+semantic ranking. */
  semantic?: Map<string, number>
}

// Hybrid blend weights when semantic scores are available. Semantic leads (handles paraphrase);
// lexical is a precision boost for exact keyword/entity matches.
const W_SEM = 0.7
const W_LEX = 0.3

/** Rich per-chunk score, shared by lone-chunk retrieval and segment region-growing. */
export interface ScoredItem {
  chunk: Chunk
  score: number   // blended (sem+lexNorm) × talk-type weight — the ranking score
  sem: number     // raw semantic cosine (0 if no semantic) — used for segment growing
  lexNorm: number // lexical score normalized to [0,1] across the corpus
  tw: number      // talk-type weight
}

export interface ScoreResult {
  items: ScoredItem[]
  matchedQueryTerms: Set<string>
  qSize: number
  topLexRaw: number
}

/** Score every chunk against the query (hybrid lexical+semantic). One source of truth. */
export function scoreChunks(query: string, graph: Graph, chunks: Chunk[], semantic?: Map<string, number>): ScoreResult {
  const weights = idf(chunks)
  const qSet = new Set(tokenize(query))
  const typeWeightCache = new Map<string, number>()
  const matchedQueryTerms = new Set<string>()

  const lex = chunks.map((chunk) => {
    const terms = tokenize(chunk.text)
    let score = 0
    const counted = new Set<string>()
    for (const t of terms) {
      if (qSet.has(t) && !counted.has(t)) {
        counted.add(t)
        matchedQueryTerms.add(t)
        score += weights.get(t) ?? 0
      }
    }
    let tw = typeWeightCache.get(chunk.talkId)
    if (tw === undefined) { tw = talkTypeWeight(graph, chunk.talkId); typeWeightCache.set(chunk.talkId, tw) }
    return { chunk, lexRaw: score / Math.sqrt(terms.length || 1), tw }
  })

  const maxLex = Math.max(1e-9, ...lex.map((l) => l.lexRaw))
  const items: ScoredItem[] = lex.map(({ chunk, lexRaw, tw }) => {
    const lexNorm = lexRaw / maxLex
    const sem = semantic ? Math.max(0, semantic.get(chunk.id) ?? 0) : 0
    const blended = semantic ? W_SEM * sem + W_LEX * lexNorm : lexNorm
    return { chunk, score: blended * tw, sem, lexNorm, tw }
  })

  return { items, matchedQueryTerms, qSize: qSet.size, topLexRaw: Math.max(0, ...lex.map((l) => l.lexRaw)) }
}

export function retrieve(query: string, graph: Graph, chunks: Chunk[], opts: RetrieveOpts = {}): Retrieval {
  const k = opts.k ?? 6
  const semantic = opts.semantic
  const { items, matchedQueryTerms, qSize, topLexRaw } = scoreChunks(query, graph, chunks, semantic)
  const scored: ScoredChunk[] = items.map(({ chunk, score }) => ({ chunk, score }))

  const rankedChunks = scored
    .filter((s) => s.score > 0.01)
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

  // Confidence / refusal gate.
  // Lexical mode: absolute top strength × query coverage — an off-topic query that only grazes one
  // incidental word stays below the refusal threshold even if that word is locally strong.
  const coverage = qSize ? matchedQueryTerms.size / qSize : 0
  const lexConfidence = Math.min(1, topLexRaw / 2.5) * coverage

  let confidence = lexConfidence
  if (semantic) {
    // Hybrid refusal gate: SEMANTIC decides. Measured separation is clean — off-topic queries
    // top out at cos ≈0.25, on-topic floor at ≈0.40 — so cosine reliably tells real from junk.
    // A query like "who won the world cup" grazes common words lexically but has near-zero
    // cosine, so it refuses. Lexical only RESCUES a fully-covered exact-entity query (e.g.
    // "GB200 NVL72") where every query term matched — that's a real hit even if cosine is modest.
    const topSem = Math.max(0, ...items.map((i) => i.sem))
    const semConfidence = Math.max(0, Math.min(1, (topSem - 0.22) / 0.35)) // cos 0.22→0, 0.57→1
    const exactRescue = coverage >= 0.99 ? lexConfidence : 0
    confidence = Math.max(semConfidence, exactRescue)
  }

  return { rankedChunks, subgraph: { nodes, edges }, confidence }
}
