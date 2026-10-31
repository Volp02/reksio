import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import type { Boundary, MapData } from '../api/types'
import { useI18n } from '../i18n'
import { useTheme } from '../ui/theme'
import { IconButton } from '../ui/ui'
import { BITMAP_SCALE, drawDots, mapColors, pickLevel, renderBitmap, toGrid, type Colors, type Grid } from './render'
import type { Live } from './useLive'
import type { MapPose } from './pose'
import './map.css'

const MAX_SCALE = 24 // CSS-Pixel pro Kartenzelle
// Reksio gleitet zur neuen Position statt zu springen; Dauer ≈ Abfragetakt (1 s), damit es durchgehend wirkt
const GLIDE_MS = 1000
const SNAP_PX = 64 // Kartenpixel (≈ 2,5 m): größere Sprünge (z. B. nach Funkloch) nicht animieren

interface Glide { from?: MapPose; to?: MapPose; t0: number }

function glidePose(a: Glide, now: number): MapPose | undefined {
    if (!a.to) return undefined
    if (!a.from) return a.to
    const k = Math.min(1, (now - a.t0) / GLIDE_MS)
    const dh = Math.atan2(Math.sin(a.to.heading - a.from.heading), Math.cos(a.to.heading - a.from.heading))
    return {
        px: a.from.px + (a.to.px - a.from.px) * k,
        py: a.from.py + (a.to.py - a.from.py) * k,
        heading: a.from.heading + dh * k,
    }
}

interface View { scale: number; x: number; y: number }

/** Umrechnung zwischen Bildschirm (CSS-Pixel im Kartenfeld) und normierten Kartenkoordinaten (0..1) */
export interface MapViewport {
    toScreen: (p: [number, number]) => [number, number]
    toMap: (x: number, y: number) => [number, number]
    /** Kartenzellen (Breite, Höhe) und CSS-Pixel pro Zelle */
    cells: [number, number]
    scale: number
    /** Mitte des sichtbaren Ausschnitts */
    center: () => [number, number]
}

/** gedrückte Zusatztasten beim Zeigerereignis */
export interface Mods { shift: boolean; alt: boolean }

/** Antippen und Ziehen auf der Karte (Zonen wählen, Eckpunkte verschieben) */
export interface MapInteraction {
    /** Zeiger gedrückt; true: der folgende Zug gehört dem Aufrufer statt dem Verschieben der Karte */
    grab?: (x: number, y: number, vp: MapViewport, mods: Mods) => boolean
    drag?: (x: number, y: number, vp: MapViewport, mods: Mods) => void
    release?: () => void
    tap?: (x: number, y: number, vp: MapViewport, mods: Mods) => void
    /** Doppelklick; true: nicht zoomen */
    doubleTap?: (x: number, y: number, vp: MapViewport) => boolean
    /** Rechtsklick; true: kein Kontextmenü */
    context?: (x: number, y: number, vp: MapViewport) => boolean
    /** Maus ohne gedrückte Taste (undefined: Zeiger hat die Karte verlassen); Rückgabe: CSS-Cursor */
    hover?: (p: { x: number; y: number; vp: MapViewport } | undefined) => string | undefined
    /** zusätzlich zeichnen, über Zonen und unter Reksio */
    overlay?: (g: CanvasRenderingContext2D, vp: MapViewport) => void
}

interface Props {
    data: MapData
    /** gefahrene Spur, gleiches Raster wie `data` */
    run?: MapData
    boundaries?: Boundary[]
    /** Reksio und Spur der laufenden Fahrt (Kartenpixel) */
    live?: Live
    label: string
    controls?: 'full' | 'fit'
    fill?: boolean
    interact?: MapInteraction
    /** aktuelle Umrechnung für den Aufrufer (z. B. neue Zone in der Bildmitte) */
    viewportRef?: { current?: () => MapViewport }
    /** Werkzeugleiste oben links in der Karte */
    tools?: ReactNode
}

const TAP_PX = 8 // weiter bewegt: Verschieben statt Antippen

