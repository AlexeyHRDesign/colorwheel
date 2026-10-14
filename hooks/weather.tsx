import type { ElementTable, RenderElement } from 'claude-code'

import type { Reading, Weather } from '../types'

export const HISTORY = 12
export const QUIET: Weather = { readings: [], limits: [] }

type Forecast = { upTo: number; word: string; glyph: string; icon: string; tone: number }

const CLOUD = 'M4.6 11h5.9a2.4 2.4 0 0 0 .3-4.8 3.4 3.4 0 0 0-6.5-.8A2.5 2.5 0 0 0 4.6 11z'
const CLOUD_UP = 'M4.6 9h5.9a2.4 2.4 0 0 0 .3-4.8 3.4 3.4 0 0 0-6.5-.8A2.5 2.5 0 0 0 4.6 9z'
const RAYS = Array.from({ length: 8 }, (_, i) => {
  const a = (i * Math.PI) / 4
  const p = (r: number) => `${(7 + r * Math.cos(a)).toFixed(2)} ${(7 + r * Math.sin(a)).toFixed(2)}`
  return `M${p(4.4)}L${p(6.1)}`
}).join('')

const FORECAST: readonly Forecast[] = [
  { upTo: 25, word: 'Clear', glyph: '☀', tone: 1, icon: `<circle cx="7" cy="7" r="2.5"/><path d="${RAYS}"/>` },
  { upTo: 50, word: 'Cloudy', glyph: '☁', tone: 0, icon: `<path d="${CLOUD}"/>` },
  { upTo: 75, word: 'Showers', glyph: '☂', tone: 3, icon: `<path d="${CLOUD_UP}"/><path d="M5.2 11l-.6 1.6M8 11l-.6 1.6M10.8 11l-.6 1.6"/>` },
  { upTo: 90, word: 'Storm', glyph: '☇', tone: 2, icon: `<path d="${CLOUD_UP}"/><path d="M7.8 9.4 6.6 11.5h1.8l-1.2 2.1"/>` },
  { upTo: Infinity, word: 'Compact soon', glyph: '↯', tone: 4, icon: `<path d="M8.2 1.5 4 8h3.3l-1.1 4.5L10.4 6H7z"/>` },
]

export const forecastFor = (percent: number): Forecast => FORECAST.find(f => percent < f.upTo) ?? FORECAST[FORECAST.length - 1]!

export const addReading = (readings: readonly Reading[], r: Reading): Reading[] =>
  [...readings.filter(x => x.tokens > 0), r].slice(-HISTORY)

export const short = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}k`
  return String(n)
}

export const trend = (readings: readonly Reading[]): string => {
  if (readings.length < 2) return ''
  const delta = readings.at(-1)!.tokens - readings.at(-2)!.tokens
  if (delta > 0) return `▲ ${short(delta)} last turn`
  if (delta < 0) return `▼ ${short(-delta)} last turn`
  return 'steady last turn'
}

const BARS = '▁▂▃▄▅▆▇█'

const chart = (readings: readonly Reading[]) => {
  const top = Math.max(...readings.map(r => r.tokens), 1)
  return readings.map(r => BARS[Math.min(BARS.length - 1, Math.floor((r.tokens / top) * (BARS.length - 1)))]).join('')
}

const HOUR = 3_600_000
const WINDOWS: Record<string, { tag: string; name: string; ms?: number }> = {
  five_hour: { tag: '5h', name: '5-hour limit', ms: 5 * HOUR },
  seven_day: { tag: '7d', name: '7-day limit', ms: 7 * 24 * HOUR },
  spend_limit: { tag: '$', name: 'Spend limit' },
}

const limitTone = (percent: number) => (percent < 50 ? 1 : percent < 80 ? 2 : 4)

export const resetsIn = (resetsAt: string | undefined, now: number): string => {
  const at = resetsAt ? Date.parse(resetsAt) : NaN
  if (Number.isNaN(at)) return ''
  const minutes = Math.max(0, Math.round((at - now) / 60_000))
  const d = Math.floor(minutes / 1440)
  const h = Math.floor((minutes % 1440) / 60)
  const m = minutes % 60
  return `resets in ${d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`}`
}

