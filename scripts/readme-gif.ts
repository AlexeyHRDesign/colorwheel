// Records the README's animation from an HTML page, frame by frame, in the system Chrome:
// a prompt is typed and sent, the reply streams in, and the band steps through the states of
// `/colorwheel progress` the way the mod draws them. The band itself changes in steps, as it
// does in the app; only the chat moves between them. Needs Chrome and Python with Pillow.
// Run with: npm --prefix scripts install && npx tsx scripts/readme-gif.ts
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from './node_modules/playwright-core/index.mjs'

import { frame } from '../hooks/frame'
import type { Summary } from '../hooks/progress'
import { pills } from '../hooks/weather'
import { window } from './mock'

const OUT = fileURLToPath(new URL('../docs/images/band-demo.gif', import.meta.url))
const FPS = 12
const MS = 1000 / FPS

const now = Date.parse('2026-10-09T12:00:00Z')
// Usage as it grows through the turn: [5-hour %, 7-day %, context %]. The mod redraws in steps,
// so each band state carries its own figures.
type Usage = [number, number, number]
const weather = ([fiveHour, sevenDay, context]: Usage) => ({
  readings: [40, 62, 75, 93, 118, 141, 166, 190, 214, 246, 281, context * 10].map(k => ({ tokens: k * 1000, window: 1_000_000, percent: Math.round(k / 10) })),
  limits: [
    { kind: 'five_hour', percentUsed: fiveHour, resetsAt: new Date(now + 2.6 * 3_600_000).toISOString() },
    { kind: 'seven_day', percentUsed: sevenDay, resetsAt: new Date(now + 3.2 * 86_400_000).toISOString() },
  ],
})

const step = (running: number, agentsDone: number, tasksDone: number, current?: string): Summary => {
  const isFinished = running === 0 && tasksDone === 4
  return { running, agentsDone, agentsTotal: 2, tasksDone, tasksTotal: 4, ...(current ? { current } : {}), isActive: !isFinished, isFinished }
}

const PROMPT = 'Move the elbow logic into the layout module and cover it with tests.'
const REPLY = ['Two subagents are mapping the layout code while I write the failing test first.', 'Done: the elbow logic lives in the layout module, and all four new tests pass.']

// The timeline, in ms. Band states switch at these marks, exactly as the mod switches them.
const TYPE_END = 1900
const SENT = 2200
const BAND: [number, Summary | null, Usage][] = [
  [0, null, [30, 61, 33]],
  [SENT + 300, step(2, 0, 0, 'Reading the layout code'), [34, 62, 35]],
  [3900, step(2, 0, 1, 'Writing the failing test'), [39, 63, 38]],
  [5100, step(1, 1, 1, 'Writing the failing test'), [44, 64, 40]],
  [6200, step(1, 1, 2, 'Moving the elbow logic'), [49, 65, 42]],
  [7400, step(0, 2, 3, 'Running the suite'), [54, 66, 45]],
  [8600, step(0, 2, 4), [58, 67, 47]],
]
const LINE_1 = [SENT + 400, SENT + 1900] as const
const LINE_2 = [8600, 9700] as const
const END = 12_000

const words = (line: string, [from, to]: readonly [number, number], t: number) => {
  if (t < from) return ''
  const all = line.split(' ')
  const n = Math.min(all.length, Math.ceil(((t - from) / (to - from)) * all.length))
  return all.slice(0, n).join(' ')
}

const at = (t: number) => {
  const [, band, stepped] = [...BAND].reverse().find(([mark]) => t >= mark)!
  // Work spends the limits: both only grow through the turn, the 5-hour one fast and the
  // 7-day one slowly, as they do in the app. Context steps with each turn.
  const p = Math.min(1, t / (END - 1500))
  const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2
  const usage: Usage = [30 + 28 * eased, 61 + 6 * eased, stepped[2]]
  const typed = t < TYPE_END ? PROMPT.slice(0, Math.round((t / TYPE_END) * PROMPT.length)) : t < SENT ? PROMPT : ''
  return window(frame(band, pills(weather(usage), now)), {
    user: t >= SENT ? PROMPT : null,
    reply: [words(REPLY[0]!, LINE_1, t), words(REPLY[1]!, LINE_2, t)],
    lines: 2,
    ...(typed ? { draft: typed } : {}),
    context: usage[2],
  })
}

const dir = mkdtempSync(join(tmpdir(), 'colorwheel-gif-'))
const browser = await chromium.launch({ channel: 'chrome' })
const page = await browser.newPage({ deviceScaleFactor: 1, colorScheme: 'light' })
const shots: string[] = []
for (let i = 0; i * MS <= END; i++) {
  const svg = at(i * MS)
  const [, w, h] = /width="(\d+)" height="(\d+)"/.exec(svg)!
  await page.setViewportSize({ width: Number(w), height: Number(h) })
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:#fff}svg{display:block}</style>${svg}`)
  const png = join(dir, `f${String(i).padStart(4, '0')}.png`)
  await page.screenshot({ path: png })
  shots.push(png)
}
await browser.close()

// Identical neighbours merge into one longer frame, which keeps the file small.
const python = [
  'import sys, json',
  'from PIL import Image, ImageChops',
  'files, ms, out = json.loads(sys.argv[1]), float(sys.argv[2]), sys.argv[3]',
  'frames, durations = [], []',
  'for f in files:',
  '    im = Image.open(f).convert("RGB")',
  '    if frames and ImageChops.difference(im, frames[-1]).getbbox() is None:',
  '        durations[-1] += ms',
  '    else:',
  '        frames.append(im); durations.append(ms)',
  'pal = frames[-1].quantize(colors=255, method=Image.Quantize.MEDIANCUT)',
  'q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in frames]',
  'q[0].save(out, save_all=True, append_images=q[1:], duration=[round(d) for d in durations], loop=0, optimize=True, disposal=1)',
  'print(len(q), "frames")',
].join('\n')
execFileSync('python', ['-c', python, JSON.stringify(shots), String(MS), OUT], { stdio: 'inherit' })
console.log(`wrote ${OUT}`)
