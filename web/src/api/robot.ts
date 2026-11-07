import { api, gen3 } from './client'
import {
    CleaningMode, NavigationMode, RobotAction, RobotState,
    type Boundary, type Gen4Boundary, type MapData, type PersistentMap, type Robots, type RobotStateData, type RunSummary, type ScheduleEvent,
} from './types'
import { GEN4_QUIET } from '../i18n/gen4codes'

/**
 * Befehle und Daten unabhängig von der Generation: Gen3 (D3–D7, Cloud-Protokoll mit `cmd`) und Gen4 (D8–D10, „abilities“).
 * Die Oberfläche arbeitet mit den Gen3-Formen; Gen4-Antworten werden hier umgeformt.
 */

let types: Robots = {}

/** vom Store bei jeder neuen Roboterliste gesetzt */
export function setRobots(robots: Robots | undefined) {
    types = robots ?? {}
}

export function isGen4(serial: string | undefined): boolean {
    return !!serial && types[serial]?.type === 'neato.gen4'
}

// --- Gen4-Formen ---------------------------------------------------------------------------------------------------

interface Gen4State {
    state: 'idle' | 'busy' | 'paused' | 'error'
    action: string
    errors: { code: string; severity: 'invalid' | 'warning' | 'error' | 'critical' }[] | null
    available_commands: { start: boolean; cancel: boolean; pause: boolean; resume: boolean; return_to_base: boolean }
    details: { is_charging: boolean; is_docked: boolean; charge: number }
}

interface Gen4Floorplan {
    id: string; name: string; promoted: boolean; in_maps_list: boolean
    base: [number, number, number]; created_at: string
}

interface Gen4Run {
    id: string; floorplan: string | null; started_by: string; battery_consumed: number; cleaning_complete: boolean
    timing: { start: string; end: string; charging: number; error: number; pause: number }
    runs: { state: string; stats: { area: number; pickup_count: number } }[]
}

export interface Gen4Settings { forceFloorplan: boolean; language: string; languages: string[] }

interface Gen4ScheduleEvent { enabled: boolean; days: string[]; time: string }

const STATES: Record<string, RobotState> = { idle: RobotState.IDLE, busy: RobotState.BUSY, paused: RobotState.PAUSED, error: RobotState.ERROR }
const ACTIONS: Record<string, RobotAction> = {
    cleaning: RobotAction.HOUSE_CLEANING, docking: RobotAction.DOCKING, cleaning_standby: RobotAction.SUSPENDED_CLEANING,
    updating_software: RobotAction.UPDATING, diagnostic_test: RobotAction.USER_MENU_ACTIVE,
}
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** state.show bzw. Ereignis peer.state → Gen3-Zustand */
export function fromGen4State(b: Gen4State): RobotStateData {
    const errors = b.errors ?? []
    const error = errors.find((e) => e.severity === 'error' || e.severity === 'critical')
    const alert = errors.find((e) => e.severity === 'warning' && !GEN4_QUIET.test(e.code))
    const av = b.available_commands ?? {}
    return {
        state: STATES[b.state] ?? RobotState.INVALID,
        action: ACTIONS[b.action] ?? RobotAction.INVALID,
        error: error?.code ?? null,
        alert: alert?.code ?? null,
        details: {
            isCharging: !!b.details?.is_charging, isDocked: !!b.details?.is_docked,
            isScheduleEnabled: false, dockHasBeenSeen: true, charge: b.details?.charge ?? 0,
        },
        availableCommands: { start: !!av.start, stop: !!av.cancel, pause: !!av.pause, resume: !!av.resume, goToBase: !!av.return_to_base },
    }
}

function settings(mode: CleaningMode, nav: NavigationMode) {
    return { mode: mode === CleaningMode.TURBO ? 'turbo' : 'eco', navigation_mode: nav === NavigationMode.EXTRA_CARE ? 'gentle' : 'normal' }
}

function gen4Run(mapId: string | null, trackId: string | null, mode: CleaningMode, nav: NavigationMode) {
    return { map: mapId ? { rank_id: mapId, track_id: trackId, nogo_enabled: true } : null, settings: settings(mode, nav) }
}

