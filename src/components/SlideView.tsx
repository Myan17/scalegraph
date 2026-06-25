import { useRef } from 'react'
import type { SlideSpec } from '../types'
import { exportPng, exportPdf, exportPptx } from '../lib/exportSlide'

export function SlideView({ spec }: { spec: SlideSpec }) {
  const ref = useRef<HTMLDivElement>(null)

  return (
    <div>
      <div
        ref={ref}
        className="slide"
        style={{
          background: 'linear-gradient(160deg, #11151c, #0a0c10)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          padding: '34px 36px',
          minHeight: 320,
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: 'var(--accent)' }} />
        <div style={{ fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 14 }}>
          @Scale · ScaleGraph
        </div>
        <h2 style={{ margin: '0 0 20px', fontSize: 26, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
          {spec.title}
        </h2>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {spec.bullets.map((b, i) => (
            <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ color: 'var(--accent)', fontWeight: 700, lineHeight: 1.5 }}>›</span>
              <span style={{ fontSize: 15, color: 'var(--text)' }}>
                {b.text}
                {b.cite && <span className="faint" style={{ fontSize: 12 }}>  — {b.cite}</span>}
              </span>
            </li>
          ))}
        </ul>
        {spec.sources.length > 0 && (
          <div className="faint" style={{ marginTop: 20, fontSize: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            Sources: {spec.sources.join('  ·  ')}
          </div>
        )}
      </div>

      <div className="tabs" style={{ marginTop: 12 }}>
        <button onClick={() => ref.current && exportPng(ref.current)}>Export PNG</button>
        <button onClick={() => exportPdf()}>Export PDF</button>
        <button onClick={() => exportPptx(spec)}>Export .pptx</button>
      </div>
    </div>
  )
}
