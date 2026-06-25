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

/** Parse WebVTT into cues with start timestamps in seconds. */
export function parseVtt(vtt: string): { ts: number; text: string }[] {
  const cues: { ts: number; text: string }[] = []
  const blocks = vtt.split(/\r?\n\r?\n/)
  const timeRe = /(\d{2}):(\d{2}):(\d{2})[.,](\d{3})\s*-->/
  for (const b of blocks) {
    const m = b.match(timeRe)
    if (!m) continue
    const ts = +m[1] * 3600 + +m[2] * 60 + +m[3]
    const text = b
      .split(/\r?\n/)
      .filter((l) => !timeRe.test(l) && !/^WEBVTT/.test(l) && l.trim())
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .trim()
    if (text) cues.push({ ts, text })
  }
  // YouTube auto-captions roll: each line is emitted twice (timed + plain) and overlaps the next.
  // Drop consecutive cues whose text repeats or is a prefix of the previous, to de-noise.
  const deduped: { ts: number; text: string }[] = []
  for (const c of cues) {
    const prev = deduped[deduped.length - 1]
    if (prev && (prev.text === c.text || prev.text.endsWith(c.text) || c.text.startsWith(prev.text))) {
      if (c.text.length > prev.text.length) prev.text = c.text // keep the longer/fuller line
      continue
    }
    deduped.push({ ...c })
  }
  return deduped
}

export async function fetchCaptions(url: string): Promise<Captions> {
  let dir: string | undefined
  try {
    dir = await mkdtemp(join(tmpdir(), 'scalegraph-'))
    // One call: write English auto-subs AND print the upload_date to stdout.
    const { stdout } = await exec('yt-dlp', [
      '--write-auto-subs', '--sub-lang', 'en', '--skip-download', '--no-simulate',
      '--sub-format', 'vtt', '--print', '%(upload_date)s',
      '-o', join(dir, '%(id)s.%(ext)s'), '--', url,
    ], { timeout: 90_000 })
    const year = yearFromUploadDate(stdout)
    const files = await readdir(dir)
    const vttFile = files.find((f) => f.endsWith('.vtt'))
    if (!vttFile) return { ...EMPTY, year }
    const vtt = await readFile(join(dir, vttFile), 'utf8')
    const cues = parseVtt(vtt)
    if (!cues.length) return { ...EMPTY, year }
    return { text: cues.map((c) => c.text).join(' '), available: true, cues, year }
  } catch {
    return EMPTY // yt-dlp missing, network error, no captions, timeout — all degrade silently
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}
