import type { MapData } from '../api/types'

/** Pixel pro Kartenzelle im vorgerenderten Bild; darüber wird live gezeichnet */
export const BITMAP_SCALE = 4

// Punktdurchmesser relativ zur Zelle (wie die bisherige Vacuula-Karte)
const DOT = { floor: 0.45, wall: 0.75, run: 0.5 }
const RUN_ALPHA = 0.8

export interface Grid {
    width: number
    height: number
    floor: Uint8Array // 0 unbekannt, 1 frei, 2 Wand
    run?: Uint8Array // 1 = befahren
    bounds: { x: number; y: number; w: number; h: number }
}

export interface Colors { bg: string; floor: string; wall: string; path: string; dock: string }

export function mapColors(): Colors {
    const s = getComputedStyle(document.documentElement)
    const v = (n: string) => s.getPropertyValue(n).trim()
    return { bg: v('--map-bg'), floor: v('--map-floor'), wall: v('--map-wall'), path: v('--map-path'), dock: v('--ok') }
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
    const rf = (DOT.floor * scale) / 2, rw = (DOT.wall * scale) / 2, rr = (DOT.run * scale) / 2
    const w = grid.width
    for (let y = y0; y < y1; y++) {
        const cy = oy + (y + 0.5) * scale
        const row = y * w
        for (let x = x0; x < x1; x++) {
            const i = row + x
            const v = grid.floor[i]
            const cx = ox + (x + 0.5) * scale
            if (v === 1) { floor.moveTo(cx + rf, cy); floor.arc(cx, cy, rf, 0, Math.PI * 2) }
            else if (v === 2) { wall.moveTo(cx + rw, cy); wall.arc(cx, cy, rw, 0, Math.PI * 2) }
            if (grid.run?.[i]) { run.moveTo(cx + rr, cy); run.arc(cx, cy, rr, 0, Math.PI * 2) }
        }
    }
    g.fillStyle = c.floor
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

/** Ganze Karte einmal in BITMAP_SCALE vorrendern (für Übersicht und Rauszoomen) */
export function renderBitmap(grid: Grid, c: Colors): HTMLCanvasElement {
    const canvas = document.createElement('canvas')
    canvas.width = grid.width * BITMAP_SCALE
    canvas.height = grid.height * BITMAP_SCALE
    drawDots(canvas.getContext('2d')!, grid, c, BITMAP_SCALE, 0, 0)
    return canvas
}
