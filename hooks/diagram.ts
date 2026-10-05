import type { Scheme } from './palette'
import { DARK, LIGHT } from './palette'
import { layoutFlowchart } from './layout'
import type { Colors } from './vendor/mermaid.js'
import {
  layoutSequenceDiagram, layoutXYChart, parseMermaid, parseSequenceDiagram, parseXYChart,
  renderMermaidAscii, renderSequenceSvg, renderSvg, renderXYChartSvg,
} from './vendor/mermaid.js'

export type Diagram = { svg: string; width: number; height: number }
export type Crop = { zoom: number; x: number; y: number }

const vars = (s: Scheme) =>
  [
    `--cw-bg:${s.bg}`, `--cw-fg:${s.fg}`, `--cw-line:${s.line}`, `--cw-accent:${s.wheel[0]}`, `--cw-muted:${s.muted}`,
    `--cw-surface:${s.surface}`, `--cw-border:${s.border}`, ...s.wheel.map((c, i) => `--cw-s${i}:${c}`),
  ].join(';')

const THEME = `<style>svg{${vars(LIGHT)}}@media (prefers-color-scheme: dark){svg{${vars(DARK)}}}`
  + `text{font-family:system-ui,-apple-system,'Segoe UI',sans-serif}.mono,text.mono{font-family:ui-monospace,'Cascadia Mono',Consolas,monospace}</style>`

const COLORS: Colors = {
  bg: 'var(--cw-bg)', fg: 'var(--cw-fg)', line: 'var(--cw-line)', accent: 'var(--cw-accent)',
  muted: 'var(--cw-muted)', surface: 'var(--cw-surface)', border: 'var(--cw-border)',
}
const FONT = 'system-ui'

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const artSvg = (art: string): string => {
  const rows = art.split('\n')
  const cols = Math.max(1, ...rows.map(r => [...r].length))
  const w = Math.ceil(cols * 8.4) + 16
  const h = rows.length * 18 + 16
  const body = rows.map((r, i) => `<text x="8" y="${22 + i * 18}" class="mono" fill="var(--cw-fg)" xml:space="preserve">${esc(r)}</text>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" style="--bg:var(--cw-bg)"><style>text{font-size:14px;white-space:pre}</style>${body}</svg>`
}

const render = (source: string): string => {
  const lines = source.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('%%'))
  const head = (lines[0] ?? '').toLowerCase()
  if (/^xychart(-beta)?\b/.test(head)) return renderXYChartSvg(layoutXYChart(parseXYChart(lines)), COLORS, FONT, true, true)
  if (/^sequencediagram\s*$/.test(head)) return renderSequenceSvg(layoutSequenceDiagram(parseSequenceDiagram(lines)), COLORS, FONT, true)
  if (/^(classdiagram|erdiagram)\s*$/.test(head)) return artSvg(renderMermaidAscii(source, { colorMode: 'none', paddingX: 3, paddingY: 1 }).replace(/[ \t]+$/gm, '').trimEnd())
  if (/^(graph|flowchart|statediagram(-v2)?)\b/.test(head)) return renderSvg(layoutFlowchart(parseMermaid(lines.join('\n'))), COLORS, FONT, true)
  throw new Error(`unsupported diagram: ${head}`)
}

export let lastError = ''
const cache = new Map<string, Diagram | null>()

export const diagram = (source: string): Diagram | null => {
  const hit = cache.get(source)
  if (hit !== undefined) return hit
  let result: Diagram | null = null
  try {
    const raw = render(source)
    const size = /<svg[^>]*?\swidth="([\d.]+)"[^>]*?\sheight="([\d.]+)"/.exec(raw)
    if (size) {
      const svg = raw
        .replace(/@import url\([^)]*\);?/g, '')
        .replace(/(--xychart-color-(\d+)):\s*[^;]+;/g, (_m, name: string, i: string) => `${name}: var(--cw-s${Number(i) % 6});`)
        .replace(/(<svg[^>]*>)/, `$1${THEME}`)
      result = { svg, width: Number(size[1]), height: Number(size[2]) }
    }
  } catch (err) {
    lastError = String((err as Error)?.stack ?? err)
    result = null
  }
  cache.set(source, result)
  if (cache.size > 100) cache.delete(cache.keys().next().value!)
  return result
}

export const PX_PER_COLUMN = 8.2
const MAX_SCALE = 2
const MAX_HEIGHT = 640

export const fit = (d: Diagram, columns: number): { width: number; height: number } => {
  const room = Math.max(320, Math.round(columns * PX_PER_COLUMN))
  let width = Math.min(room, d.width * MAX_SCALE)
  let height = (width * d.height) / d.width
  if (height > MAX_HEIGHT) {
    height = MAX_HEIGHT
    width = (height * d.width) / d.height
  }
  return { width: Math.round(width), height: Math.round(height) }
}

export const crop = (d: Diagram, view: Crop): string => {
  const vw = d.width / view.zoom
  const vh = d.height / view.zoom
  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v))
  const x = clamp(view.x * d.width - vw / 2, d.width - vw)
  const y = clamp(view.y * d.height - vh / 2, d.height - vh)
  return d.svg.replace(/viewBox="[^"]*"/, `viewBox="${x.toFixed(1)} ${y.toFixed(1)} ${vw.toFixed(1)} ${vh.toFixed(1)}"`)
}
