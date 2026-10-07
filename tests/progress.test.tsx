import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { EMPTY, agentQueued, agentStarted, agentStopped, summarize, taskCompleted, taskCreated, todosWritten } from '../hooks/progress'

test('subagents count as running until they stop, with the label their Agent call gave', async () => {
  let p = agentQueued(EMPTY, 'Explore', 'Find the layout code')
  p = agentStarted(p, 'a1', 'Explore')
  p = agentStarted(p, 'a2', 'general-purpose')
  expect(summarize(p)).toMatchObject({ running: 2, agentsDone: 0, agentsTotal: 2, current: 'Find the layout code', isActive: true })
  p = agentStopped(p, 'a1')
  expect(summarize(p)).toMatchObject({ running: 1, agentsDone: 1, current: 'general-purpose' })
  p = agentStopped(p, 'a2')
  expect(summarize(p)).toMatchObject({ running: 0, agentsDone: 2, isActive: false, isFinished: true })
})

test('a todo list gives done over total and the item in progress', async () => {
  const p = todosWritten(EMPTY, [
    { content: 'Parse', status: 'completed' },
    { content: 'Layout', status: 'in_progress', activeForm: 'Laying out' },
    { content: 'Draw', status: 'pending' },
  ])
  expect(summarize(p)).toMatchObject({ tasksDone: 1, tasksTotal: 3, current: 'Laying out', isActive: true })
})

test('team tasks add to the same count', async () => {
  let p = taskCreated(EMPTY, 't1', 'Write tests')
  p = taskCreated(p, 't2', 'Ship')
  p = taskCompleted(p, 't1')
  expect(summarize(p)).toMatchObject({ tasksDone: 1, tasksTotal: 2, current: 'Ship', isActive: true })
  expect(summarize(taskCompleted(p, 't2'))).toMatchObject({ tasksDone: 2, isActive: false, isFinished: true })
})

test('nothing tracked is neither active nor finished', async () => {
  expect(summarize(EMPTY)).toMatchObject({ isActive: false, isFinished: false })
})

const stand = (on: On) =>
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>weather</Text>
  })

const band = (surface: 'terminal' | 'desktop') => ({ plugin: 'colorwheel', component: 'AbovePrompt' as const, props: {}, viewport: { columns: 100, rows: 40 }, surface })

test('the band stays out of the way while nothing runs', async ($, on) => {
  stand(on)
  const ui = await $.ui.mount(band('desktop') as never)
  expect((await ui.find({ type: 'Text', text: /^weather$/ }))?.text).toBe('weather')
  expect(await ui.find({ type: 'Text', text: /Agents|Tasks/ })).toBeUndefined()
  await ui.unmount()
})

test('a running subagent and a todo list draw a progress row above the band below', async ($, on) => {
  stand(on)
  on('classic.SubagentStart', () => ({}))
  on('tool.call', () => ({ text: 'ok' }) as never)
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'One', status: 'completed', activeForm: 'Doing one' }, { content: 'Two', status: 'in_progress', activeForm: 'Doing two' }] } as never).catch(() => undefined)
  await $.classic.SubagentStart({ agent_id: 'x', agent_type: 'Explore' } as never).catch(() => undefined)
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount(band(surface) as never)
    expect(await ui.find({ type: 'Text', text: /1 running/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /1\/2/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Doing two/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^weather$/ }))?.text).toBe('weather')
    await ui.unmount()
  }
})