function toGen4Boundary(b: Boundary): Gen4Boundary {
    return {
        id: b.id, name: b.name, color: b.color, type: b.type, vertices: b.vertices, enabled: b.enabled ?? true,
        function: b.function ?? (b.type === 'polygon' ? 'cleaning' : 'nogo'),
    }
}

/**
 * Fahrspur der Gen4-Karte: 3/4 = gereinigt (Zellen × 16 cm² ≈ gemeldete Fläche), 6 = bekannter Ausschnitt,
 * 0 = außerhalb; alles außer gereinigt wird leer (wie 128 bei Gen3)
 */
function gen4RunMap(d: MapData): MapData {
    return { ...d, legend: { '1': 'run', '128': 'background' }, rle: d.rle.map(([v, n]) => [v === 3 || v === 4 ? 1 : 128, n]) }
}

/** Gen4: Basis (mm) → Kartenpixel */
function withDock(d: MapData): MapData {
    const m = d.metadata, b = d.base
    if (d.dock || !m || !b || !m.resolution) return d
    const ds = d.downsample || 1
    return { ...d, dock: { pixel_x: (b[0] - m.origin_x) / m.resolution / ds, pixel_y: (b[1] - m.origin_y) / m.resolution / ds } }
}

/**
 * Gen4-Karten sind 2000 × 2000 Zellen (80 m), belegt ist meist nur ein kleiner Teil. Zum Zeichnen auf den belegten
 * Bereich zuschneiden; Zonen-Eckpunkte sind auf die ganze Karte normiert und werden beim Laden/Speichern umgerechnet.
 */
interface Crop { x: number; y: number; w: number; h: number; fullW: number; fullH: number }
const CROP_PAD = 40
const crops = new Map<string, Crop>()

function decodeRle(d: MapData): Uint8Array {
    const out = new Uint8Array(d.width * d.height)
    let i = 0
    for (const [v, n] of d.rle) { out.fill(v, i, i + n); i += n }
    return out
}

function encodeRle(cells: Uint8Array, d: MapData, c: Crop): [number, number][] {
    const rle: [number, number][] = []
    for (let y = c.y; y < c.y + c.h; y++) {
        for (let x = c.x; x < c.x + c.w; x++) {
            const v = cells[y * d.width + x]
            const last = rle[rle.length - 1]
            if (last && last[0] === v) last[1]++
            else rle.push([v, 1])
        }
    }
    return rle
}

function findCrop(d: MapData, cells: Uint8Array): Crop {
    let minX = d.width, minY = d.height, maxX = -1, maxY = -1
    for (let y = 0; y < d.height; y++) {
        for (let x = 0; x < d.width; x++) {
            if (!cells[y * d.width + x]) continue
            if (x < minX) minX = x
            if (x > maxX) maxX = x
            if (y < minY) minY = y
            maxY = y
        }
    }
    if (maxX < 0) return { x: 0, y: 0, w: d.width, h: d.height, fullW: d.width, fullH: d.height }
    const x = Math.max(0, minX - CROP_PAD), y = Math.max(0, minY - CROP_PAD)
    return { x, y, w: Math.min(d.width, maxX + CROP_PAD + 1) - x, h: Math.min(d.height, maxY + CROP_PAD + 1) - y, fullW: d.width, fullH: d.height }
}

function applyCrop(d: MapData, c: Crop, cells = decodeRle(d)): MapData {
    if (d.width !== c.fullW || d.height !== c.fullH) return d
    const dock = d.dock && { pixel_x: d.dock.pixel_x - c.x, pixel_y: d.dock.pixel_y - c.y }
    return { ...d, width: c.w, height: c.h, rle: encodeRle(cells, d, c), dock }
}

async function cropOf(s: string, mapId: string): Promise<Crop | undefined> {
    if (!crops.has(`${s}:${mapId}`)) await robot.map(s, mapId)
    return crops.get(`${s}:${mapId}`)
}

