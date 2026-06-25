import { describe, it, expect } from 'vitest'
import { ping } from '../smoke'

describe('smoke', () => {
  it('pings', () => {
    expect(ping()).toBe('pong')
  })
})
