// Colour helpers for zones / no-go lines.
//
// Boundary colours are stored as "#rrggbb". Everything that draws or tints a
// boundary colour goes through here so an invalid string (3-digit hex, missing
// '#', a CSS name, or the old un-padded random hex) can never reach the canvas:
// an invalid fillStyle is silently ignored by CanvasRenderingContext2D, which
// is how zone interiors used to end up opaque in the previous colour.

/** Curated presets: high saturation, 55-65% lightness, readable on the dark
 *  floor (#2f353b / #3c434b) and still distinct from each other at 20% alpha. */
export const BOUNDARY_PRESETS: readonly string[] = [
    '#ff7a45', // orange
    '#f5b942', // amber
    '#b4e04a', // lime
    '#3ddc97', // mint
    '#38d0e0', // cyan
    '#5aa9ff', // blue
    '#a78bfa', // violet
    '#e879f9', // magenta
    '#fb7185', // rose
    '#f97373', // coral
]

/** Accepts "#rgb", "#rrggbb", with or without '#', any case. Returns "#rrggbb" or null. */
export function normalizeHex(input: string | undefined | null): string | null {
    if (!input) return null
    let s = input.trim().replace(/^#/, '').toLowerCase()
    if (/^[0-9a-f]{3}$/.test(s)) s = s.split('').map(c => c + c).join('')
    if (!/^[0-9a-f]{6}$/.test(s)) return null
    return '#' + s
}

/** "#rrggbb" + alpha -> "rgba(r, g, b, a)". Falls back to `fallback` for invalid input. */
export function withAlpha(color: string | undefined | null, alpha: number, fallback = 'rgba(255, 90, 31, 0.2)'): string {
    const hex = normalizeHex(color)
    if (!hex) return fallback
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Next preset not yet used by the given colours; wraps around when all are taken. */
export function pickUnusedPreset(usedColors: (string | undefined)[]): string {
    const used = new Set(usedColors.map(normalizeHex).filter(Boolean))
    return BOUNDARY_PRESETS.find(p => !used.has(p)) ?? BOUNDARY_PRESETS[usedColors.length % BOUNDARY_PRESETS.length]
}
