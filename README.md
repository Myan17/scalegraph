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

Measured retrieval quality (see `scripts/eval.ts`): lexical-only **57%** → hybrid **86%**
precision@1, with off-topic queries correctly refused.

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
