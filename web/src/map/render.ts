import type { MapData } from '../api/types'

/** Stufen des vorgerenderten Bilds (Pixel pro Kartenzelle); über der größten wird live gezeichnet */
export const BITMAP_LEVELS = [1, 2, 4] as const
export const BITMAP_SCALE = BITMAP_LEVELS[BITMAP_LEVELS.length - 1]

// Punktdurchmesser relativ zur Zelle (wie die bisherige Vacuula-Karte) …
const DOT = { floor: 0.45, wall: 0.75, run: 0.5 }
// … aber nie kleiner als diese Pixel, sonst verblassen Wände beim Rauszoomen (Deckung sinkt).
// Wände dürfen dabei über ihre Zelle hinausragen (rausgezoomt werden sie so etwas dicker statt dunkler).
const MIN_PX = { floor: 0, wall: 2.5, run: 0 }
const RUN_ALPHA = 0.8

export interface Grid {
    width: number
    height: number
    floor: Uint8Array // 0 unbekannt, 1 frei, 2 Wand
    run?: Uint8Array // 1 = befahren
    bounds: { x: number; y: number; w: number; h: number }
}

export interface Colors { bg: string; floor: string; floorFlat: string; wall: string; path: string; dock: string }

// Anteil der Zelle, den ein Bodenpunkt bedeckt (Kreis mit 45 % Durchmesser ≈ 16 %), etwas aufgerundet für Sichtbarkeit
const FLOOR_COVERAGE = 0.25

function mix(a: string, b: string, t: number): string {
    const p = (h: string) => { const v = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16)) }
    const [x, y] = [p(a), p(b)]
    if (x.some(Number.isNaN) || y.some(Number.isNaN)) return a
    return `rgb(${x.map((c, i) => Math.round(c * t + y[i] * (1 - t))).join(' ')})`
}

export function mapColors(): Colors {
    const s = getComputedStyle(document.documentElement)
    const v = (n: string) => s.getPropertyValue(n).trim()
    const bg = v('--map-bg'), floor = v('--map-floor')
    return { bg, floor, floorFlat: mix(floor, bg, FLOOR_COVERAGE), wall: v('--map-wall'), path: v('--map-path'), dock: v('--ok') }
}

function decode(data: MapData, map: (v: number) => number): Uint8Array {
    const out = new Uint8Array(data.width * data.height)
    let i = 0
    for (const [value, count] of data.rle) {
        const end = Math.min(i + count, out.length)
        const m = map(value)
        if (m) out.fill(m, i, end)
        i = end
    }
    return out
}

/** RLE-Karten (Floor + optional Run mit gleichem Raster) in Zellen umsetzen */
export function toGrid(floor: MapData, run?: MapData): Grid {
    const w = floor.width, h = floor.height
    const f = decode(floor, (v) => (v === 1 ? 1 : v === 2 ? 2 : 0))
    const r = run && run.width === w && run.height === h
        ? decode(run, (v) => (v === 128 || v === 100 || v === 200 ? 0 : 1))
        : undefined

    // belegter Bereich, damit „Einpassen“ die leeren Ränder weglässt
    let minX = w, minY = h, maxX = -1, maxY = -1
    for (let y = 0; y < h; y++) {
        const row = y * w
        for (let x = 0; x < w; x++) {
            if (f[row + x] || r?.[row + x]) {
                if (x < minX) minX = x
                if (x > maxX) maxX = x
                if (y < minY) minY = y
                maxY = y
            }
        }
    }
    const pad = 4
    const bounds = maxX < 0
        ? { x: 0, y: 0, w, h }
        : {
            x: Math.max(0, minX - pad), y: Math.max(0, minY - pad),
            w: Math.min(w, maxX + pad + 1) - Math.max(0, minX - pad),
            h: Math.min(h, maxY + pad + 1) - Math.max(0, minY - pad),
        }
    return { width: w, height: h, floor: f, run: r, bounds }
}

/**
 * Punkte der Zellen x0..x1, y0..y1 zeichnen. `scale` = Pixel pro Zelle, (ox, oy) = Ursprung.
 * Je Farbe ein Pfad und ein fill(), damit auch große Karten schnell gehen.
 */
export function drawDots(g: CanvasRenderingContext2D, grid: Grid, c: Colors, scale: number, ox: number, oy: number,
    x0 = 0, y0 = 0, x1 = grid.width, y1 = grid.height) {
    const floor = new Path2D(), wall = new Path2D(), run = new Path2D()
    // Boden und Spur behalten ihre relative Größe (gleiche Helligkeit in jeder Stufe), Wände bekommen eine Mindestgröße
    const size = (k: keyof typeof DOT) => Math.max(DOT[k] * scale, MIN_PX[k])
    const df = size('floor'), dw = size('wall'), dr = size('run')
    // sehr klein: Quadrate statt Kreise (Kreise unter ~2 px werden nur unscharf)
    const square = scale <= 2
    const add = (p: Path2D, cx: number, cy: number, d: number) => {
        if (square) p.rect(cx - d / 2, cy - d / 2, d, d)
        else { p.moveTo(cx + d / 2, cy); p.arc(cx, cy, d / 2, 0, Math.PI * 2) }
    }
    const w = grid.width
    for (let y = y0; y < y1; y++) {
        const cy = oy + (y + 0.5) * scale
        const row = y * w
        for (let x = x0; x < x1; x++) {
            const i = row + x
            const v = grid.floor[i]
            const cx = ox + (x + 0.5) * scale
            // klein: Boden flächig in Mischfarbe (wirkt so hell wie die Punkte beim Reinzoomen)
            if (v === 1) add(floor, cx, cy, square ? scale : df)
            else if (v === 2) add(wall, cx, cy, dw)
            if (grid.run?.[i]) add(run, cx, cy, dr)
        }
    }
    g.fillStyle = square ? c.floorFlat : c.floor
    g.fill(floor)
    g.fillStyle = c.wall
    g.fill(wall)
    if (grid.run) {
        g.globalAlpha = RUN_ALPHA
        g.fillStyle = c.path
        g.fill(run)
        g.globalAlpha = 1
    }
}

/** Ganze Karte einmal in `level` Pixel pro Zelle vorrendern (für Übersicht und Rauszoomen) */
export function renderBitmap(grid: Grid, c: Colors, level: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = grid.width * level
    canvas.height = grid.height * level
    drawDots(canvas.getContext('2d')!, grid, c, level, 0, 0)
    return canvas
}

/** Stufe, die höchstens 2× verkleinert werden muss (starkes Verkleinern mischt Punkte mit dem Hintergrund) */
export function pickLevel(devicePxPerCell: number): number {
    return BITMAP_LEVELS.find((l) => l >= devicePxPerCell) ?? BITMAP_SCALE
}