const toCrop = (c: Crop | undefined, [u, v]: [number, number]): [number, number] =>
    c ? [(u * c.fullW - c.x) / c.w, (v * c.fullH - c.y) / c.h] : [u, v]
const fromCrop = (c: Crop | undefined, [u, v]: [number, number]): [number, number] =>
    c ? [(c.x + u * c.w) / c.fullW, (c.y + v * c.h) / c.fullH] : [u, v]

function fromGen4Run(r: Gen4Run): RunSummary {
    const area = r.runs.reduce((sum, x) => sum + (x.stats?.area ?? 0), 0)
    const last = r.runs[r.runs.length - 1]
    return {
        id: r.id,
        persistent_map: r.floorplan,
        run: {
            status: last?.state, start_at: r.timing.start, end_at: r.timing.end, cleaned_area: area,
            launched_from: r.started_by, picked_up_count: r.runs.reduce((sum, x) => sum + (x.stats?.pickup_count ?? 0), 0),
            time_in_error: undefined, time_in_pause: undefined,
        },
    }
}

// --- gemeinsame Befehle --------------------------------------------------------------------------------------------

export const robot = {
    getState: async (s: string): Promise<RobotStateData> =>
        isGen4(s) ? fromGen4State((await api.ability<Gen4State>(s, 'state.show')).body) : gen3.getRobotState(s),

    /** ganze Karte (No-Go-Linien gelten); ohne Karte oder wenn der Roboter ablehnt: alles reinigen */
    startWhole: async (s: string, mapId: string | undefined, mode: CleaningMode, nav: NavigationMode) => {
        if (!isGen4(s)) return gen3.startWhole(s, mapId, mode, nav)
        if (mapId) {
            const ok = await api.ability(s, 'cleaning.start', { runs: [gen4Run(mapId, null, mode, nav)] }).then(() => true, () => false)
            if (ok) return
        }
        await api.ability(s, 'cleaning.start', { runs: [gen4Run(null, null, mode, nav)] })
    },
    pause: (s: string) => (isGen4(s) ? api.ability(s, 'cleaning.pause') : gen3.pause(s)),
    resume: (s: string) => (isGen4(s) ? api.ability(s, 'cleaning.resume') : gen3.resume(s)),
    stop: (s: string) => (isGen4(s) ? api.ability(s, 'cleaning.cancel') : gen3.stop(s)),
    sendToBase: (s: string) => (isGen4(s) ? api.ability(s, 'navigation.return_to_base') : gen3.sendToBase(s)),
    findMe: (s: string) => (isGen4(s) ? api.ability(s, 'utilities.find_me') : gen3.findMe(s)),
    /** Gen4 kennt kein Quittieren */
    canDismiss: (s: string | undefined) => !isGen4(s),
    dismissAlert: (s: string) => gen3.dismissAlert(s),
    /** Erkundungsfahrt gibt es nur bei Gen3; Gen4 legt bei jeder Reinigung eine Karte an */
    canExplore: (s: string | undefined) => !isGen4(s),

    /** Zonen nacheinander: Gen4 kann das selbst (ein Lauf pro Zone), Gen3 über die Warteschlange des Server */
    cleanZones: async (s: string, mapId: string, zones: { id: string; name: string }[], mode: CleaningMode, nav: NavigationMode) => {
        if (!isGen4(s)) return api.cleanZones(s, mapId, zones, mode, nav)
        await api.ability(s, 'cleaning.start', { runs: zones.map((z) => gen4Run(mapId, z.id, mode, nav)) })
        return null
    },

    maps: async (s: string): Promise<PersistentMap[]> => {
        if (!isGen4(s)) return api.maps(s)
        const list = await api.maps(s) as unknown as Gen4Floorplan[]
        return list.map((m) => ({ id: m.id, name: m.name, enabled: m.promoted, in_maps_list: m.in_maps_list, base: m.base, created: m.created_at }))
    },
    map: async (s: string, id: string) => {
        const d = withDock(await api.map(s, id))
        if (!isGen4(s)) return d
        const cells = decodeRle(d)
        const c = findCrop(d, cells)
        crops.set(`${s}:${id}`, c)
        return applyCrop(d, c, cells)
    },
    /** Gen4: Fahrspur auf denselben Ausschnitt wie die Bodenkarte gleicher ID */
    run: async (s: string, id: string) => {
        const d = await api.run(s, id)
        if (!isGen4(s)) return d
        const c = await cropOf(s, id)
        const r = gen4RunMap(d)
        return c ? applyCrop(r, c) : r
    },
    runs: async (s: string): Promise<RunSummary[]> =>
        isGen4(s) ? (await api.runs(s) as unknown as Gen4Run[]).map(fromGen4Run) : api.runs(s),

    /** Gen4 liest aus dem Server (auch ohne Verbindung), Gen3 vom Roboter */
    boundariesOffline: (s: string | undefined) => isGen4(s),
    getBoundaries: async (s: string, mapId: string): Promise<Boundary[]> => {
        if (!isGen4(s)) return (await gen3.getMapBoundaries(s, mapId)).data?.boundaries ?? []
        const c = await cropOf(s, mapId)
        return (await api.gen4Boundaries(s, mapId)).map((b) => ({ ...b, vertices: b.vertices.map((p) => toCrop(c, p)) }))
    },
    /**
     * Zonen/Linien ersetzen. Gen4: im Server speichern und, wenn die Karte verwendet wird, neu an den Roboter schicken.
     * Rückgabe: Antwort des Roboters (Gen3) zum Nachprüfen.
     */
    setBoundaries: async (s: string, mapId: string, list: Boundary[], inUse: boolean): Promise<unknown> => {
        if (!isGen4(s)) return gen3.setMapBoundaries(s, mapId, list)
        const c = await cropOf(s, mapId)
        await api.setGen4Boundaries(s, mapId, list.map((b) => toGen4Boundary({ ...b, vertices: b.vertices.map((p) => fromCrop(c, p)) })))
        if (inUse) await api.promote(s, mapId)
        return undefined
    },

    /** Karte verwenden: Gen4 schickt sie samt Zonen an den Roboter (nur eine gleichzeitig) */
    updateMap: async (s: string, map: PersistentMap, name: string, enabled: boolean) => {
        await api.updateMap(s, map.id, name, enabled)
        if (isGen4(s) && enabled && !map.enabled) await api.promote(s, map.id)
    },
    useMap: (s: string, id: string) => api.useMap(s, id),

    /** eigener Zeitplan des Roboters (nur zum Anzeigen) */
    getSchedule: async (s: string): Promise<ScheduleEvent[]> => {
        if (!isGen4(s)) return (await gen3.getSchedule(s)).data.events
        const body = (await api.ability<{ enabled: boolean; events: Gen4ScheduleEvent[] }>(s, 'scheduling.show')).body
        if (!body.enabled) return []
        return body.events.filter((e) => e.enabled).flatMap((e) => e.days.map((d) => ({ day: DAYS.indexOf(d), startTime: e.time })))
    },

    /** Gen4: Einstellungen am Roboter */
    gen4Settings: async (s: string): Promise<Gen4Settings> => {
        const [opts, lang] = await Promise.all([
            api.ability<{ force_floorplan: boolean }>(s, 'settings.cleaning_options'),
            api.ability<{ language: string; available_languages: string[] }>(s, 'settings.robot_language'),
        ])
        return { forceFloorplan: !!opts.body.force_floorplan, language: lang.body.language, languages: lang.body.available_languages ?? [] }
    },
    setForceFloorplan: (s: string, on: boolean) => api.ability(s, 'settings.set_cleaning_options', { force_floorplan: on }),
    setLanguage: (s: string, language: string) => api.ability(s, 'settings.set_robot_language', { language }),

    /** Modell und Firmware */
    info: async (s: string): Promise<{ model?: string; firmware?: string }> => {
        if (!isGen4(s)) {
            const d = (await gen3.getGeneralInfo(s)).data
            return { model: d.model, firmware: d.firmware }
        }
        return { firmware: (await api.ability<{ firmware?: string }>(s, 'info.robot')).body.firmware }
    },
}
