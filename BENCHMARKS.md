# ScaleGraph — Retrieval Benchmarks

Reproduce with `npx tsx scripts/eval.ts`. The harness lives in
[`scripts/eval.ts`](scripts/eval.ts) and runs against the committed
`public/data/{graph,chunks,embeddings}.json`, so the numbers below are
reproducible from a clean clone with no API keys and no network calls beyond the
one-time sentence-transformer download.

**Run date:** 2026-09-17 · **Corpus:** @Scale 2026 agenda + published back-catalog

## Method

18 questions, each labeled with the talk that should be cited first:

- **14 scored** — one or more acceptable talk IDs; scored as precision@1 on the
  first citation of the first claim.
- **1 open** — reported but not scored (several talks are legitimately correct).
- **3 refusal** — off-topic questions ("Best pizza toppings in Naples?") that the
  system must visibly refuse rather than answer from an unrelated talk. Refusing
  is the product's grounding claim, so a wrong answer here is a failure even
  though the question is unanswerable.

Two configurations are compared on the identical question set:

| Config | Retrieval |
|---|---|
| **Lexical only** | keyword scoring over talk metadata and transcript chunks |
| **Hybrid** | lexical + semantic embeddings (`@xenova/transformers`, quantized) |

## Results

| Metric | Lexical only | Hybrid | Δ |
|---|---|---|---|
| **precision@1** (14 labeled) | 9/14 — **64%** | 11/14 — **79%** | **+15 pts** |
| **Refusal rate** (3 off-topic) | 2/3 | **3/3** | +1 |

Semantic scoring flips two paraphrase cases that keyword matching gets wrong,
and closes the refusal gap:

| Question | Lexical answer | Hybrid answer |
|---|---|---|
| "How does Meta use agents for reliability incidents?" | ❌ *Stop The World* | ✅ *Teaching AI to Fight Fires* |
| "How do they recover from a regional outage?" | ❌ *DC Networks for Generative AI* | ✅ *Stop The World* |
| "Who won the football world cup?" | ❌ answered from *Security of Agents* | ✅ **REFUSED** |

## Remaining failures (hybrid)

Three labeled cases still miss, and they are reported rather than tuned away:

1. **"How is private user data protected?"** → returns *Why Have We Not Solved
   Security of Agents?* instead of *Building Privacy Aware Infrastructure*. Both
   talks discuss protection; the ranker prefers the one with denser
   security vocabulary.
2. **"What keeps the website online during failures?"** → returns *Scaling Llama4
   Training to 100K*. The question uses no vocabulary the corpus shares with the
   outage talk.
3. **"How are autonomous agents kept from doing damage?"** → returns the Google
   TPU agents talk instead of the two safety talks.

All three are ranking errors on genuinely adjacent talks, not hallucinations —
every answer still cites a real talk in the corpus.

## Regression gate

CI re-runs this eval on every push to `main`
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) and fails the build if
hybrid precision@1 drops below **79%** or if any of the three refusal cases
starts answering. The baseline is the table above.

## Unit tests

42 tests across 13 files (`npm test`) cover graph construction, caption fetching
and its failure modes, chunking, retrieval, answer composition, the refusal
judge, and the React views.
