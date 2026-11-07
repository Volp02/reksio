import type { Boundary, BoundaryBackup, Gen4Boundary, GeneralInfo, Incident, Job, MapData, Plan, Pose, PersistentMap, Robots, RobotStateData, RunSummary, ScheduleEvent, ServerInfo, Telemetry, ZoneHistory, ZoneQueue } from './types'
import { CleaningCategory, type CleaningMode, type NavigationMode } from './types'

// Relativ, damit die App auch hinter einem Präfix (HA-Ingress) läuft
export const API = new URL('api/', document.baseURI).pathname.replace(/\/$/, '')

/** Ereignis am window, wenn der Server eine Anmeldung verlangt (Sitzung abgelaufen, Passwort geändert) */
export const UNAUTHORIZED = 'reksio:unauthorized'

export interface AuthState { enabled: boolean; authed: boolean }

/** Reksio-Version dieser Oberfläche (beim Bau aus dem Release-Tag), leer bei eigenen Builds */
export const UI_VERSION: string = import.meta.env.VITE_REKSIO_VERSION ?? ''

const RELEASES = 'https://github.com/Volp02/reksio/releases'

/** Android-App: vom Server, wenn dort eine liegt (data/app), sonst aus dem GitHub-Release zur Version des Servers */
export function apkUrl(server?: ServerInfo): string {
    if (server?.android_app) return `${API}/app/reksio.apk`
    const v = server?.reksio_version
    return v ? `${RELEASES}/download/v${v}/reksio.apk` : `${RELEASES}/latest/download/reksio.apk`
}

/** a > b nach Versionsnummer (0.3.0 > 0.2.1, 0.3.0 > 0.3.0-rc1) */
export function newer(a: string, b: string): boolean {
    const parts = (v: string) => v.split('-')[0].split('.').map((n) => parseInt(n) || 0)
    const [x, y] = [parts(a), parts(b)]
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
        if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0)
    }
    return !a.includes('-') && b.includes('-')
}

export class HttpError extends Error {
    constructor(public status: number, message: string) { super(message) }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.status === 401 && !path.startsWith('/auth')) window.dispatchEvent(new Event(UNAUTHORIZED))
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
export const auth = {
    state: () => request<AuthState>('GET', '/auth'),
    login: (password: string) => request<{ token: string }>('POST', '/auth/login', { password }),
    logout: () => request('POST', '/auth/logout'),
    /** leer = Schutz abschalten */
    setPassword: (password: string) => request<{ enabled: boolean }>('PUT', '/auth/password', { password }),
}

export const api = {
    server: () => request<ServerInfo>('GET', '/server'),
    robots: () => request<Robots>('GET', '/robots'),
    maps: (serial: string) => request<PersistentMap[]>('GET', `/robot/${serial}/maps`),
    map: (serial: string, id: string) => request<MapData>('GET', `/robot/${serial}/maps/${id}`),
    runs: (serial: string) => request<RunSummary[]>('GET', `/robot/${serial}/runs`),
    jobs: (serial: string) => request<Job[]>('GET', `/robot/${serial}/jobs`),
    incidents: (serial: string, since: number, until: number) =>
        request<Incident[]>('GET', `/robot/${serial}/incidents?since=${since}&until=${until}`),
    run: (serial: string, id: string) => request<MapData>('GET', `/robot/${serial}/run/${id}`),
    telemetryLatest: (serial: string) => request<Telemetry>('GET', `/robot/${serial}/telemetry/latest`),
    telemetry: (serial: string, since: number, until?: number) =>
        request<Telemetry[]>('GET', `/robot/${serial}/telemetry?since=${since}${until ? `&until=${until}` : ''}`),
    poses: (serial: string, since: number, until?: number) =>
        request<[number, number, number, number][]>('GET', `/robot/${serial}/poses?since=${since}${until ? `&until=${until}` : ''}`)
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
    /** LIDAR live für die nächsten 15 s (beim Zusehen alle paar Sekunden erneuern); Punkte kommen als Ereignis `lidar` */
    lidar: (serial: string) => request<{ until: number; scanning: boolean }>('POST', `/robot/${serial}/lidar`),
    command: <T = unknown>(serial: string, cmd: string, params?: object) =>
        request<T>('POST', `/robot/${serial}/command`, params ? { cmd, params } : { cmd }),
    /** Gen4: Befehl („ability“) mit Parametern auf oberster Ebene; Antwort `{ code, body }` */
    ability: <T = unknown>(serial: string, ability: string, params?: object) =>
        request<{ code: number; body: T }>('POST', `/robot/${serial}/command`, { ability, ...params }),
    rename: (serial: string, name: string) => request<void>('POST', `/robot/${serial}`, { name }),
    /** Gen4: Zonen und No-Go-Linien liegen im Server, der Roboter bekommt sie mit der Karte (promote) */
    gen4Boundaries: (serial: string, mapId: string) => request<Gen4Boundary[]>('GET', `/robot/${serial}/maps/${mapId}/boundaries`),
    setGen4Boundaries: (serial: string, mapId: string, list: Gen4Boundary[]) => request<void>('POST', `/robot/${serial}/maps/${mapId}/boundaries`, list),
    /** Gen4: Karte samt Zonen an den Roboter schicken und verwenden */
    promote: (serial: string, mapId: string) => request<void>('POST', `/robot/${serial}/maps/${mapId}/promote`),
    /** Gen4: Bodenkarte einer Reinigung in die Kartenliste aufnehmen */
    useMap: (serial: string, mapId: string) => request<void>('POST', `/robot/${serial}/maps/${mapId}/use`),
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
    /** ganze Karte (Kategorie Karte, damit No-Go-Linien gelten); lehnt der Roboter ab, normale Hausreinigung */
    startWhole: async (s: string, mapId: string | undefined, mode: CleaningMode, navigationMode: NavigationMode) => {
        if (mapId) {
            const res = await api.command<{ result?: string }>(s, 'startCleaning', { category: CleaningCategory.MAP, mapId, mode, navigationMode })
                .catch(() => undefined)
            if (res?.result === 'ok') return res
        }
        return gen3.startHouse(s, mode, navigationMode)
    },
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
