// Orchestrates: config/agenda.json (+ optional config/videos.json) -> public/data/{graph,chunks}.json
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { extractTalk, mergeGraphs, addCrossYearEdges, type TalkInput, type ExtractParts } from './extract'
import { fetchCaptions, type Captions } from './fetchCaptions'
import type { Graph, Chunk } from './types'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Committed cache: makes `build:graph` reproducible offline (no yt-dlp/network needed in CI).
const cacheDir = join(root, 'captions-cache')

/** Cache fetched captions on disk (keyed by video id) so rebuilds don't re-hit YouTube.
 *  Set SCALEGRAPH_REFRESH=1 to bypass and re-fetch from source. */
async function cachedCaptions(id: string, url: string): Promise<Captions> {
  const file = join(cacheDir, `${id}.json`)
  if (!process.env.SCALEGRAPH_REFRESH && existsSync(file)) {
    return JSON.parse(await readFile(file, 'utf8')) as Captions
  }
  const caps = await fetchCaptions(url)
  if (caps.available) {
    await mkdir(cacheDir, { recursive: true })
    await writeFile(file, JSON.stringify(caps))
  }
  return caps
}

interface Agenda { event: { year: number }; talks: TalkInput[] }
interface VideoEntry { id: string; title: string; speakers?: string[]; company?: string; year?: number; url: string }

export async function build(): Promise<{ graph: Graph; chunks: Chunk[] }> {
  const agenda: Agenda = JSON.parse(await readFile(join(root, 'config/agenda.json'), 'utf8'))
  const parts: ExtractParts[] = agenda.talks.map((t) => extractTalk(t, agenda.event.year))

  // Optional: past-talk videos -> captions -> extraction (degrades silently).
  const videosPath = join(root, 'config/videos.json')
  if (existsSync(videosPath)) {
    const videos: VideoEntry[] = JSON.parse(await readFile(videosPath, 'utf8'))
    for (const v of videos) {
      const caps = await cachedCaptions(v.id, v.url)
      const year = caps.year ?? v.year // prefer the real source year; fall back to declared
      if (!caps.available) {
        console.warn(`[buildGraph] no captions for ${v.id} (${v.url}) — degrading to title-only node`)
      }
      console.log(`[buildGraph] ingested ${v.id} year=${year} captions=${caps.available} (${caps.text.length} chars)`)
      const talk: TalkInput = {
        id: v.id, title: v.title, speakers: v.speakers ?? [], company: v.company ?? '',
        type: 'talk', description: caps.available ? `${v.title}. ${caps.text}` : v.title,
      }
      parts.push(extractTalk(talk, year))
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
