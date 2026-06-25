import { composeAnswer } from '../src/lib/answer'
import { readFileSync } from 'node:fs'

const graph = JSON.parse(readFileSync('public/data/graph.json', 'utf8'))
const chunks = JSON.parse(readFileSync('public/data/chunks.json', 'utf8'))
const byId: Record<string, any> = Object.fromEntries(graph.nodes.map((n: any) => [n.id, n]))

const Q: [string, string][] = [
  ['DIRECT', 'How does Meta debug NCCL timeouts?'],
  ['DIRECT', 'What is the GB200 NVL72?'],
  ['DIRECT', 'How does Meta use agents for reliability incidents?'],
  ['DIRECT', 'How is Meta extending to the public cloud?'],
  ['DIRECT', 'What was said about security of agents?'],
  ['PARAPHRASE', 'How do they stop training jobs from crashing?'],
  ['PARAPHRASE', 'What hardware runs the largest models?'],
  ['PARAPHRASE', 'How do they keep the site up during a major outage?'],
  ['PARAPHRASE', 'How is private user data protected?'],
  ['OFF-TOPIC', 'Best pizza toppings in Naples?'],
  ['OFF-TOPIC', 'What is the weather in Paris tomorrow?'],
]

async function main() {
  for (const [kind, q] of Q) {
    const a = await composeAnswer(q, graph, chunks)
    const top = a.claims[0]?.citations[0]
    const topTalk = top ? byId[top.talkId]?.label : '(refused)'
    const line = a.refused
      ? 'REFUSED'
      : `top talk: ${(topTalk || '').slice(0, 48)} | grounded=${a.groundedness.toFixed(2)} | claims=${a.claims.length}`
    console.log(`[${kind}] ${q}\n   -> ${line}`)
  }
}
main()
