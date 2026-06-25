# ScaleGraph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A demoable-today, open-source, agentic knowledge-graph companion for the @Scale conference series that answers grounded, cited questions about the program and renders every answer as a polished, exportable slide.

**Architecture:** A Vite + React + TypeScript single-page app reads precomputed static JSON (`graph.json`, `chunks.json`). A Node/TypeScript ingestion script builds those artifacts from `config/agenda.json` (this event, real data) plus optional past-talk transcripts (via `yt-dlp` captions). Retrieval is graph traversal + lexical/semantic ranking, fully client-side. Q&A is **retrieval-first and extractive-by-default** (grounded, no API needed); optional LLM synthesis activates only when an API key is present. A single structured `Answer` object feeds two renderers: prose+citations and a slide (on-screen + PNG/PDF/.pptx export).

**Tech Stack:** TypeScript, Vite, React, D3-force (existing ForceGraph pattern), `yt-dlp` (CLI, optional), `html-to-image` (PNG), `pptxgenjs` (.pptx), browser print (PDF). Vitest for tests. Deploy: GitHub Pages.

## Global Constraints

- **License:** MIT (placeholder; confirm vs Apache-2.0). Include `LICENSE` + SPDX headers omitted for brevity.
- **Config-driven:** a new conference = new `config/agenda.json` + `config/videos.json`. No code changes.
- **Zero hard dependency on network/API at demo time:** extractive grounded answers must work fully offline. LLM synthesis is strictly optional and feature-flagged via `VITE_ANTHROPIC_API_KEY`.
- **Groundedness is structural:** every claim in any `Answer` carries ≥1 citation to a real corpus node; UI must visibly refuse when retrieval confidence is below threshold.
- **No fabricated talk data:** past-talk nodes come only from real ingested transcripts/descriptions. Never invent talk content.
- **Node types:** `Talk`, `Speaker`, `Company`, `Theme`, `System`, `Problem`, `Technique`, `Metric`.
- **Default LLM model when synthesis enabled:** `claude-opus-4-8` (or `claude-sonnet-4-6` for cost).
- **Working name:** ScaleGraph (placeholder).

---

## File Structure

```
scalegraph/
  config/
    agenda.json            # real 2026 event data (this build seeds it)
    videos.json            # list of past @Scale talk video URLs (optional ingest)
  scripts/
    types.ts               # shared graph/answer types (single source of truth)
    extract.ts             # talk -> nodes/edges/chunks extraction (deterministic + optional LLM)
    fetchCaptions.ts       # yt-dlp wrapper -> transcript text (optional, degrades gracefully)
    buildGraph.ts          # orchestrates: config -> public/data/{graph,chunks}.json
  public/
    data/
      graph.json           # generated
      chunks.json          # generated
  src/
    types.ts               # re-export of scripts/types.ts for the app
    lib/
      retrieve.ts          # query -> {subgraph, rankedChunks}
      answer.ts            # retrieval -> Answer (extractive; optional LLM synth)
      judge.ts             # groundedness scoring + refusal threshold
      llm.ts               # optional Anthropic client (feature-flagged)
      slideModel.ts        # Answer -> SlideSpec (title, bullets, citations, subgraph)
      exportSlide.ts       # SlideSpec -> PNG / PDF / .pptx
    components/
      ForceGraph.tsx       # graph hero (D3-force; drag/pin/animate)
      AskBar.tsx           # query input
      AnswerView.tsx       # prose + inline citations
      SlideView.tsx        # on-screen slide card + export buttons
      Timeline.tsx         # theme-evolution view
      ModeNav.tsx          # Explore / Ask / Timeline switch
    App.tsx
    main.tsx
    theme.css              # @Scale dark "observability console" tokens
  index.html
  README.md
  LICENSE
  CONTRIBUTING.md
  package.json
  vitest.config.ts
  tsconfig.json
  vite.config.ts
```

---

## Phase 0 — Scaffold

### Task 0: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/main.tsx`, `src/App.tsx`
- Test: `src/lib/__tests__/smoke.test.ts`

**Interfaces:**
- Produces: a runnable `npm run dev` app and `npm test` harness.

