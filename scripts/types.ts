// Single source of truth for the ScaleGraph data model.
// Re-exported by src/types.ts for the frontend.

export type NodeType =
  | 'Talk'
  | 'Speaker'
  | 'Company'
  | 'Theme'
  | 'System'
  | 'Problem'
  | 'Technique'
  | 'Metric'

export interface GraphNode {
  id: string
  type: NodeType
  label: string
  year?: number
  meta?: Record<string, unknown>
}

export interface GraphEdge {
  source: string
  target: string
  rel: string
}

export interface Graph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface Chunk {
  id: string
  talkId: string
  text: string
  ts?: number
}

export interface Citation {
  talkId: string
  label: string
  ts?: number
}

export interface Claim {
  text: string
  citations: Citation[]
}

export interface Answer {
  id: string
  query: string
  title: string
  claims: Claim[]
  relatedNodeIds: string[]
  groundedness: number
  refused: boolean
  note?: string
}

export interface SlideSpec {
  title: string
  bullets: { text: string; cite: string }[]
  sources: string[]
  nodeIds: string[]
}

/** Returns a list of human-readable validation errors; empty array == valid. */
export function validateAnswer(a: Answer): string[] {
  const errs: string[] = []
  if (!a.id) errs.push('missing id')
  if (typeof a.groundedness !== 'number' || a.groundedness < 0 || a.groundedness > 1) {
    errs.push('groundedness must be in [0,1]')
  }
  if (a.refused) {
    // A refusal must NOT smuggle in uncited claims.
    if (a.claims.length > 0) errs.push('refused answer must have no claims')
  } else {
    a.claims.forEach((c, i) => {
      if (!c.citations || c.citations.length === 0) {
        errs.push(`claim ${i} has no citations`)
      }
    })
  }
  return errs
}
