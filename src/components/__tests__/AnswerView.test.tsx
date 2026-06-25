import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AnswerView } from '../AnswerView'
import type { Answer, Graph } from '../../types'

const graph: Graph = { nodes: [], edges: [] }

const grounded: Answer = {
  id: 'a', query: 'q', title: 'Public Cloud',
  claims: [
    { text: 'Meta integrates public cloud resources.', citations: [{ talkId: 'talk:extending-public-cloud-2026', label: 'Extending Meta to the Public Cloud' }] },
  ],
  groups: [
    {
      talkId: 'talk:dc', label: "Meta's DC Networks", year: 2025,
      videoUrl: 'https://www.youtube.com/watch?v=AqIPRseYcTU', videoId: 'AqIPRseYcTU',
      score: 0.5,
      segments: [
        { text: 'First segment about data center fabric and cloud.', startTs: 100, score: 0.5 },
        { text: 'Second segment with more detail on capacity.', startTs: 160, score: 0.4 },
      ],
    },
  ],
  relatedNodeIds: ['talk:dc'], groundedness: 0.8, refused: false,
}

const refused: Answer = {
  id: 'b', query: 'q', title: 'x', claims: [], relatedNodeIds: [],
  groundedness: 0, refused: true, note: 'Not enough grounded material.',
}

describe('AnswerView', () => {
  it('renders a talk-thread group, fires onCite, and shows a watch-from-timestamp link', () => {
    const onCite = vi.fn()
    render(<AnswerView answer={grounded} graph={graph} onCite={onCite} />)
    fireEvent.click(screen.getByTitle('Highlight in graph'))
    expect(onCite).toHaveBeenCalledWith('talk:dc')
    // watch link points into the YouTube video at the segment timestamp
    const watch = screen.getByText(/watch from 1:40/) as HTMLAnchorElement
    expect(watch.getAttribute('href')).toContain('t=100s')
  })

  it('hides extra segments behind read-more, then reveals them', () => {
    render(<AnswerView answer={grounded} graph={graph} onCite={() => {}} />)
    expect(screen.queryByText(/Second segment/)).toBeNull()
    fireEvent.click(screen.getByText(/Read more/))
    expect(screen.getByText(/Second segment/)).toBeTruthy()
  })

  it('shows the refusal note and no thread groups when refused', () => {
    render(<AnswerView answer={refused} graph={graph} />)
    expect(screen.getByText(/Not enough grounded material/)).toBeTruthy()
    expect(screen.queryByTitle('Highlight in graph')).toBeNull()
  })

  it('toggles to the slide view', () => {
    render(<AnswerView answer={grounded} graph={graph} />)
    fireEvent.click(screen.getByText('Slide'))
    expect(screen.getByText('Export .pptx')).toBeTruthy()
  })
})
