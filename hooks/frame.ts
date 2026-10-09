import { DARK, LIGHT } from './palette'
import type { Summary } from './progress'
import type { Pill } from './weather'

// The desktop band: one rounded frame inside the app's own block. Its top half is the
// 5-hour limit, its bottom half the 7-day limit; each is full while the budget is untouched
// and wipes away from the right as it is used. Tasks fill the inside from the left.

const R = 11
const PAD = 16
const CHAR = 6.6
const METRIC_GAP = 16
const BASE_HEIGHT = 36
const EDGE_INSET = 5
const TAG_CHAR = 5.5
const TAG_PAD = 3
const TAG_FONT = 9.5

// Fixed colour per budget, so an edge keeps its identity as it wipes; context takes its forecast tone.
const EDGE: Record<string, number> = { '5h': 0, '7d': 2 }
export const ringOf = (p: Pill) => (p.icon ? p.tone : EDGE[p.tag] ?? 4)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const textWidth = (s: string) => s.length * CHAR

const tones = (wheel: readonly string[]) => wheel.map((c, i) => `.t${i}{color:${c}}`).join('')

const css =
  `svg{display:block;overflow:visible}text{font:500 12px ui-sans-serif,system-ui,sans-serif;font-variant-numeric:tabular-nums;dominant-baseline:central}` +
  `.track{fill:none;stroke:${LIGHT.line};stroke-opacity:.28;stroke-width:1.5}` +
  `.ring{fill:none;stroke:currentColor;stroke-width:2}` +
  `.wash{fill:currentColor;fill-opacity:.1}` +
  `.edge-tag{font-size:${TAG_FONT}px;font-weight:600;fill:currentColor}` +
  `.icon{fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}` +
  `.fg{fill:${LIGHT.fg}}.muted{fill:${LIGHT.muted}}.bold{font-weight:650}.tone{fill:currentColor}` +
  `.hit{fill:transparent}.metric:hover .hit{fill:${LIGHT.line};fill-opacity:.14}${tones(LIGHT.wheel)}` +
  `@media (prefers-color-scheme:dark){.track{stroke:${DARK.line}}.fg{fill:${DARK.fg}}.muted{fill:${DARK.muted}}` +
  `.wash{fill-opacity:.16}.metric:hover .hit{fill:${DARK.line}}${tones(DARK.wheel)}}`

type Span = { text: string; cls: string; tone?: number }

const spans = (s: Summary): Span[] => {
  const out: Span[] = []
  const tone = s.isFinished ? 1 : 0
  if (s.agentsTotal) {
    out.push({ text: 'Agents ', cls: 'fg bold' })
    out.push(s.running ? { text: `${s.running} running`, cls: 'tone', tone: 0 } : { text: 'none running', cls: 'fg' })
    out.push({ text: ` · ${s.agentsDone} done     `, cls: 'muted' })
  }
  if (s.tasksTotal || s.agentsTotal) {
    out.push({ text: s.isFinished ? 'All done ' : s.tasksTotal ? 'Tasks ' : 'Progress ', cls: 'fg bold' })
    out.push({ text: s.tasksTotal ? `${s.tasksDone}/${s.tasksTotal}` : `${s.agentsDone}/${s.agentsTotal}`, cls: 'tone', tone })
    if (s.current && !s.isFinished) out.push({ text: ` · ${s.current}`, cls: 'muted' })
  }
  return out
}

export const ratioOf = (s: Summary) => (s.tasksTotal ? s.tasksDone / s.tasksTotal : s.agentsTotal ? s.agentsDone / s.agentsTotal : 0)

// Widths are CSS calc() against the frame's own width, so the drawing fits whatever slot the band gives it.
const rect = (cls: string, inset: number, h: number) =>
  `<rect class="${cls}" x="${inset}" y="${inset}" style="width:calc(100% - ${2 * inset}px)" height="${(h - 2 * inset).toFixed(1)}" rx="${Math.max(3, R - inset + 1).toFixed(1)}"/>`
// A mask that keeps the left `ratio` of the frame and lets the cut end fade out softly.
const FADE = 6
const share = (id: string, ratio: number, y: number, h: number) => {
  const end = ratio * 100
  const start = Math.max(0, end - FADE)
  return `<linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="${start.toFixed(2)}%" y1="0" x2="${end.toFixed(2)}%" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="${y}" width="100%" height="${h}"><rect x="0" y="${y}" width="100%" height="${h}" fill="url(#${id}g)"/></mask>`
}

