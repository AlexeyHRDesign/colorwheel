import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { frame } from '../hooks/frame'
import { addReading, forecastFor, pills, short, trend } from '../hooks/weather'

const usage = (tokens: number, window = 1_000_000) => ({ startedAt: 0, context: { tokens, window, percent: Math.round((tokens / window) * 100) }, rateLimits: [] })

test('the forecast steps from Clear to Compact soon as the window fills', async () => {
  expect(forecastFor(9).word).toBe('Clear')
  expect(forecastFor(30).word).toBe('Cloudy')
  expect(forecastFor(60).word).toBe('Showers')
  expect(forecastFor(80).word).toBe('Storm')
  expect(forecastFor(95).word).toBe('Compact soon')
})

test('readings keep the last twelve and drop the empty start reading', async () => {
  let r = addReading([], { tokens: 0, window: 100, percent: 0 })
  r = addReading(r, { tokens: 10, window: 100, percent: 10 })
  expect(r.map(x => x.tokens)).toEqual([10])
  for (let i = 0; i < 20; i++) r = addReading(r, { tokens: 20 + i, window: 100, percent: 20 })
  expect(r).toHaveLength(12)
  expect(r.at(-1)!.tokens).toBe(39)
})

test('trend and short read like the old band', async () => {
  expect(trend([{ tokens: 1000, window: 1, percent: 0 }, { tokens: 5100, window: 1, percent: 0 }])).toBe('▲ 4.1k last turn')
  expect(trend([{ tokens: 1000, window: 1, percent: 0 }])).toBe('')
  expect(short(92_900)).toBe('92.9k')
  expect(short(1_000_000)).toBe('1M')
})

const band = (surface: 'terminal' | 'desktop') => ({ plugin: 'colorwheel', component: 'AbovePrompt' as const, props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 100 }, viewport: { columns: 100, rows: 40 }, surface })

const TURN = { answer: 'ok', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' }

const stub = (on: On) => {
  const clock = mock.clock(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>below</Text>
  })
  on('turn.complete', () => ({ text: '' }))
  return clock
}

type Mounts = { ui: { mount: (e: never) => Promise<{ findAll: (q: { type: string }) => Promise<{ text?: string }[]>; unmount: () => Promise<void> }> } }

const texts = async ($: Mounts, surface: 'terminal' | 'desktop' = 'desktop') => {
  const ui = await $.ui.mount(band(surface) as never)
  const all = [...(await ui.findAll({ type: 'Text' })).map(t => t.text), ...(await ui.findAll({ type: 'Svg' })).map(x => JSON.stringify(x))].join('|')
  await ui.unmount()
  return all
}

test('after a turn the band shows the icon and percent, with the details in the tooltip', async ($, on) => {
  stub(on)
  on('session.usage', () => ({ value: usage(92_900) }) as never)
  await $.turn.complete(TURN as never).catch(() => undefined)
  const desktop = await texts($, 'desktop')
  expect(desktop).toContain('9%')
  expect(desktop).toContain('Clear')
  expect(desktop).toContain('92.9k of 1M tokens')
  expect(await texts($, 'terminal')).toContain('9%')
})

test('the 5-hour limit takes the top edge and the 7-day the bottom, each as long as the share used', async ($, on) => {
  stub(on)
  on('session.usage', () => ({ value: { ...usage(92_900), rateLimits: [{ kind: 'five_hour', percentUsed: 34 }, { kind: 'seven_day', percentUsed: 12.5 }] } }) as never)
  await $.turn.complete(TURN as never).catch(() => undefined)
  const desktop = await texts($, 'desktop')
  expect(desktop).toContain('5-hour limit · 34% used, 66% left')
  expect(desktop).toContain('7-day limit · 13% used')
  expect(desktop).toMatch(/mask id=\\"e7d\\"/)
  const terminal = await texts($, 'terminal')
  expect(terminal).toContain('5h')
  expect(terminal).toContain(' 34%')
})

test('a subagent turn takes no reading', async ($, on) => {
  stub(on)
  on('session.usage', () => ({ value: usage(92_900) }) as never)
  await $.turn.complete({ ...TURN, agentId: 'sub' } as never).catch(() => undefined)
  expect(await texts($)).not.toContain('9%')
})

test('the desktop frame shows before any reading, and the terminal stays out of the way', async ($, on) => {
  stub(on)
  expect(await texts($, 'desktop')).toContain('Svg')
  expect(await texts($, 'terminal')).toBe('below')
})

