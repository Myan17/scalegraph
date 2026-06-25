// Groundedness judge: maps retrieval confidence to a groundedness score and a refusal decision.
// This is the structural guardrail — if the corpus can't support an answer, we refuse.

import type { Retrieval } from './retrieve'

export const REFUSE_THRESHOLD = 0.15

export interface Verdict {
  groundedness: number
  refuse: boolean
}

export function judge(retrieval: Retrieval): Verdict {
  const { confidence, rankedChunks } = retrieval
  const refuse = rankedChunks.length === 0 || confidence < REFUSE_THRESHOLD
  // Groundedness tracks confidence but is dampened when only a single weak chunk matched.
  const support = Math.min(1, rankedChunks.length / 3)
  const groundedness = refuse ? 0 : Math.max(0, Math.min(1, confidence * 0.7 + support * 0.3))
  return { groundedness, refuse }
}
