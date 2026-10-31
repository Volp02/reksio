import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Map as MapIcon, Pencil, Plus, Route, Shapes, Sparkles, Trash2, X } from 'lucide-react'
import { api, gen3 } from '../api/client'
import type { Boundary, ZoneQueue } from '../api/types'
import { fill, useI18n } from '../i18n'
import { useStore } from '../state/store'
import { getPrefs } from '../state/prefs'
import { activeMap, useBoundaries, useMapData, useMaps } from '../state/data'
import { MapView, type MapInteraction, type MapViewport } from '../map/MapView'
import { Legend } from '../map/Legend'
import { useLive } from '../map/useLive'
import { PX_PER_M } from '../map/pose'
import { distToSegment, insidePolygon, interiorPoint, validateShape, type Pt } from '../map/geometry'
import { fmtNumber } from '../format'
import { Button, Card, Confirm, Empty, IconButton, InputRow, Label, Segmented, Switch, Toast } from '../ui/ui'
import { CleanModes } from './CleanModes'
import './pages.css'

// Farben für neue Zonen und Linien (wie in der Neato-/Vacuula-App)
const PRESETS = ['#ff7a45', '#f5b942', '#b4e04a', '#3ddc97', '#38d0e0', '#5aa9ff', '#a78bfa', '#e879f9', '#fb7185', '#f97373']
const HANDLE_PX = 14 // Trefferradius für Eckpunkte
const LINE_HIT_PX = 12

type Tab = 'clean' | 'edit'
interface Draft { b: Boundary; isNew: boolean; vertex?: number }
type Drag = { kind: 'vertex'; i: number } | { kind: 'move'; from: Pt; orig: Pt[] }

