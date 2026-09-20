/** Canvas needs a colour string, not a CSS variable. Reading a token back is
 *  not enough either: the build pipeline rewrites oklch() to lab(), and a
 *  browser may serialise a computed value in any modern colour syntax.
 *  So resolve every token through a 1x1 canvas, which the browser fills in
 *  sRGB whatever the input syntax — then all the numeric work below is safe. */

type Rgb = [number, number, number]

let probe: CanvasRenderingContext2D | null = null
// Keyed on the resolved CSS string, so a theme switch simply misses the cache.
const resolved = new Map<string, Rgb>()

function probeCtx(): CanvasRenderingContext2D | null {
  if (probe) return probe
  if (typeof document === 'undefined') return null
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  probe = canvas.getContext('2d', { willReadFrequently: true })
  return probe
}

/** Any CSS colour -> sRGB bytes. Returns null if the browser cannot parse it. */
export function toRgb(css: string): Rgb | null {
  if (!css) return null
  const cached = resolved.get(css)
  if (cached) return cached
  const ctx = probeCtx()
  if (!ctx) return null
  ctx.clearRect(0, 0, 1, 1)
  // A colour the browser rejects leaves fillStyle untouched, so set a sentinel
  // first and treat "unchanged" as a parse failure.
  ctx.fillStyle = '#000000'
  ctx.fillStyle = css
  if (ctx.fillStyle === '#000000' && !/^(#000000|black|rgb\(0,? ?0,? ?0\))$/i.test(css.trim())) {
    return null
  }
  ctx.fillRect(0, 0, 1, 1)
  const d = ctx.getImageData(0, 0, 1, 1).data
  const rgb: Rgb = [d[0], d[1], d[2]]
  resolved.set(css, rgb)
  return rgb
}

function raw(name: string): string {
  if (typeof window === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Read a custom property off <html> as an rgb() string canvas can paint. */
export function token(name: string, fallback = '#888888'): string {
  const rgb = toRgb(raw(name)) ?? toRgb(fallback)
  return rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : fallback
}

/** Same, at a given alpha — for glows and shadows on canvas. */
export function tokenAlpha(name: string, alpha: number, fallback = '#888888'): string {
  const rgb = toRgb(raw(name)) ?? toRgb(fallback)
  if (!rgb) return fallback
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

export interface DrumPalette {
  ball: string
  ballEdge: string
  ballInk: string
  glow: string
  glowSoft: string
  chamber: string
  grid: string
  rim: string
  shadow: string
  font: string
}

export function readDrumPalette(): DrumPalette {
  return {
    ball: token('--lp-ball', '#fafafa'),
    ballEdge: token('--lp-ball-edge', '#828984'),
    ballInk: token('--lp-ball-ink', '#171b19'),
    glow: tokenAlpha('--primary', 0.5),
    glowSoft: tokenAlpha('--primary', 0.14),
    // Neutral so a red or violet theme does not tint the whole chamber.
    chamber: tokenAlpha('--muted-foreground', 0.1),
    grid: tokenAlpha('--muted-foreground', 0.18),
    rim: tokenAlpha('--foreground', 0.32),
    shadow: tokenAlpha('--background', 0.55),
    // Type is not themed; the drum matches the rest of the app.
    font: '"Manrope", "Geist", sans-serif',
  }
}

/** Confetti draws from the theme's chart ramp plus its primary. */
export function readConfettiColors(): string[] {
  return [
    token('--primary', '#f5c518'),
    token('--chart-1', '#f5c518'),
    token('--chart-2', '#00e5ff'),
    token('--chart-3', '#a78bfa'),
    token('--chart-4', '#34d399'),
    token('--chart-5', '#ff8a00'),
    token('--foreground', '#ffffff'),
  ]
}

/** Pick black or white text for a background, by relative luminance.
 *  Chart ramps differ per theme, so player chips cannot hard-code their ink. */
export function readableInk(css: string): string {
  const rgb = toRgb(css)
  if (!rgb) return '#ffffff'
  const lin = (c: number) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  const luminance = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2])
  return luminance > 0.42 ? '#0b0b0d' : '#ffffff'
}

export interface Paint {
  background: string
  color: string
}

/** Resolved fill plus readable ink for one token, ready for an inline style. */
export function paintFor(tokenName: string): Paint {
  const background = token(tokenName, '#888888')
  return { background, color: readableInk(background) }
}
