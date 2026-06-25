import { useEffect, useMemo, useRef, useState } from 'react'
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
  type Simulation,
} from 'd3-force'
import type { Graph, GraphNode, NodeType } from '../types'

const COLORS: Record<NodeType, string> = {
  Talk: 'var(--n-talk)', Speaker: 'var(--n-speaker)', Company: 'var(--n-company)',
  Theme: 'var(--n-theme)', System: 'var(--n-system)', Problem: 'var(--n-problem)',
  Technique: 'var(--n-technique)', Metric: 'var(--n-metric)',
}
const RADIUS: Partial<Record<NodeType, number>> = { Talk: 9, Theme: 7, Company: 7 }

interface SimNode extends GraphNode { x: number; y: number; fx?: number | null; fy?: number | null }
interface SimLink { source: SimNode; target: SimNode; rel: string }

export function ForceGraph({
  graph, highlightIds = [], onNodeClick, width = 760, height = 520,
}: {
  graph: Graph
  highlightIds?: string[]
  onNodeClick?: (id: string) => void
  width?: number
  height?: number
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null)
  const [, force] = useState(0)
  const hi = useMemo(() => new Set(highlightIds), [highlightIds])

  const { nodes, links } = useMemo(() => {
    const map = new Map<string, SimNode>()
    const N = graph.nodes.length
    // Phyllotaxis spread so nodes don't all start stacked at the center.
    const golden = Math.PI * (3 - Math.sqrt(5))
    const spread = Math.min(width, height) * 0.46
    graph.nodes.forEach((n, i) => {
      const r = spread * Math.sqrt((i + 0.5) / N)
      const a = i * golden
      map.set(n.id, { ...n, x: width / 2 + Math.cos(a) * r, y: height / 2 + Math.sin(a) * r })
    })
    const links: SimLink[] = graph.edges
      .filter((e) => map.has(e.source) && map.has(e.target))
      .map((e) => ({ source: map.get(e.source)!, target: map.get(e.target)!, rel: e.rel }))
    return { nodes: [...map.values()], links }
  }, [graph, width, height])

  useEffect(() => {
    const sim = forceSimulation<SimNode>(nodes)
      .force('link', forceLink<SimNode, SimLink>(links).id((d) => d.id).distance(72).strength(0.5))
      .force('charge', forceManyBody().strength(-420).distanceMax(420))
      .force('center', forceCenter(width / 2, height / 2).strength(0.06))
      .force('collide', forceCollide<SimNode>().radius((d) => (RADIUS[d.type] ?? 5) + 14))
      .on('tick', () => force((t) => t + 1))
    simRef.current = sim
    return () => { sim.stop() }
  }, [nodes, links, width, height])

  // Drag with pinning.
  const drag = useRef<{ node: SimNode; moved: boolean } | null>(null)
  const onDown = (n: SimNode) => (e: React.PointerEvent) => {
    const el = e.target as Element & { setPointerCapture?: (id: number) => void }
    el.setPointerCapture?.(e.pointerId)
    drag.current = { node: n, moved: false }
    simRef.current?.alphaTarget(0.3).restart()
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !svgRef.current) return
    const r = svgRef.current.getBoundingClientRect()
    drag.current.node.fx = ((e.clientX - r.left) / r.width) * width
    drag.current.node.fy = ((e.clientY - r.top) / r.height) * height
    drag.current.moved = true
  }
  const onUp = (n: SimNode) => () => {
    simRef.current?.alphaTarget(0)
    if (drag.current && !drag.current.moved) onNodeClick?.(n.id)
    // leave fx/fy set -> node stays pinned where dropped
    drag.current = null
  }

  const dim = hi.size > 0
  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${width} ${height}`}
      className="forcegraph"
      style={{ width: '100%', height: 'auto', display: 'block' }}
      onPointerMove={onMove}
      role="img"
      aria-label="Conference knowledge graph"
    >
      <g stroke="var(--border)" strokeOpacity={0.7}>
        {links.map((l, i) => (
          <line
            key={i}
            x1={l.source.x} y1={l.source.y} x2={l.target.x} y2={l.target.y}
            strokeWidth={l.rel === 'evolves' ? 1.8 : 1}
            stroke={l.rel === 'evolves' ? 'var(--accent)' : 'var(--border)'}
            strokeDasharray={l.rel === 'evolves' ? '4 3' : undefined}
          />
        ))}
      </g>
      <g>
        {nodes.map((n) => {
          const on = hi.has(n.id)
          const r = RADIUS[n.type] ?? 5
          return (
            <g
              key={n.id}
              transform={`translate(${n.x},${n.y})`}
              style={{ cursor: 'pointer', opacity: dim && !on ? 0.25 : 1 }}
              onPointerDown={onDown(n)}
              onPointerUp={onUp(n)}
            >
              <circle
                r={on ? r + 3 : r}
                fill={COLORS[n.type]}
                stroke={on ? 'var(--text)' : 'transparent'}
                strokeWidth={on ? 2 : 0}
              />
              {(n.type === 'Talk' || on) && (
                <text x={r + 4} y={4} fontSize={on ? 11 : 9} fill="var(--text-dim)">
                  {n.label.length > 34 ? n.label.slice(0, 32) + '…' : n.label}
                </text>
              )}
            </g>
          )
        })}
      </g>
    </svg>
  )
}
