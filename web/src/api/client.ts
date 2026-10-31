import type { Boundary, BoundaryBackup, GeneralInfo, MapData, Plan, Pose, PersistentMap, Robots, RobotStateData, RunSummary, ScheduleEvent, ServerInfo, Telemetry, ZoneHistory, ZoneQueue } from './types'
import { CleaningCategory, type CleaningMode, type NavigationMode } from './types'

// Relativ, damit die App auch hinter einem Präfix (HA-Ingress) läuft
export const API = new URL('api/', document.baseURI).pathname.replace(/\/$/, '')

export class HttpError extends Error {
    constructor(public status: number, message: string) { super(message) }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!res.ok) throw new HttpError(res.status, await res.text().catch(() => res.statusText))
    const text = await res.text()
    // manche Endpunkte antworten nur mit „OK“ statt JSON
    try {
        return (text ? JSON.parse(text) : undefined) as T
    } catch {
        return undefined as T
    }
}

// IDs (ISO-Zeitpunkte mit ':') unverändert senden: der Server dekodiert Pfade nicht
export const api = {
    server: () => request<ServerInfo>('GET', '/server'),
    robots: () => request<Robots>('GET', '/robots'),
    maps: (serial: string) => request<PersistentMap[]>('GET', `/robot/${serial}/maps`),
    map: (serial: string, id: string) => request<MapData>('GET', `/robot/${serial}/maps/${id}`),
    runs: (serial: string) => request<RunSummary[]>('GET', `/robot/${serial}/runs`),
    run: (serial: string, id: string) => request<MapData>('GET', `/robot/${serial}/run/${id}`),
    telemetryLatest: (serial: string) => request<Telemetry>('GET', `/robot/${serial}/telemetry/latest`),
    telemetry: (serial: string, since: number, until?: number) =>
        request<Telemetry[]>('GET', `/robot/${serial}/telemetry?since=${since}${until ? `&until=${until}` : ''}`),
    poses: (serial: string, since: number) =>
        request<[number, number, number, number][]>('GET', `/robot/${serial}/poses?since=${since}`)
            .then((rows) => rows.map(([ts, x, y, theta]): Pose => ({ ts, x, y, theta }))),
    /** Gen3: Name und „in Verwendung“ (der Roboter lädt nur aktivierte Karten) */
    updateMap: (serial: string, id: string, name: string, enabled: boolean) =>
        request<void>('POST', `/robot/${serial}/maps/${id}`, { name, enabled }),
    deleteMap: (serial: string, id: string) => request<void>('DELETE', `/robot/${serial}/maps/${id}`),
    /** gesicherte Stände der Zonen/Linien einer Karte, neueste zuerst (der Server sichert vorher den aktuellen) */
    boundaryBackups: (serial: string, mapId: string) => request<BoundaryBackup[]>('GET', `/robot/${serial}/maps/${mapId}/backups`),
    /** pro Zone: zuletzt gereinigt (Unix-Zeit) und Anzahl Fahrten, aus den Positionen des ESP */
    zoneHistory: (serial: string, mapId: string) => request<Record<string, ZoneHistory>>('GET', `/robot/${serial}/maps/${mapId}/zone-history`),
    plans: (serial: string) => request<Plan[]>('GET', `/robot/${serial}/plans`),
    setPlans: (serial: string, plans: Plan[]) => request<Plan[]>('PUT', `/robot/${serial}/plans`, plans),
    zones: (serial: string) => request<ZoneQueue | null>('GET', `/robot/${serial}/zones`),
    /** Zonen in dieser Reihenfolge nacheinander reinigen; die erste startet sofort */
    cleanZones: (serial: string, mapId: string, zones: { id: string; name: string }[], mode: CleaningMode, navigationMode: NavigationMode) =>
        request<ZoneQueue>('POST', `/robot/${serial}/zones`, { mapId, zones, mode, navigationMode }),
    cancelZones: (serial: string) => request<void>('DELETE', `/robot/${serial}/zones`),
    command: <T = unknown>(serial: string, cmd: string, params?: object) =>
        request<T>('POST', `/robot/${serial}/command`, params ? { cmd, params } : { cmd }),
}

/** ESP32-Bridge (OpenNeato) über den Server */
export const esp = {
    config: () => request<{ host: string; online: boolean; last_ok: number | null }>('GET', '/esp'),
    setHost: (host: string) => request<{ host: string; online: boolean; last_ok: number | null }>('PUT', '/esp', { host }),
    get: <T>(path: string) => request<T>('GET', `/esp/api/${path}`),
    put: <T>(path: string, body: unknown) => request<T>('PUT', `/esp/api/${path}`, body),
    post: <T = unknown>(path: string) => request<T>('POST', `/esp/api/${path}`),
}

/** Befehle an einen Gen3-Roboter (Cloud-Protokoll, über den Server) */
export const gen3 = {
    getRobotState: (s: string) => api.command<RobotStateData>(s, 'getRobotState'),
    getGeneralInfo: (s: string) => api.command<{ data: GeneralInfo }>(s, 'getGeneralInfo'),
    startHouse: (s: string, mode: CleaningMode, navigationMode: NavigationMode) =>
        api.command(s, 'startCleaning', { category: CleaningCategory.HOUSE, mode, navigationMode }),
    pause: (s: string) => api.command(s, 'pauseCleaning'),
    resume: (s: string) => api.command(s, 'resumeCleaning'),
    stop: (s: string) => api.command(s, 'stopCleaning'),
    sendToBase: (s: string) => api.command(s, 'sendToBase'),
    findMe: (s: string) => api.command(s, 'findMe'),
    dismissAlert: (s: string) => api.command(s, 'dismissCurrentAlert'),
    /** Erkundungsfahrt für eine neue Karte, nur aus der Basis */
    explore: (s: string) => api.command(s, 'startPersistentMapExploration'),
    getMapBoundaries: (s: string, mapId: string) =>
        api.command<{ data: { boundaries?: Boundary[] } }>(s, 'getMapBoundaries', { mapId }),
    /** ersetzt alle Zonen und No-Go-Linien der Karte; Zonen brauchen `relevancy` (Punkt innerhalb) */
    setMapBoundaries: (s: string, mapId: string, boundaries: Boundary[]) =>
        api.command(s, 'setMapBoundaries', { mapId, boundaries }),
    getSchedule: (s: string) => api.command<{ data: { enabled: boolean; events: ScheduleEvent[] } }>(s, 'getSchedule'),
}
