<div align="center">

# ScaleGraph

**An agentic, grounded knowledge-graph companion for the [@Scale](https://atscaleconference.com/) conference series.**

Ask anything about the program and the back-catalog → get a **cited** answer → and a **shareable slide**.
Stop photographing the stage.

</div>

---

## Why

Every @Scale conference is a firehose of talks, speakers, systems, and recurring themes. ScaleGraph
ingests an event's agenda — plus the published back-catalog of past talks — into a single queryable
**knowledge graph**, and answers natural-language questions with answers that are **grounded by
construction**: every claim cites a real talk, and the system **visibly refuses** when the corpus
can't support an answer.

It's built to be **handed to the conference**: drop in a new agenda + a list of past-talk videos,
rebuild, and it works for the next event — no code changes.

It also mirrors the very ideas the 2026 *Systems & Reliability* program is about — agentic systems,
guardrails, and LLM-as-Judge evaluation — so the tool that indexes the conference embodies the
conference's own thesis.

## What you get

- **Explore** — the whole conference as an interactive force-graph (drag, pin, click). Teal dashed
  links trace how a theme evolves across years.
- **Ask** — cited answers over the corpus. Click a citation to highlight its talk in the graph.
- **Timeline** — one theme traced across multiple @Scale years.
- **Slides** — every answer auto-renders as a polished slide, exportable to **PNG / PDF / .pptx**.
- **Grounded or silent** — if retrieval is too weak, ScaleGraph refuses instead of hallucinating.

## Quickstart (5 minutes)

```bash
npm install
npm run build:graph     # builds public/data/{graph,chunks}.json from config/
npm run dev             # open the printed localhost URL
```

That's it — **no API keys, no backend, no cost.** Answers are *fully extractive and grounded*:
ScaleGraph retrieves the most relevant talks and shows the **speaker's actual words**, verbatim,
each cited to its talk. No generation, no paraphrase that could drift, no hallucination — and it
**refuses** when the corpus can't support an answer.

### Semantic search

Natural-language questions are matched by **meaning**, not just keywords, so paraphrases work
("how do they keep the site up during a failure?" → the regional-outage talk). This runs a small
embedding model (`all-MiniLM-L6-v2`) **in your browser** — the model and its onnxruntime WASM are
**self-hosted** (under `public/models` and `public/*.wasm`), so there's no external CDN dependency.
First use downloads ~30 MB once, then it's cached. Chunk embeddings are precomputed and committed
(`public/data/embeddings.json`); if the model fails to load, search degrades gracefully to lexical.

To regenerate embeddings after changing the corpus:

```bash
npm run build:graph        # rebuild chunks
npm run build:embeddings   # re-embed (Node; see note below)
```

> Note: `build:embeddings` imports transformers.js in Node, which pulls `sharp` (image-only,
> unused here). If `sharp`'s native binary won't install in your environment, the committed
> `embeddings.json` already ships — you only need to regenerate if you change the talks.

Semantic ranking lifts retrieval precision from **57% → 86%** (see [Accuracy](#accuracy) for the
full picture and honest caveats). Note: the in-browser model has a heavy first-load — see
[Known bottlenecks](#known-bottlenecks-why-this-is-a-prototype-not-a-production-system).

## Add your conference

ScaleGraph is config-driven. To target a new event:

1. Edit **`config/agenda.json`** — event metadata + a `talks[]` array (title, speakers, company,
   track, description).
2. *(Optional)* Add **`config/videos.json`** — past-talk entries `{ id, title, speakers, company,
   url }`. Transcripts are pulled via [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) auto-captions and
   the **real upload year is read from the source** (no need to hand-enter it). Talks without
   captions degrade gracefully to title-only nodes.
3. Run `npm run build:graph && npm run build`.

This repo ships with **8 real past @Scale talks already wired in** (`config/videos.json`) — reliability,
storage, distributed training, DC networks, and agentic-systems talks from 2025–2026. Their
transcripts are cached in **`captions-cache/`** (committed), so `npm run build:graph` is fully
**reproducible offline** — no `yt-dlp` or network required. These past talks are what power the
cross-year **Timeline** and the dashed "evolves" links. To re-fetch fresh from YouTube:

```bash
yt-dlp --version || brew install yt-dlp     # yt-dlp must be on PATH
SCALEGRAPH_REFRESH=1 npm run build:graph
```

Multiple years in the corpus is what powers the cross-year **Timeline** and the dashed "evolves"
links in the graph.

## Architecture

```
config/agenda.json + config/videos.json
        │  scripts/  (yt-dlp + deterministic extraction, offline)
        ▼
public/data/graph.json + chunks.json        ← static, shipped with the site
        │
question ─► retrieve (lexical + subgraph) ─► judge (groundedness) ─► answer (extractive; opt. LLM)
                                                                        │
                                         ┌──────────────────────────────┼─────────────────┐
                                         ▼                              ▼                 ▼
                                   AnswerView (prose+cites)       SlideView          PNG / PDF / .pptx
```

| Unit | File | Responsibility |
|---|---|---|
| Types | `scripts/types.ts` | single source of truth for the data model |
| Extraction | `scripts/extract.ts` | talk → Talk/Speaker/Company/Theme/System/Metric nodes |
| Build | `scripts/buildGraph.ts` | config → static graph + chunks artifacts |
| Captions | `scripts/fetchCaptions.ts` | optional yt-dlp transcript fetch (never throws) |
| Retrieval | `src/lib/retrieve.ts` | idf-weighted lexical ranking + 1-hop subgraph |
| Judge | `src/lib/judge.ts` | groundedness score + refusal threshold |
| Answer | `src/lib/answer.ts` | extractive-by-default composer (+ optional LLM) |
| Slides | `src/lib/slideModel.ts`, `src/lib/exportSlide.ts` | Answer → SlideSpec → PNG/PDF/.pptx |
| UI | `src/components/*` | ForceGraph, AskBar, AnswerView, SlideView, Timeline |

## Accuracy

ScaleGraph has **two very different accuracy numbers**, and it's important to keep them separate.

### 1. Faithfulness — effectively 100% (this is the point)

Answers are **fully extractive**: every sentence shown is verbatim from the cited talk's transcript
or description, and the system **refuses** when retrieval is too weak. It therefore *cannot fabricate*
content — there is no generative step to hallucinate. Across all eval questions, zero made-up content
and off-topic questions were correctly refused. This is the dimension that matters most for trust, and
it is a structural guarantee, not a measured average.

### 2. Retrieval precision — ~86% "best talk first" (measured, but small sample)

Whether it surfaces the *single best* talk for a question is a search problem. Measured with
`scripts/eval.ts` (18 hand-labeled questions, lexical-only vs hybrid lexical+semantic):

| Mode | precision@1 | Refusal |
|---|---|---|
| Lexical only | **57%** (8/14) | 2/3 |
| Hybrid (lexical + semantic) | **86%** (12/14) | 3/3 |

In-browser spot-check (the real deployed path, driven via Chrome DevTools): **7/7** clear cases,
**2/2** refusals.

**Be honest about what this number is:** it's an **18-question hand-labeled set**, not a rigorous
benchmark. There is no precision/recall@k, MRR, or nDCG, no human relevance panel, and the labels
reflect one author's judgment. Treat "86%" as *indicative*, not validated. The remaining misses are
**topically-adjacent talks, never nonsense** — e.g. a privacy question returns the storage talk
(both about "data"), because short agenda-description talks lose to long full-transcript talks. The
quantized embedding model also produces slightly different rankings in-browser vs Node, so close
calls can flip between environments.

### Transcript quality

Past-talk transcripts come from **YouTube auto-captions**, which carry ASR errors that are NOT
corrected (e.g. "Meta" → "MTA", "shared" → "scared"). The text is coherent and readable, but it is
not a clean human transcript.

---

## Known bottlenecks (why this is a prototype, not a production system)

This is a working, deployed prototype built in a day — not a production system. The honest gaps:

### Performance — the semantic-search first-load is slow

The single biggest UX problem. Natural-language search needs the embedding model in the browser, and
**first use downloads ~31 MB** (22 MB quantized model + 9.5 MB onnxruntime WASM). Worse, **GitHub
Pages is not a model-serving CDN** — measured throughput for the 22 MB model was **~68 KB/s, i.e.
~5–6 minutes** to download. (On a fast CDN/connection this is seconds, but as deployed it's the
dominant cost.) After first load the model is browser-cached and every query is ~sub-second.

**How to fix the first-load bottleneck (in rough order of impact):**

1. **Serve the model from a real CDN** (Cloudflare, jsDelivr, or HF Hub) instead of GitHub Pages —
   the throttling, not the size, is the worst part. Easiest large win.
2. **Server-side query embedding** — a tiny serverless function (Cloudflare Worker / Vercel) embeds
   the query so the client downloads *nothing*. Removes the 31 MB entirely; reintroduces a backend.
3. **Smaller embedding model** — swap `all-MiniLM-L6-v2` (22 MB) for a tinier one (`bge-micro`,
   `gte-tiny`, `Potion/Model2Vec` static embeddings at ~a few MB) — trades some accuracy for size.
4. **Progressive results** — show lexical results *instantly*, then silently re-rank when the model
   finishes loading. Hides the latency entirely. (Not yet implemented.)
5. **Multi-threaded WASM** — set COOP/COEP headers (impossible on GitHub Pages, trivial on a real
   host) to speed inference. Note: inference isn't the bottleneck here, download is.
6. **Pre-warm on load** — start the download in the background before the user clicks Ask.

### Data
- **Single conference, 8 hand-picked past talks.** No automated ingestion pipeline; videos are
  curated by hand in `config/videos.json`.
- **Uncorrected ASR errors** in transcripts (see above).
- **No slides ingested** — the slide feature *generates* slides; it doesn't read real decks.

### Retrieval & ranking
- Hybrid lexical + a single bi-encoder embedding model; **no cross-encoder reranker**, no learned
  fusion (weights are hand-tuned constants), no query rewriting/expansion, no typo tolerance.
- **Chunking is naive** (sentence-merge to ~160 chars, no overlap, no semantic boundaries).
- Short agenda-description talks are systematically out-ranked by long transcripts.

### Evaluation
- **18-question hand-labeled set.** No standard IR metrics (recall@k, MRR, nDCG), no held-out test
  set, no regression suite on retrieval quality, no human relevance judgments.

### Serving & ops
- Fully static, **no backend** — which is why the model is shipped to the client.
- No telemetry, no feedback loop, no A/B harness, no rate limiting, no auth, no monitoring/alerting.
- ~42 MB of model/WASM committed to git (works, but not how you'd ship binaries in production).

### Scope
- One UI author's visual/UX pass; not accessibility-audited beyond basics.
- No multi-turn conversation/memory; each question is independent.

---

## Future work (toward robust & accurate)

**Accuracy & ranking**
- Add a **cross-encoder reranker** over the top-k candidates (biggest precision lever).
- **Learned fusion** (e.g. Reciprocal Rank Fusion) instead of hand-tuned lexical/semantic weights.
- **Query understanding**: rewriting, expansion, typo correction, multi-intent splitting.
- **Boost focused talks** over panels/keynotes/agenda-stubs with metadata-aware scoring.
- Smarter **chunking** (overlapping windows, semantic boundaries, title/section context).

**Data quality**
- **ASR cleanup**: an offline punctuation/spelling-correction pass over auto-captions (e.g. an LLM
  normalization step at build time), or source higher-quality transcripts.
- **Automated ingestion** for any conference: discover the channel's talks, fetch, dedupe, embed.

**Evaluation**
- A real **eval harness**: a larger labeled set, recall@k / MRR / nDCG, regression gates in CI, and
  ideally human relevance judgments.

**Performance & serving**
- Move the model to a **CDN** or a **server-side embedding endpoint**; progressive lexical-first
  results; smaller/static embeddings; warm-on-load.

**Product**
- Multi-turn **conversational** follow-ups with context.
- Per-answer **feedback** (thumbs up/down) feeding a relevance-tuning loop.
- Timestamped **deep links** into the source video for each citation.

---

## Tests

```bash
npm test        # vitest — engine + components
```

## Deploy

A GitHub Pages workflow (`.github/workflows/pages.yml`) builds and publishes `dist/` on push to
`main`. Set the Vite `base` in `vite.config.ts` to match your repo path.

## License

[MIT](./LICENSE) — chosen to match Meta's open-source ecosystem for frictionless adoption.

---

<div align="center"><sub>Built as a companion proposal for @Scale Systems &amp; Reliability 2026.</sub></div>
