import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { split } from '../hooks/blocks'
import { crop, diagram, fit } from '../hooks/diagram'
import { ALERTS, DARK, LIGHT, alertColor, contrast, toRgb } from '../hooks/palette'

const NL = String.fromCharCode(10)
const FENCE = '```'
const lines = (...l: string[]) => l.join(NL)

const draw = (text: string, surface: 'terminal' | 'desktop' = 'desktop') => ({
  plugin: 'colorwheel',
  component: 'AssistantMessage' as const,
  props: { text, isFirstOfReply: true },
  viewport: { columns: 96, rows: 40 },
  surface,
})

const engine = (on: On) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

const FLOW = lines(`${FENCE}mermaid`, 'flowchart LR', '  A[One] --> B[Two]', FENCE)
const CHART = lines(`${FENCE}mermaid`, 'xychart-beta', '  x-axis [a, b, c]', '  bar [3, 5, 2]', '  line [1, 2, 3]', FENCE)

test('splits prose, code, mermaid and alerts in order', async () => {
  const segments = split(lines('Intro **bold**', '', `${FENCE}ts`, 'const a = 1', FENCE, '', '> [!WARNING]', '> careful', '> twice', '', 'outro', FLOW))
  expect(segments.map(s => s.kind)).toEqual(['markdown', 'code', 'alert', 'markdown', 'mermaid'])
  expect(segments[1]).toEqual({ kind: 'code', lang: 'ts', source: 'const a = 1' })
  expect(segments[2]).toEqual({ kind: 'alert', level: 'warning', text: lines('careful', 'twice') })
})

test('a longer fence keeps shorter fences inside, an unclosed fence takes the rest', async () => {
  const segments = split(lines('````md', FENCE, 'inner', FENCE, '````', '', `${FENCE}py`, 'x = 1'))
  expect(segments.map(s => s.kind)).toEqual(['code', 'code'])
  expect(segments[0]).toMatchObject({ lang: 'md', source: lines(FENCE, 'inner', FENCE) })
  expect(segments[1]).toMatchObject({ lang: 'py', source: 'x = 1' })
})

test('very long prose is cut into markdown blocks the element accepts', async () => {
  const para = 'word '.repeat(400)
  const segments = split(Array.from({ length: 12 }, () => para).join(NL + NL))
  expect(segments.length).toBeGreaterThan(1)
  expect(segments.every(s => s.kind === 'markdown' && s.text.length <= 9000)).toBe(true)
})

test('the terminal keeps Claude Code\'s own renderer', async ($, on) => {
  engine(on)
  const ui = await $.ui.mount(draw('| a | b |' + NL + '|---|---|' + NL + '| 1 | 2 |', 'terminal'))
  expect((await ui.find({ type: 'Text', text: /^engine$/ }))?.text).toBe('engine')
  await ui.unmount()
})

test('desktop prose and tables go to the app\'s markdown, code to the code view', async $ => {
  const table = lines('| a | b |', '|---|---|', '| 1 | 2 |')
  const ui = await $.ui.mount(draw(lines('Hello `x`', '', table, '', `${FENCE}ts`, 'const a = 1', FENCE)))
  const md = await ui.findAll({ type: 'Markdown' })
  expect(md.map(m => m.props.text)).toEqual([lines('Hello `x`', '', table)])
  expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({ source: 'const a = 1', language: 'ts' })
  await ui.unmount()
})

test('alerts are rounded cards whose title color reads on both themes', async $ => {
  const ui = await $.ui.mount(draw(lines('> [!CAUTION]', '> mind the gap')))
  const card = (await ui.findAll({ type: 'Box' })).find(b => b.props.borderStyle === 'round')
  expect(card).toBeDefined()
  expect((await ui.find({ type: 'Text', text: /^Caution$/ }))?.props.color).toBe(alertColor('caution'))
  expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe('mind the gap')
  await ui.unmount()
})

