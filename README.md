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

That's it — the demo runs **fully offline** with zero API keys. Answers are *extractive and grounded*
by default: ScaleGraph retrieves the most relevant talks and presents their real descriptions with
citations. No generation, no hallucination.

### Optional: LLM synthesis

To have answers rephrased more fluently (still grounded — the model may only rewrite cited claims,
never add new ones), provide an Anthropic API key:

```bash
echo "VITE_ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
```

## Add your conference

ScaleGraph is config-driven. To target a new event:

1. Edit **`config/agenda.json`** — event metadata + a `talks[]` array (title, speakers, company,
   track, description).
2. *(Optional)* Add **`config/videos.json`** — past-talk entries `{ id, title, speakers, company,
   year, url }`. Captions are pulled via [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) if installed;
   if not, those talks degrade gracefully to title-only nodes.
3. Run `npm run build:graph && npm run build`.

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
