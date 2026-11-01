import { drawDots, type Colors, type Grid } from './render'

const TILE_PX = 512 // Kachelgröße in Gerätepixeln
const MAX_TILES = 64 // ≈ 64 MB; älteste fliegen zuerst raus
const BUDGET_MS = 6 // neue Kacheln pro Frame höchstens so lange rendern, Rest im nächsten Frame

/**
 * Reingezoomte Kartenpunkte als Kacheln: jeder Frame setzt nur fertige Bilder, neue Kacheln entstehen
 * nach und nach im Zeitbudget. Fehlende Kacheln zeichnet `fallback` (das vorgerenderte Kartenbild, kurz unscharf).
 */
export class DotTiles {
    private tiles = new Map<string, HTMLCanvasElement>()
    private grid?: Grid
    private colors?: Colors
    private scale = 0
    private dpr = 0

    /**
     * Sichtbare Kacheln für den Ursprung (x, y) in CSS-Pixeln zeichnen.
     * `fallback(cellX, cellY, cells, dx, dy, size)` füllt eine fehlende Kachel. Rückgabe: true = es fehlen noch Kacheln.
     */
    draw(g: CanvasRenderingContext2D, grid: Grid, colors: Colors, scale: number, dpr: number, x: number, y: number,
        w: number, h: number, fallback: (cx: number, cy: number, cells: number, dx: number, dy: number, size: number) => void): boolean {
        if (grid !== this.grid || colors !== this.colors || scale !== this.scale || dpr !== this.dpr) {
            this.tiles.clear()
            Object.assign(this, { grid, colors, scale, dpr })
        }
        const cells = TILE_PX / (scale * dpr) // Zellen pro Kachel
        const size = TILE_PX / dpr // CSS-Pixel pro Kachel
        // Ursprung auf Gerätepixel, damit Kacheln 1:1 und lückenlos liegen
        const ox = Math.round(x * dpr) / dpr, oy = Math.round(y * dpr) / dpr
        const i0 = Math.max(0, Math.floor(-ox / size)), i1 = Math.min(Math.ceil(grid.width / cells), Math.ceil((w - ox) / size))
        const j0 = Math.max(0, Math.floor(-oy / size)), j1 = Math.min(Math.ceil(grid.height / cells), Math.ceil((h - oy) / size))
        const t0 = performance.now()
        let missing = false
        g.imageSmoothingEnabled = false
        for (let j = j0; j < j1; j++) {
            for (let i = i0; i < i1; i++) {
                const key = `${i},${j}`
                let tile = this.tiles.get(key)
                if (tile) {
                    this.tiles.delete(key) // zuletzt benutzt ans Ende
                    this.tiles.set(key, tile)
                } else if (performance.now() - t0 < BUDGET_MS) {
                    tile = this.render(i * cells, j * cells, cells)
                    this.tiles.set(key, tile)
                    if (this.tiles.size > MAX_TILES) this.tiles.delete(this.tiles.keys().next().value!)
                }
                const dx = ox + i * size, dy = oy + j * size
                if (tile) g.drawImage(tile, dx, dy, size, size)
                else {
                    missing = true
                    g.imageSmoothingEnabled = true
                    fallback(i * cells, j * cells, cells, dx, dy, size)
                    g.imageSmoothingEnabled = false
                }
            }
        }
        g.imageSmoothingEnabled = true
        return missing
    }

    private render(cx: number, cy: number, cells: number): HTMLCanvasElement {
        const grid = this.grid!, scale = this.scale
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = TILE_PX
        const g = canvas.getContext('2d')!
        g.scale(this.dpr, this.dpr)
        // eine Zelle Rand: Punkte der Nachbarzellen ragen hinein (Wände sind größer als ihre Zelle)
        drawDots(g, grid, this.colors!, scale, -cx * scale, -cy * scale,
            Math.max(0, Math.floor(cx) - 1), Math.max(0, Math.floor(cy) - 1),
            Math.min(grid.width, Math.ceil(cx + cells) + 1), Math.min(grid.height, Math.ceil(cy + cells) + 1))
        return canvas
    }
}
