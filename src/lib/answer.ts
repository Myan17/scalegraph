// Answer composer: retrieval-first and FULLY EXTRACTIVE. Every claim is the speaker's actual
// words, verbatim, cited to the source talk. No LLM, no keys, no paraphrase that could drift —
// grounded by construction. Refuses when retrieval is too weak.

import type { Answer, Claim, Citation, Graph, Chunk, GraphNode } from '../types'
import { retrieve } from './retrieve'
import { judge } from './judge'

let counter = 0
function nextId(): string {
  counter += 1
  return `ans-${counter}`
}

function talkLabel(graph: Graph, talkId: string): string {
  return graph.nodes.find((n: GraphNode) => n.id === talkId)?.label ?? talkId
}

export async function composeAnswer(query: string, graph: Graph, chunks: Chunk[]): Promise<Answer> {
  const retrieval = retrieve(query, graph, chunks)
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

  // Extractive claims: one per top chunk, each cited to its source talk.
  const top = retrieval.rankedChunks.slice(0, 4)
  const claims: Claim[] = top.map((s) => {
    const citation: Citation = {
      talkId: s.chunk.talkId,
      label: talkLabel(graph, s.chunk.talkId),
      ts: s.chunk.ts,
    }
    return { text: s.chunk.text, citations: [citation] }
  })

  const title = talkLabel(graph, top[0].chunk.talkId)
  const relatedNodeIds = retrieval.subgraph.nodes.map((n) => n.id)
  return {
    id: nextId(),
    query,
    title,
    claims,
    relatedNodeIds,
    groundedness: verdict.groundedness,
    refused: false,
  }
}
