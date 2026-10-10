// Writes the README's images from the mod's own drawing code, so they never drift from what
// the mod draws. Run with: npx tsx scripts/readme-images.ts
import { mkdirSync, writeFileSync } from 'node:fs'

import { diagram } from '../hooks/diagram'
import { frame } from '../hooks/frame'
import { LIGHT } from '../hooks/palette'
import { pills } from '../hooks/weather'

const OUT = new URL('../docs/images/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const write = (name: string, svg: string) => writeFileSync(new URL(name, OUT), svg)

// The frame sits inside the app's own grey block, so the picture draws that block around it.
const PAD = 8
const sized = (svg: string, width: number, height: number) => {
  const inner = svg.replace('width="100%"', `x="${PAD}" y="${PAD}" width="${width}"`)
  const w = width + 2 * PAD
  const h = height + 2 * PAD
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<style>.block{fill:#efeeea}@media (prefers-color-scheme:dark){.block{fill:#30302e}}</style>` +
    `<rect class="block" width="${w}" height="${h}" rx="14"/>${inner}</svg>`
  )
}

const now = Date.parse('2026-10-09T12:00:00Z')
const weather = {
  readings: [40, 62, 75, 93, 118, 141, 166, 190, 214, 246, 281, 330].map(k => ({ tokens: k * 1000, window: 1_000_000, percent: Math.round(k / 10) })),
  limits: [
    { kind: 'five_hour', percentUsed: 31, resetsAt: new Date(now + 2.6 * 3_600_000).toISOString() },
    { kind: 'seven_day', percentUsed: 64, resetsAt: new Date(now + 3.2 * 86_400_000).toISOString() },
  ],
}
const running = { running: 2, agentsDone: 1, agentsTotal: 3, tasksDone: 2, tasksTotal: 5, current: 'Writing the failing test', isActive: true, isFinished: false }

const WIDTH = 880
const idle = frame(null, pills(weather, now))
write('frame-idle.svg', sized(idle.svg, WIDTH, idle.height))
const busy = frame(running, pills(weather, now))
write('frame-tasks.svg', sized(busy.svg, WIDTH, busy.height))

const flow = diagram(['flowchart LR', '  R[Reply] --> S{Split}', '  S -->|text| M[Markdown]', '  S -->|code| C[Code view]', '  S -->|mermaid| D[Diagram]'].join('\n'))
if (flow) write('diagram-flow.svg', flow.svg)
const chart = diagram(['xychart-beta', '  title "Reply render time, ms"', '  x-axis [Text, Table, Code, Diagram]', '  y-axis "ms" 0 --> 450', '  bar [410, 260, 190, 150]', '  line [180, 120, 95, 80]'].join('\n'))
if (chart) write('diagram-chart.svg', chart.svg)

// The mark: the palette's six hues as a wheel, broken into arcs like the frame's edges.
const arcs = LIGHT.wheel.map((color, i) => {
  const gap = 0.16
  const a0 = (i / 6) * Math.PI * 2 - Math.PI / 2 + gap
  const a1 = ((i + 1) / 6) * Math.PI * 2 - Math.PI / 2 - gap
  const p = (a: number) => `${(64 + 44 * Math.cos(a)).toFixed(2)} ${(64 + 44 * Math.sin(a)).toFixed(2)}`
  return `<path d="M${p(a0)}A44 44 0 0 1 ${p(a1)}" stroke="${color}"/>`
})
write(
  'logo.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><g fill="none" stroke-width="14" stroke-linecap="round">${arcs.join('')}</g></svg>`,
)
