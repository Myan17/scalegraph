# Contributing to ScaleGraph

Thanks for your interest! ScaleGraph is meant to be reused across @Scale events and extended by the
community.

## Ground rules

- **Groundedness is sacred.** Any change to retrieval/answering must preserve the invariant that
  every non-refused claim carries ≥1 citation to a real corpus node (`validateAnswer` enforces it).
  Never let the system emit uncited claims.
- **No fabricated talk data.** Corpus nodes come only from real agendas and real transcripts.
- **Tests first.** This repo is TDD. Add a failing test, then the implementation.

## Dev loop

```bash
npm install
npm test           # vitest
npm run build:graph
npm run dev
npm run build      # typecheck + production build must stay green
```

## Project layout

- `scripts/` — offline ingestion/build (Node). Pure, testable functions.
- `src/lib/` — retrieval, judge, answer, slides. No React here.
- `src/components/` — UI. One responsibility per file.
- `config/` — the data you change per conference. No code.

## Adding a conference

See the "Add your conference" section in the README. PRs that add a real past-year `config/videos.json`
(with verified caption availability) are especially welcome — they power the cross-year Timeline.

## Commit style

Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`). Keep commits focused and tested.
