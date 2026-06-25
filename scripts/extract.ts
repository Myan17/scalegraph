// Deterministic extraction: a talk -> graph nodes/edges/chunks.
// No LLM required. Optional LLM enrichment can be layered later behind the same output shape.

import type { Graph, GraphNode, GraphEdge, Chunk, NodeType } from './types'

export interface TalkInput {
  id: string
  title: string
  speakers: string[]
  company: string
  track?: string
  time?: string
  type?: string
  description: string
}

export interface ExtractParts {
  nodes: GraphNode[]
  edges: GraphEdge[]
  chunks: Chunk[]
}

// Theme + System lexicons. Key = canonical label, value = match terms (lowercased).
const THEMES: Record<string, string[]> = {
  'Agentic Infrastructure': ['agent', 'agentic', 'autonomous', 'flywheel', 'self-healing'],
  'Reliability': ['reliability', 'incident', 'on-call', 'outage', 'fight fires', 'mitigation', 'fail'],
  'Guardrails & Safety': ['guardrail', 'safely', 'safe', 'destructive', 'privacy', 'auditable'],
  'Distributed Training': ['training', 'nccl', 'watchdog', 'distributed', 'recommendation systems'],
  'Storage': ['storage', 'dataset', 'gpu utilization'],
  'Multi-Cloud': ['public cloud', 'multi-cloud', 'cloud', 'fleet', 'capacity'],
  'Custom Silicon & Hardware': ['gb200', 'nvl72', 'silicon', 'gpu', 'rack', 'exascale', 'accelerator'],
  'Debugging': ['debug', 'debugging', 'ssh', 'root cause', 'investigation'],
  'Evaluation': ['llm-as-judge', 'evaluation', 'active learning', 'ground-truth', 'ground truth'],
  'Control Plane': ['control plane', 'bootstrap', 're-bootstrap', 'region'],
}

const SYSTEMS: Record<string, string[]> = {
  'NCCL': ['nccl'],
  'GB200 NVL72': ['gb200', 'nvl72'],
  'Kubernetes': ['kubernetes'],
  'Semantic Kernel': ['semantic kernel'],
  'Pulumi': ['pulumi'],
}

const METRIC_RE = /\b\d[\d,\.]*\s*\+?\s*(?:%|x\b|incidents?|gb\b|ms\b|nodes?)/gi

const STOP = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'with', 'at', 'by', 'an'])

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function node(id: string, type: NodeType, label: string, year?: number, meta?: Record<string, unknown>): GraphNode {
  return { id, type, label, year, meta }
}

function matchLexicon(haystack: string, lex: Record<string, string[]>): string[] {
  const hits: string[] = []
  for (const [label, terms] of Object.entries(lex)) {
    if (terms.some((t) => haystack.includes(t))) hits.push(label)
  }
  return hits
}

const TARGET = 160 // accumulate sentences up to ~this length before emitting a chunk
const MAX = 280    // never exceed this
const MIN = 40     // shorter trailing fragments get merged into the previous chunk

export interface Cue { ts: number; text: string }

interface OffsetChunk { text: string; start: number } // start = char offset in the source text

/** Split into sentences with their start char offset in `text`. */
function splitSentences(text: string): { s: string; start: number }[] {
  const re = /[^.!?]+[.!?]+/g
  const out: { s: string; start: number }[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const raw = m[0]
    const lead = raw.length - raw.trimStart().length
    const s = raw.trim()
    if (s) out.push({ s, start: m.index + lead })
  }
  if (!out.length) { const s = text.trim(); if (s) out.push({ s, start: 0 }) }
  return out
}

/**
 * Core chunker: clean, whole-sentence chunks merged toward TARGET (so answers don't surface filler
 * like "Let's talk about the motivation."), with each chunk's start char offset in the source.
 */
function chunkWithOffsets(text: string): OffsetChunk[] {
  const sentences = splitSentences(text)
  const out: OffsetChunk[] = []
  let buf = ''
  let start = 0
  const flush = () => { if (buf.trim()) out.push({ text: buf.trim(), start }); buf = '' }
  for (const { s, start: sStart } of sentences) {
    if (buf && (buf.length + 1 + s.length) > MAX) flush()
    if (!buf) start = sStart
    buf = buf ? `${buf} ${s}` : s
    if (buf.length >= TARGET) flush()
  }
  flush()
  // Fold a too-short fragment into its predecessor (keeps the predecessor's start/ts).
  const merged: OffsetChunk[] = []
  for (const c of out) {
    if (c.text.length < MIN && merged.length) merged[merged.length - 1].text += ' ' + c.text
    else merged.push(c)
  }
  return merged
}

/** Chunk plain text (e.g. an agenda description); chunks carry no timestamp. */
export function chunkText(talkId: string, text: string): Chunk[] {
  return chunkWithOffsets(text).map((c, i) => ({ id: `${talkId}::c${i}`, talkId, text: c.text }))
}

/**
 * Chunk timestamped caption cues into the same clean chunks, assigning each chunk the start time
 * (seconds) of the cue covering its first character — so the UI can deep-link to that moment.
 */
