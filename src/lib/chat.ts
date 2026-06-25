// Conversational layer over the grounded retrieval engine.
// An assistant turn = a conversational `reply` ON TOP of cited `evidence` claims.
// Grounding (retrieve -> judge -> refuse) sits IN FRONT of any LLM, so replies can never
// free-form hallucinate: the model, when enabled, only rephrases retrieved/cited content.

import type { Answer, Claim, Citation, Graph, Chunk, GraphNode } from '../types'
import { retrieve, tokenize } from './retrieve'
import { judge } from './judge'
import { isEnabled, chatSynthesize, type SynthContext } from './llm'

export interface ChatTurn { role: 'user' | 'assistant'; text: string }

export interface ChatMessage extends Answer {
  reply: string          // conversational text shown to the user
  followups: string[]    // suggested next questions
}

let counter = 0
const nextId = () => `msg-${(counter += 1)}`

const ANAPHORA = /^(what about|how about|tell me more|more|and |also|why|that|those|it|them|this|elaborate|go on|explain)\b/i

/** Expand short / anaphoric follow-ups with the previous user turn so retrieval has context. */
export function expandQuery(history: ChatTurn[], message: string): string {
  const lastUser = [...history].reverse().find((t) => t.role === 'user')?.text ?? ''
  const isFollowup = ANAPHORA.test(message.trim()) || tokenize(message).length <= 3
  return isFollowup && lastUser ? `${lastUser} ${message}` : message
}

function label(graph: Graph, talkId: string): string {
  return graph.nodes.find((n: GraphNode) => n.id === talkId)?.label ?? talkId
}

const OPENERS = [
  'Here’s what came up at @Scale on that:',
  'Good question — from the talks:',
  'From the conference corpus:',
  'Here’s what the speakers covered:',
]

/** Deterministic opener pick (no RNG) so tests are stable and replays are reproducible. */
function opener(query: string): string {
  let h = 0
  for (const c of query) h = (h + c.charCodeAt(0)) % OPENERS.length
  return OPENERS[h]
}

/** Build a grounded conversational reply from extractive claims (the no-key path). */
function templatedReply(query: string, claims: Claim[]): string {
  const lead = claims[0]
  const intro = opener(query)
  const body = lead ? `${lead.text} (${lead.citations[0]?.label ?? ''})` : ''
  const more = claims.length > 1 ? ` There’s more on this in ${claims.length - 1} other talk${claims.length > 2 ? 's' : ''} below.` : ''
  return `${intro} ${body}${more}`.trim()
}

/** Suggest follow-ups from sibling talks/themes surfaced in the subgraph. */
function buildFollowups(graph: Graph, answer: Answer): string[] {
  const talkLabels = answer.relatedNodeIds
    .map((id) => graph.nodes.find((n) => n.id === id))
    .filter((n): n is GraphNode => !!n && n.type === 'Talk')
    .map((n) => n.label)
  const cited = new Set(answer.claims.flatMap((c) => c.citations.map((x) => x.label)))
  const others = talkLabels.filter((l) => !cited.has(l)).slice(0, 2)
  const fu = others.map((l) => `Tell me about "${l.length > 40 ? l.slice(0, 38) + '…' : l}"`)
  return fu.slice(0, 3)
}

export async function respond(
  history: ChatTurn[],
  message: string,
  graph: Graph,
  chunks: Chunk[],
): Promise<ChatMessage> {
  const query = expandQuery(history, message)
  const retrieval = retrieve(query, graph, chunks)
  const verdict = judge(retrieval)

  if (verdict.refuse) {
    return {
      id: nextId(), query: message, title: '', claims: [], relatedNodeIds: [],
      groundedness: 0, refused: true,
      reply:
        'I can only answer from what’s actually been presented at @Scale, and I don’t have anything in the corpus on that. ' +
        'Try asking about reliability agents, GB200, NCCL debugging, storage, public cloud, or security of agents.',
      followups: ['How does Meta use agents for reliability?', 'What is the GB200 NVL72?', 'How does Meta debug NCCL timeouts?'],
    }
  }

  const top = retrieval.rankedChunks.slice(0, 4)
  const claims: Claim[] = top.map((s) => {
    const citation: Citation = { talkId: s.chunk.talkId, label: label(graph, s.chunk.talkId), ts: s.chunk.ts }
    return { text: s.chunk.text, citations: [citation] }
  })
  const relatedNodeIds = retrieval.subgraph.nodes.map((n) => n.id)
  const title = label(graph, top[0].chunk.talkId)

  let reply = templatedReply(message, claims)
  if (isEnabled()) {
    const contexts: SynthContext[] = top.map((s) => ({ talkLabel: label(graph, s.chunk.talkId), text: s.chunk.text }))
    const synth = await chatSynthesize(history, message, contexts)
    if (synth) reply = synth // grounded conversational reply; evidence claims stay attached below
  }

  return {
    id: nextId(), query: message, title, claims, relatedNodeIds,
    groundedness: verdict.groundedness, refused: false,
    reply,
    followups: buildFollowups(graph, { id: '', query, title, claims, relatedNodeIds, groundedness: verdict.groundedness, refused: false }),
  }
}
