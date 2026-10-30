import { GEN3_COMMANDS } from '../../http/gen3'
import type { Neato } from '../../types'
import type { NoGoLine, Point, Zone } from './types'

// RLE Decode helper
export function decodeRLE(rle: Array<any>) {
    const output: number[] = []
    for (const [value, count] of rle) {
        for (let i = 0; i < count; i++) {
            output.push(value)
        }
    }
    return output
}

// Touch helpers
export function getTouchDistance(t1: React.Touch, t2: React.Touch) {
    const dx = t1.clientX - t2.clientX
    const dy = t1.clientY - t2.clientY
    return Math.sqrt(dx * dx + dy * dy)
}

export function getTouchAngle(t1: React.Touch, t2: React.Touch) {
    const dx = t2.clientX - t1.clientX
    const dy = t2.clientY - t1.clientY
    return Math.atan2(dy, dx)
}

// Coordinate conversion
export function getWorldCoords(screenX: number, screenY: number, offset: { x: number; y: number }, zoom: number, mapSize: { height: number, width: number }): Point {
    return [
        ((screenX - offset.x) / zoom) / mapSize.width, // x
        ((screenY - offset.y) / zoom) / mapSize.height // y
    ]
}

export function getCrosshairWorldCoords(canvasRef: React.RefObject<HTMLCanvasElement>, offset: { x: number; y: number }, zoom: number, mapSize: { height: number, width: number }): Point {
    const canvas = canvasRef.current
    if (!canvas) return [0, 0]
    // Center of screen in canvas coordinates
    const centerX = canvas.width / 2
    const centerY = canvas.height / 2
    return getWorldCoords(centerX, centerY, offset, zoom, mapSize)
}

export function calcRelevancy(vertices: Point[]): Point {
    const x = vertices.reduce((sum, v) => sum + v[0], 0) / vertices.length;
    const y = vertices.reduce((sum, v) => sum + v[1], 0) / vertices.length;
    return [x, y];
}

export const upsertPreserveOrder = <T extends { id: string }>(
    list: T[],
    item: T
): T[] => {
    const index = list.findIndex(b => b.id === item.id);

    if (index === -1) return [...list, item];

    const copy = [...list];
    copy[index] = item;
    return copy;
};

export const CELL_FILTERS = {
    any: (v: number) => v !== 0,
    wallsOnly: (v: number) => v !== 0 && v !== 1,
    freeSpaceOnly: (v: number) => v === 2,
} as const


export function getMapContentBounds(
    cells: number[],
    mapSize: { width: number; height: number }
): { minX: number; minY: number; maxX: number; maxY: number } | null {
    let minX = mapSize.width
    let minY = mapSize.height
    let maxX = -1
    let maxY = -1

    for (let y = 0; y < mapSize.height; y++) {
        const row = y * mapSize.width
        for (let x = 0; x < mapSize.width; x++) {
            // if (cells[row + x] !== 0) {
            if (CELL_FILTERS.freeSpaceOnly(cells[row + x])) {
                if (x < minX) minX = x
                if (x > maxX) maxX = x
                if (y < minY) minY = y
                if (y > maxY) maxY = y
            }
        }
    }

    if (maxX < minX || maxY < minY) return null // no non-empty cells at all

    return { minX, minY, maxX, maxY }
}

export function calcFitZoomAndOffset(
    cells: number[],
    mapSize: { width: number; height: number },
    canvasWidth: number,
    canvasHeight: number,
    minZoom: number,
    maxZoom: number,
    padding = 0.9 // fraction of canvas the content should occupy
): { zoom: number; offset: { x: number; y: number } } | null {
    const bounds = getMapContentBounds(cells, mapSize)
    if (!bounds) return null

    const contentWidth = bounds.maxX - bounds.minX + 1
    const contentHeight = bounds.maxY - bounds.minY + 1

    const zoomX = (canvasWidth * padding) / contentWidth
    const zoomY = (canvasHeight * padding) / contentHeight

    const zoom = Math.max(minZoom, Math.min(maxZoom, Math.min(zoomX, zoomY)))

    const contentCenterX = bounds.minX + contentWidth / 2
    const contentCenterY = bounds.minY + contentHeight / 2

    return {
        zoom,
        offset: {
            x: canvasWidth / 2 - contentCenterX * zoom,
            y: canvasHeight / 2 - contentCenterY * zoom
        }
    }
}

