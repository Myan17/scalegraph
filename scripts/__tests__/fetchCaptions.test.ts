import { describe, it, expect } from 'vitest'
import { parseVtt, fetchCaptions, yearFromUploadDate } from '../fetchCaptions'

describe('yearFromUploadDate', () => {
  it('extracts the year from a YYYYMMDD string', () => {
    expect(yearFromUploadDate('20250819')).toBe(2025)
  })
  it('returns undefined for junk or empty input', () => {
    expect(yearFromUploadDate('NA')).toBeUndefined()
    expect(yearFromUploadDate(undefined)).toBeUndefined()
  })
})

describe('parseVtt', () => {
  it('extracts cues with timestamps', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello and welcome

00:01:05.500 --> 00:01:08.000
to the talk`
    const cues = parseVtt(vtt)
    expect(cues).toHaveLength(2)
    expect(cues[0]).toEqual({ ts: 1, text: 'Hello and welcome' })
    expect(cues[1].ts).toBe(65)
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
