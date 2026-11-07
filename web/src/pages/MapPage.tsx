import { useEffect, useMemo, useRef, useState } from 'react'
import { Ban, Check, History, Map as MapIcon, MousePointer2, Pencil, Pentagon, Plus, Route, Shapes, Sparkles, Spline, Square, Trash2, Undo2, X } from 'lucide-react'
import { api } from '../api/client'
import { isGen4, robot } from '../api/robot'
import { isCleaning } from '../status'
import type { Boundary, ZoneQueue } from '../api/types'
import { fill, useI18n } from '../i18n'
import { useStore } from '../state/store'
import { getPrefs } from '../state/prefs'
import { activeMap, useBoundaries, useMapData, useMaps, useZoneHistory } from '../state/data'
import { MapView, type MapInteraction, type MapViewport, type Mods } from '../map/MapView'
import { Legend } from '../map/Legend'
import { useLive } from '../map/useLive'
import { PX_PER_M } from '../map/pose'
import { distToSegment, insidePolygon, interiorPoint, validateShape, type Pt } from '../map/geometry'
import { fmtNumber } from '../format'
import { Button, Card, Confirm, Empty, IconButton, InputRow, Label, Segmented, Switch, Toast } from '../ui/ui'
import { CleanModes } from './CleanModes'
import { MapsPanel } from './MapsPanel'
import { BoundaryHistory } from './BoundaryHistory'
import { LidarTag, LidarToggle, lidarAvailable } from '../map/LidarToggle'
import './pages.css'

// Farben für neue Zonen und Linien (wie in der Neato-/Vacuula-App)
const PRESETS = ['#ff7a45', '#f5b942', '#b4e04a', '#3ddc97', '#38d0e0', '#5aa9ff', '#a78bfa', '#e879f9', '#fb7185', '#f97373']
const HANDLE_PX = 14 // Trefferradius für Eckpunkte
const LINE_HIT_PX = 12
const SNAP_PX = 8 // Eckpunkt rastet auf gleiche Höhe/Breite wie seine Nachbarn ein
const MIN_RECT_PX = 12
const HISTORY_MAX = 100

type Tab = 'clean' | 'edit' | 'maps'
type Tool = 'select' | 'rect' | 'poly' | 'line'
interface Draft { b: Boundary; isNew: boolean; vertex?: number; orig?: string }
type Drag = { kind: 'vertex'; i: number } | { kind: 'move'; from: Pt; orig: Pt[] } | { kind: 'rect'; from: Pt }
interface Guides { u?: Pt; v?: Pt; at?: Pt } // Eckpunkte, an deren u bzw. v der Punkt at eingerastet ist

