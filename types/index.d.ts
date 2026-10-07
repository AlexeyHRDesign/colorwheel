export type DiagramView = { source: string; zoom: number; x: number; y: number }

export type Todo = { content: string; status: 'pending' | 'in_progress' | 'completed'; activeForm?: string }
export type TrackedAgent = { id: string; type: string; label: string; isDone: boolean }
export type TrackedTask = { id: string; subject: string; isDone: boolean }
export type Progress = { agents: TrackedAgent[]; queued: { type: string; label: string }[]; tasks: TrackedTask[]; todos: Todo[] }

declare module 'claude-code' {
  interface PluginState {
    colorwheel: { view: DiagramView | null; progress: Progress }
  }
}
