import { build } from 'esbuild'
import { readFileSync, statSync } from 'node:fs'

const bundled = new Set()
const result = await build({
  metafile: true,
  stdin: {
    contents: [
      "export { parseMermaid } from './node_modules/beautiful-mermaid/src/parser.ts'",
      "export { renderSvg } from './node_modules/beautiful-mermaid/src/renderer.ts'",
      "export { measureMultilineText } from './node_modules/beautiful-mermaid/src/text-metrics.ts'",
      "export { FONT_SIZES, FONT_WEIGHTS, NODE_PADDING } from './node_modules/beautiful-mermaid/src/styles.ts'",
      "export { parseSequenceDiagram } from './node_modules/beautiful-mermaid/src/sequence/parser.ts'",
      "export { layoutSequenceDiagram } from './node_modules/beautiful-mermaid/src/sequence/layout.ts'",
      "export { renderSequenceSvg } from './node_modules/beautiful-mermaid/src/sequence/renderer.ts'",
      "export { parseXYChart } from './node_modules/beautiful-mermaid/src/xychart/parser.ts'",
      "export { layoutXYChart } from './node_modules/beautiful-mermaid/src/xychart/layout.ts'",
      "export { renderXYChartSvg } from './node_modules/beautiful-mermaid/src/xychart/renderer.ts'",
      "export { renderMermaidAscii } from './node_modules/beautiful-mermaid/src/ascii/index.ts'",
    ].join('\n'),
    resolveDir: '.',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  target: 'es2023',
  minify: true,
  outfile: '../hooks/vendor/mermaid.js',
  legalComments: 'none',
})
for (const input of Object.keys(result.metafile.inputs)) {
  const match = /node_modules\/((?:@[^/]+\/)?[^/]+)/.exec(input)
  if (match) bundled.add(match[1])
}
for (const name of bundled) {
  const { license } = JSON.parse(readFileSync(`node_modules/${name}/package.json`, 'utf8'))
  console.log(`bundled ${name}: ${license}`)
}
const size = statSync('../hooks/vendor/mermaid.js').size
if (size > 1_000_000) throw new Error(`vendor bundle is ${size} bytes, over the engine's 1 MiB module limit`)
console.log(`vendor bundle ${size} bytes`)
