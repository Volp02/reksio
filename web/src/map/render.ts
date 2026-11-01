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

export interface Colors { bg: string; floor: string; floorFlat: string; wall: string; path: string; onPath: string; dock: string }

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
    return { bg, floor, floorFlat: mix(floor, bg, FLOOR_COVERAGE), wall: v('--map-wall'), path: v('--map-path'), onPath: v('--on-accent'), dock: v('--ok') }
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

/** CSS-Farbe → [r, g, b, a] (0–255) */
const rgbaCache = new Map<string, Uint8ClampedArray>()
function rgba(color: string): Uint8ClampedArray {
    let v = rgbaCache.get(color)
    if (!v) {
        const g = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!
        g.fillStyle = color
        g.fillRect(0, 0, 1, 1)
        v = g.getImageData(0, 0, 1, 1).data
        rgbaCache.set(color, v)
    }
    return v
}

/** Deckung eines Punkts (Kreis oder Quadrat mit Durchmesser d) um (fx, fy) in einem Pixelfenster ab (x, y) */
interface Mask { x: number; y: number; w: number; h: number; a: Float32Array }
const SUB = 8 // Punktmitte auf 1/8 Pixel gerundet: gleiche Masken für viele Punkte
const SS = 4 // Kreise: 4×4 Stichproben pro Pixel
const masks = new Map<string, Mask>()
function mask(square: boolean, d: number, fx: number, fy: number): Mask {
    const key = `${square ? 's' : 'c'}${d}:${fx}:${fy}`
    let m = masks.get(key)
    if (m) return m
    const r = d / 2
    const x = Math.floor(fx - r), y = Math.floor(fy - r)
    const w = Math.ceil(fx + r) - x, h = Math.ceil(fy + r) - y
    const a = new Float32Array(w * h)
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            const px = x + i, py = y + j
            if (square) {
                a[j * w + i] = Math.max(0, Math.min(px + 1, fx + r) - Math.max(px, fx - r))
                    * Math.max(0, Math.min(py + 1, fy + r) - Math.max(py, fy - r))
            } else {
                let n = 0
                for (let sy = 0; sy < SS; sy++) {
                    const dy = py + (sy + 0.5) / SS - fy
                    for (let sx = 0; sx < SS; sx++) {
                        const dx = px + (sx + 0.5) / SS - fx
                        if (dx * dx + dy * dy <= r * r) n++
                    }
                }
                a[j * w + i] = n / (SS * SS)
            }
        }
    }
    m = { x, y, w, h, a }
    if (masks.size > 4096) masks.clear()
    masks.set(key, m)
    return m
}

/**
 * Punkte der Zellen x0..x1, y0..y1 direkt in Pixel rechnen (Pfade mit zehntausenden Kreisen braucht der Browser ohne
 * GPU sekundenlang). `scale` = Einheiten pro Zelle, `unit` = Gerätepixel pro Einheit, (ox, oy) = Ursprung in
 * Gerätepixeln. Je Farbe eine Deckungsebene (Überlappungen wie bei einem gemeinsamen Pfad), dann darübergelegt.
 */
export function rasterDots(width: number, height: number, grid: Grid, c: Colors, scale: number, unit: number,
    ox: number, oy: number, x0 = 0, y0 = 0, x1 = grid.width, y1 = grid.height): ImageData {
    const img = new ImageData(width, height)
    const cover = new Float32Array(width * height)
    const s = scale * unit
    // Boden und Spur behalten ihre relative Größe (gleiche Helligkeit in jeder Stufe), Wände bekommen eine Mindestgröße
    const size = (k: keyof typeof DOT) => Math.max(DOT[k] * s, MIN_PX[k] * unit)
    // sehr klein: Quadrate statt Kreise (Kreise unter ~2 px werden nur unscharf), Boden flächig in Mischfarbe
    const square = scale <= 2
    const layers: [(i: number) => boolean, number, string, number][] = [
        [(i) => grid.floor[i] === 1, square ? s : size('floor'), square ? c.floorFlat : c.floor, 1],
        [(i) => grid.floor[i] === 2, size('wall'), c.wall, 1],
    ]
    if (grid.run) layers.push([(i) => !!grid.run![i], size('run'), c.path, RUN_ALPHA])
    const w = grid.width
    for (const [hit, d, color, alpha] of layers) {
        cover.fill(0)
        let any = false
        for (let y = y0; y < y1; y++) {
            const cy = oy + (y + 0.5) * s
            const iy = Math.floor(cy), fy = Math.round((cy - iy) * SUB) / SUB
            for (let x = x0; x < x1; x++) {
                if (!hit(y * w + x)) continue
                any = true
                const cx = ox + (x + 0.5) * s
                const ix = Math.floor(cx), fx = Math.round((cx - ix) * SUB) / SUB
                const m = mask(square, d, fx, fy)
                for (let j = 0; j < m.h; j++) {
                    const py = iy + m.y + j
                    if (py < 0 || py >= height) continue
                    for (let i = 0; i < m.w; i++) {
                        const px = ix + m.x + i
                        if (px < 0 || px >= width) continue
                        const k = py * width + px, v = m.a[j * m.w + i]
                        if (v > cover[k]) cover[k] = v
                    }
                }
            }
        }
        if (!any) continue
        // darüberlegen (source-over, nicht vormultipliziert)
        const [r, g, b, ca] = rgba(color)
        const px = img.data
        for (let k = 0; k < cover.length; k++) {
            const a = cover[k] * alpha * (ca / 255)
            if (a <= 0) continue
            const o = k * 4, da = px[o + 3] / 255, rest = da * (1 - a), oa = a + rest
            px[o] = (r * a + px[o] * rest) / oa
            px[o + 1] = (g * a + px[o + 1] * rest) / oa
            px[o + 2] = (b * a + px[o + 2] * rest) / oa
            px[o + 3] = oa * 255
        }
    }
    return img
}

/** Ganze Karte einmal in `level` Pixel pro Zelle vorrendern (für Übersicht und Rauszoomen) */
export function renderBitmap(grid: Grid, c: Colors, level: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = grid.width * level
    canvas.height = grid.height * level
    canvas.getContext('2d')!.putImageData(rasterDots(canvas.width, canvas.height, grid, c, level, 1, 0, 0), 0, 0)
    return canvas
}

/** Stufe, die höchstens 2× verkleinert werden muss (starkes Verkleinern mischt Punkte mit dem Hintergrund) */
export function pickLevel(devicePxPerCell: number): number {
    return BITMAP_LEVELS.find((l) => l >= devicePxPerCell) ?? BITMAP_SCALE
}
