// OPTIONAL LLM synthesis. Strictly feature-flagged: the app is fully functional without it.
// When enabled, the model may only REPHRASE grounded claims — it must never introduce
// uncited content. Citations are attached by the composer, not the model.

import type { Claim } from '../types'

const MODEL = 'claude-sonnet-4-6' // cost-efficient; swap to claude-opus-4-8 for max quality
const LS_KEY = 'scalegraph.anthropicKey'

/** Resolve the API key: runtime localStorage (bring-your-own-key) takes precedence over the
 *  build-time env var. Keys live only in the user's browser and are never committed. */
export function getApiKey(): string {
  try {
    const ls = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null
    if (ls) return ls
  } catch { /* localStorage blocked */ }
  return (import.meta?.env?.VITE_ANTHROPIC_API_KEY as string) ?? ''
}

export function setApiKey(key: string): void {
  try { key ? localStorage.setItem(LS_KEY, key) : localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
}

export function isEnabled(): boolean {
  return Boolean(getApiKey())
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

/**
 * Conversational, grounded synthesis for the chat agent. Given the conversation history and the
 * retrieved snippets, produce a natural multi-turn reply that uses ONLY the snippets. Returns a
 * plain string, or null on any error (caller keeps the templated grounded reply). Citations are
 * shown separately as evidence, so this text never carries the grounding burden alone.
 */
export async function chatSynthesize(
  history: { role: 'user' | 'assistant'; text: string }[],
  message: string,
  contexts: SynthContext[],
): Promise<string | null> {
  if (!isEnabled()) return null
  try {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string
    const system =
      'You are ScaleGraph, a conversational assistant for the @Scale conference. Answer ONLY from the ' +
      'provided talk snippets — never add facts not present in them, and never invent talks or speakers. ' +
      'Be concise, natural, and conversational (2-4 sentences). Refer to talks by name when relevant. ' +
      'If the snippets do not address the question, say so plainly.'
    const convo = history.slice(-6).map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.text}`).join('\n')
    const snippets = contexts.map((c, i) => `[${i}] (${c.talkLabel}) ${c.text}`).join('\n')
    const user = `${convo ? convo + '\n' : ''}User: ${message}\n\nSnippets you may use:\n${snippets}`

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
        max_tokens: 512,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text: string = data?.content?.[0]?.text ?? ''
    return text.trim() || null
  } catch {
    return null
  }
}

export type { Claim }