function uuid(): string {
    // crypto.randomUUID gibt es nur über HTTPS; die App läuft im LAN auch über HTTP
    const b = crypto.getRandomValues(new Uint8Array(16))
    b[6] = (b[6] & 0x0f) | 0x40
    b[8] = (b[8] & 0x3f) | 0x80
    const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

const clamp = (v: number) => Math.min(1, Math.max(0, v))

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

export function MapPage() {
    const { t, locale } = useI18n()
    const s = useStore()
    const maps = useMaps(s.serial)
    const [chosen, setChosen] = useState<string>()
    const current = chosen ?? activeMap(maps.data)?.id
    const map = maps.data?.find((m) => m.id === current)
    const data = useMapData(s.serial, current)
    const [version, setVersion] = useState(0)
    const bounds = useBoundaries(s.serial, current, s.connected, version)
    // Live nur auf der Karte, auf der Reksio gerade fährt
    const live = useLive(current === activeMap(maps.data)?.id ? data.data : undefined)

    const [tab, setTab] = useState<Tab>('clean')
    const [selected, setSelected] = useState<string[]>([])
    const [draft, setDraft] = useState<Draft>()
    const [busy, setBusy] = useState<'clean' | 'cancel' | 'save' | 'delete'>()
    const [toast, setToast] = useState<string>()
    const [confirmDelete, setConfirmDelete] = useState(false)
    const [error, setError] = useState<string>()
    const drag = useRef<Drag>(undefined)
    const vpRef = useRef<() => MapViewport>(undefined)

    const all = useMemo(() => bounds.data ?? [], [bounds.data])
    const zones = all.filter((b) => b.type === 'polygon')
    const queue = s.zoneQueue && s.zoneQueue.mapId === current ? s.zoneQueue : undefined
    const cells: [number, number] = data.data ? [data.data.width, data.data.height] : [1, 1]

    useEffect(() => { setSelected([]); setDraft(undefined) }, [current])
    useEffect(() => { setDraft(undefined); setError(undefined) }, [tab])
    // gelöschte Zonen aus der Auswahl nehmen
    useEffect(() => { setSelected((sel) => sel.filter((id) => all.some((b) => b.id === id))) }, [all])

    const toggle = (id: string) => setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]))
    const edit = (b: Boundary) => { setDraft({ b: { ...b, vertices: b.vertices.map((v) => [...v] as Pt) }, isNew: false }); setError(undefined) }

    const create = (type: Boundary['type']) => {
        const vp = vpRef.current?.()
        if (!vp) return
        const [cx, cy] = vp.center()
        // etwa 1,6 m groß, am Bildschirm aber mindestens gut greifbar
        const half = Math.max(PX_PER_M * 0.8, 70 / vp.scale)
        const du = half / vp.cells[0], dv = half / vp.cells[1]
        const used = new Set(all.map((b) => b.color.toLowerCase()))
        const vertices: Pt[] = type === 'polygon'
            ? [[cx - du, cy - dv], [cx + du, cy - dv], [cx + du, cy + dv], [cx - du, cy + dv]]
            : [[cx - du, cy], [cx + du, cy]]
        setDraft({
            isNew: true,
            b: {
                id: uuid(), type, enabled: true, vertices: vertices.map(([u, v]) => [clamp(u), clamp(v)]),
                name: type === 'polygon' ? `${t.zones.zone} ${zones.length + 1}` : '',
                color: PRESETS.find((c) => !used.has(c)) ?? PRESETS[all.length % PRESETS.length],
            },
        })
        setError(undefined)
    }

    const save = async (list: Boundary[]) => {
        setBusy('save')
        try {
            await gen3.setMapBoundaries(s.serial!, current!, list.map((b) => b.type === 'polygon'
                ? { ...b, relevancy: interiorPoint(b.vertices) }
                : { id: b.id, type: b.type, name: b.name, color: b.color, enabled: b.enabled ?? true, vertices: b.vertices }))
            setVersion((v) => v + 1)
            setDraft(undefined)
            setToast(t.zones.saved)
        } catch {
            setToast(t.zones.saveFailed)
        } finally {
            setBusy(undefined)
        }
    }

    const saveDraft = () => {
        if (!draft) return
        const b = draft.b
        const shapeError = validateShape(b.vertices, b.type === 'polygon')
        if (shapeError) return setError(t.zones[shapeError])
        if (b.type === 'polygon' && !b.name.trim()) return setError(t.zones.nameMissing)
        setError(undefined)
        const next = draft.isNew ? [...all, b] : all.map((x) => (x.id === b.id ? b : x))
        save(next.map((x) => ({ ...x, name: x.name.trim() })))
    }

    const remove = () => {
        if (!draft) return
        setConfirmDelete(false)
        if (draft.isNew) return setDraft(undefined)
        save(all.filter((x) => x.id !== draft.b.id))
    }

    const cleanSelected = async () => {
        setBusy('clean')
        try {
            const p = getPrefs()
            const q = await api.cleanZones(s.serial!, current!, selected.map((id) => ({ id, name: all.find((b) => b.id === id)?.name ?? '' })), p.mode, p.navigation)
            s.setZoneQueue(q)
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

    // Karte: im Reinigen-Modus Zonen antippen, im Bearbeiten-Modus Form wählen und Eckpunkte ziehen
    const setVertices = (vs: Pt[]) => setDraft((d) => d && { ...d, b: { ...d.b, vertices: vs } })
    const interact: MapInteraction | undefined = !data.data ? undefined : tab === 'clean'
        ? {
            tap: (x, y, vp) => {
                if (queue) return
                const b = hitBoundary(zones, x, y, vp, false)
                if (b) toggle(b.id)
            },
            overlay: (g, vp) => {
                const order = queue ? queue.zones.map((z) => z.id) : selected
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
            tap: (x, y, vp) => {
                if (draft) return
                const b = hitBoundary(all, x, y, vp, true)
                if (b) edit(b)
            },
            grab: (x, y, vp) => {
                if (!draft) return false
                const vs = draft.b.vertices
                const closed = draft.b.type === 'polygon'
                const ps = vs.map(vp.toScreen)
                const vi = ps.findIndex(([px, py]) => Math.hypot(px - x, py - y) < HANDLE_PX)
                if (vi >= 0) {
                    drag.current = { kind: 'vertex', i: vi }
                    setDraft({ ...draft, vertex: vi })
                    return true
                }
                // Mittelpunkt einer Kante: neuen Eckpunkt einfügen
                const edges = closed ? vs.length : vs.length - 1
                for (let i = 0; i < edges; i++) {
                    const a = ps[i], c = ps[(i + 1) % vs.length]
                    if (Math.hypot((a[0] + c[0]) / 2 - x, (a[1] + c[1]) / 2 - y) < HANDLE_PX) {
                        const nv = [...vs.slice(0, i + 1), vp.toMap(x, y), ...vs.slice(i + 1)] as Pt[]
                        drag.current = { kind: 'vertex', i: i + 1 }
                        setDraft({ ...draft, vertex: i + 1, b: { ...draft.b, vertices: nv } })
                        return true
                    }
                }
                const p = vp.toMap(x, y)
                const onShape = closed ? insidePolygon(p, vs)
                    : ps.some((q, i) => i > 0 && distToSegment([x, y], ps[i - 1], q) < LINE_HIT_PX)
                if (onShape) {
                    drag.current = { kind: 'move', from: p, orig: vs }
                    return true
                }
                return false
            },
            drag: (x, y, vp) => {
                const d = drag.current
                if (!d || !draft) return
                const [u, v] = vp.toMap(x, y)
                if (d.kind === 'vertex') {
                    setDraft((cur) => cur && { ...cur, b: { ...cur.b, vertices: cur.b.vertices.map((p, i) => (i === d.i ? [clamp(u), clamp(v)] : p)) } })
                } else {
                    const du = u - d.from[0], dv = v - d.from[1]
                    setVertices(d.orig.map(([a, b]) => [clamp(a + du), clamp(b + dv)]))
                }
            },
            release: () => { drag.current = undefined },
            overlay: (g, vp) => {
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
                const surface = cssVar('--surface'), accent = cssVar('--accent')
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
                ps.forEach(([px, py], i) => {
                    g.beginPath()
                    g.arc(px, py, 7, 0, Math.PI * 2)
                    g.fillStyle = i === draft.vertex ? accent : surface
                    g.fill()
                    g.lineWidth = 2.5
                    g.strokeStyle = i === draft.vertex ? surface : b.color
                    g.stroke()
                })
            },
        }

    const shown = tab === 'edit' && draft ? all.filter((b) => b.id !== draft.b.id) : all
    const canStart = s.connected && !!s.robot?.availableCommands?.start
    const minPoints = draft?.b.type === 'polygon' ? 3 : 2

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
                            interact={interact} viewportRef={vpRef} />
                        : <Empty icon={<MapIcon />} label={data.loading || maps.loading ? t.common.loading : t.map.noMap} />}
                </div>
                <Card className="zpanel">
                    <Segmented<Tab> label={t.map.zones} value={tab} onChange={setTab}
                        options={[{ value: 'clean', label: t.zones.clean }, { value: 'edit', label: t.zones.edit }]} />

                    {tab === 'clean' && queue && <QueueView queue={queue} busy={busy === 'cancel'} onCancel={cancelQueue} />}

                    {tab === 'clean' && !queue && (<>
                        {zones.length ? (
                            <ul className="rows">
                                {zones.map((b) => {
                                    const n = selected.indexOf(b.id)
                                    return (
                                        <li key={b.id}>
                                            <button type="button" className="row zrow" aria-pressed={n >= 0} onClick={() => toggle(b.id)}>
                                                <span className="zrow-c" style={{ ['--c' as string]: b.color }} aria-hidden>{n >= 0 ? n + 1 : ''}</span>
                                                <span className="row-main">
                                                    <Label className="row-t">{b.name || t.zones.unnamed}</Label>
                                                    <Label className="row-s">{fill(t.zones.area, { a: fmtNumber(locale, areaM2(b.vertices, cells), 1) })}</Label>
                                                </span>
                                                {n >= 0 && <Check className="row-i zrow-ok" />}
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        ) : <Empty icon={<Shapes />} label={bounds.loading ? t.common.loading : t.zones.none} />}
                        {zones.length > 0 && <>
                            <CleanModes />
                            <div className="actions zpanel-foot">
                                {selected.length > 0 && <Button variant="ghost" label={t.zones.clear} onClick={() => setSelected([])} />}
                                <Button variant="primary" icon={<Sparkles />} loading={busy === 'clean'}
                                    label={busy === 'clean' ? t.actions.sending : selected.length > 1 ? fill(t.zones.cleanN, { n: selected.length }) : t.zones.cleanOne}
                                    disabled={!selected.length || !canStart || !!busy} onClick={cleanSelected} />
                            </div>
                        </>}
                    </>)}

                    {tab === 'edit' && !draft && (<>
                        {all.length ? (
                            <ul className="rows">
                                {all.map((b) => (
                                    <li key={b.id}>
                                        <button type="button" className="row zrow" onClick={() => edit(b)}>
                                            <span className={`zrow-c zrow-c--${b.type}`} style={{ ['--c' as string]: b.color || 'var(--danger)' }} aria-hidden />
                                            <span className="row-main">
                                                <Label className="row-t">{b.name || (b.type === 'polyline' ? t.zones.line : t.zones.unnamed)}</Label>
                                                <Label className="row-s">{b.type === 'polygon'
                                                    ? fill(t.zones.area, { a: fmtNumber(locale, areaM2(b.vertices, cells), 1) })
                                                    : b.enabled === false ? `${t.zones.line} · ${t.common.none}` : t.zones.line}</Label>
                                            </span>
                                            <Pencil className="row-i" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : <Empty icon={<Shapes />} label={bounds.loading ? t.common.loading : t.zones.none} />}
                        <div className="actions">
                            <Button icon={<Route />} label={t.zones.newLine} disabled={!s.connected || !data.data} onClick={() => create('polyline')} />
                            <Button icon={<Plus />} label={t.zones.newZone} disabled={!s.connected || !data.data} onClick={() => create('polygon')} />
                        </div>
                    </>)}

                    {tab === 'edit' && draft && (
                        <div className="zedit">
                            <div className="zedit-h">
                                <Label className="zedit-t">{draft.b.type === 'polygon' ? t.zones.zone : t.zones.line}</Label>
                                <IconButton size="s" icon={<X />} label={t.common.cancel} onClick={() => setDraft(undefined)} />
                            </div>
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
                            {error && <div className="zedit-err" role="alert">{error}</div>}
                            <div className="actions">
                                {draft.vertex !== undefined && draft.b.vertices.length > minPoints && (
                                    <Button variant="ghost" label={t.zones.deletePoint} onClick={() => setDraft({
                                        ...draft, vertex: undefined, b: { ...draft.b, vertices: draft.b.vertices.filter((_, i) => i !== draft.vertex) },
                                    })} />
                                )}
                                <Button variant="danger" icon={<Trash2 />} label={t.zones.delete} disabled={!!busy}
                                    loading={busy === 'delete'} onClick={() => (draft.isNew ? setDraft(undefined) : setConfirmDelete(true))} />
                                <Button variant="primary" label={busy === 'save' ? t.actions.sending : t.common.save} loading={busy === 'save'}
                                    disabled={!s.connected || !!busy} onClick={saveDraft} />
                            </div>
                        </div>
                    )}
                </Card>
            </div>
            {tab === 'clean' && <Legend boundaries={all.filter((b) => b.type === 'polyline')} noGo={t.map.noGo} />}
            <Confirm open={confirmDelete} title={fill(t.zones.deleteConfirm, { name: draft?.b.name || t.zones.line })}
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
                const state = i < queue.index ? t.zones.done
                    : i === queue.index ? (queue.status === 'waiting' ? wait : queue.busy ? t.zones.current : t.zones.starting)
                        : i === queue.index + 1 ? t.zones.next : ''
                return (
                    <li key={z.id + i}>
                        <div className={`row zrow${i === queue.index ? ' is-cur' : ''}`}>
                            <span className="zrow-c zrow-c--n" aria-hidden>{i < queue.index ? <Check /> : i + 1}</span>
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
