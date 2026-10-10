import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { DiagramView, Limit, Progress, Todo } from '../types'
import type { Segment } from './blocks'
import { split } from './blocks'
import { DEMO } from './demo'
import type { Diagram } from './diagram'
import { PX_PER_COLUMN, crop, diagram, fit } from './diagram'
import { ALERTS, alertColor } from './palette'
import { frame } from './frame'
import { EMPTY, agentQueued, agentStarted, agentStopped, drawBand, summarize, taskCompleted, taskCreated, todosWritten } from './progress'
import { INVERT_GLYPH, INVERT_KEY, QUIET, addReading, drawWeather, pills } from './weather'

const HINT = [
  'Replies are drawn by the ColorWheel mod in the Claude Code desktop app.',
  'Fenced ```mermaid blocks render as full-width themed diagrams: flowcharts, sequence, state, class and ER diagrams, and xychart-beta bar or line charts.',
  'GitHub alerts (> [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION]) render as cards.',
  'When a numeric series or a flow is easier to see than read, add one small diagram or chart with short labels; skip diagrams for simple answers.',
].join(' ')

const VIEW = 'colorwheel-view'
const view = atom({ plugin: 'colorwheel', key: 'view' } as const, null as DiagramView | null)
const progress = atom({ plugin: 'colorwheel', key: 'progress' } as const, EMPTY)
const weather = atom({ plugin: 'colorwheel', key: 'weather' } as const, QUIET)
const inverted = atom({ plugin: 'colorwheel', key: 'inverted' } as const, false)
const SETTLE_MS = 6000
// One cell of the app's padding on each side is reclaimed by the band's negative margin.
const CELL_PX = 12
const BAND_MARGIN = 40 - 2 * CELL_PX
const LIMITS_KEY = 'limits'
const DEMO_STEPS = ['Read the layout code', 'Write the failing test', 'Move the elbow logic', 'Run the suite']
const ZOOMS = [1, 1.5, 2, 3, 4, 6]
const PAN = 0.15
// Room kept free in the frame for the invert button, left of the weather icon.
const SLOT_PX = 2 * PX_PER_COLUMN + 8

type Elements = ReturnType<EngineInterface['ui']['resolve']>

const openDiagram = async ($: EngineInterface, source: string) => {
  await update($, view, () => ({ source, zoom: 1, x: 0.5, y: 0.5 }))
  await $.ui.open({ id: VIEW, title: 'Diagram', focus: true, closeOnEscape: true })
}

const copy = ($: EngineInterface, text: string, surface: string) =>
  $.ui.copy({ text, surface: surface as 'desktop' })
    .then(r => $.ui.toast(r.isCopied ? 'Copied' : `Copy failed: ${r.reason}`))
    .catch(() => $.ui.toast('Copy failed'))

const drawDiagram = ($: EngineInterface, el: Elements, source: string, d: Diagram, columns: number, key: string): RenderElement => {
  const { Box, Button } = el
  const size = fit(d, columns)
  return (
    <Box key={key} flexDirection="column" width="100%" rowGap={1}>
      {'Svg' in el ? <el.Svg source={d.svg} alt="mermaid diagram" width={size.width} height={size.height} isInteractive /> : null}
      <Box flexDirection="row" columnGap={1}>
        <Button key={`${key}.open`} label="Open large" onPress={() => void openDiagram($, source)} />
        <Button key={`${key}.copy`} label="Copy source" onPress={press => void copy($, `\`\`\`mermaid\n${source}\n\`\`\``, press.surface)} />
      </Box>
    </Box>
  )
}

