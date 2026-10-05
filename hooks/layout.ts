import type { MermaidGraph, MermaidSubgraph, Point, PositionedEdge, PositionedGraph, PositionedGroup, PositionedNode } from './vendor/mermaid.js'
import { FONT_SIZES, FONT_WEIGHTS, NODE_PADDING, measureMultilineText } from './vendor/mermaid.js'

const RANK_GAP = 56
const NODE_GAP = 28
const MARGIN = 24
const GROUP_PAD = 16
const GROUP_HEADER = 26
const SWEEPS = 6
const ELBOW = 18
const WHEEL = 6

type Box = { id: string; w: number; h: number; virtual: boolean; rank: number; order: number; x: number; y: number }

const sizeOf = (label: string, shape: string): { w: number; h: number } => {
  const text = measureMultilineText(label || ' ', FONT_SIZES.nodeLabel, FONT_WEIGHTS.nodeLabel)
  let w = text.width + NODE_PADDING.horizontal * 2
  let h = text.height + NODE_PADDING.vertical * 2
  if (shape === 'diamond') {
    w += NODE_PADDING.diamondExtra * 2
    h += NODE_PADDING.diamondExtra
  }
  if (shape === 'circle' || shape === 'doublecircle') w = h = Math.max(w, h)
  return { w: Math.max(w, 48), h: Math.max(h, 36) }
}

const rankNodes = (ids: string[], edges: { source: string; target: string }[]): Map<string, number> => {
  const out = new Map<string, string[]>(ids.map(id => [id, []]))
  const state = new Map<string, 0 | 1 | 2>()
  const forward: { source: string; target: string }[] = []
  const visit = (id: string) => {
    state.set(id, 1)
    for (const e of edges.filter(e => e.source === id)) {
      if (e.source === e.target) continue
      if (state.get(e.target) === 1) continue
      forward.push(e)
      if (!state.get(e.target)) visit(e.target)
    }
    state.set(id, 2)
  }
  for (const id of ids) if (!state.get(id)) visit(id)
  for (const e of forward) out.get(e.source)?.push(e.target)
  const rank = new Map<string, number>(ids.map(id => [id, 0]))
  const indegree = new Map<string, number>(ids.map(id => [id, 0]))
  for (const e of forward) indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1)
  const queue = ids.filter(id => indegree.get(id) === 0)
  while (queue.length) {
    const id = queue.shift()!
    for (const next of out.get(id) ?? []) {
      rank.set(next, Math.max(rank.get(next)!, rank.get(id)! + 1))
      indegree.set(next, indegree.get(next)! - 1)
      if (indegree.get(next) === 0) queue.push(next)
    }
  }
  return rank
}

