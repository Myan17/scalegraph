import { useEffect, useState } from 'react'
import type { Graph, Chunk, Answer } from './types'
import { composeAnswer } from './lib/answer'
import { semanticScoresFor, type EmbeddingIndex } from './lib/semantic'
import { ModeNav, type Mode } from './components/ModeNav'
import { ForceGraph } from './components/ForceGraph'
import { AskBar } from './components/AskBar'
import { AnswerView } from './components/AnswerView'
import { Timeline } from './components/Timeline'

const base = import.meta.env.BASE_URL

const MODES: Mode[] = ['explore', 'ask', 'timeline']
function modeFromHash(): Mode {
  const h = (typeof location !== 'undefined' ? location.hash.replace('#', '') : '') as Mode
  return MODES.includes(h) ? h : 'explore'
}

export default function App() {
  const [graph, setGraph] = useState<Graph | null>(null)
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [mode, setModeState] = useState<Mode>(modeFromHash())
  const setMode = (m: Mode) => { setModeState(m); if (typeof location !== 'undefined') location.hash = m }
  const [answer, setAnswer] = useState<Answer | null>(null)
  const [busy, setBusy] = useState(false)
  const [highlight, setHighlight] = useState<string[]>([])
  const [embIndex, setEmbIndex] = useState<EmbeddingIndex | null>(null)
  const [embSettled, setEmbSettled] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`${base}data/graph.json`).then((r) => r.json()),
      fetch(`${base}data/chunks.json`).then((r) => r.json()),
    ])
      .then(([g, c]) => { setGraph(g); setChunks(c) })
      .catch(() => {/* data missing -> run `npm run build:graph` */})
    // Semantic index loads separately; lexical search works even if this fails.
    fetch(`${base}data/embeddings.json`)
      .then((r) => r.json())
      .then((idx) => { setEmbIndex(idx); setEmbSettled(true) })
      .catch(() => { setEmbSettled(true) /* no embeddings -> graceful lexical fallback */ })
  }, [])

  // Shareable question links: ?q=... auto-asks once data AND the embeddings load has settled
  // (so it ranks semantically, not by whichever loads first).
  const [autoAsked, setAutoAsked] = useState(false)
  useEffect(() => {
    if (autoAsked || !graph || !embSettled) return
    const q = new URLSearchParams(location.search).get('q')
    if (q) { setAutoAsked(true); ask(q) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, embSettled])

  async function ask(q: string) {
    if (!graph) return
    setBusy(true)
    setMode('ask')
    // Semantic (paraphrase-aware) ranking when the index + model are available; else lexical.
    const semantic = embIndex ? (await semanticScoresFor(q, embIndex)) ?? undefined : undefined
    const a = await composeAnswer(q, graph, chunks, semantic)
    setAnswer(a)
    setHighlight(a.relatedNodeIds)
    setBusy(false)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="dot" /> ScaleGraph
          <span className="sub">@Scale · Systems &amp; Reliability 2026</span>
        </div>
        <ModeNav value={mode} onChange={setMode} />
      </header>

      <main className="main">
        {!graph ? (
          <div className="card muted">
            Loading the conference graph… If this persists, run <code>npm run build:graph</code>.
          </div>
        ) : mode === 'ask' ? (
          <div className="split">
            <div>
              <AskBar onAsk={ask} busy={busy} />
              {answer && <AnswerView answer={answer} graph={graph} onCite={(id) => setHighlight([id])} />}
            </div>
            <div className="card">
              <p className="section-title">Sources in the graph</p>
              <ForceGraph graph={graph} highlightIds={highlight} onNodeClick={(id) => setHighlight([id])} />
            </div>
          </div>
        ) : mode === 'timeline' ? (
          <Timeline graph={graph} onTalk={(id) => { setHighlight([id]); setMode('explore') }} />
        ) : (
          <div>
            <p className="section-title">The conference as a knowledge graph — drag, pin, click a node</p>
            <div className="card" style={{ padding: 8 }}>
              <ForceGraph graph={graph} highlightIds={highlight} onNodeClick={(id) => setHighlight([id])} width={1180} height={620} />
            </div>
            <p className="faint" style={{ marginTop: 12 }}>
              Teal dashed links trace how a theme evolves across years. Switch to <strong>Ask</strong> to query the corpus with cited answers.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
