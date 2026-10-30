import type { GeneralInfo, MapData, PersistentMap, Robots, RobotStateData, RunSummary, ScheduleEvent, ServerInfo, Telemetry } from './types'
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
    return (text ? JSON.parse(text) : undefined) as T
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
    command: <T = unknown>(serial: string, cmd: string, params?: object) =>
        request<T>('POST', `/robot/${serial}/command`, params ? { cmd, params } : { cmd }),
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
    getSchedule: (s: string) => api.command<{ data: { enabled: boolean; events: ScheduleEvent[] } }>(s, 'getSchedule'),
}
