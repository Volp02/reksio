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
