export type Scheme = {
  bg: string
  fg: string
  line: string
  muted: string
  surface: string
  border: string
  wheel: readonly string[]
}

export const LIGHT: Scheme = {
  bg: '#ffffff',
  fg: '#29261b',
  line: '#a8a29e',
  muted: '#6f6a64',
  surface: '#f1f5fe',
  border: '#9db8ef',
  wheel: ['#2563eb', '#0f8a7e', '#c2410c', '#7c3aed', '#be185d', '#4d7c0f'],
}

export const DARK: Scheme = {
  bg: '#262624',
  fg: '#ece9e3',
  line: '#77726b',
  muted: '#aaa59e',
  surface: '#28324a',
  border: '#5677c2',
  wheel: ['#7aa7ff', '#5fd0c4', '#f5a25d', '#b49cff', '#f38bb8', '#a5d16b'],
}

type Rgb = [number, number, number]

export const toRgb = (hex: string): Rgb | null => {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  return m ? [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)] : null
}

const toHex = (rgb: Rgb) => `#${rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`

const luminance = ([r, g, b]: Rgb) => {
  const lin = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export const contrast = (a: Rgb, b: Rgb): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number]
  return (x + 0.05) / (y + 0.05)
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]

export const bridge = (light: string, dark: string): string => {
  const a = toRgb(light)!
  const b = toRgb(dark)!
  const lightBg = toRgb(LIGHT.bg)!
  const darkBg = toRgb(DARK.bg)!
  let best = a
  let score = -1
  for (let i = 0; i <= 40; i++) {
    const c = mix(a, b, i / 40)
    const s = Math.min(contrast(c, lightBg), contrast(c, darkBg))
    if (s > score) {
      score = s
      best = c
    }
  }
  return toHex(best)
}

export const ALERTS = {
  note: { title: 'Note', hue: 0 },
  tip: { title: 'Tip', hue: 1 },
  important: { title: 'Important', hue: 3 },
  warning: { title: 'Warning', hue: 2 },
  caution: { title: 'Caution', hue: 4 },
} as const

export const alertColor = (level: keyof typeof ALERTS): string => bridge(LIGHT.wheel[ALERTS[level].hue]!, DARK.wheel[ALERTS[level].hue]!)
