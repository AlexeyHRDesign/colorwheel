export type DiagramView = { source: string; zoom: number; x: number; y: number }

declare module 'claude-code' {
  interface PluginState {
    colorwheel: { view: DiagramView | null }
  }
}
