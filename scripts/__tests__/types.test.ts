import { describe, it, expect } from 'vitest'
import { validateAnswer, type Answer } from '../types'

describe('validateAnswer', () => {
  it('rejects a claim with no citations', () => {
    const a: Answer = {
      id: 'a', query: 'q', title: 't',
      claims: [{ text: 'x', citations: [] }],
      relatedNodeIds: [], groundedness: 1, refused: false,
    }
    expect(validateAnswer(a)).toContain('claim 0 has no citations')
  })

  it('accepts a grounded claim', () => {
    const a: Answer = {
      id: 'a', query: 'q', title: 't',
      claims: [{ text: 'x', citations: [{ talkId: 'talk:mitra', label: 'Mitra' }] }],
      relatedNodeIds: ['talk:mitra'], groundedness: 0.8, refused: false,
    }
    expect(validateAnswer(a)).toEqual([])
  })

  it('rejects a refusal that carries claims', () => {
    const a: Answer = {
      id: 'a', query: 'q', title: 't',
      claims: [{ text: 'x', citations: [{ talkId: 't', label: 'l' }] }],
      relatedNodeIds: [], groundedness: 0, refused: true,
    }
    expect(validateAnswer(a)).toContain('refused answer must have no claims')
  })

  it('flags out-of-range groundedness', () => {
    const a: Answer = {
      id: 'a', query: 'q', title: 't', claims: [],
      relatedNodeIds: [], groundedness: 2, refused: true,
    }
    expect(validateAnswer(a)).toContain('groundedness must be in [0,1]')
  })
})
