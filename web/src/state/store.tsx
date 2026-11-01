import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { API, api, gen3 } from '../api/client'
import type { LidarScan, Pose, Robots, RobotStateData, ServerInfo, Telemetry, ZoneQueue } from '../api/types'

const HISTORY_S = 3 * 3600
const LIDAR_RENEW_MS = 5000 // Server liest Scans 15 s pro Anfrage
const LIDAR_OFF_AFTER_S = 60 // so lange keine Position mehr: Fahrt vorbei, LIDAR aus

export interface Store {
    server?: ServerInfo
    serverError: boolean
    robots?: Robots
    serial?: string
    name: string
    connected: boolean
    robot?: RobotStateData
    robotAt?: number
    telemetry?: Telemetry
    history: Telemetry[]
    pose?: Pose
    /** Posen der letzten Stunden (für die Spur der laufenden Fahrt) */
    poses: Pose[]
    /** letzte Server-Meldung (z. B. Staubbehälter geleert und quittiert) */
    notice?: Notice
    /** Zonen, die der Server nacheinander reinigen lässt */
    zoneQueue?: ZoneQueue | null
    /** LIDAR live angefordert (Knopf auf der Karte, startet immer aus) */
    lidarOn: boolean
    setLidarOn: (on: boolean) => void
    /** letzter LIDAR-Scan, solange `lidarOn` */
    lidar?: LidarScan
    /** Zeitpunkt der letzten Änderung am Zeitplan des Servers (neu laden) */
    plansAt: number
    /** Sekundentakt für Frische-Anzeigen */
    now: number
    refresh: () => void
    refreshRobot: () => Promise<void>
    setZoneQueue: (q: ZoneQueue | null) => void
}

export interface Notice { type: string; ts: number; reason?: string | null; failed?: string[] }

const Ctx = createContext<Store | null>(null)

/** Cloud-Ereignis vom Roboter, durchgereicht über /api/robot/<serial>/connect */
interface RobotEvent { serial: string; data?: { type?: string; eventId?: string; data?: RobotStateData } }