export function chunkCues(talkId: string, cues: Cue[]): Chunk[] {
  // Reconstruct the full transcript while recording the char offset where each cue begins.
  const marks: { char: number; ts: number }[] = []
  let full = ''
  for (const c of cues) {
    const piece = c.text.trim()
    if (!piece) continue
    marks.push({ char: full.length ? full.length + 1 : 0, ts: c.ts })
    full = full ? `${full} ${piece}` : piece
  }
  const tsAt = (char: number): number => {
    let ts = marks[0]?.ts ?? 0
    for (const m of marks) { if (m.char <= char) ts = m.ts; else break }
    return ts
  }
  return chunkWithOffsets(full).map((c, i) => ({ id: `${talkId}::c${i}`, talkId, text: c.text, ts: tsAt(c.start) }))
}

export interface ExtractOpts {
  cues?: Cue[]                       // timestamped transcript -> ts-aware chunks
  meta?: Record<string, unknown>     // extra Talk-node meta (e.g. videoUrl, videoId)
}

export function extractTalk(talk: TalkInput, year?: number, opts: ExtractOpts = {}): ExtractParts {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const hay = `${talk.title}. ${talk.description}`.toLowerCase()

  const talkNode = node(`talk:${talk.id}`, 'Talk', talk.title, year, {
    company: talk.company, track: talk.track, time: talk.time, type: talk.type, ...opts.meta,
  })
  nodes.push(talkNode)

  // Speakers
  for (const sp of talk.speakers) {
    const id = `speaker:${slug(sp)}`
    nodes.push(node(id, 'Speaker', sp))
    edges.push({ source: id, target: talkNode.id, rel: 'presents' })
  }

  // Company
  if (talk.company) {
    const id = `company:${slug(talk.company)}`
    nodes.push(node(id, 'Company', talk.company))
    edges.push({ source: talkNode.id, target: id, rel: 'from' })
  }

  // Navigational sessions (welcome, panels, Q&A) get a node but never anchor themes/systems/metrics —
  // their boilerplate ("...Systems & Reliability 2026...") would otherwise create spurious links.
  const contentful = talk.type !== 'session' && talk.type !== 'panel'

  // Themes
  if (contentful) for (const theme of matchLexicon(hay, THEMES)) {
    const id = `theme:${slug(theme)}`
    nodes.push(node(id, 'Theme', theme))
    edges.push({ source: talkNode.id, target: id, rel: 'about' })
  }

  // Systems / technologies
  if (contentful) for (const sys of matchLexicon(hay, SYSTEMS)) {
    const id = `system:${slug(sys)}`
    nodes.push(node(id, 'System', sys))
    edges.push({ source: talkNode.id, target: id, rel: 'uses' })
  }

  // Metrics
  const metrics = contentful ? (talk.description.match(METRIC_RE) ?? []) : []
  for (const m of metrics) {
    const clean = m.trim()
    const id = `metric:${slug(talk.id)}:${slug(clean)}`
    nodes.push(node(id, 'Metric', clean, year, { talkId: talkNode.id }))
    edges.push({ source: talkNode.id, target: id, rel: 'reports' })
  }

  const chunks = opts.cues?.length
    ? chunkCues(talkNode.id, opts.cues)
    : chunkText(talkNode.id, talk.description)
  return { nodes, edges, chunks }
}

/** Merge extraction parts, de-duping nodes by id and edges by (source,target,rel). */
export function mergeGraphs(parts: ExtractParts[]): { graph: Graph; chunks: Chunk[] } {
  const nodeMap = new Map<string, GraphNode>()
  const edgeSet = new Set<string>()
  const edges: GraphEdge[] = []
  const chunks: Chunk[] = []
  for (const p of parts) {
    for (const n of p.nodes) if (!nodeMap.has(n.id)) nodeMap.set(n.id, n)
    for (const e of p.edges) {
      const key = `${e.source}|${e.target}|${e.rel}`
      if (!edgeSet.has(key)) { edgeSet.add(key); edges.push(e) }
    }
    chunks.push(...p.chunks)
  }
  return { graph: { nodes: [...nodeMap.values()], edges }, chunks }
}

/** Add talk<->talk edges for talks that share a Theme across DIFFERENT years. */
export function addCrossYearEdges(graph: Graph): void {
  const themeToTalks = new Map<string, { talkId: string; year?: number }[]>()
  for (const e of graph.edges) {
    if (e.rel === 'about' && e.target.startsWith('theme:')) {
      const talk = graph.nodes.find((n) => n.id === e.source)
      if (!talk) continue
      const arr = themeToTalks.get(e.target) ?? []
      arr.push({ talkId: e.source, year: talk.year })
      themeToTalks.set(e.target, arr)
    }
  }
  const seen = new Set<string>()
  for (const [theme, talks] of themeToTalks) {
    for (let i = 0; i < talks.length; i++) {
      for (let j = i + 1; j < talks.length; j++) {
        if (talks[i].year === talks[j].year) continue
        const [a, b] = [talks[i].talkId, talks[j].talkId].sort()
        const key = `${a}|${b}`
        if (seen.has(key)) continue
        seen.add(key)
        graph.edges.push({ source: a, target: b, rel: 'evolves', ...{} })
        graph.nodes.find((n) => n.id === a) // keep nodes referenced
        ;(graph.edges[graph.edges.length - 1] as GraphEdge & { via?: string }).via = theme
      }
    }
  }
}
