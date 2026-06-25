// Orchestrates: config/agenda.json (+ optional config/videos.json) -> public/data/{graph,chunks}.json
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extractTalk, mergeGraphs, addCrossYearEdges, type TalkInput, type ExtractParts } from './extract'
import { fetchCaptions } from './fetchCaptions'
import type { Graph, Chunk } from './types'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

interface Agenda { event: { year: number }; talks: TalkInput[] }
interface VideoEntry { id: string; title: string; speakers?: string[]; company?: string; year: number; url: string }

export async function build(): Promise<{ graph: Graph; chunks: Chunk[] }> {
  const agenda: Agenda = JSON.parse(await readFile(join(root, 'config/agenda.json'), 'utf8'))
  const parts: ExtractParts[] = agenda.talks.map((t) => extractTalk(t, agenda.event.year))

  // Optional: past-talk videos -> captions -> extraction (degrades silently).
  const videosPath = join(root, 'config/videos.json')
  if (existsSync(videosPath)) {
    const videos: VideoEntry[] = JSON.parse(await readFile(videosPath, 'utf8'))
    for (const v of videos) {
      const caps = await fetchCaptions(v.url)
      if (!caps.available) {
        console.warn(`[buildGraph] no captions for ${v.id} (${v.url}) — degrading to title-only node`)
      }
      const talk: TalkInput = {
        id: v.id, title: v.title, speakers: v.speakers ?? [], company: v.company ?? '',
        type: 'talk', description: caps.available ? caps.text : v.title,
      }
      parts.push(extractTalk(talk, v.year))
    }
  }

  const { graph, chunks } = mergeGraphs(parts)
  addCrossYearEdges(graph)
  return { graph, chunks }
}

export async function buildAndWrite(): Promise<void> {
  const { graph, chunks } = await build()
  const outDir = join(root, 'public/data')
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, 'graph.json'), JSON.stringify(graph, null, 2))
  await writeFile(join(outDir, 'chunks.json'), JSON.stringify(chunks, null, 2))
  console.log(`[buildGraph] wrote ${graph.nodes.length} nodes, ${graph.edges.length} edges, ${chunks.length} chunks`)
}

// Run when invoked directly (npm run build:graph).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  buildAndWrite().catch((e) => { console.error(e); process.exit(1) })
}