export const frame = (s: Summary | null, list: readonly Pill[]): { svg: string; alt: string; height: number } => {
  const h = BASE_HEIGHT
  const mid = h / 2
  const inner = EDGE_INSET
  const defs: string[] = []
  const body: string[] = []
  const hasProgress = !!s && (s.isActive || s.isFinished)

  // Tasks: a wash inside the frame, growing from the left.
  if (hasProgress) {
    defs.push(share('tasks', ratioOf(s!), 0, h))
    body.push(`<g class="t${s!.isFinished ? 1 : 0}" mask="url(#tasks)">${rect('wash', EDGE_INSET + 1.5, h)}</g>`)
  }

  // The frame: top half the 5-hour limit, bottom half the 7-day, each wiped from the right by the share used.
  // Its percent sits on the edge itself, just past where the colour ends, in a gap cut out of the line;
  // near the right corner it flips to sit before the end.
  const edges: string[] = [rect('track', EDGE_INSET, h)]
  const tags: string[] = []
  const cuts: string[] = []
  for (const [tag, y] of [['5h', 0], ['7d', mid]] as const) {
    const p = list.find(x => x.tag === tag)
    if (!p) continue
    const left = Math.max(0, Math.min(100, 100 - p.percent)) / 100
    if (left > 0) {
      defs.push(share(`e${tag}`, left, y, mid))
      edges.push(`<g class="t${ringOf(p)}" mask="url(#e${tag})">${rect('ring', EDGE_INSET, h)}</g>`)
    }
    const label = `${tag} ${p.percent}%`
    const flip = left > 0.85
    const at = `${(left * 100).toFixed(2)}%`
    const ty = y === 0 ? EDGE_INSET : h - EDGE_INSET
    const width = label.length * TAG_CHAR + 2 * TAG_PAD
    const from = flip ? `calc(${at} - ${(width + 4).toFixed(1)}px)` : `calc(${at} + 4px)`
    cuts.push(`<rect y="${ty - 6}" height="12" style="x:${from};width:${width.toFixed(1)}px" fill="#000"/>`)
    tags.push(
      `<g class="t${ringOf(p)}"><title>${esc(p.tip.join('\n'))}</title><text class="edge-tag" x="${at}" dx="${flip ? -(4 + TAG_PAD) : 4 + TAG_PAD}" y="${ty}" text-anchor="${flip ? 'end' : 'start'}">${esc(label)}</text></g>`,
    )
  }
  defs.push(`<mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="${h}"><rect x="0" y="0" width="100%" height="${h}" fill="#fff"/>${cuts.join('')}</mask>`)
  body.push(`<g mask="url(#cut)">${edges.join('')}</g>`, ...tags)

  // Metrics, right-aligned inside the frames, each labelled in its frame's colour.
  let right = 0
  const metrics: string[] = []
  for (const p of [...list].reverse().filter(x => !(x.tag in EDGE))) {
    const value = `${p.percent}%`
    const ring = ringOf(p)
    const lead = p.icon ? 18 : textWidth(p.tag) + 4
    const mw = lead + textWidth(value)
    const x = right - mw
    const icon = p.icon ? `<g class="icon t${ring}" transform="translate(${x.toFixed(1)} ${mid - 7})">${p.icon}</g>` : ''
    const tag = p.tag ? `<text class="tone t${ring}" x="${x.toFixed(1)}" y="${mid}">${esc(p.tag)}</text>` : ''
    const valueTone = p.percent >= 80 ? ` class="tone t4 bold"` : ` class="fg"`
    metrics.push(
      `<g class="metric"><title>${esc(p.tip.join('\n'))}</title>` +
        `<rect class="hit" x="${(x - 6).toFixed(1)}" y="${inner + 2}" width="${(mw + 12).toFixed(1)}" height="${(h - 2 * inner - 4).toFixed(1)}" rx="5"/>` +
        `${icon}${tag}<text${valueTone} x="${(x + lead).toFixed(1)}" y="${mid}">${value}</text></g>`,
    )
    right = x - METRIC_GAP
  }
  const metricsWidth = -right - METRIC_GAP
  body.push(`<svg x="100%" y="0" overflow="visible"><g transform="translate(${-(inner + PAD)} 0)">${metrics.join('')}</g></svg>`)

  // Progress text on the left.
  // Progress text on the left, cut where the metrics begin.
  if (hasProgress) {
    const reserve = 2 * (inner + PAD) + Math.max(0, metricsWidth) + METRIC_GAP
    defs.push(`<clipPath id="text"><rect x="0" y="0" style="width:calc(100% - ${reserve.toFixed(0)}px)" height="${h}"/></clipPath>`)
    const tspans = spans(s!).map(sp => `<tspan class="${sp.cls}${sp.tone === undefined ? '' : ` t${sp.tone}`}">${esc(sp.text)}</tspan>`)
    body.push(`<g clip-path="url(#text)"><text x="${inner + PAD}" y="${mid}" xml:space="preserve">${tspans.join('')}</text></g>`)
  }

  const alt = [
    ...(hasProgress ? [spans(s!).map(x => x.text).join('').replace(/\s+/g, ' ').trim()] : []),
    ...list.map(p => p.tip[0]!),
  ].join('; ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}"><style>${css}</style><defs>${defs.join('')}</defs>${body.join('')}</svg>`
  return { svg, alt, height: h }
}
