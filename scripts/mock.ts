// A fragment of the Claude Code desktop app drawn around ColorWheel's band, for the README's pictures.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// A fragment of the desktop app around the band: the chat, the repository row, the band and the
// prompt. Class names are prefixed so the frame's own stylesheet, nested inside, never restyles them.
const W = 880
const SIDE = 40
const SANS = "ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif"
const MONO = "ui-monospace,'Cascadia Mono',Consolas,monospace"
const t = (x: number, y: number, size: number, cls: string, text: string, extra = '') =>
  `<text x="${x}" y="${y}" class="${cls}" style="font:${extra || 400} ${size}px ${SANS};dominant-baseline:alphabetic">${esc(text)}</text>`
const mono = (x: number, y: number, size: number, cls: string, text: string, anchor = 'start') =>
  `<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}" style="font:400 ${size}px ${MONO};dominant-baseline:alphabetic">${esc(text)}</text>`

const css =
  '.w-page{fill:#faf9f5}.w-edge{stroke:#e3e0d8}.w-fg{fill:#29261b}.w-muted{fill:#8a857e}.w-block{fill:#efeeea}' +
  '.w-bubble{fill:#f0eee6}.w-input{fill:#ffffff;stroke:#d8d4cb}.w-add{fill:#15803d}.w-del{fill:#be123c}' +
  '.w-btn{fill:#f7f6f2;stroke:#dcd8cf}.w-line{stroke:#8a857e}.w-spin{stroke:#2563eb}' +
  '@media (prefers-color-scheme:dark){.w-page{fill:#262624}.w-edge{stroke:#3a3936}.w-fg{fill:#ece9e3}.w-muted{fill:#9c978f}' +
  '.w-block{fill:#30302e}.w-bubble{fill:#30302e}.w-input{fill:#30302e;stroke:#45433f}.w-add{fill:#4ade80}.w-del{fill:#fb7185}' +
  '.w-btn{fill:#383835;stroke:#4a4844}.w-line{stroke:#9c978f}.w-spin{stroke:#7aa7ff}}'

// `user` is null before the message is sent; `lines` keeps room for a reply still streaming in;
// `draft` is text being typed into the prompt; `spin` is the activity ring's angle, or null at rest.
export type Chat = { user: string | null; reply: string[]; lines?: number; draft?: string; spin?: number | null }