test('the band draws with nothing beneath it', async ($, on) => {
  mock.clock(on)
  on('ui.render', () => {
    throw new Error('nothing beneath answers ui.render')
  })
  const ui = await $.ui.mount(band('desktop') as never)
  expect((await ui.findAll({ type: 'Svg' })).length).toBe(1)
  await ui.unmount()
})

test('a saved limit whose window has reset comes back empty, not missing', async ($, on) => {
  stub(on)
  on('session.start', () => ({ cwd: '.' }))
  mock.store(on, { limits: [{ kind: 'five_hour', percentUsed: 80, resetsAt: '1960-01-01T00:00:00Z' }, { kind: 'seven_day', percentUsed: 40, resetsAt: '2999-01-01T00:00:00Z' }] })
  on('session.usage', () => ({ value: usage(0) }) as never)
  await $.session.start({ cwd: '.' } as never).catch(() => undefined)
  const desktop = await texts($, 'desktop')
  expect(desktop).toContain('5h 0%')
  expect(desktop).toContain('7d 40%')
})

const HOUR = 3_600_000
const DAY = 24 * HOUR

test('each limit edge carries a pace tick at the share of its window already gone', async ($, on) => {
  const clock = stub(on)
  const at = (ms: number) => new Date(clock.now() + ms).toISOString()
  on('session.usage', () => ({ value: { ...usage(92_900), rateLimits: [{ kind: 'five_hour', percentUsed: 34, resetsAt: at(4 * HOUR) }, { kind: 'seven_day', percentUsed: 64, resetsAt: at(3.5 * DAY) }] } }) as never)
  await $.turn.complete(TURN as never).catch(() => undefined)
  const desktop = await texts($, 'desktop')
  expect(desktop).toContain('20% of the window gone, 14 points over pace')
  expect(desktop).toContain('50% of the window gone, 14 points over pace')
  expect(desktop).toMatch(/class=\\"pace-dot t0\\"/)
})

test('pills read the share left when inverted, and pace counts down with it', async () => {
  const now = Date.parse('2026-10-10T00:00:00Z')
  const w = { readings: [{ tokens: 300, window: 1000, percent: 30 }], limits: [{ kind: 'seven_day', percentUsed: 64, resetsAt: new Date(now + 3.5 * DAY).toISOString() }] }
  const [context, week] = pills(w, now, true)
  expect(context).toMatchObject({ percent: 70, used: 30 })
  expect(week).toMatchObject({ percent: 36, used: 64, pace: 50 })
  expect(pills(w, now)[1]).toMatchObject({ percent: 64, pace: 50 })
})

test('the invert button flips the band to the share left and the choice is kept', async ($, on) => {
  stub(on)
  mock.store(on, {})
  on('session.usage', () => ({ value: { ...usage(92_900), rateLimits: [{ kind: 'five_hour', percentUsed: 34 }] } }) as never)
  await $.turn.complete(TURN as never).catch(() => undefined)
  const ui = await $.ui.mount(band('desktop') as never)
  await ui.press({ key: 'invert' })
  await ui.unmount()
  const desktop = await texts($, 'desktop')
  expect(desktop).toContain('5h 66% left')
  expect(desktop).toContain('91%')
  expect(await texts($, 'terminal')).toContain(' 66%')
})

test('an inverted band stays inverted in the next session', async ($, on) => {
  stub(on)
  on('session.start', () => ({ cwd: '.' }))
  mock.store(on, { invert: true, limits: [{ kind: 'seven_day', percentUsed: 40, resetsAt: '2999-01-01T00:00:00Z' }] })
  on('session.usage', () => ({ value: usage(0) }) as never)
  await $.session.start({ cwd: '.' } as never).catch(() => undefined)
  expect(await texts($, 'desktop')).toContain('7d 60% left')
})

test('limit edges shimmer while Claude works, and stay still at rest', async () => {
  const list = pills({ readings: [], limits: [{ kind: 'five_hour', percentUsed: 40 }, { kind: 'seven_day', percentUsed: 20 }] }, 0)
  const busy = frame(null, list, { working: true }).svg
  expect(busy).toContain('class="ring shine"')
  expect(busy).toContain('<animateTransform')
  expect(busy).toContain('prefers-reduced-motion')
  expect(frame(null, list).svg).not.toContain('<animateTransform')
})