const drawSegment = ($: EngineInterface, el: Elements, segment: Segment, columns: number, key: string): RenderElement => {
  const { Box, Text, Markdown } = el
  switch (segment.kind) {
    case 'markdown':
      return <Markdown key={key} text={segment.text} />
    case 'code':
      return 'Code' in el
        ? <el.Code key={key} source={segment.source || ' '} {...(segment.lang ? { language: segment.lang } : {})} />
        : <Markdown key={key} text={`\`\`\`${segment.lang}\n${segment.source}\n\`\`\``} />
    case 'mermaid': {
      const d = diagram(segment.source)
      return d ? drawDiagram($, el, segment.source, d, columns, key) : <Markdown key={key} text={`\`\`\`mermaid\n${segment.source}\n\`\`\``} />
    }
    case 'alert': {
      const color = alertColor(segment.level)
      return (
        <Box key={key} flexDirection="column" width="100%" borderStyle="round" borderColor={color} paddingX={2}>
          <Text bold color={color}>{ALERTS[segment.level].title}</Text>
          {segment.text ? <Markdown text={segment.text} /> : null}
        </Box>
      )
    }
  }
}

const drawReply = ($: EngineInterface, el: Elements, text: string, columns: number): RenderElement => (
  <el.Box flexDirection="column" width="100%" rowGap={1}>
    {split(text).map((segment, i) => drawSegment($, el, segment, columns, `s${i}`))}
  </el.Box>
)

const track = async ($: EngineInterface, change: (p: Progress) => Progress) => {
  await update($, progress, change)
  if (!summarize(await read($, progress)).isFinished) return
  $.clock.after(SETTLE_MS, () => {
    void (async () => {
      if (summarize(await read($, progress)).isFinished) await update($, progress, () => EMPTY)
    })()
  })
}

const takeReading = async ($: EngineInterface) => {
  const { context, rateLimits } = await $.session.usage()
  if (!context?.window) return
  const tokens = context.tokens ?? 0
  const percent = Math.round(context.percent ?? (tokens / context.window) * 100)
  const limits = (rateLimits ?? []).map(l => ({ kind: l.kind, percentUsed: l.percentUsed, ...(l.resetsAt ? { resetsAt: l.resetsAt } : {}) }))
  // An empty list means no fresh figures, not that the limits went away: keep the last known.
  await update($, weather, w => ({ readings: addReading(w.readings, { tokens, window: context.window, percent }), limits: limits.length ? limits : w.limits }))
  if (limits.length) await $.store.set(LIMITS_KEY, limits)
}

const toggleInvert = async ($: EngineInterface) => {
  await update($, inverted, v => !v)
  await $.store.set(INVERT_KEY, await read($, inverted))
}

// The limits are the account's, not the session's: the last known ones show at once in a new session.
const restoreLimits = async ($: EngineInterface) => {
  const saved = await $.store.get(LIMITS_KEY)
  if (!Array.isArray(saved)) return
  const now = await $.clock.now()
  // A window that reset since it was saved starts over empty; it is not dropped, or its edge vanishes.
  const limits = (saved as Limit[])
    .filter(l => typeof l?.kind === 'string' && typeof l.percentUsed === 'number')
    .map(l => (l.resetsAt && Date.parse(l.resetsAt) <= now ? { kind: l.kind, percentUsed: 0 } : l))
  if (limits.length) await update($, weather, w => (w.limits.length ? w : { ...w, limits }))
}