// The share of a limit's window already gone: spending at this share is spending at pace.
export const elapsed = (resetsAt: string | undefined, ms: number | undefined, now: number): number | undefined => {
  const at = resetsAt ? Date.parse(resetsAt) : NaN
  if (!ms || Number.isNaN(at)) return undefined
  return Math.round(Math.max(0, Math.min(100, 100 - ((at - now) / ms) * 100)))
}

const paceLine = (gone: number, used: number) => {
  const d = used - gone
  return `${gone}% of the window gone, ${d === 0 ? 'on pace' : `${Math.abs(d)} points ${d > 0 ? 'over' : 'under'} pace`}`
}

// What the pace dot means, in its own tooltip: where even spending would be by now, and how far off it you are.
const paceTip = (name: string, gone: number, used: number) => {
  const d = used - gone
  return [
    `Pace mark · ${name}`,
    `Spending evenly, you would be here: ${gone}% of the window has passed.`,
    d === 0
      ? `You have used ${used}%, right on pace.`
      : d > 0
        ? `You have used ${used}%, ${d} points ahead of pace: at this rate the limit runs out early.`
        : `You have used ${used}%, ${-d} points behind pace: there is room to spare.`,
  ]
}

// `percent` is what the band shows: the share used, or with `left` the share left.
// `used` is always the share used, for tones; `pace` sits on the same scale as `percent`.
export type Pill = { tag: string; percent: number; used: number; pace?: number; paceTip?: string[]; tone: number; icon?: string; glyph?: string; tip: string[] }

export const pills = (w: Weather, now: number, left = false): Pill[] => {
  const shown = (used: number) => (left ? Math.max(0, 100 - used) : used)
  const out: Pill[] = []
  const r = w.readings.at(-1)
  if (r) {
    const f = forecastFor(r.percent)
    out.push({
      tag: '',
      percent: shown(r.percent),
      used: r.percent,
      tone: f.tone,
      icon: f.icon,
      glyph: f.glyph,
      tip: [
        `${f.word} · ${r.percent}% of context`,
        `${short(r.tokens)} of ${short(r.window)} tokens`,
        ...(w.readings.length > 1 ? [`Last ${w.readings.length} turns  ${chart(w.readings)}`] : []),
        ...(trend(w.readings) ? [trend(w.readings)] : []),
      ],
    })
  }
  for (const l of w.limits) {
    const known = WINDOWS[l.kind] ?? { tag: l.kind, name: l.kind }
    const percent = Math.round(l.percentUsed)
    const reset = resetsIn(l.resetsAt, now)
    const gone = elapsed(l.resetsAt, known.ms, now)
    out.push({
      tag: known.tag,
      percent: shown(percent),
      used: percent,
      ...(gone === undefined ? {} : { pace: shown(gone), paceTip: paceTip(known.name, gone, percent) }),
      tone: limitTone(percent),
      tip: [`${known.name} · ${percent}% used, ${Math.max(0, 100 - percent)}% left`, ...(gone === undefined ? [] : [paceLine(gone, percent)]), ...(reset ? [reset] : [])],
    })
  }
  return out
}

const TERMINAL_TONES = ['blue', 'cyan', 'yellow', 'magenta', 'red', 'green']

export const INVERT_KEY = 'invert'
export const INVERT_GLYPH = '⇆'

export const drawWeather = (el: ElementTable, w: Weather, now: number, left: boolean, toggle: () => void): RenderElement | null => {
  const list = pills(w, now, left)
  if (!list.length) return null
  const { Box, Text, Button } = el
  return (
    <Box key="weather" flexShrink={0} columnGap={2} flexDirection="row">
      <Button key={INVERT_KEY} label={INVERT_GLYPH} plain dimColor onPress={toggle} />
      {list.map((p, i) => (
        <Text key={`w${i}`}>
          <Text color={TERMINAL_TONES[p.tone]}>{p.glyph ?? p.tag}</Text>
          <Text>{` ${p.percent}%`}</Text>
        </Text>
      ))}
    </Box>
  )
}
