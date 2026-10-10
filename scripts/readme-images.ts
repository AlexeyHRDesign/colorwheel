// Writes the README's images from the mod's own drawing code, so they never drift from what
// the mod draws. Run with: npx tsx scripts/readme-images.ts
import { mkdirSync, writeFileSync } from 'node:fs'

import { diagram } from '../hooks/diagram'
import { frame } from '../hooks/frame'
import { pills } from '../hooks/weather'
import { window } from './mock'

const OUT = new URL('../docs/images/', import.meta.url)
mkdirSync(OUT, { recursive: true })
const write = (name: string, svg: string) => writeFileSync(new URL(name, OUT), svg)

const now = Date.parse('2026-10-09T12:00:00Z')
const weather = {
  readings: [40, 62, 75, 93, 118, 141, 166, 190, 214, 246, 281, 330].map(k => ({ tokens: k * 1000, window: 1_000_000, percent: Math.round(k / 10) })),
  limits: [
    { kind: 'five_hour', percentUsed: 31, resetsAt: new Date(now + 2.6 * 3_600_000).toISOString() },
    { kind: 'seven_day', percentUsed: 64, resetsAt: new Date(now + 3.2 * 86_400_000).toISOString() },
  ],
}
const running = { running: 2, agentsDone: 1, agentsTotal: 3, tasksDone: 2, tasksTotal: 5, current: 'Writing the failing test', isActive: true, isFinished: false }

write(
  'window-tasks.svg',
  window(frame(running, pills(weather, now)), {
    user: 'Move the layout code into its own module and cover it with tests.',
    reply: ['Two subagents are mapping the layout code while I write the failing test first.', 'The band below follows them, and the task list, as they go.'],
  }),
)
write(
  'window-idle.svg',
  window(frame(null, pills(weather, now)), {
    user: 'How much room is left before I should start a new session?',
    reply: ['About two thirds of the context is still free, so there is no rush.', 'The 5-hour limit is at 31%; the weekly one at 64% is the one to watch.'],
  }),
)

const flow = diagram(['flowchart LR', '  R[Reply] --> S{Split}', '  S -->|text| M[Markdown]', '  S -->|code| C[Code view]', '  S -->|mermaid| D[Diagram]'].join('\n'))
if (flow) write('diagram-flow.svg', flow.svg)
const chart = diagram(['xychart-beta', '  title "Reply render time, ms"', '  x-axis [Text, Table, Code, Diagram]', '  y-axis "ms" 0 --> 450', '  bar [410, 260, 190, 150]', '  line [180, 120, 95, 80]'].join('\n'))
if (chart) write('diagram-chart.svg', chart.svg)
