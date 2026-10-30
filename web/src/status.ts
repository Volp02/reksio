import { RobotAction, RobotState, type RobotStateData, type Telemetry } from './api/types'
import type { Dict } from './i18n/de'

export type Tone = 'ok' | 'info' | 'warn' | 'danger' | 'neutral'

export interface Status { label: string; tone: Tone }

/** Lage von Reksio als ein Wort + Ton (DESIGN.md §12.1) */
export function robotStatus(t: Dict, connected: boolean, r: RobotStateData | undefined): Status {
    if (!connected || !r) return { label: t.status.offline, tone: 'neutral' }
    if (r.error || r.state === RobotState.ERROR) return { label: problemText(t, r.error) ?? t.status.error, tone: 'danger' }
    if (r.state === RobotState.PAUSED) return { label: t.status.paused, tone: 'warn' }
    if (r.state === RobotState.BUSY) {
        switch (r.action) {
            case RobotAction.HOUSE_CLEANING:
            case RobotAction.SPOT_CLEANING:
            case RobotAction.MAP_CLEANING:
            case RobotAction.MANUAL_CLEANING:
                return { label: t.status.cleaning, tone: 'info' }
            case RobotAction.DOCKING:
                return { label: t.status.returning, tone: 'info' }
            case RobotAction.SUSPENDED_CLEANING:
            case RobotAction.SUSPENDED_EXPLORATION:
                return r.details.isCharging
                    ? { label: t.status.chargingResume, tone: 'info' }
                    : { label: t.status.paused, tone: 'warn' }
            case RobotAction.EXPLORING_MAP:
                return { label: t.status.exploring, tone: 'info' }
            default:
                return { label: t.status.busy, tone: 'info' }
        }
    }
    if (r.details.isCharging) return { label: t.status.charging, tone: 'info' }
    return { label: t.status.ready, tone: 'ok' }
}

/** Fehler-/Hinweis-Code des Roboters übersetzen, sonst Originaltext */
export function problemText(t: Dict, code: string | null | undefined): string | undefined {
    if (!code) return undefined
    const key = code.replace(/^ui_(error|alert)_/, '') as keyof Dict['errors']
    return t.errors[key] ?? code.replace(/_/g, ' ')
}

export function isCleaning(r: RobotStateData | undefined): boolean {
    return !!r && (r.state === RobotState.BUSY || r.state === RobotState.PAUSED) && r.action !== RobotAction.DOCKING
}

/** Akkustand: ESP (frisch) vor Cloud-Zustand */
export function batteryPercent(r: RobotStateData | undefined, tel: Telemetry | undefined, telFresh: boolean): number | undefined {
    if (telFresh && tel?.charger) return tel.charger.fuelPercent
    return r?.details.charge
}

export function batteryTone(p: number | undefined): Tone {
    if (p === undefined) return 'neutral'
    if (p < 15) return 'danger'
    if (p < 30) return 'warn'
    return 'neutral'
}

/** Verbrauch in %/h über die letzten 30 min Entladen, sonst undefined */
export function dischargeRate(history: Telemetry[]): number | undefined {
    const pts = history.filter((h) => h.charger && !h.charger.extPwrPresent)
    if (pts.length < 2) return undefined
    const last = pts[pts.length - 1]
    const first = pts.find((p) => p.ts >= last.ts - 1800) ?? pts[0]
    const dt = (last.ts - first.ts) / 3600
    const dp = first.charger!.fuelPercent - last.charger!.fuelPercent
    if (dt < 0.1 || dp <= 0) return undefined
    return dp / dt
}

/**
 * Beginn der laufenden Reinigung aus dem Verlauf (erster ST_F*-Zustand nach einem Ruhezustand).
 * Nur wenn der Ruhezustand davor im Verlauf liegt, sonst ist der Beginn nicht bekannt.
 */
export function cleaningSince(history: Telemetry[]): number | undefined {
    let since: number | undefined
    let sawIdle = false
    for (const h of history) {
        const s = h.state?.robotState ?? ''
        if (!s) continue
        if (s.startsWith('ST_F') || s.startsWith('ST_M1_Charging_Cleaning')) {
            if (sawIdle) since ??= h.ts
        } else {
            sawIdle = true
            since = undefined
        }
    }
    return since
}
