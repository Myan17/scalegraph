// Client-side semantic search. Lazily loads all-MiniLM-L6-v2 (transformers.js), embeds the
// QUERY in the browser, and scores chunks by cosine similarity against the precomputed,
// committed embeddings. No keys, no backend — the model is fetched once and cached by the browser.

export const EMBED_MODEL = 'Xenova/all-MiniLM-L6-v2'

export interface EmbeddingIndex {
  model: string
  dim: number
  ids: string[]
  vectors: number[][]
}

let extractorPromise: Promise<(text: string, opts: object) => Promise<{ data: Float32Array }>> | null = null

/** Lazily load the embedding model. Heavy (~one-time ~30MB, then browser-cached) but all
 *  same-origin: the model and onnxruntime WASM are self-hosted (no external CDN dependency). */
async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import('@xenova/transformers')
      const base = import.meta.env.BASE_URL // e.g. "/scalegraph/"
      // Self-hosted model + WASM, single-threaded (GitHub Pages has no cross-origin isolation).
      env.allowLocalModels = true
      env.allowRemoteModels = false
      env.localModelPath = `${base}models/`
      env.backends.onnx.wasm.wasmPaths = base
      env.backends.onnx.wasm.numThreads = 1
      return pipeline('feature-extraction', EMBED_MODEL, { quantized: true }) as unknown as (
        text: string,
        opts: object,
      ) => Promise<{ data: Float32Array }>
    })()
  }
  return extractorPromise
}

/** Embed a query into a unit-normalized vector (same space as the committed chunk vectors). */
export async function embedQuery(text: string): Promise<number[]> {
  const extractor = await getExtractor()
  const out = await extractor(text, { pooling: 'mean', normalize: true })
  return Array.from(out.data)
}

/** Cosine similarity of the query against every chunk (both sides unit-normalized → dot product). */
export function semanticScores(qvec: number[], index: EmbeddingIndex): Map<string, number> {
  const scores = new Map<string, number>()
  const n = Math.min(qvec.length, index.dim)
  for (let i = 0; i < index.ids.length; i++) {
    const v = index.vectors[i]
    let dot = 0
    for (let j = 0; j < n; j++) dot += qvec[j] * v[j]
    scores.set(index.ids[i], dot)
  }
  return scores
}

/** Convenience: embed the query and score in one call. Returns null if the model fails to load. */
export async function semanticScoresFor(query: string, index: EmbeddingIndex): Promise<Map<string, number> | null> {
  try {
    const qvec = await embedQuery(query)
    return semanticScores(qvec, index)
  } catch {
    return null // model load/network failure → caller falls back to lexical
  }
}
