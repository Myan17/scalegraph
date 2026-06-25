# ScaleGraph — Design Spec

**Date:** 2026-06-25
**Working name:** ScaleGraph (rename freely)
**Status:** Approved for implementation planning
**License:** MIT (matches Meta's OSS ecosystem; Apache-2.0 is the alternative if a patent grant is wanted)

---

## 1. Purpose

An open-source, agentic knowledge-graph companion for the **At Scale** conference series.
It ingests a conference's agenda plus a set of past At Scale talk videos into a single
queryable knowledge graph, and answers **grounded, cited** questions about the program and
the corpus. Every answer also renders as a polished, shareable **slide** — so attendees stop
photographing the stage and instead capture a clean, accurate slide of exactly what they asked.

The system is designed to be **handed to Meta as a feature** for future At Scale conferences:
config-driven (drop in a new agenda + video list, no code changes), cleanly licensed, and
contribution-ready.

### Why it fits the event
- The whole 2026 program is organized around **agentic infrastructure + autonomous reliability
  with guardrails**. ScaleGraph is itself an agentic, grounded, guardrailed system — so the tool
  that indexes the conference embodies the conference's own thesis.
- It directly mirrors specific talks: groundedness guardrails (Pariag, "safely unleash agents"),
  LLM-as-Judge evaluation (Kirti, "privacy-aware infra"), cross-system investigation (Liu, Mitra).
- The slide feature solves a pain observed **at this exact event**: people photographing slides.

---

## 2. Success criteria

A demoable-today prototype that can:

1. Show the conference (this year + ~10–15 past talks) as an interactive force-graph.
2. Answer a natural-language question with a grounded answer where **every claim cites a talk**.
3. Visibly **refuse to answer** when it cannot ground a claim in the corpus (guardrail demo).
4. Trace **one theme across multiple At Scales** (cross-conference evolution view).
5. Render every answer as a **polished on-screen slide**, exportable to **PNG/PDF and .pptx**.
6. Be reconfigured for a different conference by editing config only.

---

## 3. Data sourcing (provenance)

Three distinct data concerns, often conflated — kept separate here.

### 3.1 Today's event — already in hand
The data for the *current* conference is the **public agenda page**
(`atscaleconference.com/events/systems-reliability-2026/`), already extracted: 15 talks with
speakers, companies, and detailed descriptions (e.g. Mitra's "reliability flywheel — 1,000+
incidents, 60% faster detection-to-mitigation"). Today's actual video/slides are not published
for weeks and are **not needed** — the descriptions carry enough signal to build a full graph of
this event. Fidelity: clean but shallow.

### 3.2 Past events — public and pullable
A real back-catalog exists and is verified:
- **@Scale YouTube channel** — `youtube.com/@scaleconference` (years of recorded talks).
- **Video library** — `atscaleconference.com/videos-articles/` (individual talk pages).

These are public YouTube videos, so `yt-dlp` pulls **auto-captions → transcripts → graph**.
For the tight build we cherry-pick ~10–15 talks with **clean** captions; talks with messy or
absent captions degrade gracefully to description-only nodes. Fidelity: deep.

### 3.3 Existing slide decks — not needed, ever
The slide feature (Unit 5) **generates new slides from answers**; it does **not** ingest anyone's
existing decks. No real PowerPoint files are ever sourced. "How do we get the slides" does not
apply to this feature — it manufactures them from the structured `Answer` object.

| Source | What we get | Fidelity | Status |
|---|---|---|---|
| Today's agenda | structured metadata + descriptions | clean, shallow | already pulled |
| Past @Scale videos | yt-dlp auto-captions → transcripts | deep | public, ~10–15 picked |
| Existing slide decks | — | — | not needed |

**Risk:** some past videos have poor auto-captions → mitigated by cherry-picking clean ones and
degrading the rest to description-only nodes (see §11).

---

## 4. Architecture — five units, clean boundaries

### Unit 1 — Ingestion (offline, run once before demo)
- **Input:** `config/agenda.json` (structured: talks, speakers, companies, descriptions) +
  `config/videos.json` (list of past At Scale talk video URLs).
- Past-talk transcripts pulled via `yt-dlp` auto-captions (no live audio required).
- One LLM extraction pass per talk → emits graph nodes/edges + text chunks.
- **Output:** `data/graph.json` + `data/embeddings.json` (precomputed; no always-on backend).
- **Boundary:** pure function `talks[] -> {graph, chunks, embeddings}`. Testable in isolation.

### Unit 2 — Knowledge graph + retrieval (the core asset)
- **Node types:** `Talk`, `Speaker`, `Company`, `Theme`, `System/Tech`, `Problem`,
  `Technique`, `Metric`.
- **Edge types:** `speaker→talk`, `talk→theme`, `theme↔theme`, and the high-value
  `talk→talk` cross-year edge (same theme across conferences).
- **Retrieval:** graph traversal + semantic search over chunks (sentence-transformers style,
  reusing prior RAG patterns).
- **Boundary:** `query -> {subgraph, ranked_chunks}`. No LLM here; deterministic and testable.

### Unit 3 — Agentic Q&A with guardrails (the on-theme part)
- Question → retrieve (Unit 2) → compose answer where **every claim is tied to a citation**
  (talk + timestamp when transcript-sourced).
- **Groundedness guardrail:** if a claim can't be grounded in retrieved context, the agent
  flags/refuses rather than hallucinating — surfaced visibly in the UI.
- **LLM-as-Judge:** lightweight pass scoring each answer's groundedness; low scores trigger the
  refusal path. Mirrors the Kirti talk.
- **Output:** a structured `Answer` object: `{ title, claims:[{text, citations[]}],
  related_nodes[], groundedness_score, refused:bool }`.
- **Boundary:** `query + retrieval -> Answer`. The single structured object both renderers consume.

### Unit 4 — Web UI (React + Vite → GitHub Pages)
- Reuses the existing `ForceGraph` component (drag/pin/animate).
- **Attendee mode:** "what should I see today, given I care about X?" → personalized agenda;
  click a talk to light up its connections.
- **Cross-conference mode:** theme-evolution timeline (e.g. "Meta's reliability-agent story,
  2023 → 2026").
- Answers display as two tabs: **Answer** (prose + inline citations) and **Slide** (Unit 5).

### Unit 5 — Slide renderer (the photograph-killer)
- Consumes the same `Answer` object — the slide is a *second renderer*, not a new pipeline.
- **On-screen slide:** polished HTML/CSS deck card — bold title, 3–5 key points, an inline
  graph/diagram snippet from the relevant subgraph, and a source-citation footer strip
  (grounded even as a slide). Auto-generated for every answer, with a toggle.
- **Export:** PNG/PDF (html-to-image / print-to-PDF) **and** editable `.pptx` (python-pptx
  or client-side equivalent) + shareable URL.
- Uses the `frontend-design` skill so the aesthetic doesn't read as templated.

---

## 5. Data flow

```
config/agenda.json + config/videos.json
        │  (Unit 1: yt-dlp + LLM extraction, offline)
        ▼
data/graph.json + data/embeddings.json   ← static, shipped with the site
        │
user question ──► Unit 2 retrieval ──► Unit 3 agentic answer ──► Answer object
                                                                   │
                                            ┌──────────────────────┼───────────────────┐
                                            ▼                      ▼                   ▼
                                   Unit 4 prose+citations   Unit 5 on-screen slide   PNG/PDF/.pptx export
```

Everything precomputes to static artifacts; the live site needs only the LLM API for Q&A
(or can ship with cached answers for a fully-offline demo).

---

## 6. Tech stack (reuse-first)

- **Ingestion:** Python; `yt-dlp` for captions; Claude (Opus/Sonnet) for extraction.
- **Graph + embeddings:** JSON/SQLite + sentence-transformers index (prior RAG pattern).
- **Q&A agent:** Claude via API; LLM-as-Judge as a second cheap call.
- **Frontend:** React + Vite + existing `ForceGraph`; deploy to GitHub Pages (prior pattern).
- **Slides:** HTML/CSS deck component; `html-to-image` / print-to-PDF for raster; `python-pptx`
  (or `pptxgenjs` client-side) for `.pptx`.

---

## 7. Visual design & UX direction

The page must look **visually appealing, match the @Scale event vibe, and be easy to navigate**.
Direction captured here as text; the exact aesthetic will be locked in a dedicated **visual
companion** session (mockups in-browser) as the final polish pass, feeding the `frontend-design`
skill at implementation time.

- **Vibe:** modern, technical, "observability console" feel that fits an AI-infrastructure /
  agentic conference. Meta-adjacent but with its own identity — not a templated default.
- **Palette:** dark base (near-black / deep navy), one consistent signature accent
  (electric blue / teal), high-contrast text. Restraint — a single accent used everywhere, not
  a rainbow.
- **Typography:** clean geometric/grotesque sans (e.g. Inter or similar), strong hierarchy,
  generous whitespace.
- **Navigation:** single-page, few clear modes — **Explore** (graph), **Ask** (Q&A), **Timeline**
  (theme evolution). Mode switch always obvious; the ask/search bar always reachable.
- **Hero:** the interactive force-graph is the centerpiece; the slide view feels premium and
  screenshot-worthy (it is, after all, the "stop photographing slides" feature).
- **Motion:** subtle and purposeful — graph animation, smooth transitions, source-talk highlight
  on answer. No gratuitous effects.
- **Responsive & accessible:** laptop-first for the demo, graceful on phone for attendees;
  sufficient contrast and keyboard navigation.

---

## 8. Open-source posture (baked in)

- **Config-driven reuse:** new conference = new `agenda.json` + `videos.json`. No code changes.
- Repo hygiene: `README.md` (5-minute quickstart), architecture diagram, `LICENSE` (MIT),
  `CONTRIBUTING.md`, demo GIFs of the four wow beats.
- Framed as "a feature Meta can adopt for future At Scale conferences," not a personal demo.

---

## 9. Demo script — four wow beats

1. The whole conference as a living force-graph; cross-year threads light up.
2. Ask a question → grounded cited answer; source talks highlight in the graph.
3. Theme-evolution view — one topic traced across multiple At Scales.
4. The guardrail visibly **refusing** to invent an answer — groundedness proven on stage.
5. (Bonus) Every answer flips to a polished slide → export PNG/.pptx → "stop photographing,
   start sharing."

---

## 10. Out of scope (YAGNI for the tight build)

- Live audio capture / real-time transcription.
- Full back-catalog ingestion (cap at ~10–15 talks).
- Auth, multi-user, persistent server-side state.
- Slide-deck ingestion (we ingest agenda + video transcripts only).
- Any always-on backend beyond the Q&A LLM call.

---

## 11. Open questions / risks

- **Transcript availability:** some past At Scale talks may lack good captions → pick the
  ~10–15 with clean captions; degrade gracefully to description-only nodes.
- **`.pptx` aesthetics:** python-pptx output is plainer than the HTML slide; acceptable as the
  "editable take-home" format while the on-screen/PNG version is the pretty one.
- **Name:** "ScaleGraph" is a placeholder pending final choice.
