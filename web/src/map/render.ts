import type { MapData } from '../api/types'

type RGBA = [number, number, number, number]

function cssColor(name: string): RGBA {
    // Farbe über ein 1×1-Canvas auflösen, damit auch var()/color-mix() funktionieren
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888'
    const c = document.createElement('canvas')
    c.width = c.height = 1
    const g = c.getContext('2d')!
    g.fillStyle = value
    g.fillRect(0, 0, 1, 1)
    const d = g.getImageData(0, 0, 1, 1).data
    return [d[0], d[1], d[2], d[3]]
}

function withAlpha([r, g, b]: RGBA, a: number): RGBA {
    return [r, g, b, Math.round(a * 255)]
}

export interface Rendered { canvas: HTMLCanvasElement; bounds: { x: number; y: number; w: number; h: number } }

/**
 * RLE-Karte von Vacuula einmal in ein Bild umsetzen (Pixel 1:1).
 * Floor-Map: 0 unbekannt, 1 frei, 2 Wand. Run-Map: 128 Hintergrund, 100/200 Basis, sonst Spur.
 */
export function renderMap(data: MapData, kind: 'floor' | 'run'): Rendered {
    const canvas = document.createElement('canvas')
    canvas.width = data.width
    canvas.height = data.height
    const g = canvas.getContext('2d')!
    const img = g.createImageData(data.width, data.height)
    const px = img.data

    const free = cssColor('--map-free')
    const wall = cssColor('--map-wall')
    const dock = cssColor('--ok')
    const path = withAlpha(cssColor('--accent'), 0.55)
    const none: RGBA = [0, 0, 0, 0]

    const colorOf = (v: number): RGBA => {
        if (kind === 'floor') return v === 1 ? free : v === 2 ? wall : none
        if (v === 128) return none
        if (v === 100 || v === 200) return dock
        return path
    }

    // belegter Bereich, damit „Einpassen“ die leeren Ränder weglässt
    let minX = data.width, minY = data.height, maxX = -1, maxY = -1
    let i = 0
    for (const [value, count] of data.rle) {
        const [r, gg, b, a] = colorOf(value)
        const end = Math.min(i + count, data.width * data.height)
        if (a !== 0) {
            for (let p = i; p < end; p++) {
                const o = p * 4
                px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = a
            }
            const y0 = Math.floor(i / data.width), y1 = Math.floor((end - 1) / data.width)
            minY = Math.min(minY, y0); maxY = Math.max(maxY, y1)
            if (y0 === y1) { minX = Math.min(minX, i % data.width); maxX = Math.max(maxX, (end - 1) % data.width) }
            else { minX = 0; maxX = data.width - 1 }
        }
        i = end
    }
    g.putImageData(img, 0, 0)

    // Basis der Floor-Map als Punkt (die Run-Map hat eigene Markierungen)
    if (kind === 'floor' && data.dock) {
        g.fillStyle = `rgb(${dock[0]} ${dock[1]} ${dock[2]})`
        g.beginPath()
        g.arc(data.dock.pixel_x, data.dock.pixel_y, 3, 0, Math.PI * 2)
        g.fill()
    }
    const pad = 6
    const bounds = maxX < 0
        ? { x: 0, y: 0, w: data.width, h: data.height }
        : {
            x: Math.max(0, minX - pad), y: Math.max(0, minY - pad),
            w: Math.min(data.width, maxX + pad + 1) - Math.max(0, minX - pad),
            h: Math.min(data.height, maxY + pad + 1) - Math.max(0, minY - pad),
        }
    return { canvas, bounds }
}
