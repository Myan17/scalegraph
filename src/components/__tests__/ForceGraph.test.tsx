import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { ForceGraph } from '../ForceGraph'
import type { Graph } from '../../types'

const graph: Graph = {
  nodes: [
    { id: 'talk:a', type: 'Talk', label: 'Talk A' },
    { id: 'speaker:x', type: 'Speaker', label: 'X' },
  ],
  edges: [{ source: 'speaker:x', target: 'talk:a', rel: 'presents' }],
}

describe('ForceGraph', () => {
  it('renders a circle per node', () => {
    const { container } = render(<ForceGraph graph={graph} />)
    expect(container.querySelectorAll('circle').length).toBe(2)
  })

  it('calls onNodeClick when a node is clicked without dragging', () => {
    const onNodeClick = vi.fn()
    const { container } = render(<ForceGraph graph={graph} onNodeClick={onNodeClick} />)
    const node = container.querySelector('g[transform] ')!
    // simulate a click = pointerdown then pointerup without move
    fireEvent.pointerDown(node)
    fireEvent.pointerUp(node)
    expect(onNodeClick).toHaveBeenCalled()
  })
})