export const layoutFlowchart = (graph: MermaidGraph): PositionedGraph => {
  const horizontal = graph.direction === 'LR' || graph.direction === 'RL'
  const reversed = graph.direction === 'BT' || graph.direction === 'RL'
  const ids = [...graph.nodes.keys()]
  const rank = rankNodes(ids, graph.edges)
  const boxes = new Map<string, Box>()
  for (const id of ids) {
    const node = graph.nodes.get(id)!
    const { w, h } = sizeOf(node.label, node.shape)
    boxes.set(id, { id, w, h, virtual: false, rank: rank.get(id)!, order: 0, x: 0, y: 0 })
  }

  const chains = new Map<number, string[]>()
  const links: [string, string][] = []
  graph.edges.forEach((e, i) => {
    const a = boxes.get(e.source)
    const b = boxes.get(e.target)
    if (!a || !b) return
    const [lo, hi] = a.rank <= b.rank ? [a, b] : [b, a]
    const chain = [lo.id]
    for (let r = lo.rank + 1; r < hi.rank; r++) {
      const id = `__v${i}_${r}`
      boxes.set(id, { id, w: 8, h: 8, virtual: true, rank: r, order: 0, x: 0, y: 0 })
      chain.push(id)
    }
    chain.push(hi.id)
    for (let k = 1; k < chain.length; k++) links.push([chain[k - 1]!, chain[k]!])
    chains.set(i, a.rank <= b.rank ? chain : [...chain].reverse())
  })

  const maxRank = Math.max(0, ...[...boxes.values()].map(b => b.rank))
  const layers: Box[][] = Array.from({ length: maxRank + 1 }, () => [])
  for (const b of boxes.values()) layers[b.rank]!.push(b)
  layers.forEach(layer => layer.forEach((b, i) => (b.order = i)))
  const neighbours = (id: string, up: boolean) =>
    links.flatMap(([s, t]) => {
      const S = boxes.get(s)!
      const T = boxes.get(t)!
      if (up) return T.id === id && S.rank < T.rank ? [S] : S.id === id && T.rank < S.rank ? [T] : []
      return S.id === id && T.rank > S.rank ? [T] : T.id === id && S.rank > T.rank ? [S] : []
    })
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    const down = sweep % 2 === 0
    const order = down ? layers.slice(1) : layers.slice(0, -1).reverse()
    for (const layer of order) {
      const bary = new Map(layer.map(b => {
        const n = neighbours(b.id, down)
        return [b.id, n.length ? n.reduce((s, x) => s + x.order, 0) / n.length : b.order]
      }))
      layer.sort((a, b) => bary.get(a.id)! - bary.get(b.id)! || a.order - b.order)
      layer.forEach((b, i) => (b.order = i))
    }
  }

  const main = (b: Box) => (horizontal ? b.w : b.h)
  const cross = (b: Box) => (horizontal ? b.h : b.w)
  const rankSize = layers.map(layer => Math.max(0, ...layer.map(main)))
  const rankStart: number[] = []
  const labelRoom = layers.map((_, r) =>
    Math.max(0, ...graph.edges.filter(e => e.label && Math.min(boxes.get(e.source)?.rank ?? -1, boxes.get(e.target)?.rank ?? -1) === r).map(e => {
      const m = measureMultilineText(e.label!, FONT_SIZES.edgeLabel, FONT_WEIGHTS.edgeLabel)
      return (horizontal ? m.width : m.height) + ELBOW + 36
    })))
  let at = 0
  for (let r = 0; r <= maxRank; r++) {
    rankStart.push(at)
    at += rankSize[r]! + Math.max(RANK_GAP, labelRoom[r]!)
  }
  const extent = (layer: Box[]) => layer.reduce((s, b) => s + cross(b), 0) + NODE_GAP * Math.max(0, layer.length - 1)
  const span = Math.max(...layers.map(extent))
  for (const layer of layers) {
    let c = (span - extent(layer)) / 2
    for (const b of layer) {
      const m = rankStart[b.rank]! + (rankSize[b.rank]! - main(b)) / 2
      if (horizontal) {
        b.x = m
        b.y = c
      } else {
        b.x = c
        b.y = m
      }
      c += cross(b) + NODE_GAP
    }
  }
  if (reversed) {
    const total = at - RANK_GAP
    for (const b of boxes.values()) {
      if (horizontal) b.x = total - b.x - b.w
      else b.y = total - b.y - b.h
    }
  }

  const center = (b: Box): Point => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 })
  const port = (b: Box, toward: Point): Point => {
    const c = center(b)
    if (b.virtual) return c
    if (horizontal) return { x: toward.x >= c.x ? b.x + b.w : b.x, y: c.y }
    return { x: c.x, y: toward.y >= c.y ? b.y + b.h : b.y }
  }
  const edges: PositionedEdge[] = graph.edges.flatMap((e, i) => {
    const chain = chains.get(i)
    if (!chain) return []
    const src = boxes.get(e.source)!
    const dst = boxes.get(e.target)!
    if (src === dst) {
      const c = center(src)
      const r = horizontal ? { x: src.x + src.w / 2, y: src.y } : { x: src.x + src.w, y: c.y }
      const loop = horizontal
        ? [r, { x: r.x, y: r.y - 22 }, { x: r.x + src.w / 2 + 14, y: r.y - 22 }, { x: r.x + src.w / 2 + 14, y: c.y }, { x: src.x + src.w, y: c.y }]
        : [r, { x: r.x + 22, y: r.y }, { x: r.x + 22, y: src.y - 14 }, { x: c.x, y: src.y - 14 }, { x: c.x, y: src.y }]
      return [{ ...e, points: loop }]
    }
    const stops = chain.map(id => boxes.get(id)!)
    const points: Point[] = []
    for (let k = 0; k < stops.length - 1; k++) {
      const a = stops[k]!
      const b = stops[k + 1]!
      const p = port(a, center(b))
      const q = port(b, center(a))
      if (k === 0) points.push(p)
      const elbow = (from: number, to: number) => from + Math.sign(to - from) * Math.min(ELBOW, Math.abs(to - from) / 2)
      if (horizontal) {
        const mx = elbow(p.x, q.x)
        if (Math.abs(p.y - q.y) > 0.5) points.push({ x: mx, y: p.y }, { x: mx, y: q.y })
      } else {
        const my = elbow(p.y, q.y)
        if (Math.abs(p.x - q.x) > 0.5) points.push({ x: p.x, y: my }, { x: q.x, y: my })
      }
      points.push(q)
    }
    const a = points[points.length - 2] ?? points[0]!
    const b = points[points.length - 1]!
    return [{ ...e, points, labelPosition: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }]
  })

  const real = [...boxes.values()].filter(b => !b.virtual)
  const groupOf = (sg: MermaidSubgraph): PositionedGroup | null => {
    const children = sg.children.map(groupOf).filter((g): g is PositionedGroup => g !== null)
    const members = real.filter(b => sg.nodeIds.includes(b.id))
    const rects = [...members.map(b => ({ x: b.x, y: b.y, w: b.w, h: b.h })), ...children.map(g => ({ x: g.x, y: g.y, w: g.width, h: g.height }))]
    if (!rects.length) return null
    const x = Math.min(...rects.map(r => r.x)) - GROUP_PAD
    const y = Math.min(...rects.map(r => r.y)) - GROUP_PAD - GROUP_HEADER
    const right = Math.max(...rects.map(r => r.x + r.w)) + GROUP_PAD
    const bottom = Math.max(...rects.map(r => r.y + r.h)) + GROUP_PAD
    return { id: sg.id, label: sg.label, x, y, width: right - x, height: bottom - y, children }
  }
  const groups = graph.subgraphs.map(groupOf).filter((g): g is PositionedGroup => g !== null)

  const xs: number[] = []
  const ys: number[] = []
  const take = (x: number, y: number) => {
    xs.push(x)
    ys.push(y)
  }
  for (const b of real) take(b.x, b.y), take(b.x + b.w, b.y + b.h)
  for (const e of edges) for (const p of e.points) take(p.x, p.y)
  const walk = (g: PositionedGroup) => {
    take(g.x, g.y)
    take(g.x + g.width, g.y + g.height)
    g.children.forEach(walk)
  }
  groups.forEach(walk)
  const dx = MARGIN - Math.min(...xs)
  const dy = MARGIN - Math.min(...ys)
  const move = (p: Point): Point => ({ x: p.x + dx, y: p.y + dy })
  const shiftGroup = (g: PositionedGroup): PositionedGroup => ({ ...g, x: g.x + dx, y: g.y + dy, children: g.children.map(shiftGroup) })

  const nodes: PositionedNode[] = real.map(b => {
    const node = graph.nodes.get(b.id)!
    const hue = `var(--cw-s${b.rank % WHEEL})`
    return {
      id: b.id, label: node.label, shape: node.shape, x: b.x + dx, y: b.y + dy, width: b.w, height: b.h,
      inlineStyle: { stroke: hue, fill: `color-mix(in srgb, ${hue} 13%, var(--cw-bg))` },
    }
  })
  return {
    width: Math.ceil(Math.max(...xs) + dx + MARGIN),
    height: Math.ceil(Math.max(...ys) + dy + MARGIN),
    nodes,
    edges: edges.map(e => ({ ...e, points: e.points.map(move), ...(e.labelPosition ? { labelPosition: move(e.labelPosition) } : {}) })),
    groups: groups.map(shiftGroup),
  }
}
