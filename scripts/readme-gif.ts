// Records the README's animation: the band through the steps of `/colorwheel progress`, drawn by
// the mod's own code inside the window mock. Needs Chrome and Python with Pillow.
// Run with: npx tsx scripts/readme-gif.ts
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { frame } from '../hooks/frame'
import type { Summary } from '../hooks/progress'
import { pills } from '../hooks/weather'
import { window } from './mock'

const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = fileURLToPath(new URL('../docs/images/band-demo.gif', import.meta.url))

const now = Date.parse('2026-10-09T12:00:00Z')
const weather = {
  readings: [40, 62, 75, 93, 118, 141, 166, 190, 214, 246, 281, 330].map(k => ({ tokens: k * 1000, window: 1_000_000, percent: Math.round(k / 10) })),
  limits: [
    { kind: 'five_hour', percentUsed: 31, resetsAt: new Date(now + 2.6 * 3_600_000).toISOString() },
    { kind: 'seven_day', percentUsed: 64, resetsAt: new Date(now + 3.2 * 86_400_000).toISOString() },
  ],
}

const step = (running: number, agentsDone: number, tasksDone: number, current?: string): Summary => {
  const isFinished = running === 0 && tasksDone === 4
  return { running, agentsDone, agentsTotal: 2, tasksDone, tasksTotal: 4, ...(current ? { current } : {}), isActive: !isFinished, isFinished }
}

// The demo's steps, each with how long it stays on screen.
const steps: [Summary | null, number][] = [
  [null, 1400],
  [step(2, 0, 0, 'Reading the layout code'), 1200],
  [step(2, 0, 1, 'Writing the failing test'), 1200],
  [step(1, 1, 1, 'Writing the failing test'), 1000],
  [step(1, 1, 2, 'Moving the elbow logic'), 1200],
  [step(0, 2, 3, 'Running the suite'), 1200],
  [step(0, 2, 4), 2200],
]
const chat = {
  user: 'Move the elbow logic into the layout module and cover it with tests.',
  reply: ['Two subagents are mapping the layout code while I write the failing test first.', 'The band below follows them, and the task list, as they go.'],
}

const dir = mkdtempSync(join(tmpdir(), 'colorwheel-gif-'))
const shots: string[] = []
steps.forEach(([s, _], i) => {
  const svg = window(frame(s, pills(weather, now)), chat)
  const [, w, h] = /width="(\d+)" height="(\d+)"/.exec(svg)!
  const page = join(dir, `f${i}.html`)
  writeFileSync(page, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:#fff}</style>${svg}`)
  const png = join(dir, `f${i}.png`)
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--blink-settings=preferredColorScheme=1', `--window-size=${w},${h}`, `--screenshot=${png}`, `file:///${page.replace(/\\/g, '/')}`], { stdio: 'ignore' })
  shots.push(png)
})

const python = [
  'import sys, json',
  'from PIL import Image',
  'files, durations, out = json.loads(sys.argv[1]), json.loads(sys.argv[2]), sys.argv[3]',
  'frames = [Image.open(f).convert("RGB").quantize(colors=255, method=Image.Quantize.MEDIANCUT) for f in files]',
  'frames[0].save(out, save_all=True, append_images=frames[1:], duration=durations, loop=0, optimize=True)',
].join('\n')
execFileSync('python', ['-c', python, JSON.stringify(shots), JSON.stringify(steps.map(([, ms]) => ms)), OUT], { stdio: 'inherit' })
console.log(`wrote ${OUT}`)