test('every alert color keeps at least 3.5:1 on the light and the dark chat', async () => {
  for (const level of Object.keys(ALERTS) as (keyof typeof ALERTS)[]) {
    const rgb = toRgb(alertColor(level))!
    expect(contrast(rgb, toRgb(LIGHT.bg)!)).toBeGreaterThan(3.5)
    expect(contrast(rgb, toRgb(DARK.bg)!)).toBeGreaterThan(3.5)
  }
})

test('wheel colors read on their own background', async () => {
  for (const scheme of [LIGHT, DARK]) for (const c of scheme.wheel) expect(contrast(toRgb(c)!, toRgb(scheme.bg)!)).toBeGreaterThan(3)
})

test('mermaid renders themed SVG with a dark palette and no font downloads', async () => {
  for (const source of [FLOW, CHART].map(s => s.split(NL).slice(1, -1).join(NL))) {
    const d = diagram(source)
    expect(d).not.toBeNull()
    expect(d!.svg).toContain('prefers-color-scheme: dark')
    expect(d!.svg).not.toContain('googleapis')
    expect(d!.width).toBeGreaterThan(0)
  }
  expect(diagram(lines('xychart-beta', '  x-axis [a]', '  bar [1]'))!.svg).toContain('var(--cw-s0)')
})

test('diagrams fill the chat width up to twice their size and never grow too tall', async () => {
  const d = { svg: '<svg/>', width: 400, height: 100 }
  expect(fit(d, 96)).toEqual({ width: 787, height: 197 })
  expect(fit({ ...d, width: 200 }, 96).width).toBe(400)
  expect(fit({ svg: '', width: 300, height: 900 }, 96).height).toBe(640)
})

test('desktop diagrams draw as sized interactive SVG with open and copy buttons', async $ => {
  const ui = await $.ui.mount(draw(lines('Look:', '', CHART)))
  const svg = await ui.find({ type: 'Svg' })
  expect(svg?.props.isInteractive).toBe(true)
  expect(Number(svg?.props.width)).toBeGreaterThan(300)
  expect(await ui.find({ type: 'Button', text: /^Open large$/ })).toBeDefined()
  expect(await ui.find({ type: 'Button', text: /^Copy source$/ })).toBeDefined()
  await ui.unmount()
})

test('a diagram that does not parse falls back to its source', async $ => {
  const ui = await $.ui.mount(draw(lines(`${FENCE}mermaid`, 'pie title nope', '  "a" : 1', FENCE)))
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(String((await ui.find({ type: 'Markdown' }))?.props.text)).toContain('pie title nope')
  await ui.unmount()
})

test('open large shows a pane that zooms and pans by cropping the view box', async ($, on) => {
  const opened: string[] = []
  on('ui.open', (_$, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  const ui = await $.ui.mount(draw(CHART))
  await ui.press({ key: 's0.open' })
  expect(opened).toEqual(['colorwheel-view'])
  const pane = await $.ui.mount({ plugin: 'colorwheel', component: 'Pane', requestId: 'colorwheel-view', props: {}, surface: 'desktop', viewport: { columns: 100, rows: 40 } } as never)
  const box = async () => /viewBox="([^"]+)"/.exec(String((await pane.find({ type: 'Svg' }))?.props.source))![1]!.split(' ').map(Number)
  const full = await box()
  await pane.press({ key: 'zoom-in' })
  await pane.press({ key: 'zoom-in' })
  const zoomed = await box()
  expect(Math.round(zoomed[2]! * 2)).toBe(Math.round(full[2]!))
  await pane.press({ key: 'pan-right' })
  expect((await box())[0]!).toBeGreaterThan(zoomed[0]!)
  await pane.unmount()
  await ui.unmount()
})

test('crop keeps the view inside the diagram', async () => {
  const d = { svg: '<svg viewBox="0 0 100 50" width="100" height="50"></svg>', width: 100, height: 50 }
  expect(crop(d, { zoom: 2, x: 1, y: 1 })).toContain('viewBox="50.0 25.0 50.0 25.0"')
  expect(crop(d, { zoom: 2, x: 0, y: 0 })).toContain('viewBox="0.0 0.0 50.0 25.0"')
})
