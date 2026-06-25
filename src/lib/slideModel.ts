// Map a grounded Answer into a SlideSpec: the same structured content, laid out as a deck slide.
import type { Answer, Graph, SlideSpec } from '../types'

const MAX_BULLET = 180

function trim(s: string): string {
  return s.length > MAX_BULLET ? s.slice(0, MAX_BULLET - 1).trimEnd() + '…' : s
}

export function toSlideSpec(answer: Answer, _graph?: Graph): SlideSpec {
  if (answer.refused) {
    return {
      title: 'No grounded answer',
      bullets: [{ text: answer.note ?? 'Not enough material in the corpus.', cite: '' }],
      sources: [],
      nodeIds: [],
    }
  }

  const bullets = answer.claims.slice(0, 5).map((c) => ({
    text: trim(c.text),
    cite: c.citations[0]?.label ?? '',
  }))

  const sources = [...new Set(answer.claims.flatMap((c) => c.citations.map((x) => x.label)))]

  return {
    title: answer.title,
    bullets,
    sources,
    nodeIds: answer.relatedNodeIds,
  }
}