export const register: Register = (on, options) => {
  if (options.enabled === false) return

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await restoreLimits($).catch(() => undefined)
    if ((await $.store.get(INVERT_KEY).catch(() => undefined)) === true) await update($, inverted, () => true)
    await takeReading($).catch(() => undefined)
    await $.command.register({ name: 'colorwheel', description: 'Show what ColorWheel draws; progress plays a demo of the progress row; invert switches limits between used and left', argumentHint: '[progress|invert]' }).catch(() => undefined)
    return started
  })

  on('command.run', { command: 'colorwheel' }, async ($, e) => {
    const arg = e.args.trim().split(/\s+/)[0]
    if (arg === 'invert') {
      await toggleInvert($)
      return { text: (await read($, inverted)) ? 'ColorWheel now shows what is left.' : 'ColorWheel now shows what is used.' }
    }
    if (arg !== 'progress') return { text: DEMO }
    const todo = (done: number, active: string): Todo[] =>
      DEMO_STEPS.map((content, i) => ({ content, status: i < done ? 'completed' : i === done ? 'in_progress' : 'pending', ...(i === done ? { activeForm: active } : {}) }))
    const steps: [number, (p: Progress) => Progress][] = [
      [0, p => agentStarted(agentStarted(agentQueued(agentQueued(todosWritten(EMPTY, todo(0, 'Reading the layout code')), 'Explore', 'Map the layout code'), 'Plan', 'Plan the refactor'), 'demo-a', 'Explore'), 'demo-b', 'Plan')],
      [3000, p => todosWritten(p, todo(1, 'Writing the failing test'))],
      [6000, p => agentStopped(p, 'demo-a')],
      [8000, p => todosWritten(p, todo(2, 'Moving the elbow logic'))],
      [11000, p => todosWritten(agentStopped(p, 'demo-b'), todo(3, 'Running the suite'))],
      [14000, p => todosWritten(p, todo(4, ''))],
    ]
    for (const [at, change] of steps) {
      $.clock.after(at, () => void track($, change).catch(err => $.ui.toast(`Progress demo failed: ${String(err)}`)))
    }
    return { text: 'Progress demo: watch the row above the prompt for about 20 seconds.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (summarize(await read($, progress)).isFinished) await update($, progress, () => EMPTY)
    if (options.diagramHints === false || (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge')) return next(e)
    return next({ ...e, context: [...(e.context ?? []), HINT] })
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (!e.agentId) await takeReading($).catch(() => undefined)
    return done
  })

  on('tool.call', async ($, e, next) => {
    const input = e as unknown as { tool: string; description?: string; subagent_type?: string; todos?: Todo[] }
    if ((input.tool === 'Agent' || input.tool === 'Task') && !e.agentId) {
      await track($, p => agentQueued(p, input.subagent_type ?? 'general-purpose', input.description ?? input.subagent_type ?? 'subagent'))
    }
    if (input.tool === 'TodoWrite' && Array.isArray(input.todos) && !e.agentId) await track($, p => todosWritten(p, input.todos!))
    return next(e)
  })

  on('classic.SubagentStart', async ($, e, next) => {
    await track($, p => agentStarted(p, e.agent_id, e.agent_type))
    return next(e)
  })

  on('classic.SubagentStop', async ($, e, next) => {
    await track($, p => agentStopped(p, e.agent_id))
    return next(e)
  })

  on('classic.TaskCreated', async ($, e, next) => {
    await track($, p => taskCreated(p, e.task_id, e.task_subject))
    return next(e)
  })

  on('classic.TaskCompleted', async ($, e, next) => {
    await track($, p => taskCompleted(p, e.task_id))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const s = summarize(await read($, progress))
    const left = await read($, inverted)
    const metrics = pills(await read($, weather), await $.clock.now(), left)
    const toggle = () => void toggleInvert($)
    const hasProgress = s.isActive || s.isFinished
    const el = $.ui.resolve(e)
    const desktop = e.surface !== 'terminal' && 'Svg' in el
    // The desktop frame always shows: limits and weather are worth a glance at any time.
    if (!desktop && !hasProgress && !metrics.length) return next(e)
    // With no hook beneath, next() rejects rather than resolving empty; the band must still draw.
    const below = await next(e).catch(() => null)
    const columns = e.props.bodyColumns ?? e.viewport?.columns ?? 100
    if (desktop) {
      const f = frame(hasProgress ? s : null, metrics, { left, slot: SLOT_PX })
      // The Svg needs a width in px: the frame's markup stretches to whatever it gets, so
      // a width a little under the transcript column is safe.
      const width = Math.max(320, Math.round((e.viewport?.columns ?? 100) * PX_PER_COLUMN) - BAND_MARGIN)
      // `below` may be the engine's own node, which the app refuses under a Box that sets width.
      return (
        <el.Box flexDirection="column">
          <el.Box key="cw-band" position="relative" marginLeft={-1} marginRight={-1} marginTop={-1} marginBottom={-1}>
            <el.Svg source={f.svg} alt={f.alt} width={width} height={f.height} isInteractive />
            {/* The Svg takes no presses, so the invert button lies over the gap the frame keeps for it. */}
            <el.Box position="absolute" top={0} left={Math.max(0, Math.round((width - f.slotRight - SLOT_PX) / PX_PER_COLUMN))}>
              <el.Button key={INVERT_KEY} label={INVERT_GLYPH} plain dimColor onPress={toggle} />
            </el.Box>
          </el.Box>
          {below ?? null}
        </el.Box>
      )
    }
    return (
      <el.Box flexDirection="column">
        <el.Box flexDirection="row" width="100%" columnGap={3}>
          <el.Box flexGrow={1} flexShrink={1}>{hasProgress ? drawBand(el, s, e.surface, columns) : null}</el.Box>
          {drawWeather(el, await read($, weather), await $.clock.now(), left, toggle)}
        </el.Box>
        {below ?? null}
      </el.Box>
    )
  })

  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    if (e.surface === 'terminal' || !e.props.text.trim()) return next(e)
    return drawReply($, $.ui.resolve(e), e.props.text, e.viewport?.columns ?? 96)
  })

  on('ui.render', { component: 'CommandOutput' }, ($, e, next) => {
    if (e.surface === 'terminal' || e.props.isErrored || !e.props.text.trim()) return next(e)
    return drawReply($, $.ui.resolve(e), e.props.text, e.viewport?.columns ?? 96)
  })

  on('ui.render', { component: 'Pane', requestId: VIEW }, async ($, e) => {
    const el = $.ui.resolve(e)
    const { Box, Text, Button } = el
    const current = await read($, view)
    const d = current ? diagram(current.source) : null
    if (!current || !d || !('Svg' in el)) return <Text dimColor>No diagram to show.</Text>
    const at = Math.max(0, ZOOMS.indexOf(current.zoom))
    const set = (change: Partial<DiagramView>) => void update($, view, v => (v ? { ...v, ...change } : v))
    const pan = (dx: number, dy: number) => {
      const step = PAN / current.zoom
      set({ x: Math.max(0, Math.min(1, current.x + dx * step)), y: Math.max(0, Math.min(1, current.y + dy * step)) })
    }
    const room = Math.max(320, Math.round((e.viewport?.columns ?? 100) * PX_PER_COLUMN) - 16)
    const height = Math.round(Math.min((room * d.height) / d.width, Math.max(240, (e.viewport?.rows ?? 40) * 18)))
    const width = Math.round(Math.min(room, (height * d.width) / d.height))
    const zoomed = current.zoom > 1
    return (
      <Box flexDirection="column" rowGap={1} width="100%">
        <Box flexDirection="row" columnGap={1} alignItems="center" flexWrap="wrap">
          <Button key="zoom-out" label="−" onPress={() => set({ zoom: ZOOMS[Math.max(0, at - 1)]! })} />
          <Text bold>{`${Math.round(current.zoom * 100)}%`}</Text>
          <Button key="zoom-in" label="+" onPress={() => set({ zoom: ZOOMS[Math.min(ZOOMS.length - 1, at + 1)]! })} />
          <Button key="zoom-fit" label="Fit" onPress={() => set({ zoom: 1, x: 0.5, y: 0.5 })} />
          {zoomed && <Button key="pan-left" label="←" onPress={() => pan(-1, 0)} />}
          {zoomed && <Button key="pan-up" label="↑" onPress={() => pan(0, -1)} />}
          {zoomed && <Button key="pan-down" label="↓" onPress={() => pan(0, 1)} />}
          {zoomed && <Button key="pan-right" label="→" onPress={() => pan(1, 0)} />}
          <Button key="close" label="Close" role="dismiss" onPress={() => void $.ui.close({ id: VIEW })} />
        </Box>
        <el.Svg source={crop(d, current)} alt="mermaid diagram" width={width} height={height} isInteractive />
      </Box>
    )
  })
}