function uuid(): string {
    // crypto.randomUUID gibt es nur über HTTPS; die App läuft im LAN auch über HTTP
    const b = crypto.getRandomValues(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Gen4: Fläche, in die der Roboter nicht fährt (sonst ist jedes Vieleck eine Zone) */
const isNoGoArea = (b: Boundary) => b.type === 'polygon' && b.function === 'nogo'
const isZone = (b: Boundary) => b.type === 'polygon' && b.function !== 'nogo'
const NOGO_COLOR = '#f97373'

const clamp = (v: number) => Math.min(1, Math.max(0, v))
const clampPt = ([u, v]: Pt): Pt => [clamp(u), clamp(v)]
const copyPts = (vs: Pt[]) => vs.map((v) => [...v] as Pt)

/** Fläche einer Zone in m² (Eckpunkte normiert auf die Karte) */
function areaM2(vs: Pt[], cells: [number, number]): number {
    let a = 0
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) a += (vs[j][0] + vs[i][0]) * (vs[j][1] - vs[i][1])
    return Math.abs(a / 2) * cells[0] * cells[1] / (PX_PER_M * PX_PER_M)
}

/** Zone unter dem Punkt (oberste zuerst) oder No-Go-Linie in Reichweite */
function hitBoundary(list: Boundary[], x: number, y: number, vp: MapViewport, lines: boolean): Boundary | undefined {
    const p = vp.toMap(x, y)
    for (const b of [...list].reverse()) {
        if (b.type === 'polygon' && insidePolygon(p, b.vertices)) return b
        if (lines && b.type === 'polyline') {
            const ps = b.vertices.map(vp.toScreen)
            for (let i = 1; i < ps.length; i++) if (distToSegment([x, y], ps[i - 1], ps[i]) < LINE_HIT_PX) return b
        }
    }
    return undefined
}

/** Nachbarn von Eckpunkt i (Vorgänger, Nachfolger) */
function neighbours(i: number, vs: Pt[], closed: boolean): Pt[] {
    const n = vs.length
    const near: Pt[] = []
    if (closed || i > 0) near.push(vs[(i - 1 + n) % n])
    if (closed || i < n - 1) near.push(vs[(i + 1) % n])
    return near
}

/** Punkt immer auf den Raster der Karte (Linien zwischen den Punkten); welche Rasterlinie, bestimmen die Nachbarn
 *  oder Eckpunkte anderer Zonen auf fast gleicher Höhe/Breite (verlängerte Wände) */
function snapPoint(p: Pt, near: Pt[], others: Boundary[], vp: MapViewport): [Pt, Guides] {
    const [cu, cv] = vp.cells
    const tu = SNAP_PX / (cu * vp.scale), tv = SNAP_PX / (cv * vp.scale)
    const g: Guides = {}
    let du = tu, dv = tv
    for (const q of [...near, ...others.flatMap((b) => b.vertices)]) {
        const eu = Math.abs(q[0] - p[0]), ev = Math.abs(q[1] - p[1])
        if (eu < du) { du = eu; g.u = q }
        if (ev < dv) { dv = ev; g.v = q }
    }
    const u = Math.round((g.u ? g.u[0] : p[0]) * cu) / cu
    const v = Math.round((g.v ? g.v[1] : p[1]) * cv) / cv
    const at = clampPt([u, v])
    return [at, { ...g, at }]
}

/** gestrichelte Hilfslinie vom Eckpunkt, an dem eingerastet wurde, bis über den Punkt hinaus */
function drawGuides(g: CanvasRenderingContext2D, vp: MapViewport, gd: Guides, color: string) {
    if (!gd.at || (!gd.u && !gd.v)) return
    const [px, py] = vp.toScreen(gd.at)
    g.save()
    g.lineWidth = 1.25
    g.strokeStyle = color
    g.globalAlpha = 0.7
    g.setLineDash([2, 4])
    for (const [q, axis] of [[gd.u, 1], [gd.v, 0]] as const) {
        if (!q) continue
        const [qx, qy] = vp.toScreen(q)
        const ext = 24
        g.beginPath()
        if (axis === 1) {
            const s = Math.sign(py - qy) || 1
            g.moveTo(px, Math.min(qy, py) - (s < 0 ? ext : 0)); g.lineTo(px, Math.max(qy, py) + (s > 0 ? ext : 0))
        } else {
            const s = Math.sign(px - qx) || 1
            g.moveTo(Math.min(qx, px) - (s < 0 ? ext : 0), py); g.lineTo(Math.max(qx, px) + (s > 0 ? ext : 0), py)
        }
        g.stroke()
    }
    g.restore()
}

function cssVar(name: string): string {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** nummerierte Marke in der Zone (Reihenfolge der Reinigung) */
function badge(g: CanvasRenderingContext2D, x: number, y: number, text: string, dim = false) {
    g.beginPath()
    g.arc(x, y, 11, 0, Math.PI * 2)
    g.fillStyle = dim ? cssVar('--surface-3') : cssVar('--accent')
    g.fill()
    g.lineWidth = 2
    g.strokeStyle = cssVar('--surface')
    g.stroke()
    g.fillStyle = dim ? cssVar('--text-2') : cssVar('--on-accent')
    g.font = `600 12px ${cssVar('--font-sans')}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, x, y + 0.5)
}

function outline(g: CanvasRenderingContext2D, vp: MapViewport, b: Boundary, width: number) {
    g.beginPath()
    b.vertices.forEach((p, i) => (i ? g.lineTo(...vp.toScreen(p)) : g.moveTo(...vp.toScreen(p))))
    if (b.type === 'polygon') g.closePath()
    g.lineWidth = width
    g.strokeStyle = b.color || cssVar('--danger')
    g.stroke()
}

function handle(g: CanvasRenderingContext2D, x: number, y: number, r: number, fillC: string, strokeC: string) {
    g.beginPath()
    g.arc(x, y, r, 0, Math.PI * 2)
    g.fillStyle = fillC
    g.fill()
    g.lineWidth = 2.5
    g.strokeStyle = strokeC
    g.stroke()
}

export function MapPage() {
    const { t, locale } = useI18n()
    const s = useStore()
    const [mapsVersion, setMapsVersion] = useState(0)
    const maps = useMaps(s.serial, mapsVersion)
    const [chosen, setChosen] = useState<string>()
    const current = (chosen && maps.data?.some((m) => m.id === chosen) ? chosen : undefined) ?? activeMap(maps.data)?.id
    const map = maps.data?.find((m) => m.id === current)
    const data = useMapData(s.serial, current)
    const [version, setVersion] = useState(0)
    const bounds = useBoundaries(s.serial, current, s.connected, version)
    // Live nur auf der Karte, auf der Reksio gerade fährt
    const live = useLive(current === activeMap(maps.data)?.id ? data.data : undefined)

    const [tab, setTab] = useState<Tab>('clean')
    const [tool, setTool] = useState<Tool>('select')
    const [sketch, setSketch] = useState<Pt[]>([]) // gesetzte Punkte beim Zeichnen von Vieleck/Linie
    const [pointer, setPointer] = useState<Pt>() // Mauszeiger beim Zeichnen (Kartenkoordinaten)
    const [hoverId, setHoverId] = useState<string>()
    const [selected, setSelected] = useState<string[]>([])
    const [draft, setDraft] = useState<Draft>()
    const [busy, setBusy] = useState<'clean' | 'cancel' | 'save' | 'delete'>()
    const [toast, setToast] = useState<string>()
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [error, setError] = useState<string>()
    const drag = useRef<Drag>(undefined)
    const guides = useRef<Guides>({})
    const history = useRef<Pt[][]>([])
    const [historyLen, setHistoryLen] = useState(0)
    const vpRef = useRef<() => MapViewport>(undefined)

    const all = useMemo(() => bounds.data ?? [], [bounds.data])
    useEffect(() => {
        if (!bounds.error) return
        const id = setTimeout(() => setVersion((v) => v + 1), 3000)
        return () => clearTimeout(id)
    }, [bounds.error])
    // „zuletzt gereinigt“ neu berechnen, sobald sich der Zustand von Reksio ändert (z. B. Zone fertig)
    const [histVersion, setHistVersion] = useState(0)
    useEffect(() => { setHistVersion((v) => v + 1) }, [s.robot?.state])
    const zoneHist = useZoneHistory(s.serial, current, histVersion)
    const [showHistory, setShowHistory] = useState(false)
    useEffect(() => { setShowHistory(false) }, [current, tab])
    const cleaned = (id: string) => {
        const last = zoneHist.data?.[id]?.last
        if (!last) return undefined
        const today = new Date(s.now * 1000).setHours(0, 0, 0, 0)
        const days = last * 1000 >= today ? 0 : Math.ceil((today - last * 1000) / 86400000)
        return days === 0 ? t.zones.cleanedToday : days === 1 ? t.zones.cleanedYesterday : fill(t.zones.cleanedDays, { n: days })
    }
    const zones = all.filter(isZone)
    const queue = s.zoneQueue && s.zoneQueue.mapId === current ? s.zoneQueue : undefined
    const cells: [number, number] = data.data ? [data.data.width, data.data.height] : [1, 1]
    const dirty = !!draft && (draft.isNew || JSON.stringify(draft.b) !== draft.orig)
    const drawing = tool === 'poly' || tool === 'line'
    // Einrasten: immer auf den Raster, Alt platziert frei
    const snap = (p: Pt, near: Pt[], vp: MapViewport, mods?: Mods): [Pt, Guides] =>
        mods?.alt ? [clampPt(p), {}] : snapPoint(p, near, all.filter((o) => o.id !== draft?.b.id), vp)
    const sketchNear = () => (sketch.length ? [sketch[sketch.length - 1], sketch[0]] : [])

    const resetHistory = () => { history.current = []; setHistoryLen(0) }
    const pushHistory = (vs: Pt[]) => {
        history.current.push(copyPts(vs))
        if (history.current.length > HISTORY_MAX) history.current.shift()
        setHistoryLen(history.current.length)
    }

    useEffect(() => { setSelected([]); setDraft(undefined); setSketch([]); setTool('select') }, [current])
    useEffect(() => { setDraft(undefined); setError(undefined); setSketch([]); setTool('select'); setHoverId(undefined) }, [tab])
    // gelöschte Zonen aus der Auswahl nehmen
    useEffect(() => { setSelected((sel) => sel.filter((id) => all.some((b) => b.id === id))) }, [all])

    const toggle = (id: string) => setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]))
    const edit = (b: Boundary) => {
        const copy = { ...b, vertices: copyPts(b.vertices) }
        setDraft({ b: copy, isNew: false, orig: JSON.stringify(copy) })
        setError(undefined)
        resetHistory()
    }

    const newDraft = (type: Boundary['type'], vertices: Pt[], fn?: Boundary['function']) => {
        const used = new Set(all.map((b) => b.color.toLowerCase()))
        const nogo = fn === 'nogo'
        setDraft({
            isNew: true,
            b: {
                id: uuid(), type, enabled: true, vertices: vertices.map(clampPt),
                name: type === 'polygon' && !nogo ? `${t.zones.zone} ${zones.length + 1}` : '',
                color: nogo ? NOGO_COLOR : PRESETS.find((c) => !used.has(c)) ?? PRESETS[all.length % PRESETS.length],
                ...(fn ? { function: fn } : {}),
            },
        })
        setError(undefined)
        resetHistory()
    }

    /** neue Form in der Bildmitte (vor allem fürs Handy) */
    const create = (type: Boundary['type'], fn?: Boundary['function']) => {
        const vp = vpRef.current?.()
        if (!vp) return
        const [cx, cy] = vp.center()
        // etwa 1,6 m groß, am Bildschirm aber mindestens gut greifbar
        const half = Math.max(PX_PER_M * 0.8, 70 / vp.scale)
        const du = half / vp.cells[0], dv = half / vp.cells[1]
        setTool('select')
        setSketch([])
        newDraft(type, type === 'polygon'
            ? [[cx - du, cy - dv], [cx + du, cy - dv], [cx + du, cy + dv], [cx - du, cy + dv]]
            : [[cx - du, cy], [cx + du, cy]], fn)
    }

    const chooseTool = (k: Tool) => {
        if (k !== 'select' && (dirty || !s.connected)) return
        setSketch([])
        setPointer(undefined)
        if (k !== 'select') setDraft(undefined)
        setTool(k)
    }

    const finishSketch = () => {
        const closed = tool === 'poly'
        if (sketch.length < (closed ? 3 : 2)) return
        newDraft(closed ? 'polygon' : 'polyline', sketch)
        setSketch([])
        setPointer(undefined)
        setTool('select')
    }

    const undo = () => {
        if (sketch.length) return setSketch((sk) => sk.slice(0, -1))
        const vs = history.current.pop()
        setHistoryLen(history.current.length)
        if (vs) setDraft((d) => d && { ...d, vertex: undefined, b: { ...d.b, vertices: vs } })
    }

    const minPoints = draft?.b.type === 'polygon' ? 3 : 2
    const deleteVertex = (i = draft?.vertex) => {
        if (!draft || i === undefined || draft.b.vertices.length <= minPoints) return
        pushHistory(draft.b.vertices)
        setDraft({ ...draft, vertex: undefined, b: { ...draft.b, vertices: draft.b.vertices.filter((_, j) => j !== i) } })
    }

    /** Pfeiltasten: gewählten Eckpunkt oder ganze Form um Kartenzellen verschieben */
    const nudge = (du: number, dv: number) => {
        if (!draft) return
        pushHistory(draft.b.vertices)
        const i = draft.vertex
        const vs = draft.b.vertices.map((p, j) => (i === undefined || i === j ? clampPt([p[0] + du, p[1] + dv]) : p))
        setDraft({ ...draft, b: { ...draft.b, vertices: vs } })
    }

    /** Änderung auf die aktuelle Liste vom Roboter anwenden: eine veraltete oder leere Ansicht überschreibt nie andere Zonen */
    const save = async (change: (list: Boundary[]) => Boundary[], done = t.zones.saved): Promise<boolean> => {
        // Gen4 bekommt die Zonen mit der ganzen Karte: nicht während einer Reinigung
        if (isGen4(s.serial) && map?.enabled && isCleaning(s.robot)) {
            setToast(t.zones.busySave)
            return false
        }
        setBusy('save')
        try {
            const fresh = await robot.getBoundaries(s.serial!, current!)
            if (!Array.isArray(fresh)) throw new Error('boundaries not loaded')
            const list = change(fresh)
            const res = await robot.setBoundaries(s.serial!, current!, list.map((b) => b.type === 'polygon'
                ? { ...b, relevancy: interiorPoint(b.vertices) }
                : { id: b.id, type: b.type, name: b.name, color: b.color, enabled: b.enabled ?? true, vertices: b.vertices, function: b.function }), !!map?.enabled)
            // Reksio bestätigt setMapBoundaries nur mit einer leeren Antwort: nachlesen, ob alles angekommen ist
            if ((res as { emptyReply?: boolean } | undefined)?.emptyReply) {
                const now = await robot.getBoundaries(s.serial!, current!)
                const key = (bs: Boundary[]) => bs.map((b) => `${b.id}|${b.name}|${b.vertices.length}`).sort().join()
                if (key(now) !== key(list)) throw new Error('boundaries not applied')
            }
            setVersion((v) => v + 1)
            setDraft(undefined)
            setToast(done)
            return true
        } catch {
            setToast(t.zones.saveFailed)
            return false
        } finally {
            setBusy(undefined)
        }
    }

    const saveDraft = () => {
        if (!draft || busy || !s.connected) return
        const b = draft.b
        const shapeError = validateShape(b.vertices, b.type === 'polygon')
        if (shapeError) return setError(t.zones[shapeError])
        if (isZone(b) && !b.name.trim()) return setError(t.zones.nameMissing)
        setError(undefined)
        const nb = { ...b, name: b.name.trim() }
        save((list) => (draft.isNew || !list.some((x) => x.id === nb.id) ? [...list, nb] : list.map((x) => (x.id === nb.id ? nb : x))))
    }

    const remove = () => {
        if (!draft) return
        setConfirmDelete(false)
        if (draft.isNew) return setDraft(undefined)
        save((list) => list.filter((x) => x.id !== draft.b.id))
    }

    const cleanSelected = async () => {
        setBusy('clean')
        try {
            const p = getPrefs()
            const q = await robot.cleanZones(s.serial!, current!, selected.map((id) => ({ id, name: all.find((b) => b.id === id)?.name ?? '' })), p.mode, p.navigation)
            if (q) s.setZoneQueue(q)
            setSelected([])
            await s.refreshRobot()
        } catch {
            setToast(t.actions.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const cancelQueue = async () => {
        setBusy('cancel')
        try {
            await api.cancelZones(s.serial!)
            s.setZoneQueue(null)
        } catch {
            setToast(t.actions.failed)
        } finally {
            setBusy(undefined)
        }
    }

    // Tastatur im Bearbeiten-Modus (Desktop); immer die aktuelle Fassung aufrufen
    const onKey = (e: KeyboardEvent) => {
        if (document.querySelector('dialog[open]')) return
        const el = e.target as HTMLElement
        const typing = !!el.closest('input, textarea, select, [contenteditable="true"]')
        const mod = e.ctrlKey || e.metaKey
        if (e.key === 'Enter' && !e.isComposing && !el.closest('button')) {
            if (sketch.length) finishSketch()
            else if (draft) saveDraft()
            else return
            e.preventDefault()
            return
        }
        if (typing) return
        if (e.key === 'Escape') {
            if (sketch.length) setSketch([])
            else if (tool !== 'select') setTool('select')
            else if (draft) setDraft(undefined)
            else return
            e.preventDefault()
            return
        }
        if (mod && e.key.toLowerCase() === 'z') { undo(); e.preventDefault(); return }
        if (mod || e.altKey) return
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (sketch.length) setSketch((sk) => sk.slice(0, -1))
            else if (draft?.vertex !== undefined) deleteVertex()
            else return
            e.preventDefault()
            return
        }
        const k = ({ v: 'select', r: 'rect', p: 'poly', l: 'line' } as Record<string, Tool>)[e.key.toLowerCase()]
        if (k) { chooseTool(k); e.preventDefault(); return }
        const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key]
        if (dir && draft && !el.closest('[role="radiogroup"]')) {
            const step = e.shiftKey ? 10 : 1
            nudge(dir[0] * step / cells[0], dir[1] * step / cells[1])
            e.preventDefault()
        }
    }
    const keyRef = useRef(onKey)
    keyRef.current = onKey
    useEffect(() => {
        if (tab !== 'edit') return
        const h = (e: KeyboardEvent) => keyRef.current(e)
        window.addEventListener('keydown', h)
        return () => window.removeEventListener('keydown', h)
    }, [tab])

    const hoverOutline = (g: CanvasRenderingContext2D, vp: MapViewport, skip?: string) => {
        const b = hoverId && hoverId !== skip ? all.find((x) => x.id === hoverId) : undefined
        if (b) outline(g, vp, b, 3.5)
    }

    // Karte: im Reinigen-Modus Zonen antippen, im Bearbeiten-Modus zeichnen, Form wählen und Eckpunkte ziehen
    const interact: MapInteraction | undefined = !data.data || tab === 'maps' ? undefined : tab === 'clean'
        ? {
            tap: (x, y, vp) => {
                if (queue) return
                const b = hitBoundary(zones, x, y, vp, false)
                if (b) toggle(b.id)
            },
            hover: (p) => {
                const b = p && !queue ? hitBoundary(zones, p.x, p.y, p.vp, false) : undefined
                setHoverId(b?.id)
                return b ? 'pointer' : undefined
            },
            overlay: (g, vp) => {
                const order = queue ? queue.zones.map((z) => z.id) : selected
                if (hoverId && !order.includes(hoverId)) hoverOutline(g, vp)
                order.forEach((id, i) => {
                    const b = all.find((x) => x.id === id)
                    if (!b) return
                    outline(g, vp, b, queue && i !== queue.index ? 2 : 4)
                    const [bx, by] = vp.toScreen(b.relevancy ?? interiorPoint(b.vertices))
                    const done = !!queue && i < queue.index
                    badge(g, bx, by, done ? '✓' : String(i + 1), done)
                })
            },
        }
        : {
            tap: (x, y, vp, mods) => {
                if (drawing) {
                    const ps = sketch.map(vp.toScreen)
                    const last = ps[ps.length - 1]
                    // zweiter Klick eines Doppelklicks: kein doppelter Punkt
                    if (last && Math.hypot(last[0] - x, last[1] - y) < HANDLE_PX) return
                    if (tool === 'poly' && ps.length >= 3 && Math.hypot(ps[0][0] - x, ps[0][1] - y) < HANDLE_PX) return finishSketch()
                    setSketch([...sketch, snap(vp.toMap(x, y), sketchNear(), vp, mods)[0]])
                    return
                }
                if (tool !== 'select') return
                const b = hitBoundary(all.filter((o) => o.id !== draft?.b.id), x, y, vp, true)
                if (draft) {
                    if (dirty) return
                    if (b) edit(b)
                    else setDraft(undefined)
                    return
                }
                if (b) edit(b)
            },
            doubleTap: () => {
                if (!drawing) return false
                finishSketch()
                return true
            },
            context: (x, y, vp) => {
                if (sketch.length) { setSketch(sketch.slice(0, -1)); return true }
                if (!draft) return false
                const i = draft.b.vertices.map(vp.toScreen).findIndex(([px, py]) => Math.hypot(px - x, py - y) < HANDLE_PX)
                if (i < 0) return false
                deleteVertex(i)
                return true
            },
            hover: (p) => {
                if (!p) { setHoverId(undefined); setPointer(undefined); guides.current = {}; return undefined }
                const { x, y, vp } = p
                if (tool !== 'select') {
                    setHoverId(undefined)
                    if (drawing && sketch.length) {
                        const [q, g] = snap(vp.toMap(x, y), sketchNear(), vp, p.mods)
                        guides.current = g
                        setPointer(q)
                    }
                    return 'crosshair'
                }
                if (draft) {
                    const ps = draft.b.vertices.map(vp.toScreen)
                    if (ps.some(([px, py]) => Math.hypot(px - x, py - y) < HANDLE_PX)) return 'move'
                    const closed = draft.b.type === 'polygon'
                    const edges = closed ? ps.length : ps.length - 1
                    for (let i = 0; i < edges; i++) {
                        const a = ps[i], c = ps[(i + 1) % ps.length]
                        if (Math.hypot((a[0] + c[0]) / 2 - x, (a[1] + c[1]) / 2 - y) < HANDLE_PX) return 'copy'
                    }
                    const onShape = closed ? insidePolygon(vp.toMap(x, y), draft.b.vertices)
                        : ps.some((q, i) => i > 0 && distToSegment([x, y], ps[i - 1], q) < LINE_HIT_PX)
                    if (onShape) { setHoverId(undefined); return 'move' }
                }
                const b = hitBoundary(all.filter((o) => o.id !== draft?.b.id), x, y, vp, true)
                setHoverId(b?.id)
                return b && !dirty ? 'pointer' : undefined
            },
            grab: (x, y, vp, mods) => {
                guides.current = {}
                if (tool === 'rect') {
                    const p = snap(vp.toMap(x, y), [], vp, mods)[0]
                    drag.current = { kind: 'rect', from: p }
                    newDraft('polygon', [p, p, p, p])
                    return true
                }
                if (tool !== 'select' || !draft) return false
                const vs = draft.b.vertices
                const closed = draft.b.type === 'polygon'
                const ps = vs.map(vp.toScreen)
                const vi = ps.findIndex(([px, py]) => Math.hypot(px - x, py - y) < HANDLE_PX)
                if (vi >= 0) {
                    pushHistory(vs)
                    drag.current = { kind: 'vertex', i: vi }
                    setDraft({ ...draft, vertex: vi })
                    return true
                }
                // Mittelpunkt einer Kante: neuen Eckpunkt einfügen
                const edges = closed ? vs.length : vs.length - 1
                for (let i = 0; i < edges; i++) {
                    const a = ps[i], c = ps[(i + 1) % vs.length]
                    if (Math.hypot((a[0] + c[0]) / 2 - x, (a[1] + c[1]) / 2 - y) < HANDLE_PX) {
                        pushHistory(vs)
                        const nv = [...vs.slice(0, i + 1), snap(vp.toMap(x, y), [vs[i], vs[(i + 1) % vs.length]], vp, mods)[0], ...vs.slice(i + 1)] as Pt[]
                        drag.current = { kind: 'vertex', i: i + 1 }
                        setDraft({ ...draft, vertex: i + 1, b: { ...draft.b, vertices: nv } })
                        return true
                    }
                }
                const p = vp.toMap(x, y)
                const onShape = closed ? insidePolygon(p, vs)
                    : ps.some((q, i) => i > 0 && distToSegment([x, y], ps[i - 1], q) < LINE_HIT_PX)
                if (onShape) {
                    pushHistory(vs)
                    drag.current = { kind: 'move', from: p, orig: vs }
                    setDraft({ ...draft, vertex: undefined })
                    return true
                }
                return false
            },
            drag: (x, y, vp, mods) => {
                const d = drag.current
                if (!d) return
                const p = clampPt(vp.toMap(x, y))
                if (d.kind === 'rect') {
                    const [a, b] = d.from
                    const [q, g] = snap(p, [], vp, mods)
                    guides.current = g
                    setDraft((cur) => cur && { ...cur, b: { ...cur.b, vertices: [[a, b], [q[0], b], q, [a, q[1]]] } })
                } else if (d.kind === 'vertex') {
                    setDraft((cur) => {
                        if (!cur) return cur
                        const [q, g] = snap(p, neighbours(d.i, cur.b.vertices, cur.b.type === 'polygon'), vp, mods)
                        guides.current = g
                        return { ...cur, b: { ...cur.b, vertices: cur.b.vertices.map((o, i) => (i === d.i ? q : o)) } }
                    })
                } else {
                    // Form als Ganzes verschieben, ohne über den Kartenrand hinaus
                    const us = d.orig.map((o) => o[0]), vs = d.orig.map((o) => o[1])
                    // in ganzen Rasterschritten, damit Eckpunkte auf dem Raster bleiben
                    const [cu, cv] = vp.cells
                    const step = (dd: number, c: number) => (mods.alt ? dd : Math.round(dd * c) / c)
                    const du = Math.min(1 - Math.max(...us), Math.max(-Math.min(...us), step(p[0] - d.from[0], cu)))
                    const dv = Math.min(1 - Math.max(...vs), Math.max(-Math.min(...vs), step(p[1] - d.from[1], cv)))
                    setDraft((cur) => cur && { ...cur, b: { ...cur.b, vertices: d.orig.map(([a, b]) => [a + du, b + dv]) } })
                }
            },
            release: () => {
                const d = drag.current
                drag.current = undefined
                guides.current = {}
                if (d?.kind !== 'rect') return setDraft((cur) => cur && { ...cur })
                const vp = vpRef.current?.()
                const vs = draft?.b.vertices
                const [a, c] = vs && vp ? [vp.toScreen(vs[0]), vp.toScreen(vs[2])] : [[0, 0], [0, 0]]
                if (Math.abs(a[0] - c[0]) < MIN_RECT_PX || Math.abs(a[1] - c[1]) < MIN_RECT_PX) setDraft(undefined)
                setTool('select')
            },
            overlay: (g, vp) => {
                const surface = cssVar('--surface'), accent = cssVar('--accent')
                if (!draft) hoverOutline(g, vp)
                if (sketch.length) {
                    const color = tool === 'line' ? cssVar('--danger') : accent
                    const ps = sketch.map(vp.toScreen)
                    const rubber = pointer ? [...ps, vp.toScreen(pointer)] : ps
                    g.beginPath()
                    rubber.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p)))
                    if (tool === 'poly' && rubber.length >= 3) {
                        g.closePath()
                        g.globalAlpha = 0.15
                        g.fillStyle = color
                        g.fill()
                        g.globalAlpha = 1
                    }
                    g.setLineDash([6, 4])
                    g.lineWidth = 2.5
                    g.strokeStyle = color
                    g.stroke()
                    g.setLineDash([])
                    ps.forEach(([px, py], i) => handle(g, px, py, i === 0 && tool === 'poly' && ps.length >= 3 ? 8 : 5.5, i === 0 ? color : surface, i === 0 ? surface : color))
                }
                // Hilfslinien beim Einrasten (verlängerte Kanten)
                if ((sketch.length && pointer) || drag.current) drawGuides(g, vp, guides.current, accent)
                if (!draft) return
                const b = draft.b
                const closed = b.type === 'polygon'
                const ps = b.vertices.map(vp.toScreen)
                if (ps.length < 2) return
                g.beginPath()
                ps.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p)))
                if (closed) {
                    g.closePath()
                    g.globalAlpha = 0.25
                    g.fillStyle = b.color
                    g.fill()
                    g.globalAlpha = 1
                } else {
                    g.setLineDash([6, 4])
                }
                g.lineWidth = 3
                g.strokeStyle = b.color
                g.stroke()
                g.setLineDash([])
                // Kantenmitten: kleine Punkte zum Einfügen
                const edges = closed ? ps.length : ps.length - 1
                for (let i = 0; i < edges; i++) {
                    const a = ps[i], c = ps[(i + 1) % ps.length]
                    g.beginPath()
                    g.arc((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, 4.5, 0, Math.PI * 2)
                    g.fillStyle = surface
                    g.globalAlpha = 0.85
                    g.fill()
                    g.globalAlpha = 1
                    g.lineWidth = 1.5
                    g.strokeStyle = b.color
                    g.stroke()
                }
                ps.forEach(([px, py], i) => handle(g, px, py, 7, i === draft.vertex ? accent : surface, i === draft.vertex ? surface : b.color))
            },
        }

    // Laden fehlgeschlagen: nie „Keine Zonen“ zeigen, sonst sieht es aus, als wären sie gelöscht
    const zonesEmpty = bounds.error
        ? <Empty icon={<Shapes />} label={t.zones.loadFailed}
            action={<Button size="s" label={t.common.retry} onClick={() => setVersion((v) => v + 1)} />} />
        : <Empty icon={<Shapes />} label={!current ? t.map.noMap : bounds.loading || !bounds.data ? t.common.loading : t.zones.none} />

    const shown = tab === 'edit' && draft ? all.filter((b) => b.id !== draft.b.id) : all
    // Gen4 kennt die Zonen nur auf der verwendeten Karte
    const canStart = s.connected && !!s.robot?.availableCommands?.start && (!isGen4(s.serial) || !!map?.enabled)
    const rowHover = (id: string) => ({ onMouseEnter: () => setHoverId(id), onMouseLeave: () => setHoverId(undefined) })

    const toolButtons: [Tool, typeof Square, string][] = [
        ['select', MousePointer2, t.zones.toolSelect],
        ['rect', Square, t.zones.toolRect],
        ['poly', Pentagon, t.zones.toolPoly],
        ['line', Spline, t.zones.toolLine],
    ]
    const lidarTool = tab === 'clean' && lidarAvailable(live)
        ? <><div className="maptools-g"><LidarToggle live={live} /></div><LidarTag live={live} /></> : undefined
    const tools = tab === 'edit' && data.data ? (<>
        <div className="maptools-g" role="toolbar" aria-label={t.zones.tools}>
            {toolButtons.map(([k, Icon, label]) => (
                <IconButton key={k} size="s" icon={<Icon />} label={label} aria-pressed={tool === k}
                    aria-keyshortcuts={label.slice(-2, -1)} disabled={k !== 'select' && (dirty || !s.connected)} onClick={() => chooseTool(k)} />
            ))}
        </div>
        {(sketch.length > 0 || (draft && historyLen > 0)) && (
            <div className="maptools-g">
                <IconButton size="s" icon={<Undo2 />} label={t.zones.undo} aria-keyshortcuts="Control+Z" onClick={undo} />
                {sketch.length > 0 && <IconButton size="s" icon={<Check />} label={t.zones.finish} aria-keyshortcuts="Enter"
                    disabled={sketch.length < (tool === 'poly' ? 3 : 2)} onClick={finishSketch} />}
            </div>
        )}
    </>) : lidarTool

    return (
        <div className="mappage">
            {(maps.data?.length ?? 0) > 1 && (
                <Segmented label={t.nav.map} value={current ?? ''} onChange={setChosen}
                    options={maps.data!.map((m) => ({ value: m.id, label: m.name || m.id }))} />
            )}
            <div className="mappage-body">
                <div className="mappage-view">
                    {data.data
                        ? <MapView data={data.data} boundaries={shown} live={live} label={map?.name || t.map.floor} fill
                            interact={interact} viewportRef={vpRef} tools={tools} />
                        : <Empty icon={<MapIcon />} label={data.loading || maps.loading ? t.common.loading : t.map.noMap} />}
                </div>
                <Card className="zpanel">
                    <Segmented<Tab> label={t.map.zones} value={tab} onChange={setTab}
                        options={[{ value: 'clean', label: t.zones.clean }, { value: 'edit', label: t.zones.edit }, { value: 'maps', label: t.maps.title }]} />

                    {tab === 'maps' && (
                        <MapsPanel maps={maps.data ?? []} current={current} onChoose={setChosen}
                            onChanged={() => setMapsVersion((v) => v + 1)} onToast={setToast} />
                    )}

                    {tab === 'clean' && queue && <QueueView queue={queue} busy={busy === 'cancel'} onCancel={cancelQueue} />}

                    {tab === 'clean' && !queue && (<>
                        {zones.length > 0 && (
                            <div className="zpanel-top">
                                <CleanModes />
                                <div className="actions">
                                    {selected.length > 0 && <Button variant="ghost" label={t.zones.clear} onClick={() => setSelected([])} />}
                                    <Button variant="primary" icon={<Sparkles />} loading={busy === 'clean'}
                                        label={busy === 'clean' ? t.actions.sending : selected.length > 1 ? fill(t.zones.cleanN, { n: selected.length }) : t.zones.cleanOne}
                                        disabled={!selected.length || !canStart || !!busy} onClick={cleanSelected} />
                                </div>
                            </div>
                        )}
                        {zones.length ? (
                            <ul className="rows">
                                {zones.map((b) => {
                                    const n = selected.indexOf(b.id)
                                    return (
                                        <li key={b.id}>
                                            <button type="button" className="row zrow" aria-pressed={n >= 0} onClick={() => toggle(b.id)} {...rowHover(b.id)}>
                                                <span className="zrow-c" style={{ ['--c' as string]: b.color }} aria-hidden>{n >= 0 ? n + 1 : ''}</span>
                                                <span className="row-main">
                                                    <Label className="row-t">{b.name || t.zones.unnamed}</Label>
                                                    <Label className="row-s">{[fill(t.zones.area, { a: fmtNumber(locale, areaM2(b.vertices, cells), 1) }), cleaned(b.id)]
                                                        .filter(Boolean).join(' · ')}</Label>
                                                </span>
                                                {n >= 0 && <Check className="row-i zrow-ok" />}
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        ) : zonesEmpty}
                    </>)}

                    {tab === 'edit' && !draft && showHistory && current && (
                        <BoundaryHistory mapId={current} current={all} busy={busy === 'save'} onClose={() => setShowHistory(false)}
                            onRestore={async (list) => { if (await save(() => list, t.zones.restored)) setShowHistory(false) }} />
                    )}

                    {tab === 'edit' && !draft && !showHistory && (<>
                        {all.length ? (
                            <ul className="rows">
                                {all.map((b) => (
                                    <li key={b.id}>
                                        <button type="button" className="row zrow" onClick={() => edit(b)} {...rowHover(b.id)}>
                                            <span className={`zrow-c zrow-c--${isNoGoArea(b) ? 'nogo' : b.type}`} style={{ ['--c' as string]: b.color || 'var(--danger)' }} aria-hidden />
                                            <span className="row-main">
                                                <Label className="row-t">{b.name || (b.type === 'polyline' ? t.zones.line : isNoGoArea(b) ? t.zones.noGoArea : t.zones.unnamed)}</Label>
                                                <Label className="row-s">{b.type === 'polygon'
                                                    ? [isNoGoArea(b) && b.name ? t.zones.noGoArea : '', fill(t.zones.area, { a: fmtNumber(locale, areaM2(b.vertices, cells), 1) })].filter(Boolean).join(' · ')
                                                    : b.enabled === false ? `${t.zones.line} · ${t.common.none}` : t.zones.line}</Label>
                                            </span>
                                            <Pencil className="row-i" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : zonesEmpty}
                        <div className="actions zpanel-foot">
                            {!isGen4(s.serial) && <Button variant="ghost" icon={<History />} label={t.zones.history} disabled={!current} onClick={() => setShowHistory(true)} />}
                            <Button icon={<Route />} label={t.zones.newLine} disabled={!s.connected || !data.data || !bounds.data} onClick={() => create('polyline')} />
                            {isGen4(s.serial) && <Button icon={<Ban />} label={t.zones.noGoArea} disabled={!s.connected || !data.data || !bounds.data} onClick={() => create('polygon', 'nogo')} />}
                            <Button icon={<Plus />} label={t.zones.newZone} disabled={!s.connected || !data.data || !bounds.data} onClick={() => create('polygon')} />
                        </div>
                    </>)}

                    {tab === 'edit' && draft && (
                        <div className="zedit">
                            <div className="zedit-h">
                                <Label className="zedit-t">{isNoGoArea(draft.b) ? t.zones.noGoArea : draft.b.type === 'polygon' ? t.zones.zone : t.zones.line}</Label>
                                <IconButton size="s" icon={<X />} label={t.common.cancel} aria-keyshortcuts="Escape" onClick={() => setDraft(undefined)} />
                            </div>
                            {draft.b.type === 'polygon' && isGen4(s.serial) && (
                                <div className="field"><Label className="field-l">{t.zones.kind}</Label>
                                    <Segmented<'cleaning' | 'nogo'> label={t.zones.kind} value={draft.b.function ?? 'cleaning'}
                                        onChange={(v) => { setError(undefined); setDraft({ ...draft, b: { ...draft.b, function: v } }) }}
                                        options={[{ value: 'cleaning', label: t.zones.zone }, { value: 'nogo', label: t.zones.noGoArea }]} />
                                </div>
                            )}
                            <InputRow label={t.zones.name} value={draft.b.name} invalid={error === t.zones.nameMissing}
                                onChange={(v) => setDraft({ ...draft, b: { ...draft.b, name: v.slice(0, 40) } })} />
                            <div className="field">
                                <Label className="field-l">{t.zones.color}</Label>
                                <div className="swatches" role="radiogroup" aria-label={t.zones.color}>
                                    {PRESETS.map((c) => (
                                        <button key={c} type="button" role="radio" className="swatch" style={{ ['--c' as string]: c }}
                                            aria-checked={draft.b.color.toLowerCase() === c} aria-label={c}
                                            onClick={() => setDraft({ ...draft, b: { ...draft.b, color: c } })} />
                                    ))}
                                </div>
                            </div>
                            {draft.b.type === 'polyline' && (
                                <Switch label={t.zones.active} checked={draft.b.enabled !== false}
                                    onChange={(v) => setDraft({ ...draft, b: { ...draft.b, enabled: v } })} />
                            )}
                            {draft.b.type === 'polygon' && <Label className="field-l">{fill(t.zones.area, { a: fmtNumber(locale, areaM2(draft.b.vertices, cells), 1) })}</Label>}
                            {error && <div className="zedit-err" role="alert">{error}</div>}
                            <div className="actions">
                                {draft.vertex !== undefined && draft.b.vertices.length > minPoints && (
                                    <Button variant="ghost" label={t.zones.deletePoint} aria-keyshortcuts="Delete" onClick={() => deleteVertex()} />
                                )}
                                <Button variant="danger" icon={<Trash2 />} label={t.zones.delete} disabled={!!busy}
                                    loading={busy === 'delete'} onClick={() => (draft.isNew ? setDraft(undefined) : setConfirmDelete(true))} />
                                <Button variant="primary" label={busy === 'save' ? t.actions.sending : t.common.save} loading={busy === 'save'}
                                    aria-keyshortcuts="Enter" disabled={!s.connected || !!busy} onClick={saveDraft} />
                            </div>
                        </div>
                    )}
                </Card>
            </div>
            {tab === 'clean' && <Legend boundaries={all.filter((b) => !isZone(b))} noGo={t.map.noGo} noGoArea={t.zones.noGoArea} />}
            <Confirm open={confirmDelete} title={fill(t.zones.deleteConfirm, { name: draft?.b.name || (draft && isNoGoArea(draft.b) ? t.zones.noGoArea : t.zones.line) })}
                confirmLabel={t.zones.delete} cancelLabel={t.common.cancel} onCancel={() => setConfirmDelete(false)} onConfirm={remove} />
            <Toast text={toast} onClose={() => setToast(undefined)} />
        </div>
    )
}

/** laufende Zonenfolge: erledigt, aktuell, ausstehend */
export function QueueView({ queue, busy, onCancel }: { queue: ZoneQueue; busy: boolean; onCancel: () => void }) {
    const { t } = useI18n()
    const wait = queue.reason === 'charging' ? t.zones.waitCharging : queue.reason === 'error' ? t.zones.waitError : t.zones.waitBlocked
    return (<>
        <ul className="rows">
            {queue.zones.map((z, i) => {
                const r = queue.results?.[i]
                const failed = r?.status === 'failed'
                const retry = i === queue.index && (r?.attempts.length ?? 0) > 0 && queue.status === 'waiting'
                const state = failed ? t.zones.notCleaned
                    : i < queue.index ? t.zones.done
                        : i === queue.index ? (queue.status === 'checking' ? t.zones.checking
                            : queue.status === 'waiting' ? (retry ? `${t.zones.retry} · ${wait}` : wait)
                                : queue.busy ? t.zones.current : t.zones.starting)
                            : i === queue.index + 1 ? t.zones.next : ''
                return (
                    <li key={z.id + i}>
                        <div className={`row zrow${i === queue.index ? ' is-cur' : ''}`}>
                            <span className="zrow-c zrow-c--n rsteps-c" data-st={failed ? 'failed' : i < queue.index ? 'done' : undefined} aria-hidden>
                                {failed ? <X /> : i < queue.index ? <Check /> : i + 1}</span>
                            <span className="row-main">
                                <Label className="row-t">{z.name || t.zones.unnamed}</Label>
                                {state && <Label className="row-s">{state}</Label>}
                            </span>
                        </div>
                    </li>
                )
            })}
        </ul>
        {queue.index < queue.zones.length - 1 && (
            <div className="actions">
                <Button label={busy ? t.actions.sending : t.zones.cancelRest} loading={busy} onClick={onCancel} />
            </div>
        )}
    </>)
}
