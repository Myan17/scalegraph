import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AnswerView } from '../AnswerView'
import type { Answer, Graph } from '../../types'

const graph: Graph = { nodes: [], edges: [] }

const grounded: Answer = {
  id: 'a', query: 'q', title: 'Reliability agents',
  claims: [
    { text: 'Meta built a reliability flywheel.', citations: [{ talkId: 'talk:mitra-fight-fires-2026', label: 'Teaching AI to Fight Fires' }] },
  ],
  relatedNodeIds: ['talk:mitra-fight-fires-2026'], groundedness: 0.8, refused: false,
}

const refused: Answer = {
  id: 'b', query: 'q', title: 'x', claims: [], relatedNodeIds: [],
  groundedness: 0, refused: true, note: 'Not enough grounded material.',
}

describe('AnswerView', () => {
  it('renders every claim with a citation chip and fires onCite', () => {
    const onCite = vi.fn()
    render(<AnswerView answer={grounded} graph={graph} onCite={onCite} />)
    const chip = screen.getByTitle('Highlight in graph')
    fireEvent.click(chip)
    expect(onCite).toHaveBeenCalledWith('talk:mitra-fight-fires-2026')
  })

  it('shows the refusal note and no citation chips when refused', () => {
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