export function MapView({ data, run, boundaries, live, label, controls = 'full', fill = false, interact, viewportRef, tools }: Props) {
    const { t } = useI18n()
    const { resolved } = useTheme()
    const wrap = useRef<HTMLDivElement>(null)
    const canvas = useRef<HTMLCanvasElement>(null)
    const view = useRef<View>({ scale: 1, x: 0, y: 0 })
    const fitted = useRef(true)
    const frame = useRef(0)
    const glide = useRef<Glide>({ t0: 0 })

    const grid = useMemo<Grid>(() => toGrid(data, run), [data, run])
    // Farben und Punktebild nur bei neuer Karte oder neuem Thema neu erzeugen
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const colors = useMemo<Colors>(() => mapColors(), [resolved])
    // Bildstufen erst bei Bedarf erzeugen, dann behalten
    const bitmaps = useMemo(() => {
        const cache = new Map<number, HTMLCanvasElement>()
        return (level: number) => {
            let b = cache.get(level)
            if (!b) { b = renderBitmap(grid, colors, level); cache.set(level, b) }
            return b
        }
    }, [grid, colors])
    const bounds = grid.bounds
    const interactRef = useRef(interact)
    interactRef.current = interact

    const viewport = useCallback((): MapViewport => {
        const { scale, x, y } = view.current
        const sx = grid.width * scale, sy = grid.height * scale
        return {
            toScreen: ([u, v]) => [x + u * sx, y + v * sy],
            toMap: (px, py) => [(px - x) / sx, (py - y) / sy],
            cells: [grid.width, grid.height],
            scale,
            center: () => {
                const el = wrap.current
                return el ? [(el.clientWidth / 2 - x) / sx, (el.clientHeight / 2 - y) / sy] : [0.5, 0.5]
            },
        }
    }, [grid])
    if (viewportRef) viewportRef.current = viewport

    const draw = useCallback(() => {
        cancelAnimationFrame(frame.current)
        frame.current = requestAnimationFrame(() => {
            const c = canvas.current
            if (!c) return
            const g = c.getContext('2d')!
            const dpr = window.devicePixelRatio || 1
            const { scale, x, y } = view.current
            g.setTransform(dpr, 0, 0, dpr, 0, 0)
            g.fillStyle = colors.bg
            g.fillRect(0, 0, c.width, c.height)

            if (scale * dpr <= BITMAP_SCALE * 1.25) {
                // rausgezoomt: passende Stufe des vorgerenderten Bilds skalieren
                g.imageSmoothingEnabled = true
                g.imageSmoothingQuality = 'high'
                g.drawImage(bitmaps(pickLevel(scale * dpr)), x, y, grid.width * scale, grid.height * scale)
            } else {
                // reingezoomt: nur sichtbare Zellen live, damit die Punkte scharf bleiben
                const w = c.width / dpr, h = c.height / dpr
                const x0 = Math.max(0, Math.floor(-x / scale)), y0 = Math.max(0, Math.floor(-y / scale))
                const x1 = Math.min(grid.width, Math.ceil((w - x) / scale)), y1 = Math.min(grid.height, Math.ceil((h - y) / scale))
                drawDots(g, grid, colors, scale, x, y, x0, y0, x1, y1)
            }

            drawBoundaries(g, boundaries, grid, scale, x, y)
            interact?.overlay?.(g, viewport())

            // aktuelle (gleitende) Position von Reksio
            const robot = live?.robot && (glidePose(glide.current, performance.now()) ?? live.robot)

            // Spur der laufenden Fahrt; das letzte Stück endet an der gleitenden Position
            if (live?.trail.length) {
                g.beginPath()
                const pts = robot ? [...live.trail.slice(0, -1), robot] : live.trail
                pts.forEach((p, i) => (i ? g.lineTo(x + p.px * scale, y + p.py * scale) : g.moveTo(x + p.px * scale, y + p.py * scale)))
                g.strokeStyle = colors.path
                g.globalAlpha = live.robot ? 0.7 : 0.85
                g.lineWidth = live.robot ? Math.max(2, Math.min(6, scale * 0.6)) : Math.max(1.25, Math.min(3, scale * 0.3))
                g.lineJoin = 'round'
                g.lineCap = 'round'
                g.stroke()
                g.globalAlpha = 1
            }

            if (data.dock) {
                const dx = x + data.dock.pixel_x * scale, dy = y + data.dock.pixel_y * scale
                const r = Math.max(4, Math.min(8, scale * 1.5))
                g.fillStyle = colors.dock
                g.strokeStyle = colors.bg
                g.lineWidth = 2
                g.beginPath()
                g.arc(dx, dy, r, 0, Math.PI * 2)
                g.fill()
                g.stroke()
            }

            // Reksio: Punkt mit Blickrichtung, hohl wenn die Position veraltet ist
            if (live?.robot && robot) {
                const { stale } = live.robot
                const { px, py, heading } = robot
                const rx = x + px * scale, ry = y + py * scale
                const r = Math.max(7, Math.min(14, scale * 4.2)) // D7 ≈ 33 cm ≈ 8,4 Zellen
                g.lineWidth = 2.5
                g.beginPath()
                g.arc(rx, ry, r, 0, Math.PI * 2)
                g.fillStyle = stale ? colors.bg : colors.path
                g.strokeStyle = stale ? colors.path : colors.onPath
                g.fill()
                g.stroke()
                g.beginPath()
                g.moveTo(rx + Math.cos(heading) * r * 0.75, ry + Math.sin(heading) * r * 0.75)
                g.lineTo(rx + Math.cos(heading + 2.5) * r * 0.45, ry + Math.sin(heading + 2.5) * r * 0.45)
                g.lineTo(rx + Math.cos(heading - 2.5) * r * 0.45, ry + Math.sin(heading - 2.5) * r * 0.45)
                g.closePath()
                g.fillStyle = stale ? colors.path : colors.onPath
                g.fill()
            }
        })
    }, [bitmaps, boundaries, colors, data.dock, grid, live, interact, viewport])

    // Zoom/Einpassen/Gesten rufen immer die aktuelle Zeichenfunktion, hängen aber nicht von ihr ab:
    // sonst würde jede neue Live-Position die Ansicht neu einpassen
    const drawRef = useRef(draw)
    drawRef.current = draw
    const redraw = useCallback(() => drawRef.current(), [])

    const fitScale = useCallback(() => {
        const el = wrap.current
        if (!el) return 1
        return Math.min(el.clientWidth / bounds.w, el.clientHeight / bounds.h)
    }, [bounds])

    const fit = useCallback(() => {
        const el = wrap.current
        if (!el) return
        const s = fitScale()
        view.current = {
            scale: s,
            x: (el.clientWidth - bounds.w * s) / 2 - bounds.x * s,
            y: (el.clientHeight - bounds.h * s) / 2 - bounds.y * s,
        }
        fitted.current = true
        redraw()
    }, [bounds, redraw, fitScale])

    const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
        const v = view.current
        const scale = Math.min(MAX_SCALE, Math.max(fitScale() * 0.8, v.scale * factor))
        const k = scale / v.scale
        view.current = { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
        fitted.current = false
        redraw()
    }, [redraw, fitScale])

    // Canvas an Container anpassen; eingepasst bleiben, solange nicht gezoomt wurde
    useEffect(() => {
        const el = wrap.current
        const c = canvas.current
        if (!el || !c) return
        const ro = new ResizeObserver(() => {
            const dpr = window.devicePixelRatio || 1
            c.width = Math.round(el.clientWidth * dpr)
            c.height = Math.round(el.clientHeight * dpr)
            if (fitted.current) fit()
            else redraw()
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [fit, redraw])

    useEffect(() => { fit() }, [grid, fit])

    // neue Live-Position: von der gerade angezeigten Stelle aus hingleiten
    const target = live?.robot
    useEffect(() => {
        if (!target) { glide.current = { t0: 0 }; return }
        const g = glide.current
        if (g.to && g.to.px === target.px && g.to.py === target.py && g.to.heading === target.heading) return
        const now = performance.now()
        const cur = glidePose(g, now)
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const snap = !cur || reduce || Math.hypot(target.px - cur.px, target.py - cur.py) > SNAP_PX
        glide.current = { from: snap ? undefined : cur, to: { px: target.px, py: target.py, heading: target.heading }, t0: now }
        if (snap) return
        let raf = 0
        const tick = () => {
            redraw()
            if (performance.now() - now < GLIDE_MS) raf = requestAnimationFrame(tick)
        }
        raf = requestAnimationFrame(tick)
        return () => cancelAnimationFrame(raf)
    }, [target?.px, target?.py, target?.heading, redraw])
    useEffect(() => { draw() }, [draw])

    // Mausrad und Gesten
    useEffect(() => {
        const el = wrap.current
        if (!el || controls !== 'full') return
        const pointers = new Map<number, { x: number; y: number }>()
        let pinch: number | null = null
        let grabbed: number | null = null // Zeiger, der gerade etwas zieht
        let down: { id: number; x: number; y: number; moved: boolean } | null = null
        const local = (e: { clientX: number; clientY: number }) => {
            const r = el.getBoundingClientRect()
            return { x: e.clientX - r.left, y: e.clientY - r.top }
        }
        const onCtl = (e: Event) => !!(e.target as HTMLElement).closest('.mapctl, .maptools')
        const mods = (e: PointerEvent): Mods => ({ shift: e.shiftKey, alt: e.altKey })
        const setCursor = (c: string | undefined) => { el.style.cursor = c ?? '' }
        const onWheel = (e: WheelEvent) => {
            e.preventDefault()
            const p = local(e)
            zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y)
        }
        const onDown = (e: PointerEvent) => {
            if (onCtl(e) || e.button > 0) return
            el.setPointerCapture(e.pointerId)
            const p = local(e)
            pointers.set(e.pointerId, p)
            down = pointers.size === 1 ? { id: e.pointerId, ...p, moved: false } : null
            if (pointers.size === 1 && interactRef.current?.grab?.(p.x, p.y, viewport(), mods(e))) grabbed = e.pointerId
        }
        const onMove = (e: PointerEvent) => {
            const prev = pointers.get(e.pointerId)
            if (!prev) {
                if (e.pointerType === 'mouse' && !onCtl(e)) {
                    const p = local(e)
                    setCursor(interactRef.current?.hover?.({ ...p, vp: viewport() }))
                }
                return
            }
            const cur = local(e)
            pointers.set(e.pointerId, cur)
            if (down?.id === e.pointerId && Math.hypot(cur.x - down.x, cur.y - down.y) > TAP_PX) down.moved = true
            if (grabbed === e.pointerId) {
                interactRef.current?.drag?.(cur.x, cur.y, viewport(), mods(e))
                return
            }
            if (pointers.size === 1) {
                const v = view.current
                view.current = { ...v, x: v.x + cur.x - prev.x, y: v.y + cur.y - prev.y }
                fitted.current = false
                redraw()
            } else if (pointers.size === 2) {
                const [a, b] = [...pointers.values()]
                const d = Math.hypot(a.x - b.x, a.y - b.y)
                if (pinch) zoomAt(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2)
                pinch = d
            }
        }
        const onUp = (e: PointerEvent) => {
            const p = pointers.get(e.pointerId)
            pointers.delete(e.pointerId)
            if (pointers.size < 2) pinch = null
            if (grabbed === e.pointerId) {
                grabbed = null
                interactRef.current?.release?.()
            } else if (e.type === 'pointerup' && p && down?.id === e.pointerId && !down.moved) {
                interactRef.current?.tap?.(p.x, p.y, viewport(), mods(e))
            }
            if (down?.id === e.pointerId) down = null
        }
        const onDbl = (e: MouseEvent) => {
            if (onCtl(e)) return
            const p = local(e)
            if (interactRef.current?.doubleTap?.(p.x, p.y, viewport())) return
            zoomAt(2, p.x, p.y)
        }
        const onContext = (e: MouseEvent) => {
            if (onCtl(e)) return
            const p = local(e)
            if (interactRef.current?.context?.(p.x, p.y, viewport())) e.preventDefault()
        }
        const onLeave = () => { if (!pointers.size) setCursor(interactRef.current?.hover?.(undefined)) }
        el.addEventListener('wheel', onWheel, { passive: false })
        el.addEventListener('pointerdown', onDown)
        el.addEventListener('pointermove', onMove)
        el.addEventListener('pointerup', onUp)
        el.addEventListener('pointercancel', onUp)
        el.addEventListener('dblclick', onDbl)
        el.addEventListener('contextmenu', onContext)
        el.addEventListener('pointerleave', onLeave)
        return () => {
            el.removeEventListener('wheel', onWheel)
            el.removeEventListener('pointerdown', onDown)
            el.removeEventListener('pointermove', onMove)
            el.removeEventListener('pointerup', onUp)
            el.removeEventListener('pointercancel', onUp)
            el.removeEventListener('dblclick', onDbl)
            el.removeEventListener('contextmenu', onContext)
            el.removeEventListener('pointerleave', onLeave)
        }
    }, [controls, redraw, zoomAt, viewport])

    const center = () => {
        const el = wrap.current!
        return [el.clientWidth / 2, el.clientHeight / 2] as const
    }

    return (
        <div className={`mapview${controls === 'full' ? ' mapview--interactive' : ''}${fill ? ' mapview--full' : ''}`} ref={wrap}
            style={{ aspectRatio: `${bounds.w} / ${bounds.h}` }}>
            <canvas ref={canvas} role="img" aria-label={label} />
            {tools && <div className="maptools">{tools}</div>}
            <div className="mapctl">
                {controls === 'full' && <>
                    <IconButton size="s" variant="default" icon={<Plus />} label={t.map.zoomIn} onClick={() => zoomAt(1.5, ...center())} />
                    <IconButton size="s" variant="default" icon={<Minus />} label={t.map.zoomOut} onClick={() => zoomAt(1 / 1.5, ...center())} />
                </>}
                <IconButton size="s" variant="default" icon={<Maximize />} label={t.map.fit} onClick={fit} />
            </div>
        </div>
    )
}

/** Zonen (Fläche + Rand + Name) und No-Go-Linien als Vektoren; Eckpunkte sind normiert (0..1) */
function drawBoundaries(g: CanvasRenderingContext2D, boundaries: Boundary[] | undefined, grid: Grid, scale: number, ox: number, oy: number) {
    if (!boundaries?.length) return
    const css = getComputedStyle(document.documentElement)
    const sx = grid.width * scale, sy = grid.height * scale
    const pt = ([u, v]: [number, number]): [number, number] => [ox + u * sx, oy + v * sy]
    const visible = boundaries.filter((b) => b.enabled !== false)

    for (const b of visible) {
        if (b.type !== 'polygon' || b.vertices.length < 3) continue
        g.beginPath()
        b.vertices.forEach((p, i) => (i ? g.lineTo(...pt(p)) : g.moveTo(...pt(p))))
        g.closePath()
        g.globalAlpha = 0.18
        g.fillStyle = b.color
        g.fill()
        g.globalAlpha = 1
        g.lineWidth = 2
        g.strokeStyle = b.color
        g.stroke()
    }
    for (const b of visible) {
        if (b.type !== 'polyline' || b.vertices.length < 2) continue
        g.beginPath()
        b.vertices.forEach((p, i) => (i ? g.lineTo(...pt(p)) : g.moveTo(...pt(p))))
        g.setLineDash([6, 4])
        g.lineWidth = 3
        g.lineCap = 'round'
        g.strokeStyle = b.color || css.getPropertyValue('--danger')
        g.stroke()
        g.setLineDash([])
    }
    // Namen in der Zone, nur wenn genug Platz
    g.font = `500 12px ${css.getPropertyValue('--font-sans')}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineJoin = 'round'
    for (const b of visible) {
        if (b.type !== 'polygon' || !b.name) continue
        const ps = b.vertices.map(pt)
        const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1])
        const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys)
        if (w < 40 || h < 18) continue
        const [cx, cy] = b.relevancy ? pt(b.relevancy) : [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2]
        g.lineWidth = 3
        g.strokeStyle = css.getPropertyValue('--map-bg')
        g.strokeText(b.name, cx, cy, w - 8)
        g.fillStyle = css.getPropertyValue('--text')
        g.fillText(b.name, cx, cy, w - 8)
    }
}
