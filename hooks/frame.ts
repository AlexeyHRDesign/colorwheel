import { DARK, LIGHT } from './palette'
import type { Summary } from './progress'
import type { Pill } from './weather'

// The desktop band: one rounded frame inside the app's own block. Its top half is the
// 5-hour limit, its bottom half the 7-day limit; each is empty while the budget is untouched
// and grows from the left as it is used. Tasks fill the inside from the left.

const R = 11
const PAD = 16
const CHAR = 6.6
const METRIC_GAP = 16
const BASE_HEIGHT = 36
const EDGE_INSET = 5
// The band pulls the Svg one cell out past the app's padding; this much of it comes back on the sides.
const SIDE_INSET = 6
const TAG_CHAR = 5.5
const TAG_PAD = 3
const TAG_FONT = 9.5
const TEXT_FADE = 28

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
  `.edge-tag{font-size:${TAG_FONT}px;font-weight:600;fill:currentColor}.pace-dot{fill:currentColor;stroke:#efeeea;stroke-width:1.5}.shine{stroke:url(#shine)}@media (prefers-reduced-motion:reduce){.shine{display:none}}` +
  `.icon{fill:none;stroke:currentColor;stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round}` +
  `.fg{fill:${LIGHT.fg}}.muted{fill:${LIGHT.muted}}.bold{font-weight:650}.tone{fill:currentColor}` +
  `.hit{fill:transparent}.metric:hover .hit{fill:${LIGHT.line};fill-opacity:.14}${tones(LIGHT.wheel)}` +
  `@media (prefers-color-scheme:dark){.track{stroke:${DARK.line}}.pace-dot{stroke:#30302e}.fg{fill:${DARK.fg}}.muted{fill:${DARK.muted}}` +
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
const rect = (cls: string, inset: number, h: number) => {
  const x = inset - EDGE_INSET + SIDE_INSET
  return `<rect class="${cls}" x="${x}" y="${inset}" style="width:calc(100% - ${2 * x}px)" height="${(h - 2 * inset).toFixed(1)}" rx="${Math.max(3, R - inset + 1).toFixed(1)}"/>`
}
// A mask that keeps the left `ratio` of the frame and lets the cut end fade out softly.
const FADE = 6
// Percent of the width a label takes past the edge's end, roughly; a pace tick in it moves the label.
const PACE_ROOM = 9
const DOT_R = 3
const SHINE_S = 2.4
const share = (id: string, ratio: number, y: number, h: number, fade = FADE) => {
  const end = ratio * 100
  const start = Math.max(0, end - fade)
  if (fade <= 0) {
    return `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="${y}" width="100%" height="${h}"><rect x="0" y="${y}" width="${end.toFixed(2)}%" height="${h}" fill="#fff"/></mask>`
  }
  return `<linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="${start.toFixed(2)}%" y1="0" x2="${end.toFixed(2)}%" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
    `<mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="${y}" width="100%" height="${h}"><rect x="0" y="${y}" width="100%" height="${h}" fill="url(#${id}g)"/></mask>`
}

// `left` labels the edges as the share left; `slot` keeps that many px free left of the metrics,
// where the caller lays a control over the drawing. `slotRight` is that gap's right end, in px from the right.
// `working` runs a slow shimmer along the limit edges while Claude or its agents are at work.
export type FrameOptions = { left?: boolean; slot?: number; working?: boolean }

export const frame = (s: Summary | null, list: readonly Pill[], opts: FrameOptions = {}): { svg: string; alt: string; height: number; slotRight: number } => {
  const slot = opts.slot ?? 0
  const h = BASE_HEIGHT
  const mid = h / 2
  const inner = SIDE_INSET
  const defs: string[] = []
  const body: string[] = []
  const hasProgress = !!s && (s.isActive || s.isFinished)
  // A soft band of light that crosses the edge's own colour at a constant pace; it never changes
  // the edge's length, which is data. Reduced motion hides it.
  if (opts.working) {
    defs.push(
      `<linearGradient id="shine" x1="-0.35" y1="0" x2="0" y2="0">` +
        `<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>` +
        `<animateTransform attributeName="gradientTransform" type="translate" from="0 0" to="1.35 0" dur="${SHINE_S}s" repeatCount="indefinite"/></linearGradient>`,
    )
  }

  // Tasks: a wash inside the frame, growing from the left.
  if (hasProgress) {
    defs.push(share('tasks', ratioOf(s!), 0, h))
    body.push(`<g class="t${s!.isFinished ? 1 : 0}" mask="url(#tasks)">${rect('wash', EDGE_INSET + 1.5, h)}</g>`)
  }

  // The frame: top half the 5-hour limit, bottom half the 7-day, each drawn from the left as far as the share used.
  // Each fades out softly at its value; its percent sits just past the fade in a gap cut out of the line,
  // or, near the right corner, just before the fade begins. A dot of the same colour marks the pace.
  const edges: string[] = [rect('track', EDGE_INSET, h)]
  const tags: string[] = []
  const cuts: string[] = []
  for (const [tag, y] of [['5h', 0], ['7d', mid]] as const) {
    const p = list.find(x => x.tag === tag)
    if (!p) continue
    const left = Math.max(0, Math.min(100, p.percent)) / 100
    if (left > 0) {
      defs.push(share(`e${tag}`, left, y, mid))
      edges.push(`<g class="t${ringOf(p)}" mask="url(#e${tag})">${rect('ring', EDGE_INSET, h)}</g>`)
      if (opts.working) edges.push(`<g mask="url(#e${tag})">${rect('ring shine', EDGE_INSET, h)}</g>`)
    }
    const label = `${tag} ${p.percent}%${opts.left ? ' left' : ''}`
    // The label also steps to the other side of the edge's end when the pace dot sits there.
    const near = (from: number, to: number) => p.pace !== undefined && p.pace - p.percent >= from && p.pace - p.percent <= to
    const flip = left > 0.85 ? !near(-PACE_ROOM, 0) : near(0, PACE_ROOM)
    const ty = y === 0 ? EDGE_INSET : h - EDGE_INSET
    const width = label.length * TAG_CHAR + 2 * TAG_PAD
    // The label sits clear of the edge's soft end: past it, or, flipped, before the fade begins.
    const at = `${((flip ? Math.max(0, left * 100 - FADE) : left * 100)).toFixed(2)}%`
    const from = flip ? `calc(${at} - ${(width + 4).toFixed(1)}px)` : `calc(${at} + 4px)`
    cuts.push(`<rect y="${ty - 6}" height="12" style="x:${from};width:${width.toFixed(1)}px" fill="#000"/>`)
    // The whole edge answers with the tooltip, not only its small label.
    const hitY = y === 0 ? 0 : h - 2 * EDGE_INSET
    tags.push(`<rect class="hit" x="0" y="${hitY}" width="100%" height="${2 * EDGE_INSET}"><title>${esc(p.tip.join('\n'))}</title></rect>`)
    tags.push(
      `<g class="t${ringOf(p)}"><title>${esc(p.tip.join('\n'))}</title><text class="edge-tag" x="${at}" dx="${flip ? -(4 + TAG_PAD) : 4 + TAG_PAD}" y="${ty}" text-anchor="${flip ? 'end' : 'start'}">${esc(label)}</text></g>`,
    )
    // Pace: a dot in the edge's colour where the edge would end if the budget were spent evenly.
    if (p.pace !== undefined) {
      const px = Math.max(0, Math.min(100, p.pace))
      // The dot's own tooltip says what it marks; a wider invisible ring makes the small dot easy to hover.
      const cx = `cx:clamp(${R + SIDE_INSET}px, ${px.toFixed(2)}%, calc(100% - ${R + SIDE_INSET}px))`
      const tip = `<title>${esc((p.paceTip ?? p.tip).join('\n'))}</title>`
      tags.push(`<circle class="pace-dot t${ringOf(p)}" cy="${ty}" r="${DOT_R}" style="${cx}">${tip}</circle><circle class="hit" cy="${ty}" r="${DOT_R + 4}" style="${cx}">${tip}</circle>`)
    }
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
    const valueTone = p.used >= 80 ? ` class="tone t4 bold"` : ` class="fg"`
    metrics.push(
      `<g class="metric"><title>${esc(p.tip.join('\n'))}</title>` +
        `<rect class="hit" x="${(x - 6).toFixed(1)}" y="${inner + 2}" width="${(mw + 12).toFixed(1)}" height="${(h - 2 * inner - 4).toFixed(1)}" rx="5"/>` +
        `${icon}${tag}<text${valueTone} x="${(x + lead).toFixed(1)}" y="${mid}">${value}</text></g>`,
    )
    right = x - METRIC_GAP
  }
  const metricsWidth = Math.max(0, -right - METRIC_GAP)
  const slotRight = inner + PAD + metricsWidth + (metricsWidth ? METRIC_GAP : 0)
  body.push(`<svg x="100%" y="0" overflow="visible"><g transform="translate(${-(inner + PAD)} 0)">${metrics.join('')}</g></svg>`)

  // Progress text on the left; where it would run into the metrics it fades out rather than cutting a word.
  if (hasProgress) {
    const reserve = 2 * (inner + PAD) + metricsWidth + METRIC_GAP + slot
    const solid = `calc(100% - ${(reserve + TEXT_FADE).toFixed(0)}px)`
    defs.push(
      `<linearGradient id="textg"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>` +
        `<mask id="text" maskUnits="userSpaceOnUse" x="0" y="0" width="100%" height="${h}">` +
        `<rect x="0" y="0" style="width:${solid}" height="${h}" fill="#fff"/>` +
        `<rect y="0" style="x:${solid};width:${TEXT_FADE}px" height="${h}" fill="url(#textg)"/></mask>`,
    )
    const tspans = spans(s!).map(sp => `<tspan class="${sp.cls}${sp.tone === undefined ? '' : ` t${sp.tone}`}">${esc(sp.text)}</tspan>`)
    body.push(`<g mask="url(#text)"><text x="${inner + PAD}" y="${mid}" xml:space="preserve">${tspans.join('')}</text></g>`)
  } else if (!list.length) {
    body.push(`<text class="muted" x="${inner + PAD}" y="${mid}">Context and limits show after the first reply</text>`)
  }

  const alt = [
    ...(hasProgress ? [spans(s!).map(x => x.text).join('').replace(/\s+/g, ' ').trim()] : []),
    ...list.map(p => p.tip[0]!),
  ].join('; ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h}"><style>${css}</style><defs>${defs.join('')}</defs>${body.join('')}</svg>`
  return { svg, alt, height: h, slotRight }
}