export const window = (band: { svg: string; height: number }, chat: Chat) => {
  const cw = W - 2 * SIDE
  const parts: string[] = []
  let y = 0

  // Title bar.
  parts.push(`<rect class="w-page" width="${W}" height="${44}"/>`, `<line class="w-edge" x1="0" y1="44" x2="${W}" y2="44"/>`)
  parts.push(t(20, 27, 14, 'w-fg', 'ColorWheel', '600'), t(112, 27, 13, 'w-muted', 'colorwheel'))
  const cx = W - 96
  parts.push(
    `<g class="w-line" stroke-width="1.4" fill="none"><path d="M${cx} 22h10"/><rect x="${cx + 34}" y="17" width="10" height="10"/><path d="M${cx + 68} 17l10 10M${cx + 78} 17l-10 10"/></g>`,
  )
  y = 44 + 24

  // The person's message, right-aligned in a bubble.
  if (chat.user !== null) {
    const uw = Math.min(cw * 0.75, chat.user.length * 7.4 + 32)
    parts.push(`<rect class="w-bubble" x="${W - SIDE - uw}" y="${y}" width="${uw.toFixed(0)}" height="40" rx="14"/>`)
    parts.push(t(W - SIDE - uw + 16, y + 25, 14, 'w-fg', chat.user))
  }
  y += 40 + 26

  // The reply.
  for (let i = 0; i < Math.max(chat.lines ?? 0, chat.reply.length); i++) {
    if (chat.reply[i]) parts.push(t(SIDE, y + 14, 14, 'w-fg', chat.reply[i]!))
    y += 24
  }
  y += 24

  // The repository row the app draws above the band.
  parts.push(`<rect class="w-block" x="${SIDE}" y="${y}" width="${cw}" height="44" rx="12"/>`)
  parts.push(mono(SIDE + 18, y + 27, 14, 'w-muted', 'colorwheel  main'))
  parts.push(`<rect class="w-btn" x="${W - SIDE - 128}" y="${y + 8}" width="118" height="28" rx="7"/>`, t(W - SIDE - 116, y + 27, 13, 'w-fg', 'Commit changes'))
  parts.push(`<rect class="w-btn" x="${W - SIDE - 206}" y="${y + 8}" width="70" height="28" rx="7"/>`)
  parts.push(mono(W - SIDE - 196, y + 27, 13, 'w-add', '+42'), mono(W - SIDE - 160, y + 27, 13, 'w-del', '−7'))
  y += 44 + 8

  // The band: the app's block, ColorWheel's frame inside it.
  const bh = band.height + 16
  parts.push(`<rect class="w-block" x="${SIDE}" y="${y}" width="${cw}" height="${bh}" rx="12"/>`)
  parts.push(band.svg.replace('width="100%"', `x="${SIDE + 8}" y="${y + 8}" width="${cw - 16}"`))
  y += bh + 8

  // The prompt.
  parts.push(`<rect class="w-input" x="${SIDE}" y="${y}" width="${cw}" height="52" rx="14" stroke-width="1"/>`)
  if (chat.draft) {
    parts.push(t(SIDE + 18, y + 31, 15, 'w-fg', chat.draft))
    const caret = SIDE + 18 + chat.draft.length * 7.35 + 2
    parts.push(`<line class="w-line" x1="${caret.toFixed(1)}" y1="${y + 17}" x2="${caret.toFixed(1)}" y2="${y + 35}" stroke-width="1.4"/>`)
  } else {
    parts.push(t(SIDE + 18, y + 31, 15, 'w-muted', 'Type / for commands'))
  }
  parts.push(`<path class="w-line" d="M${W - SIDE - 22} ${y + 20}v8h-10m3 -3l-3 3 3 3" fill="none" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>`)
  y += 52 + 10

  // The row under the prompt: attach, voice, mode on the left; model, effort, activity on the right.
  const row = y + 16
  parts.push(`<path class="w-line" d="M${SIDE + 10} ${row - 6}v12M${SIDE + 4} ${row}h12" stroke-width="1.6" stroke-linecap="round"/>`)
  parts.push(
    `<g class="w-line" fill="none" stroke-width="1.4" stroke-linecap="round"><rect x="${SIDE + 33}" y="${row - 8}" width="6" height="10" rx="3"/><path d="M${SIDE + 30} ${row - 1}a6 6 0 0 0 12 0M${SIDE + 36} ${row + 5}v3"/><path d="M${SIDE + 50} ${row - 2}l3.5 3.5 3.5-3.5"/></g>`,
  )
  parts.push(t(SIDE + 70, row + 5, 14, 'w-fg', 'Auto'))
  parts.push(t(W - SIDE - 168, row + 5, 14, 'w-fg', 'Opus 5.5'), t(W - SIDE - 92, row + 5, 14, 'w-fg', 'Medium'))
  const spin = chat.spin === undefined ? 0 : chat.spin
  if (spin === null) parts.push(`<circle class="w-line" cx="${W - SIDE - 15}" cy="${row}" r="7" fill="none" stroke-width="2" opacity="0.35"/>`)
  else parts.push(`<path class="w-spin" transform="rotate(${spin.toFixed(1)} ${W - SIDE - 15} ${row})" d="M${W - SIDE - 8} ${row - 7}a7 7 0 1 1 -7 7" fill="none" stroke-width="2" stroke-linecap="round"/>`)
  y = row + 22

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${y}" viewBox="0 0 ${W} ${y}"><style>${css}</style>` +
    `<clipPath id="w-clip"><rect width="${W}" height="${y}" rx="12"/></clipPath>` +
    `<g clip-path="url(#w-clip)"><rect class="w-page" width="${W}" height="${y}"/>${parts.join('')}</g>` +
    `<rect class="w-edge" x="0.5" y="0.5" width="${W - 1}" height="${y - 1}" rx="12" fill="none"/></svg>`
  )
}