export function StoreProvider({ children }: { children: ReactNode }) {
    const [server, setServer] = useState<ServerInfo>()
    const [serverError, setServerError] = useState(false)
    const [robots, setRobots] = useState<Robots>()
    const [robot, setRobot] = useState<RobotStateData>()
    const [robotAt, setRobotAt] = useState<number>()
    const [telemetry, setTelemetry] = useState<Telemetry>()
    const [history, setHistory] = useState<Telemetry[]>([])
    const [pose, setPose] = useState<Pose>()
    const [poses, setPoses] = useState<Pose[]>([])
    const [notice, setNotice] = useState<Notice>()
    const [zoneQueue, setZoneQueue] = useState<ZoneQueue | null>()
    const [plansAt, setPlansAt] = useState(0)
    const [lidarOn, setLidarOn] = useState(false)
    const [lidar, setLidar] = useState<LidarScan>()
    const [now, setNow] = useState(() => Date.now() / 1000)
    const [reload, setReload] = useState(0)

    // einziger Gen3-Roboter (Reksio); Gen4 wird nicht unterstützt
    const serial = useMemo(
        () => robots && Object.entries(robots).find(([, r]) => r.type === 'neato.gen3')?.[0],
        [robots],
    )
    const serialRef = useRef(serial)
    serialRef.current = serial
    const connected = !!(serial && robots?.[serial]?.connected)

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now() / 1000), 1000)
        return () => clearInterval(id)
    }, [])

    useEffect(() => {
        setServerError(false)
        api.server().then(setServer).catch(() => setServerError(true))
        api.robots().then(setRobots).catch(() => setServerError(true))
    }, [reload])

    // serverweite Ereignisse: Roboterliste, ESP-Telemetrie, Position
    useEffect(() => {
        const es = new EventSource(`${API}/events`)
        es.addEventListener('robots', (e) => setRobots(JSON.parse((e as MessageEvent).data)))
        es.addEventListener('telemetry', (e) => {
            const t = JSON.parse((e as MessageEvent).data) as Telemetry & { serial: string }
            if (t.serial !== serialRef.current) return
            // seltene Felder (Wartung, Roboter-WLAN, Zähler) kommen nur alle 5 min: letzten Wert behalten
            setTelemetry((prev) => ({
                ...t,
                maintenance: t.maintenance ?? prev?.maintenance,
                robotWifi: t.robotWifi ?? prev?.robotWifi,
                warranty: t.warranty ?? prev?.warranty,
            }))
            setHistory((h) => [...h.filter((x) => x.ts > t.ts - HISTORY_S), t])
        })
        es.addEventListener('pose', (e) => {
            const p = JSON.parse((e as MessageEvent).data) as Pose & { serial: string }
            if (p.serial !== serialRef.current) return
            setPose(p)
            setPoses((ps) => [...ps.filter((x) => x.ts > p.ts - HISTORY_S), p])
        })
        es.addEventListener('lidar', (e) => {
            const l = JSON.parse((e as MessageEvent).data) as LidarScan & { serial: string }
            if (l.serial === serialRef.current) setLidar({ ts: l.ts, points: l.points })
        })
        es.addEventListener('notice', (e) => {
            const n = JSON.parse((e as MessageEvent).data) as Notice & { serial: string }
            if (n.serial === serialRef.current) setNotice({ type: n.type, ts: n.ts, reason: n.reason })
        })
        es.addEventListener('zones', (e) => {
            const z = JSON.parse((e as MessageEvent).data) as { serial: string; queue: ZoneQueue | null }
            if (z.serial === serialRef.current) setZoneQueue(z.queue)
        })
        es.addEventListener('plans', (e) => {
            const p = JSON.parse((e as MessageEvent).data) as { serial: string }
            if (p.serial === serialRef.current) setPlansAt(Date.now())
        })
        es.onopen = () => setServerError(false)
        return () => es.close()
    }, [reload])

    const refreshRobot = useCallback(async () => {
        const s = serialRef.current
        if (!s) return
        try {
            const state = await gen3.getRobotState(s)
            setRobot(state)
            setRobotAt(Date.now() / 1000)
        } catch {
            // Roboter antwortet nicht: alter Stand bleibt, Verbindung zeigt die Pill
        }
    }, [])

    // Robot-Zustand: einmal holen, danach Ereignisse des Roboters
    useEffect(() => {
        if (!serial || !connected) return
        refreshRobot()
        const es = new EventSource(`${API}/robot/${serial}/connect`)
        es.onopen = () => refreshRobot()
        es.onmessage = (e) => {
            const ev = JSON.parse(e.data) as RobotEvent
            const d = ev.data
            if (d?.data && (d.type === 'state' || d.eventId === '77')) {
                setRobot((cur) => ({ ...cur, ...d.data } as RobotStateData))
                setRobotAt(Date.now() / 1000)
            }
        }
        return () => es.close()
    }, [serial, connected, refreshRobot, reload])

    // ESP: letzter Stand und Verlauf für die Akkukurve
    useEffect(() => {
        if (!serial) return
        api.telemetryLatest(serial).then(setTelemetry).catch(() => undefined)
        api.zones(serial).then(setZoneQueue).catch(() => undefined)
        api.telemetry(serial, Date.now() / 1000 - HISTORY_S).then(setHistory).catch(() => undefined)
        api.poses(serial, Date.now() / 1000 - HISTORY_S).then((ps) => {
            setPoses(ps)
            if (ps.length) setPose(ps[ps.length - 1])
        }).catch(() => undefined)
    }, [serial, reload])

    // LIDAR nur, solange jemand zusieht: Anfrage erneuern, solange an und die Seite sichtbar ist
    useEffect(() => {
        if (!lidarOn || !serial) { setLidar(undefined); return }
        const ask = () => { if (document.visibilityState === 'visible') api.lidar(serial).catch(() => undefined) }
        ask()
        const id = setInterval(ask, LIDAR_RENEW_MS)
        document.addEventListener('visibilitychange', ask)
        return () => { clearInterval(id); document.removeEventListener('visibilitychange', ask) }
    }, [lidarOn, serial])
    useEffect(() => {
        if (lidarOn && (!pose || now - pose.ts > LIDAR_OFF_AFTER_S)) setLidarOn(false)
    }, [lidarOn, pose, now])

    const value: Store = {
        server, serverError, robots, serial,
        name: (serial && robots?.[serial]?.name) || 'Reksio',
        connected, robot, robotAt, telemetry, history, pose, poses, notice, zoneQueue, plansAt, now,
        lidarOn, setLidarOn, lidar: lidarOn ? lidar : undefined,
        refresh: () => setReload((n) => n + 1),
        setZoneQueue,
        refreshRobot,
    }
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
    const v = useContext(Ctx)
    if (!v) throw new Error('useStore outside StoreProvider')
    return v
}

/** ESP-Telemetrie gilt nach 30 s als veraltet (DESIGN.md §12.3) */
export const TELEMETRY_STALE_S = 30

export function isFresh(ts: number | undefined, now: number, maxAge: number): boolean {
    return ts !== undefined && now - ts <= maxAge
}
