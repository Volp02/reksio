import { useEffect, useState } from 'react'
import { api, esp, gen3 } from '../api/client'
import type { Boundary, EspSession, Incident, Job, MapData, PersistentMap, Pose, RunSummary, ZoneHistory } from '../api/types'

// Karten und Reinigungen ändern sich selten: einfacher Cache pro Sitzung
const cache = new Map<string, Promise<unknown>>()

function cached<T>(key: string, load: () => Promise<T>, force = false): Promise<T> {
    if (force || !cache.has(key)) {
        const p = load()
        p.catch(() => cache.delete(key))
        cache.set(key, p)
    }
    return cache.get(key) as Promise<T>
}

export interface Loaded<T> { data?: T; error: boolean; loading: boolean }

function useLoad<T>(key: string | undefined, load: () => Promise<T>, version = 0): Loaded<T> {
    const [state, setState] = useState<Loaded<T>>({ error: false, loading: !!key })
    useEffect(() => {
        if (!key) { setState({ error: false, loading: false }); return }
        let alive = true
        setState((s) => ({ data: s.data, error: false, loading: true }))
        cached(key, load, version > 0)
            .then((data) => alive && setState({ data, error: false, loading: false }))
            .catch(() => alive && setState({ error: true, loading: false }))
        return () => { alive = false }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, version])
    return state
}

export function useMaps(serial: string | undefined, version = 0) {
    return useLoad<PersistentMap[]>(serial && `maps:${serial}`, () => api.maps(serial!), version)
}

export function useMapData(serial: string | undefined, id: string | undefined) {
    return useLoad<MapData>(serial && id ? `map:${serial}:${id}` : undefined, () => api.map(serial!, id!))
}

export function useRuns(serial: string | undefined, version = 0) {
    return useLoad<RunSummary[]>(serial && `runs:${serial}`, () => api.runs(serial!), version)
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
    return useLoad<MapData>(serial && id ? `run:${serial}:${id}` : undefined, () => api.run(serial!, id!))
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

/** Zonen und No-Go-Linien einer Karte; kommen vom Roboter, daher nur wenn er verbunden ist */
export function useBoundaries(serial: string | undefined, mapId: string | undefined, connected: boolean, version = 0) {
    return useLoad<Boundary[]>(serial && mapId && connected ? `bounds:${serial}:${mapId}` : undefined,
        () => gen3.getMapBoundaries(serial!, mapId!).then((r) => r.data.boundaries ?? []), version)
}

export function useZoneHistory(serial: string | undefined, mapId: string | undefined, version = 0) {
    return useLoad<Record<string, ZoneHistory>>(serial && mapId ? `zone-history:${serial}:${mapId}` : undefined,
        () => api.zoneHistory(serial!, mapId!), version)
}

/** Karte, auf der Reksio fährt: die aktivierte, sonst die neueste */
export function activeMap(maps: PersistentMap[] | undefined): PersistentMap | undefined {
    if (!maps?.length) return undefined
    return maps.find((m) => m.enabled) ?? [...maps].sort((a, b) => b.id.localeCompare(a.id))[0]
}

export function sortRuns(runs: RunSummary[] | undefined): RunSummary[] {
    return [...(runs ?? [])].sort((a, b) => b.id.localeCompare(a.id))
}

/** Fahrten-Zusammenfassungen des ESP (Dauer, Fläche, Strecke, Akku) */
export function useEspSessions(version = 0) {
    return useLoad<EspSession[]>('esp-history', () => esp.get<EspSession[]>('history'), version)
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
