// Geometrie für Zonen und No-Go-Linien; Punkte sind normierte Kartenkoordinaten (0..1)
export type Pt = [number, number]

export function insidePolygon([x, y]: Pt, vs: Pt[]): boolean {
    let inside = false
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        const [xi, yi] = vs[i], [xj, yj] = vs[j]
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside
    }
    return inside
}

export function distToSegment([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt): number {
    const dx = bx - ax, dy = by - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function centroid(vs: Pt[]): Pt {
    return [vs.reduce((s, v) => s + v[0], 0) / vs.length, vs.reduce((s, v) => s + v[1], 0) / vs.length]
}

/** Punkt sicher innerhalb der Zone (`relevancy` für den Roboter): Schwerpunkt, bei L/U-Formen der Rasterpunkt mit größtem Randabstand */
export function interiorPoint(vs: Pt[]): Pt {
    const c = centroid(vs)
    if (insidePolygon(c, vs)) return c
    const xs = vs.map((v) => v[0]), ys = vs.map((v) => v[1])
    const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0
    const steps = 40
    let best = c, bestD = -1
    for (let i = 0; i < steps; i++) {
        for (let j = 0; j < steps; j++) {
            const p: Pt = [x0 + w * (i + 0.5) / steps, y0 + h * (j + 0.5) / steps]
            if (!insidePolygon(p, vs)) continue
            let d = Infinity
            for (let k = 0, l = vs.length - 1; k < vs.length; l = k++) d = Math.min(d, distToSegment(p, vs[l], vs[k]))
            if (d > bestD) { bestD = d; best = p }
        }
    }
    return best
}

function crosses(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
    const cross = (p: Pt, q: Pt, r: Pt) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
    return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0) && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0
}

function area(vs: Pt[]): number {
    let a = 0
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) a += (vs[j][0] + vs[i][0]) * (vs[j][1] - vs[i][1])
    return Math.abs(a / 2)
}

export type ShapeError = 'tooFewPoints' | 'selfIntersecting' | 'tooSmall'

/** Formen ablehnen, die der Roboter nicht annimmt */
export function validateShape(vs: Pt[], closed: boolean): ShapeError | undefined {
    if (vs.length < (closed ? 3 : 2)) return 'tooFewPoints'
    if (!closed) return undefined
    const n = vs.length
    for (let i = 0; i < n; i++) {
        for (let j = i + 2; j < n; j++) {
            if (i === 0 && j === n - 1) continue
            if (crosses(vs[i], vs[(i + 1) % n], vs[j], vs[(j + 1) % n])) return 'selfIntersecting'
        }
    }
    if (area(vs) < 1e-5) return 'tooSmall'
    return undefined
}
