// OPTIONAL LLM synthesis. Strictly feature-flagged: the app is fully functional without it.
// When enabled, the model may only REPHRASE grounded claims — it must never introduce
// uncited content. Citations are attached by the composer, not the model.

import type { Claim } from '../types'

const MODEL = 'claude-sonnet-4-6' // cost-efficient; swap to claude-opus-4-8 for max quality

export function isEnabled(): boolean {
  return Boolean(import.meta?.env?.VITE_ANTHROPIC_API_KEY)
}

export interface SynthContext {
  talkLabel: string
  text: string
}

/**
 * Rephrase grounded snippets into a tighter answer. Returns a title and rephrased claim texts
 * in the SAME ORDER as the input contexts so the composer can re-attach citations 1:1.
 * Falls back to identity (returns null) on any error — caller keeps the extractive answer.
 */
export async function synthesize(
  query: string,
  contexts: SynthContext[],
): Promise<{ title: string; claimTexts: string[] } | null> {
  if (!isEnabled()) return null
  try {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string
    const system =
      'You rewrite conference-talk snippets into a concise grounded answer. ' +
      'You MUST NOT add facts not present in the snippets. Return JSON ' +
      '{"title": string, "claims": string[]} where claims has exactly one entry per snippet, ' +
      'in the same order, each a one-sentence rephrasing grounded ONLY in that snippet.'
    const user =
      `Question: ${query}\n\nSnippets:\n` +
      contexts.map((c, i) => `[${i}] (${c.talkLabel}) ${c.text}`).join('\n')

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text: string = data?.content?.[0]?.text ?? ''
    const parsed = JSON.parse(text)
    if (!parsed?.title || !Array.isArray(parsed?.claims)) return null
    // Enforce 1:1 alignment; if the model returned the wrong count, reject (keep extractive).
    if (parsed.claims.length !== contexts.length) return null
    return { title: parsed.title, claimTexts: parsed.claims.map(String) }
  } catch {
    return null
  }
}

export type { Claim }
