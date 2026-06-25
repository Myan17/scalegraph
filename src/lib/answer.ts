// Answer composer: retrieval-first and FULLY EXTRACTIVE. Every claim is the speaker's actual
// words, verbatim, cited to the source talk. No LLM, no keys, no paraphrase that could drift —
// grounded by construction. Refuses when retrieval is too weak.

import type { Answer, Claim, Citation, Graph, Chunk, GraphNode } from '../types'
import { retrieve } from './retrieve'
import { judge } from './judge'
import { buildSegments } from './segments'

let counter = 0
function nextId(): string {
  counter += 1
  return `ans-${counter}`
}

function talkLabel(graph: Graph, talkId: string): string {
  return graph.nodes.find((n: GraphNode) => n.id === talkId)?.label ?? talkId
}

export async function composeAnswer(
  query: string,
  graph: Graph,
  chunks: Chunk[],
  semantic?: Map<string, number>,
): Promise<Answer> {
  const retrieval = retrieve(query, graph, chunks, { semantic })
  const verdict = judge(retrieval)

  if (verdict.refuse) {
    return {
      id: nextId(),
      query,
      title: 'Not enough grounded material',
      claims: [],
      relatedNodeIds: [],
      groundedness: 0,
      refused: true,
      note: 'The corpus does not contain enough relevant material to answer this confidently. Try rephrasing, or ask about a topic covered by the talks (e.g. reliability agents, GB200, NCCL, storage, public cloud).',
    }
  }

  // Comprehensive view: the speaker's contiguous segments grouped by talk.
  const { groups } = buildSegments(query, graph, chunks, semantic)

  // Derived flat claims (one per top segment) keep slideModel / validateAnswer / graph highlight
  // working off a single grounded structure.
  const claims: Claim[] = groups.flatMap((g) =>
    g.segments.slice(0, 1).map((seg): Claim => ({
      text: seg.text,
      citations: [{ talkId: g.talkId, label: g.label, ts: seg.startTs } as Citation],
    })),
  )

  // Fallback: if region-growing produced no segments (rare), fall back to the lone top chunk so we
  // never show an empty non-refused answer.
  if (claims.length === 0) {
    const s = retrieval.rankedChunks[0]
    claims.push({ text: s.chunk.text, citations: [{ talkId: s.chunk.talkId, label: talkLabel(graph, s.chunk.talkId), ts: s.chunk.ts }] })
  }

  const title = groups[0]?.label ?? talkLabel(graph, retrieval.rankedChunks[0].chunk.talkId)
  const relatedNodeIds = retrieval.subgraph.nodes.map((n) => n.id)
  return {
    id: nextId(),
    query,
    title,
    claims,
    groups,
    relatedNodeIds,
    groundedness: verdict.groundedness,
    refused: false,
  }
}