export interface Gen3MapWithZones {
    map: Neato.Gen3.PersistentMap
    boundaries: (NoGoLine | Zone)[]
    zones: Zone[]
}

export async function getAllGen3MapsWithZones(
    serial: string,
    maps: Neato.Gen3.PersistentMap[],
): Promise<Gen3MapWithZones[]> {
    return Promise.all(
        maps.map(async (map) => {
            if (!map.enabled) return { map, boundaries: [], zones: [] };
            try {
                const res = await GEN3_COMMANDS.getMapBoundaries(serial, map.id)
                const boundaries: (NoGoLine | Zone)[] = (res.data.data.boundaries ?? [])
                return {
                    map,
                    boundaries,
                    zones: boundaries.filter((b): b is Zone => b.type === 'polygon'),
                }
            } catch (err) {
                console.error(`Failed to fetch boundaries for map ${map.id}`, err)
                return { map, boundaries: [], zones: [] }
            }
        }),
    )
}

function isInsidePolygon([x, y]: Point, vertices: Point[]): boolean {
    let inside = false
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        const [xi, yi] = vertices[i]
        const [xj, yj] = vertices[j]
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
    }
    return inside
}

function distanceToSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
    const dx = bx - ax
    const dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

// Point that is guaranteed to lie inside the polygon. The vertex average can fall
// outside of concave (L/U-shaped) zones, so fall back to the grid point that is
// furthest away from all edges.
export function calcInteriorPoint(vertices: Point[]): Point {
    const centroid = calcRelevancy(vertices)
    if (isInsidePolygon(centroid, vertices)) return centroid

    const xs = vertices.map(v => v[0])
    const ys = vertices.map(v => v[1])
    const minX = Math.min(...xs)
    const minY = Math.min(...ys)
    const w = Math.max(...xs) - minX
    const h = Math.max(...ys) - minY
    const steps = 40
    let best: Point = centroid
    let bestDistance = -1
    for (let i = 0; i < steps; i++) {
        for (let j = 0; j < steps; j++) {
            const p: Point = [minX + w * (i + 0.5) / steps, minY + h * (j + 0.5) / steps]
            if (!isInsidePolygon(p, vertices)) continue
            let d = Infinity
            for (let k = 0, l = vertices.length - 1; k < vertices.length; l = k++) {
                d = Math.min(d, distanceToSegment(p, vertices[l], vertices[k]))
            }
            if (d > bestDistance) {
                bestDistance = d
                best = p
            }
        }
    }
    return best
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
    const cross = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    const d1 = cross(c, d, a)
    const d2 = cross(c, d, b)
    const d3 = cross(a, b, c)
    const d4 = cross(a, b, d)
    return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0)) && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0
}

function polygonArea(vertices: Point[]): number {
    let area = 0
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
        area += (vertices[j][0] + vertices[i][0]) * (vertices[j][1] - vertices[i][1])
    }
    return Math.abs(area / 2)
}

export type BoundaryError = 'tooFewPoints' | 'selfIntersecting' | 'tooSmall'

// Reject shapes the robot can't handle before they are sent.
export function validateBoundary(vertices: Point[], closed: boolean): BoundaryError | undefined {
    if (vertices.length < (closed ? 3 : 2)) return 'tooFewPoints'
    if (!closed) return undefined
    const n = vertices.length
    for (let i = 0; i < n; i++) {
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue // adjacent via the closing edge
            if (segmentsIntersect(vertices[i], vertices[(i + 1) % n], vertices[j], vertices[(j + 1) % n])) return 'selfIntersecting'
        }
    }
    if (polygonArea(vertices) < 1e-5) return 'tooSmall'
    return undefined
}
