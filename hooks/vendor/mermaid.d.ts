export type Direction = 'TD' | 'TB' | 'LR' | 'BT' | 'RL'
export type NodeShape = string
export type MermaidNode = { id: string; label: string; shape: NodeShape }
export type MermaidEdge = { source: string; target: string; label?: string; style: 'solid' | 'dotted' | 'thick'; hasArrowStart: boolean; hasArrowEnd: boolean }
export type MermaidSubgraph = { id: string; label: string; nodeIds: string[]; children: MermaidSubgraph[]; direction?: Direction }
export type MermaidGraph = { direction: Direction; nodes: Map<string, MermaidNode>; edges: MermaidEdge[]; subgraphs: MermaidSubgraph[] }
export type Point = { x: number; y: number }
export type PositionedNode = { id: string; label: string; shape: NodeShape; x: number; y: number; width: number; height: number; inlineStyle?: Record<string, string> }
export type PositionedEdge = { source: string; target: string; label?: string; style: MermaidEdge['style']; hasArrowStart: boolean; hasArrowEnd: boolean; points: Point[]; labelPosition?: Point }
export type PositionedGroup = { id: string; label: string; x: number; y: number; width: number; height: number; children: PositionedGroup[] }
export type PositionedGraph = { width: number; height: number; nodes: PositionedNode[]; edges: PositionedEdge[]; groups: PositionedGroup[] }
export type Colors = { bg: string; fg: string; line?: string; accent?: string; muted?: string; surface?: string; border?: string }
export type Sized = { readonly width: number; readonly height: number }

export function parseMermaid(text: string): MermaidGraph
export function renderSvg(graph: PositionedGraph, colors: Colors, font?: string, transparent?: boolean): string
export function measureMultilineText(text: string, fontSize: number, fontWeight: number): { width: number; height: number }
export const FONT_SIZES: { nodeLabel: number; edgeLabel: number; groupHeader: number }
export const FONT_WEIGHTS: { nodeLabel: number; edgeLabel: number; groupHeader: number }
export const NODE_PADDING: { horizontal: number; vertical: number; diamondExtra: number }
export function parseSequenceDiagram(lines: string[]): unknown
export function layoutSequenceDiagram(diagram: unknown, options?: Record<string, unknown>): Sized
export function renderSequenceSvg(diagram: Sized, colors: Colors, font?: string, transparent?: boolean): string
export function parseXYChart(lines: string[]): unknown
export function layoutXYChart(chart: unknown, options?: Record<string, unknown>): Sized
export function renderXYChartSvg(chart: Sized, colors: Colors, font?: string, transparent?: boolean, interactive?: boolean): string
export function renderMermaidAscii(text: string, options?: { useAscii?: boolean; paddingX?: number; paddingY?: number; colorMode?: 'none' }): string
