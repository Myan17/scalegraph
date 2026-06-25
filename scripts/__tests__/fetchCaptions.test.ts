import { describe, it, expect } from 'vitest'
import { parseJson3, fetchCaptions, yearFromUploadDate } from '../fetchCaptions'

describe('yearFromUploadDate', () => {
  it('extracts the year from a YYYYMMDD string', () => {
    expect(yearFromUploadDate('20250819')).toBe(2025)
  })
  it('returns undefined for junk or empty input', () => {
    expect(yearFromUploadDate('NA')).toBeUndefined()
    expect(yearFromUploadDate(undefined)).toBeUndefined()
  })
})

describe('parseJson3', () => {
  it('extracts clean cues with timestamps and no rolling duplication', () => {
    const json3 = JSON.stringify({
      events: [
        { tStartMs: 1000, segs: [{ utf8: 'Hello' }, { utf8: ' and welcome' }] },
        { tStartMs: 65500, segs: [{ utf8: 'to the talk' }] },
        { tStartMs: 70000, segs: [{ utf8: '\n' }] }, // whitespace-only event is dropped
      ],
    })
    const cues = parseJson3(json3)
    expect(cues).toHaveLength(2)
    expect(cues[0]).toEqual({ ts: 1, text: 'Hello and welcome' })
    expect(cues[1].ts).toBe(65)
  })

  it('returns [] for malformed input without throwing', () => {
    expect(parseJson3('not json')).toEqual([])
  })
})

describe('fetchCaptions', () => {
  it('degrades gracefully (never throws) for an unresolvable URL', async () => {
    // yt-dlp likely absent in CI / will fail to resolve — must return available:false, not throw.
    const res = await fetchCaptions('https://example.invalid/not-a-video')
    expect(res.available).toBe(false)
    expect(res.text).toBe('')
  })
})
