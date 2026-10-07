import type { ElementTable, RenderElement } from 'claude-code'

import type { Progress, Todo } from '../types'
import { DARK, LIGHT, bridge } from './palette'

export const EMPTY: Progress = { agents: [], queued: [], tasks: [], todos: [] }

export const agentQueued = (p: Progress, type: string, label: string): Progress => ({ ...p, queued: [...p.queued, { type, label }] })

export const agentStarted = (p: Progress, id: string, type: string): Progress => {
  if (p.agents.some(a => a.id === id)) return p
  const at = p.queued.findIndex(q => q.type === type)
  const label = at === -1 ? type : p.queued[at]!.label
  return { ...p, queued: p.queued.filter((_, i) => i !== at), agents: [...p.agents, { id, type, label, isDone: false }] }
}

export const agentStopped = (p: Progress, id: string): Progress => ({ ...p, agents: p.agents.map(a => (a.id === id ? { ...a, isDone: true } : a)) })

export const taskCreated = (p: Progress, id: string, subject: string): Progress =>
  p.tasks.some(t => t.id === id) ? p : { ...p, tasks: [...p.tasks, { id, subject, isDone: false }] }

export const taskCompleted = (p: Progress, id: string): Progress => ({ ...p, tasks: p.tasks.map(t => (t.id === id ? { ...t, isDone: true } : t)) })

export const todosWritten = (p: Progress, todos: readonly Todo[]): Progress => ({ ...p, todos: todos.map(t => ({ content: t.content, status: t.status, ...(t.activeForm ? { activeForm: t.activeForm } : {}) })) })

export type Summary = {
  running: number
  agentsDone: number
  agentsTotal: number
  tasksDone: number
  tasksTotal: number
  current?: string
  isActive: boolean
  isFinished: boolean
}

export const summarize = (p: Progress): Summary => {
  const running = p.agents.filter(a => !a.isDone)
  const tasksTotal = p.todos.length + p.tasks.length
  const tasksDone = p.todos.filter(t => t.status === 'completed').length + p.tasks.filter(t => t.isDone).length
  const doing = p.todos.find(t => t.status === 'in_progress')
  const current = doing ? doing.activeForm ?? doing.content : p.tasks.find(t => !t.isDone)?.subject ?? running[0]?.label
  const isActive = running.length > 0 || tasksDone < tasksTotal
  return {
    running: running.length,
    agentsDone: p.agents.length - running.length,
    agentsTotal: p.agents.length,
    tasksDone,
    tasksTotal,
    ...(current ? { current } : {}),
    isActive,
    isFinished: !isActive && (p.agents.length > 0 || tasksTotal > 0),
  }
}

const ACCENT = bridge(LIGHT.wheel[0]!, DARK.wheel[0]!)
const DONE = bridge(LIGHT.wheel[1]!, DARK.wheel[1]!)
const TRACK = '#8a857e'
const BAR = 20

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

export const drawBand = (el: ElementTable, s: Summary, surface: string, columns: number): RenderElement => {
  const { Box, Text } = el
  const ratio = s.tasksTotal ? s.tasksDone / s.tasksTotal : s.agentsTotal ? s.agentsDone / s.agentsTotal : 0
  const tone = s.isFinished ? DONE : ACCENT
  const bar = surface === 'terminal'
    ? (
      <Text>
        <Text color={tone}>{'▰'.repeat(Math.round(ratio * BAR))}</Text>
        <Text dimColor>{'▱'.repeat(BAR - Math.round(ratio * BAR))}</Text>
      </Text>
    )
    : (
      <Box width="24%" flexShrink={0} backgroundColor={TRACK}>
        <Box width={`${Math.max(ratio > 0 ? 3 : 0, Math.round(ratio * 100))}%`} backgroundColor={tone}><Text> </Text></Box>
      </Box>
    )
  const parts: RenderElement[] = []
  if (s.agentsTotal) {
    parts.push(
      <Text key="agents">
        <Text bold>Agents </Text>
        <Text color={s.running ? ACCENT : undefined}>{s.running ? `${s.running} running` : 'none running'}</Text>
        <Text dimColor>{` · ${s.agentsDone} done`}</Text>
      </Text>,
    )
  }
  if (s.tasksTotal || s.agentsTotal) {
    parts.push(
      <Box key="bar" flexDirection="row" columnGap={1} alignItems="center" flexGrow={1}>
        <Text bold>{s.isFinished ? 'All done' : s.tasksTotal ? 'Tasks' : 'Progress'}</Text>
        {bar}
        <Text color={tone}>{s.tasksTotal ? `${s.tasksDone}/${s.tasksTotal}` : `${s.agentsDone}/${s.agentsTotal}`}</Text>
        {s.current && !s.isFinished ? <Text dimColor wrap="truncate-end">{`· ${clip(s.current, Math.max(20, columns - 60))}`}</Text> : null}
      </Box>,
    )
  }
  return (
    <Box flexDirection="row" columnGap={3} alignItems="center" width="100%">
      {parts}
    </Box>
  )
}
