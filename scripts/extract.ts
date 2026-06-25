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

/** Split a description into <=280 char chunks at sentence boundaries. */
export function chunkText(talkId: string, text: string): Chunk[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text]
  const chunks: Chunk[] = []
  let buf = ''
  let i = 0
  const flush = () => {
    const t = buf.trim()
    if (t) chunks.push({ id: `${talkId}::c${i++}`, talkId, text: t })
    buf = ''
  }
  for (const s of sentences) {
    if ((buf + s).length > 280) flush()
    buf += s
  }
  flush()
  return chunks
}

export function extractTalk(talk: TalkInput, year: number): ExtractParts {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []
  const hay = `${talk.title}. ${talk.description}`.toLowerCase()

  const talkNode = node(`talk:${talk.id}`, 'Talk', talk.title, year, {
    company: talk.company, track: talk.track, time: talk.time, type: talk.type,
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

  // Themes
  for (const theme of matchLexicon(hay, THEMES)) {
    const id = `theme:${slug(theme)}`
    nodes.push(node(id, 'Theme', theme))
    edges.push({ source: talkNode.id, target: id, rel: 'about' })
  }

  // Systems / technologies
  for (const sys of matchLexicon(hay, SYSTEMS)) {
    const id = `system:${slug(sys)}`
    nodes.push(node(id, 'System', sys))
    edges.push({ source: talkNode.id, target: id, rel: 'uses' })
  }

  // Metrics
  const metrics = talk.description.match(METRIC_RE) ?? []
  for (const m of metrics) {
    const clean = m.trim()
    const id = `metric:${slug(talk.id)}:${slug(clean)}`
    nodes.push(node(id, 'Metric', clean, year, { talkId: talkNode.id }))
    edges.push({ source: talkNode.id, target: id, rel: 'reports' })
  }

  const chunks = chunkText(talkNode.id, talk.description)
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
