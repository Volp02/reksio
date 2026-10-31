// Antworten des Vacuula-Servers (server/) und des Gen3-Cloud-Protokolls

export interface ServerInfo {
    version: string
    timezone: string
    utc_offset_minutes: number
}

export interface RobotSummary {
    type: 'neato.gen3' | 'neato.gen4'
    connected: boolean
    name: string
    installed_with?: string
}
export type Robots = Record<string, RobotSummary>

export enum RobotState { INVALID = 0, IDLE = 1, BUSY = 2, PAUSED = 3, ERROR = 4 }

export enum RobotAction {
    INVALID = 0,
    HOUSE_CLEANING = 1,
    SPOT_CLEANING = 2,
    MANUAL_CLEANING = 3,
    DOCKING = 4,
    USER_MENU_ACTIVE = 5,
    SUSPENDED_CLEANING = 6,
    UPDATING = 7,
    COPYING_LOGS = 8,
    RECOVERING_LOCATION = 9,
    MAP_CLEANING = 11,
    EXPLORING_MAP = 12,
    ACQUIRING_PERSISTENT_MAP_IDS = 13,
    CREATING_UPLOADING_MAP = 14,
    SUSPENDED_EXPLORATION = 15,
}

export enum CleaningCategory { MANUAL = 1, HOUSE = 2, SPOT = 3, MAP = 4 }
export enum CleaningMode { ECO = 1, TURBO = 2 }
export enum NavigationMode { NORMAL = 1, EXTRA_CARE = 2, DEEP = 3 }

export interface RobotStateData {
    state: RobotState
    action: RobotAction
    error: string | null
    alert: string | null
    cleaning: {
        category: CleaningCategory
        mode: CleaningMode
        modifier: number
        navigationMode: NavigationMode
    }
    details: {
        isCharging: boolean
        isDocked: boolean
        isScheduleEnabled: boolean
        dockHasBeenSeen: boolean
        charge: number
    }
    availableCommands: {
        start: boolean
        stop: boolean
        pause: boolean
        resume: boolean
        goToBase: boolean
    }
    meta?: { modelName: string; firmware: string }
}

export interface GeneralInfo {
    productNumber: string
    serial: string
    model: string
    firmware: string
    battery: { level: number; timeToEmpty: number; timeToFullCharge: number; totalCharges: number; vendor: string }
}

/** ESP-Telemetrie (server/…/esp/poller.py) */
export interface Telemetry {
    ts: number
    state: { uiState: string; robotState: string } | null
    error: { hasError: boolean; kind: string; errorCode: number; errorMessage: string; displayMessage: string } | null
    charger: {
        fuelPercent: number
        chargingActive: boolean
        extPwrPresent: boolean
        vBattV: number
    } | null
    analog: {
        batteryVoltageV: number
        batteryCurrentMA: number
        batteryTemperatureC: number
    } | null
    /** GetDigitalSensors (bei jeder Probe) */
    sensors?: {
        dustbinIn: boolean; dcJackIn: boolean; leftWheelExtended: boolean; rightWheelExtended: boolean
        bumperLeftSide: boolean; bumperLeftFront: boolean; bumperLeftLds: boolean
        bumperRightSide: boolean; bumperRightFront: boolean; bumperRightLds: boolean
    } | null
    /** GetUserSettings-Zähler (alle 5 min) */
    maintenance?: {
        binRuntimeMin: number | null; binFullCount: number | null; binReminderMin: number | null
        filterChangeS: number | null; brushChangeS: number | null
    } | null
    /** WLAN des Roboters selbst (alle 5 min) */
    robotWifi?: { ssid: string | null; bssid: string | null; ip: string | null; signal: string | null; cloud: boolean } | null
    /** Lebensdauerzähler (alle 5 min) */
    warranty?: { cumulativeCleaningTimeSeconds: number; cumulativeBatteryCycles: number } | null
    motors: {
        brushRPM: number
        brushMA: number
        vacuumRPM: number
        sideBrushMA: number
        leftWheelLoad: number
        rightWheelLoad: number
        leftWheelSpeed: number
        rightWheelSpeed: number
    } | null
}

export interface Pose { ts: number; x: number; y: number; theta: number }

export interface PersistentMap {
    id: string
    name: string
    enabled: boolean
    in_maps_list: boolean
    base: [number, number]
}

export interface RunSummary { id: string; persistent_map: string | null }

export interface MapData {
    width: number
    height: number
    legend: Record<string, string>
    rle: [number, number][]
    dock?: { pixel_x: number; pixel_y: number }
}

export interface ScheduleEvent {
    day: number
    startTime: string
    mode?: number
    mapId?: string
    boundaryId?: string
}

/** Zone (Polygon) oder No-Go-Linie (Polylinie); Eckpunkte normiert auf Kartenbreite/-höhe */
export interface Boundary {
    id: string
    type: 'polygon' | 'polyline'
    name: string
    color: string
    enabled?: boolean
    vertices: [number, number][]
    relevancy?: [number, number]
}

/** Zonen nacheinander reinigen: Warteschlange im Server */
export interface ZoneQueue {
    mapId: string
    zones: { id: string; name: string }[]
    /** aktuelle bzw. als Nächstes startende Zone */
    index: number
    mode: CleaningMode
    navigationMode: NavigationMode
    status: 'cleaning' | 'waiting'
    since: number
    busy: boolean
    /** warum die nächste Zone noch nicht startet */
    reason: 'charging' | 'error' | 'blocked' | null
}

/** ESP-History-Sitzung (OpenNeato /api/history), Zusammenfassung einer Fahrt */
export interface EspSession {
    name: string
    recording: boolean
    session: { time: number; battery: number } | null
    summary: {
        time: number; duration: number; recharges: number; distanceTraveled: number; areaCovered: number
        errorsDuringClean: number; batteryStart: number; batteryEnd: number
    } | null
}

export interface BoundaryBackup { id: number; ts: number; boundaries: Boundary[] }

export interface ZoneHistory { last: number | null; count: number }

/** Termin im Zeitplan des Servers: ganze Karte (zones leer) oder Zonen nacheinander */
export interface Plan {
    id: string
    enabled: boolean
    /** 0 = Sonntag … 6 = Samstag (wie beim Roboter) */
    days: number[]
    /** „HH:MM“ in der Zeitzone des Servers */
    time: string
    mapId: string | null
    zones: { id: string; name: string }[]
    mode: CleaningMode
    navigationMode: NavigationMode
    /** diesen Start auslassen (YYYY-MM-DD, Zeitzone des Servers) */
    skip?: string | null
    /** nächste Startzeit (Unix), nur vom Server */
    next?: number | null
    last?: { due: string; ts: number; result: 'started' | 'skipped' | 'waiting'; reason: string | null }
}
