import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { addReading, forecastFor, short, trend } from '../hooks/weather'

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
  mock.clock(on)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>below</Text>
  })
  on('turn.complete', () => ({ text: '' }))
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

test('the 5-hour limit takes the top edge and the 7-day the bottom, wiped by what is used', async ($, on) => {
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
