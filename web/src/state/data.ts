import { useEffect, useState } from 'react'
import { api, esp } from '../api/client'
import { isGen4, robot } from '../api/robot'
import { idToTs } from '../format'
import { store, stored } from './persist'
import type { Boundary, EspSession, Incident, Job, MapData, PersistentMap, Pose, RunSummary, ZoneHistory } from '../api/types'

// Karten und Reinigungen ändern sich selten: einfacher Cache pro Sitzung
const cache = new Map<string, Promise<unknown>>()
// diese bleiben auch auf dem Gerät (klein, ändern sich selten); einzelne Fahrten und Strecken nicht, die würden sich häufen
const PERSIST = new Set(['maps', 'map', 'bounds', 'zone-history', 'runs', 'jobs', 'esp-history'])
const persisted = (key: string) => PERSIST.has(key.split(':')[0])

function cached<T>(key: string, load: () => Promise<T>, force = false): Promise<T> {
    if (force || !cache.has(key)) {
        const p = load()
        p.then((data) => { if (persisted(key)) store(key, data) }, () => cache.delete(key))
        cache.set(key, p)
    }
    return cache.get(key) as Promise<T>
}

export interface Loaded<T> { data?: T; error: boolean; loading: boolean }

function useLoad<T>(key: string | undefined, load: () => Promise<T>, version = 0): Loaded<T> {
    const [state, setState] = useState<Loaded<T>>({ error: false, loading: !!key })
    useEffect(() => {
        if (!key) { setState({ error: false, loading: false }); return }
        let alive = true, fresh = false, stale = false
        setState((s) => ({ data: s.data, error: false, loading: true }))
        // zuerst der Stand auf dem Gerät, dann frisch vom Server
        if (!cache.has(key) && persisted(key)) {
            stored<T>(key).then((data) => {
                if (!alive || fresh || data === undefined) return
                stale = true
                setState({ data, error: false, loading: true })
            })
        }
        cached(key, load, version > 0)
            .then((data) => { fresh = true; if (alive) setState({ data, error: false, loading: false }) })
            .catch(() => { fresh = true; if (alive) setState((s) => stale ? { data: s.data, error: false, loading: false } : { error: true, loading: false }) })
        return () => { alive = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, version])
    return state
}

export function useMaps(serial: string | undefined, version = 0) {
    return useLoad<PersistentMap[]>(serial && `maps:${serial}`, () => robot.maps(serial!), version)
}

export function useMapData(serial: string | undefined, id: string | undefined) {
    return useLoad<MapData>(serial && id ? `map:${serial}:${id}` : undefined, () => robot.map(serial!, id!))
}

export function useRuns(serial: string | undefined, version = 0) {
    return useLoad<RunSummary[]>(serial && `runs:${serial}`, () => robot.runs(serial!), version)
}

export function useJobs(serial: string | undefined, version = 0) {
    return useLoad<Job[]>(serial && `jobs:${serial}`, () => api.jobs(serial!), version)
}

/** Störungen im Zeitraum; Zeitraum auf ganze Sekunden, damit der Cache greift */
export function useIncidents(serial: string | undefined, since: number | undefined, until: number | undefined) {
    const a = since && Math.floor(since), b = until && Math.ceil(until)
    return useLoad<Incident[]>(serial && a && b ? `incidents:${serial}:${a}:${b}` : undefined, () => api.incidents(serial!, a!, b!))
}

export function useRunData(serial: string | undefined, id: string | undefined) {
    return useLoad<MapData>(serial && id ? `run:${serial}:${id}` : undefined, () => robot.run(serial!, id!))
}

const RUN_MAX_S = 6 * 3600
const RUN_GAP_S = 15 * 60

/**
 * Gefahrene Strecke einer Reinigung aus den gespeicherten Posen (bleiben dauerhaft auf dem Server).
 * Ende aus der ESP-Sitzung (inkl. Ladestopps); ohne Sitzung bis zur ersten Pause von mehr als 15 min.
 */
export function useRunPath(serial: string | undefined, start: number | undefined, end: number | undefined) {
    return useLoad<Pose[]>(serial && start ? `path:${serial}:${start}:${end ?? ''}` : undefined, async () => {
        const poses = await api.poses(serial!, start! - 60, end ? end + 60 : start! + RUN_MAX_S)
        if (end) return poses
        const gap = poses.findIndex((p, i) => i > 0 && p.ts - poses[i - 1].ts > RUN_GAP_S)
        return gap < 0 ? poses : poses.slice(0, gap)
    })
}

/** Zonen und No-Go-Linien einer Karte; Gen3 liefert sie nur, wenn er verbunden ist, Gen4 aus dem Server */
export function useBoundaries(serial: string | undefined, mapId: string | undefined, connected: boolean, version = 0) {
    const ok = connected || robot.boundariesOffline(serial)
    return useLoad<Boundary[]>(serial && mapId && ok ? `bounds:${serial}:${mapId}` : undefined,
        () => robot.getBoundaries(serial!, mapId!), version)
}

export function useZoneHistory(serial: string | undefined, mapId: string | undefined, version = 0) {
    return useLoad<Record<string, ZoneHistory>>(serial && mapId ? `zone-history:${serial}:${mapId}` : undefined,
        () => api.zoneHistory(serial!, mapId!), version)
}

/** Karte, auf der Reksio fährt: die aktivierte, sonst die neueste */
export function activeMap(maps: PersistentMap[] | undefined): PersistentMap | undefined {
    if (!maps?.length) return undefined
    return maps.find((m) => m.enabled) ?? [...maps].sort((a, b) => (b.created ?? b.id).localeCompare(a.created ?? a.id))[0]
}

/** Startzeit einer Reinigung: Gen3-IDs sind die Startzeit, Gen4 hat UUIDs */
export function runTs(r: RunSummary | undefined): number | undefined {
    if (!r) return undefined
    return idToTs(r.id) ?? (r.run?.start_at ? idToTs(r.run.start_at) : undefined)
}

export function sortRuns(runs: RunSummary[] | undefined): RunSummary[] {
    return [...(runs ?? [])].sort((a, b) => (runTs(b) ?? 0) - (runTs(a) ?? 0))
}

/** Fahrten-Zusammenfassungen des ESP (Dauer, Fläche, Strecke, Akku); der ESP passt nur an Gen3-Roboter */
export function useEspSessions(serial: string | undefined, version = 0) {
    return useLoad<EspSession[]>(serial && !isGen4(serial) ? 'esp-history' : undefined, () => esp.get<EspSession[]>('history'), version)
}

/** ESP-Sitzung zu einer Reinigung: Start innerhalb von 5 min um die Run-ID (= Startzeit) */
export function sessionFor(sessions: EspSession[] | undefined, runTs: number | undefined): EspSession | undefined {
    if (!sessions || runTs === undefined) return undefined
    let best: EspSession | undefined
    for (const s of sessions) {
        const t = s.session?.time ?? Number(s.name.split('.')[0])
        if (Math.abs(t - runTs) <= 300 && (!best || Math.abs(t - runTs) < Math.abs((best.session?.time ?? 0) - runTs))) best = s
    }
    return best
}
