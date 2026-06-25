import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ModeNav } from '../ModeNav'

describe('ModeNav', () => {
  it('fires onChange with the clicked mode', () => {
    const onChange = vi.fn()
    render(<ModeNav value="explore" onChange={onChange} />)
    fireEvent.click(screen.getByText('Ask'))
    expect(onChange).toHaveBeenCalledWith('ask')
  })

  it('marks the active mode as pressed', () => {
    render(<ModeNav value="timeline" onChange={() => {}} />)
    expect(screen.getByText('Timeline').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('Explore').getAttribute('aria-pressed')).toBe('false')
  })
})
