// Eval harness: ~20 questions with the EXPECTED best talk. Runs lexical-only vs hybrid
// (lexical + semantic embeddings) and reports precision@1 + the top talk for each, so we can
// see the improvement is real. Requires public/data/{graph,chunks,embeddings}.json.

import { readFileSync } from 'node:fs'
import { composeAnswer } from '../src/lib/answer'
import { semanticScores, type EmbeddingIndex } from '../src/lib/semantic'
import { pipeline } from '@xenova/transformers'

const graph = JSON.parse(readFileSync('public/data/graph.json', 'utf8'))
const chunks = JSON.parse(readFileSync('public/data/chunks.json', 'utf8'))
const index: EmbeddingIndex = JSON.parse(readFileSync('public/data/embeddings.json', 'utf8'))
const byId: Record<string, any> = Object.fromEntries(graph.nodes.map((n: any) => [n.id, n]))

// [question, acceptable best-talk id(s) | null=open | 'REFUSE']
const CASES: [string, string | string[] | null][] = [
  ['How does Meta debug NCCL timeouts?', 'talk:liu-agentic-debug-2026'],
  ['What is the GB200 NVL72?', 'talk:nvidia-gb200-2026'],
  ['How does Meta use agents for reliability incidents?', 'talk:mitra-fight-fires-2026'],
  ['How is Meta extending to the public cloud?', 'talk:extending-public-cloud-2026'],
  ['What was said about security of agents?', 'talk:security-of-agents'],
  ['How is private user data protected?', 'talk:kirti-privacy-2026'],
  ['How does Meta store training data for AI?', ['talk:storage-blueprint-2026', 'talk:ai-training-storage-data-normalization']],
  ['How do they recover from a regional outage?', 'talk:stop-the-world-2026'],
  ['How do you keep large training jobs from failing?', ['talk:reliability-llm-training-observability', 'talk:scaling-llama4-training-100k']],
  ['What does the data center network look like?', 'talk:meta-dc-networks-generative-ai'],
  ['How is Meta scaling Llama training?', 'talk:scaling-llama4-training-100k'],
  ['Tell me about managing infrastructure with code', 'talk:duffy-agentic-gap-2026'],
  // paraphrase / synonym stress
  ['How do they stop GPU training runs from crashing?', null], // open: any training/reliability talk
  ['What keeps the website online during failures?', 'talk:stop-the-world-2026'],
  ['How are autonomous agents kept from doing damage?', ['talk:pariag-agents-2026', 'talk:security-of-agents']],
  // off-topic → must refuse
  ['Best pizza toppings in Naples?', 'REFUSE'],
  ['What is the weather in Paris tomorrow?', 'REFUSE'],
  ['Who won the football world cup?', 'REFUSE'],
]

async function run(label: string, useSemantic: boolean) {
  let extractor: any = null
  if (useSemantic) extractor = await pipeline('feature-extraction', index.model, { quantized: true })
  let hits = 0, scored = 0, refuseOk = 0, refuseTotal = 0
  const rows: string[] = []
  for (const [q, expected] of CASES) {
    let sem: Map<string, number> | undefined
    if (useSemantic) {
      const out = await extractor(q, { pooling: 'mean', normalize: true })
      sem = semanticScores(Array.from(out.data), index)
    }
    const a = await composeAnswer(q, graph, chunks, sem)
    const top = a.claims[0]?.citations[0]?.talkId
    const topLabel = a.refused ? 'REFUSED' : (byId[top]?.label ?? top)
    if (expected === 'REFUSE') {
      refuseTotal++; if (a.refused) refuseOk++
      rows.push(`${a.refused ? '✅' : '❌'} [refuse] ${q} -> ${topLabel}`)
    } else if (expected === null) {
      rows.push(`•  [open]   ${q} -> ${topLabel}`)
    } else {
      const ok = Array.isArray(expected) ? expected.includes(top) : top === expected
      scored++; if (ok) hits++
      const want = Array.isArray(expected) ? expected.map((e) => byId[e]?.label).join(' / ') : (byId[expected]?.label ?? expected)
      rows.push(`${ok ? '✅' : '❌'} ${q} -> ${topLabel}${ok ? '' : `  (want ${want})`}`)
    }
  }
  console.log(`\n===== ${label} =====`)
  console.log(rows.join('\n'))
  console.log(`\nprecision@1 (labeled): ${hits}/${scored} = ${(100 * hits / scored).toFixed(0)}%   |   refusal: ${refuseOk}/${refuseTotal}`)
}

async function main() {
  await run('LEXICAL ONLY', false)
  await run('HYBRID (lexical + semantic)', true)
}
main().catch((e) => { console.error(e); process.exit(1) })
