// Optional past-talk transcript fetch via yt-dlp auto-captions.
// Contract: NEVER throws. Returns { available:false } when yt-dlp is missing,
// the video has no captions, or anything else goes wrong — so the build degrades gracefully.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const exec = promisify(execFile)

export interface Captions {
  text: string
  available: boolean
  /** Per-cue segments with start time in seconds (for citation timestamps). */
  cues: { ts: number; text: string }[]
  /** Real upload year from the source (YouTube), when resolvable. */
  year?: number
}

const EMPTY: Captions = { text: '', available: false, cues: [] }

/** Parse a yt-dlp upload_date (YYYYMMDD) into a year. */
export function yearFromUploadDate(s: string | undefined): number | undefined {
  const m = (s ?? '').trim().match(/^(\d{4})\d{4}$/)
  return m ? Number(m[1]) : undefined
}

/**
 * Parse YouTube `json3` auto-captions into clean cues with start timestamps (seconds).
 *
 * We use json3 rather than VTT on purpose: VTT auto-captions "roll" — every phrase is emitted
 * twice and overlapping cues concatenate into garbled, duplicated text ("...at MTA. And I'm a
 * network engineer at MTA..."). json3 gives one clean segment per event, so the transcript reads
 * naturally. Each event has `tStartMs` and `segs[].utf8`.
 */
export function parseJson3(raw: string): { ts: number; text: string }[] {
  let data: { events?: { tStartMs?: number; segs?: { utf8?: string }[] }[] }
  try { data = JSON.parse(raw) } catch { return [] }
  const cues: { ts: number; text: string }[] = []
  for (const e of data.events ?? []) {
    if (!e.segs) continue
    const text = e.segs.map((s) => s.utf8 ?? '').join('').replace(/\s+/g, ' ').trim()
    if (text) cues.push({ ts: Math.floor((e.tStartMs ?? 0) / 1000), text })
  }
  return cues
}

export async function fetchCaptions(url: string): Promise<Captions> {
  let dir: string | undefined
  try {
    dir = await mkdtemp(join(tmpdir(), 'scalegraph-'))
    // One call: write English auto-subs AND print the upload_date to stdout.
    const { stdout } = await exec('yt-dlp', [
      '--write-auto-subs', '--sub-lang', 'en', '--skip-download', '--no-simulate',
      '--sub-format', 'json3', '--print', '%(upload_date)s',
      '-o', join(dir, '%(id)s.%(ext)s'), '--', url,
    ], { timeout: 90_000 })
    const year = yearFromUploadDate(stdout)
    const files = await readdir(dir)
    const subFile = files.find((f) => f.endsWith('.json3'))
    if (!subFile) return { ...EMPTY, year }
    const raw = await readFile(join(dir, subFile), 'utf8')
    const cues = parseJson3(raw)
    if (!cues.length) return { ...EMPTY, year }
    const text = cues.map((c) => c.text).join(' ').replace(/\s+/g, ' ').trim()
    return { text, available: true, cues, year }
  } catch {
    return EMPTY // yt-dlp missing, network error, no captions, timeout — all degrade silently
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
