import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { DiagramView, Progress, Todo } from '../types'
import type { Segment } from './blocks'
import { split } from './blocks'
import { DEMO } from './demo'
import type { Diagram } from './diagram'
import { PX_PER_COLUMN, crop, diagram, fit } from './diagram'
import { ALERTS, alertColor } from './palette'
import { EMPTY, agentQueued, agentStarted, agentStopped, drawBand, summarize, taskCompleted, taskCreated, todosWritten } from './progress'

const HINT = [
  'Replies are drawn by the ColorWheel mod in the Claude Code desktop app.',
  'Fenced ```mermaid blocks render as full-width themed diagrams: flowcharts, sequence, state, class and ER diagrams, and xychart-beta bar or line charts.',
  'GitHub alerts (> [!NOTE], > [!TIP], > [!IMPORTANT], > [!WARNING], > [!CAUTION]) render as cards.',
  'When a numeric series or a flow is easier to see than read, add one small diagram or chart with short labels; skip diagrams for simple answers.',
].join(' ')

const VIEW = 'colorwheel-view'
const view = atom({ plugin: 'colorwheel', key: 'view' } as const, null as DiagramView | null)
const progress = atom({ plugin: 'colorwheel', key: 'progress' } as const, EMPTY)
const SETTLE_MS = 6000
const DEMO_STEPS = ['Read the layout code', 'Write the failing test', 'Move the elbow logic', 'Run the suite']
const ZOOMS = [1, 1.5, 2, 3, 4, 6]
const PAN = 0.15

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

export const register: Register = (on, options) => {
  if (options.enabled === false) return

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({ name: 'colorwheel', description: 'Show what ColorWheel draws; progress plays a demo of the progress row', argumentHint: '[progress]' }).catch(() => undefined)
    return started
  })

  on('command.run', { command: 'colorwheel' }, async ($, e) => {
    if (e.args.trim() !== 'progress') return { text: DEMO }
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
    for (const [at, change] of steps) $.clock.after(at, () => void track($, change))
    return { text: 'Progress demo: watch the row above the prompt for about 20 seconds.' }
  })

  on('prompt.submit', async ($, e, next) => {
    if (summarize(await read($, progress)).isFinished) await update($, progress, () => EMPTY)
    if (options.diagramHints === false || (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge')) return next(e)
    return next({ ...e, context: [...(e.context ?? []), HINT] })
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
    const s = summarize(await read($, progress))
    if (!s.isActive && !s.isFinished) return next(e)
    const el = $.ui.resolve(e)
    const below = await next(e)
    return (
      <el.Box flexDirection="column" width="100%">
        {drawBand(el, s, e.surface, e.viewport?.columns ?? 100)}
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
