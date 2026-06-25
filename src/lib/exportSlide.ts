// Slide export: PNG (html-to-image), PDF (browser print), and editable .pptx (pptxgenjs).
import { toPng } from 'html-to-image'
import type { SlideSpec } from '../types'

function download(href: string, name: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  a.click()
}

export async function exportPng(el: HTMLElement, name = 'scalegraph-slide.png'): Promise<void> {
  const url = await toPng(el, { pixelRatio: 2, backgroundColor: '#0a0c10', cacheBust: true })
  download(url, name)
}

/** Print to PDF via the browser dialog (user picks "Save as PDF"). */
export function exportPdf(): void {
  window.print()
}

export async function exportPptx(spec: SlideSpec, name = 'scalegraph-slide.pptx'): Promise<void> {
  // Lazy import keeps pptxgenjs out of the initial bundle.
  const PptxGenJS = (await import('pptxgenjs')).default
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 })
  pptx.layout = 'WIDE'
  const slide = pptx.addSlide()
  slide.background = { color: '0A0C10' }

  slide.addText(spec.title, {
    x: 0.6, y: 0.5, w: 12.1, h: 1.0,
    fontSize: 30, bold: true, color: 'E7EDF3', fontFace: 'Arial',
  })

  if (spec.bullets.length) {
    slide.addText(
      spec.bullets.map((b) => ({
        text: b.cite ? `${b.text}  (${b.cite})` : b.text,
        options: { bullet: true, fontSize: 16, color: 'C7D0DA', paraSpaceAfter: 10 },
      })),
      { x: 0.7, y: 1.7, w: 11.9, h: 4.4, valign: 'top', fontFace: 'Arial' },
    )
  }

  if (spec.sources.length) {
    slide.addText(`Sources: ${spec.sources.join('  ·  ')}`, {
      x: 0.6, y: 6.7, w: 12.1, h: 0.5, fontSize: 11, color: '2DD4BF', fontFace: 'Arial',
    })
  }

  await pptx.writeFile({ fileName: name })
}
