import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { MapData, PersistentMap, RunSummary } from '../api/types'

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

export function useRunData(serial: string | undefined, id: string | undefined) {
    return useLoad<MapData>(serial && id ? `run:${serial}:${id}` : undefined, () => api.run(serial!, id!))
}

/** Karte, auf der Reksio fährt: die aktivierte, sonst die neueste */
export function activeMap(maps: PersistentMap[] | undefined): PersistentMap | undefined {
    if (!maps?.length) return undefined
    return maps.find((m) => m.enabled) ?? [...maps].sort((a, b) => b.id.localeCompare(a.id))[0]
}

export function sortRuns(runs: RunSummary[] | undefined): RunSummary[] {
    return [...(runs ?? [])].sort((a, b) => b.id.localeCompare(a.id))
}
