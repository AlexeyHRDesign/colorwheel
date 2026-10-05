export type AlertLevel = 'note' | 'tip' | 'important' | 'warning' | 'caution'

export type Segment =
  | { kind: 'markdown'; text: string }
  | { kind: 'code'; lang: string; source: string }
  | { kind: 'mermaid'; source: string }
  | { kind: 'alert'; level: AlertLevel; text: string }

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)[^`]*$/
const ALERT = /^ {0,3}>\s*\[!(note|tip|important|warning|caution)\]\s*$/i
const QUOTE = /^ {0,3}>\s?(.*)$/
const MAX_MARKDOWN = 9000

const chunk = (text: string): string[] => {
  if (text.length <= MAX_MARKDOWN) return [text]
  const out: string[] = []
  let current = ''
  for (const para of text.split(/\n{2,}/)) {
    const next = current ? `${current}\n\n${para}` : para
    if (next.length > MAX_MARKDOWN && current) {
      out.push(current)
      current = para
    } else current = next
  }
  if (current) out.push(current)
  return out.flatMap(part => (part.length <= MAX_MARKDOWN ? [part] : part.match(new RegExp(`[\\s\\S]{1,${MAX_MARKDOWN}}`, 'g')) ?? []))
}

export const split = (text: string): Segment[] => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const out: Segment[] = []
  let prose: string[] = []
  const flush = () => {
    const body = prose.join('\n').replace(/^\n+|\n+$/g, '')
    if (body.trim()) for (const part of chunk(body)) out.push({ kind: 'markdown', text: part })
    prose = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    const fence = FENCE.exec(line)
    if (fence) {
      const mark = fence[1]!
      const lang = (fence[2] ?? '').toLowerCase()
      const body: string[] = []
      let j = i + 1
      while (j < lines.length && !new RegExp(`^ {0,3}${mark[0] === '`' ? '`' : '~'}{${mark.length},}\\s*$`).test(lines[j]!)) body.push(lines[j++]!)
      flush()
      const source = body.join('\n')
      out.push(lang === 'mermaid' ? { kind: 'mermaid', source } : { kind: 'code', lang, source })
      i = j
      continue
    }
    const alert = ALERT.exec(line)
    if (alert) {
      const body: string[] = []
      let j = i + 1
      while (j < lines.length && QUOTE.test(lines[j]!)) body.push(QUOTE.exec(lines[j++]!)![1]!)
      flush()
      out.push({ kind: 'alert', level: alert[1]!.toLowerCase() as AlertLevel, text: body.join('\n').trim() })
      i = j - 1
      continue
    }
    prose.push(line)
  }
  flush()
  return out
}