- [ ] **Step 1: Write failing smoke test**
```ts
// src/lib/__tests__/smoke.test.ts
import { describe, it, expect } from 'vitest'
import { ping } from '../smoke'
describe('smoke', () => { it('pings', () => { expect(ping()).toBe('pong') }) })
```
- [ ] **Step 2: Run `npx vitest run` → FAIL (cannot find '../smoke')**
- [ ] **Step 3: Create `src/lib/smoke.ts` with `export const ping = () => 'pong'`**
- [ ] **Step 4: Create `package.json` (deps: react, react-dom, d3-force; dev: vite, @vitejs/plugin-react, typescript, vitest, jsdom, html-to-image, pptxgenjs), `tsconfig.json`, `vite.config.ts` (base: `/scalegraph/`), `vitest.config.ts` (environment jsdom), `index.html`, minimal `src/main.tsx` + `src/App.tsx`. Run `npm install`.**
- [ ] **Step 5: Run `npx vitest run` → PASS; `npm run build` → succeeds**
- [ ] **Step 6: Commit** `git add -A && git commit -m "chore: scaffold Vite+React+TS app with vitest"`

---

## Phase 1 — Data model & real event data

### Task 1: Shared types

**Files:**
- Create: `scripts/types.ts`; Re-export: `src/types.ts`
- Test: `scripts/__tests__/types.test.ts`

**Interfaces:**
- Produces: `NodeType`, `GraphNode`, `GraphEdge`, `Graph`, `Chunk`, `Citation`, `Claim`, `Answer`, `SlideSpec`.

- [ ] **Step 1: Write failing test** asserting a `Graph` literal with one `Talk` node and one `Speaker` node and a `speaker->talk` edge type-checks and that `Answer` requires `claims[].citations.length >= 1` via a runtime validator `validateAnswer(a): string[]` (returns error list).
```ts
// scripts/__tests__/types.test.ts
import { describe, it, expect } from 'vitest'
import { validateAnswer } from '../types'
it('rejects a claim with no citations', () => {
  const errs = validateAnswer({ id:'a', query:'q', title:'t',
    claims:[{ text:'x', citations:[] }], relatedNodeIds:[], groundedness:1, refused:false })
  expect(errs).toContain('claim 0 has no citations')
})
```
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement `scripts/types.ts`** with the interfaces below and `validateAnswer`:
```ts
export type NodeType = 'Talk'|'Speaker'|'Company'|'Theme'|'System'|'Problem'|'Technique'|'Metric'
export interface GraphNode { id: string; type: NodeType; label: string; year?: number; meta?: Record<string,unknown> }
export interface GraphEdge { source: string; target: string; rel: string }
export interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }
export interface Chunk { id: string; talkId: string; text: string; ts?: number }
export interface Citation { talkId: string; label: string; ts?: number }
export interface Claim { text: string; citations: Citation[] }
export interface Answer { id: string; query: string; title: string; claims: Claim[]; relatedNodeIds: string[]; groundedness: number; refused: boolean; note?: string }
export interface SlideSpec { title: string; bullets: { text: string; cite: string }[]; sources: string[]; nodeIds: string[] }
export function validateAnswer(a: Answer): string[] { /* checks each claim has >=1 citation, groundedness in [0,1] */ }
```
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Create `src/types.ts` re-exporting:** `export * from '../scripts/types'`
- [ ] **Step 6: Commit** `git commit -am "feat: shared graph & answer types with validateAnswer"`

### Task 2: Seed real 2026 agenda config

**Files:**
- Create: `config/agenda.json`
- Test: `scripts/__tests__/agenda.test.ts`

**Interfaces:**
- Consumes: `Graph` types. Produces: `config/agenda.json` (real data, see content below).

