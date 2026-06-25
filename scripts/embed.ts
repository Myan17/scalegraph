// Build-time semantic embedding generator.
// Reads public/data/chunks.json, embeds each chunk with all-MiniLM-L6-v2, and writes
// public/data/embeddings.json (committed). The browser embeds the QUERY with the same model
// at runtime and ranks chunks by cosine similarity — handling paraphrase/synonyms.
//
// Note: the Node import of @xenova/transformers pulls `sharp` (image-only). If sharp's native
// binary is unavailable, stub node_modules/sharp/lib/index.js — embeddings are TEXT-only.

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pipeline } from '@xenova/transformers'

export const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')

interface Chunk { id: string; talkId: string; text: string }

async function main() {
  const chunks: Chunk[] = JSON.parse(await readFile(join(root, 'public/data/chunks.json'), 'utf8'))
  console.log(`[embed] embedding ${chunks.length} chunks with ${EMBED_MODEL} …`)
  const extractor = await pipeline('feature-extraction', EMBED_MODEL, { quantized: true })

  const vectors: number[][] = []
  for (let i = 0; i < chunks.length; i++) {
    const out = await extractor(chunks[i].text, { pooling: 'mean', normalize: true })
    // round to 4 decimals to keep the committed file small; vectors are unit-normalized
    vectors.push(Array.from(out.data as Float32Array, (v) => Math.round(v * 1e4) / 1e4))
    if ((i + 1) % 100 === 0) console.log(`[embed]   ${i + 1}/${chunks.length}`)
  }

  const payload = {
    model: EMBED_MODEL,
    dim: vectors[0]?.length ?? 0,
    ids: chunks.map((c) => c.id),
    vectors,
  }
  await writeFile(join(root, 'public/data/embeddings.json'), JSON.stringify(payload))
  console.log(`[embed] wrote ${vectors.length} vectors (dim ${payload.dim})`)
}

main().catch((e) => { console.error(e); process.exit(1) })