- [ ] **Step 1: Write failing test** that loads `config/agenda.json`, asserts `talks.length === 15`, every talk has `title`, `speakers[]`, `company`, `description`, `track`, and that "Teaching AI to Fight Fires" is present.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Create `config/agenda.json`** with the 15 real talks (verbatim from the spec's extracted agenda: Surupa Biswas keynote; David Pariag "Safely Unleash Agents"; Joe Duffy/Pulumi "Agentic Infrastructure Gap"; Govindasamy/Dhillon "Extending Meta to Public Cloud"; Gaurav Mitra "Teaching AI to Fight Fires"; NVIDIA GB200; Rituraj Kirti "Privacy Aware Infrastructure"; Bajaj/Srinivasa "AI Storage Blueprint"; Peter Hoose keynote; Lopreiato/Iyengar "Stop The World"; Sharma/Kelly Microsoft "Securing Production Debugging"; Phillip Liu "Agentic Debugging"; plus welcome/panel placeholders). Include `event` metadata `{name:'Systems & Reliability', year:2026}`.
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `git commit -am "feat: seed real 2026 @Scale agenda config"`

### Task 3: Deterministic extraction (talk → nodes/edges/chunks)

**Files:**
- Create: `scripts/extract.ts`
- Test: `scripts/__tests__/extract.test.ts`

**Interfaces:**
- Consumes: agenda talk objects, `Graph`, `Chunk`.
- Produces: `extractTalk(talk, year): { nodes: GraphNode[]; edges: GraphEdge[]; chunks: Chunk[] }` and `mergeGraphs(parts): Graph` (dedupes nodes by id).

- [ ] **Step 1: Write failing test:** `extractTalk` on the Mitra talk yields a `Talk` node, a `Speaker` node "Gaurav Mitra", a `Company` "Meta", at least one `Theme` (matched from a keyword lexicon incl. "reliability","agentic") and a `Metric` node capturing "1,000+ incidents"; edges include `speaker->talk` and `talk->theme`.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement `extract.ts`:** deterministic extraction = id slugging, speaker/company nodes from fields, theme/system tagging via a keyword lexicon (`reliability`,`agentic`,`NCCL`,`GB200`,`storage`,`privacy`,`cloud`,`control plane`,`guardrails`,...), metric regex (`/\d[\d,\.]*\+?\s?(incidents|%|x|GB|ms)/i`), and chunking of the description into ≤280-char chunks. `mergeGraphs` dedupes by node id, unions edges. (LLM enrichment is a later optional path, not required here.)
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `git commit -am "feat: deterministic talk extraction + graph merge"`

### Task 4: Build graph artifact

**Files:**
- Create: `scripts/buildGraph.ts`; add npm script `"build:graph": "tsx scripts/buildGraph.ts"`
- Test: `scripts/__tests__/buildGraph.test.ts`

**Interfaces:**
- Consumes: `extractTalk`, `mergeGraphs`, `config/agenda.json`, optional `config/videos.json` + `fetchCaptions`.
- Produces: `public/data/graph.json`, `public/data/chunks.json`.

- [ ] **Step 1: Write failing test** that runs the build function against `config/agenda.json` and asserts output graph has ≥15 Talk nodes, a connected component, and chunks non-empty.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement `buildGraph.ts`:** read agenda, `extractTalk` each, merge, add cross-year `talk->talk` edges between talks sharing a Theme across different `year`, write JSON to `public/data/`. Past videos (if `config/videos.json` present and `yt-dlp` available) are fetched via `fetchCaptions` and extracted the same way; absence degrades silently.
- [ ] **Step 4: Run → PASS; run `npm run build:graph` and verify files exist**
- [ ] **Step 5: Commit** `git commit -am "feat: buildGraph produces static graph+chunks artifacts"`

### Task 5: Optional caption fetch (yt-dlp)

**Files:**
- Create: `scripts/fetchCaptions.ts`, `config/videos.json` (curated real @Scale past-talk URLs, may start empty)
- Test: `scripts/__tests__/fetchCaptions.test.ts`

**Interfaces:**
- Produces: `fetchCaptions(url): Promise<{ text: string; available: boolean }>` — shells `yt-dlp --write-auto-subs --skip-download`; returns `available:false` (never throws) when yt-dlp missing or no captions.

- [ ] **Step 1: Write failing test** mocking `child_process.execFile` to assert a missing-yt-dlp path returns `{available:false}` and never throws.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement `fetchCaptions.ts`** with the graceful-degradation contract; parse `.vtt` to plain text with timestamps preserved per cue.
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `git commit -am "feat: optional yt-dlp caption fetch with graceful degradation"`

---

## Phase 2 — Retrieval & grounded answers

### Task 6: Retrieval

**Files:**
- Create: `src/lib/retrieve.ts`
- Test: `src/lib/__tests__/retrieve.test.ts`

**Interfaces:**
- Consumes: `Graph`, `Chunk[]`.
- Produces: `retrieve(query, graph, chunks, k=6): { rankedChunks: {chunk: Chunk; score: number}[]; subgraph: Graph; confidence: number }`.

- [ ] **Step 1: Write failing test:** query "how does Meta handle reliability incidents" ranks the Mitra talk's chunk first; `confidence` ∈ [0,1]; `subgraph` contains the Mitra Talk node + its Theme nodes.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement `retrieve.ts`:** tokenized TF-style lexical scoring over chunks (lowercase, stopword-strip, term overlap + idf weighting), take top-k, build subgraph = matched talks + neighbors (1 hop), `confidence` = normalized top score. (Pluggable: a later task may swap in embeddings, same signature.)
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `git commit -am "feat: client-side lexical retrieval with subgraph"`

### Task 7: Groundedness judge

**Files:**
- Create: `src/lib/judge.ts`
- Test: `src/lib/__tests__/judge.test.ts`

**Interfaces:**
- Produces: `judge(retrieval): { groundedness: number; refuse: boolean }` with `refuse = confidence < 0.15`.

- [ ] **Step 1: Write failing test:** empty/low retrieval → `refuse:true`; strong retrieval → `refuse:false`, `groundedness>0.5`.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement `judge.ts`** (threshold + monotonic mapping of confidence→groundedness).
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `git commit -am "feat: groundedness judge + refusal threshold"`

### Task 8: Answer composer (extractive default)

**Files:**
- Create: `src/lib/answer.ts`, `src/lib/llm.ts`
- Test: `src/lib/__tests__/answer.test.ts`

**Interfaces:**
- Consumes: `retrieve`, `judge`, optional `llm.synthesize`.
- Produces: `composeAnswer(query, graph, chunks): Promise<Answer>`. `llm.ts` exports `isEnabled(): boolean` and `synthesize(query, contexts): Promise<{title:string; claims:Claim[]}>` (only called when `isEnabled()`).

- [ ] **Step 1: Write failing test:** with LLM disabled, `composeAnswer` returns an `Answer` whose every `claim.citations.length >= 1`, `refused` matches judge, and `validateAnswer` returns `[]`. A refusal query yields `refused:true` and a single explanatory claim citing nothing is NOT produced (refusal path sets `claims:[]`, `note` set).
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement `answer.ts`:** retrieve → judge → if refuse, return `{refused:true, claims:[], note:'Not enough grounded material in the corpus to answer confidently.'}`; else build extractive claims (one per top chunk, citation = its talk + ts) and `title` from the top talk. If `llm.isEnabled()`, replace prose via `synthesize` but KEEP citations attached (synthesis may only rephrase grounded claims, never add uncited ones). Implement `llm.ts` gated on `import.meta.env.VITE_ANTHROPIC_API_KEY`.
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `git commit -am "feat: extractive grounded answer composer with optional LLM synthesis"`

---

## Phase 3 — UI

### Task 9: Theme tokens + ModeNav + App shell

**Files:**
- Create: `src/theme.css`, `src/components/ModeNav.tsx`; Modify: `src/App.tsx`
- Test: `src/components/__tests__/ModeNav.test.tsx`

**Interfaces:**
- Produces: `<ModeNav mode value onChange>` with modes `explore|ask|timeline`; App loads `public/data/*.json` on mount.

- [ ] **Step 1: Write failing test** (render ModeNav, click "Ask", expect onChange('ask')).
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** dark "observability console" tokens in `theme.css` (near-black bg, single teal/blue accent var, Inter stack), `ModeNav`, and App shell that fetches graph/chunks and switches views.
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `git commit -am "feat: theme tokens, mode navigation, app shell"`

### Task 10: ForceGraph hero

**Files:**
- Create: `src/components/ForceGraph.tsx`
- Test: `src/components/__tests__/ForceGraph.test.tsx`

**Interfaces:**
- Consumes: `Graph`, `highlightIds?: string[]`, `onNodeClick?`.
- Produces: an SVG force layout; nodes colored by `NodeType`; highlighted nodes emphasized.

- [ ] **Step 1: Write failing test** (renders N circles for N nodes; clicking a node calls `onNodeClick` with its id).
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** D3-force simulation (drag, pin on drag-end, type-colored radii), respect `highlightIds`.
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `git commit -am "feat: interactive ForceGraph hero"`

### Task 11: AskBar + AnswerView

**Files:**
- Create: `src/components/AskBar.tsx`, `src/components/AnswerView.tsx`
- Test: `src/components/__tests__/AnswerView.test.tsx`

**Interfaces:**
- Consumes: `Answer`. Produces: prose + inline citation chips; refusal state renders the `note`, not a fake answer.

- [ ] **Step 1: Write failing test:** given a refused Answer, AnswerView shows the refusal note and zero citation chips; given a normal Answer, every claim renders with ≥1 citation chip.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** AskBar (input → `composeAnswer` → state) and AnswerView; clicking a citation chip emits the talkId to highlight the graph.
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `git commit -am "feat: ask bar and grounded answer view with citation chips"`

### Task 12: Timeline (theme evolution)

**Files:**
- Create: `src/components/Timeline.tsx`
- Test: `src/components/__tests__/Timeline.test.tsx`

**Interfaces:**
- Consumes: `Graph`. Produces: per-Theme rows, talks placed by `year`; cross-year edges drawn as connectors.

- [ ] **Step 1: Write failing test** (a theme present in 2 years renders 2 talk markers in that row).
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** Timeline grouping talks by theme×year.
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `git commit -am "feat: theme-evolution timeline"`

---

## Phase 4 — Slides & export

### Task 13: Slide model

**Files:**
- Create: `src/lib/slideModel.ts`
- Test: `src/lib/__tests__/slideModel.test.ts`

**Interfaces:**
- Produces: `toSlideSpec(answer, graph): SlideSpec` (title, ≤5 bullets each with a `cite`, `sources[]`, subgraph `nodeIds`).

- [ ] **Step 1: Write failing test:** a 3-claim answer → 3 bullets, each bullet's `cite` non-empty; `sources` deduped.
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** mapping (refused answer → a single "No grounded answer" slide with empty sources).
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `git commit -am "feat: Answer->SlideSpec model"`

### Task 14: SlideView (auto, toggle)

**Files:**
- Create: `src/components/SlideView.tsx`; Modify: `src/components/AnswerView.tsx` (Answer/Slide tab toggle)
- Test: `src/components/__tests__/SlideView.test.tsx`

**Interfaces:**
- Consumes: `SlideSpec`. Produces: a deck-style card (title, bullets, citation footer, inline mini-subgraph). Auto-rendered alongside Answer with a toggle.

- [ ] **Step 1: Write failing test** (SlideView renders title + one li per bullet + a sources footer).
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** SlideView styled per theme tokens; wire the Answer/Slide toggle in AnswerView (auto-generate on every answer).
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `git commit -am "feat: auto slide view with toggle"`

### Task 15: Export PNG/PDF/.pptx

**Files:**
- Create: `src/lib/exportSlide.ts`; Modify: `SlideView.tsx` (export buttons)
- Test: `src/lib/__tests__/exportSlide.test.ts`

**Interfaces:**
- Produces: `exportPng(el)`, `exportPdf()` (window.print to PDF), `exportPptx(spec)` (pptxgenjs).

- [ ] **Step 1: Write failing test** for `exportPptx(spec)` building a deck with one slide whose title === spec.title and a bullet per spec.bullet (assert via pptxgenjs in-memory object / mock).
- [ ] **Step 2: Run → FAIL**
- [ ] **Step 3: Implement** `exportSlide.ts` (`html-to-image` for PNG, print for PDF, `pptxgenjs` for .pptx) and wire 3 buttons.
- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** `git commit -am "feat: export slide to PNG/PDF/.pptx"`

---

## Phase 5 — Open-source polish

### Task 16: README, LICENSE, CONTRIBUTING, deploy

**Files:**
- Create: `README.md`, `LICENSE` (MIT), `CONTRIBUTING.md`, `.github/workflows/pages.yml`

**Interfaces:** none (docs/infra).

- [ ] **Step 1:** Write `README.md`: what/why, 5-min quickstart (`npm i`, `npm run build:graph`, `npm run dev`), "add your conference" config guide, architecture diagram, the four demo beats.
- [ ] **Step 2:** Add MIT `LICENSE`, `CONTRIBUTING.md`.
- [ ] **Step 3:** Add GitHub Pages workflow (build + deploy `dist`, base `/scalegraph/`).
- [ ] **Step 4:** Run `npm run build` → succeeds; commit `git commit -am "docs: README, license, contributing, pages deploy"`.

---

## Self-Review

**Spec coverage:** §3 data sourcing → Tasks 2,5 (agenda real data; yt-dlp optional). §4 units 1–5 → Tasks 3–4 (ingest), 6 (graph/retrieval), 8 (agentic answer), 9–12 (UI), 13–15 (slides). §6 tech stack → Task 0 deps. §7 visual direction → Task 9 tokens (final polish deferred to visual-companion pass before merge). §8 open-source → Task 16. §9 demo beats → graph (10), cited answer (11), timeline (12), refusal (7/8/11), slide export (14/15). Cross-conference edges → Task 4. LLM-as-Judge/guardrail → Tasks 7,8.

**Placeholder scan:** No "TBD/TODO" in steps; each code step shows code or an exact algorithm contract. `validateAnswer` body summarized as a contract — implementer writes it to satisfy the Task 1 test (acceptable: test is the spec).

**Type consistency:** `Answer`, `Claim`, `Citation`, `SlideSpec` defined once in `scripts/types.ts` (Task 1), consumed unchanged by Tasks 6–15. `retrieve` signature stable across Tasks 6/8. `composeAnswer` async across Tasks 8/11.

**Known deferrals (intentional, documented):** semantic embeddings (lexical retrieval ships first, same interface); final visual aesthetic (visual-companion pass); license confirmation; project name.
