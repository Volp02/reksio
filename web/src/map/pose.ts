import type { MapData, Pose } from '../api/types'

/**
 * Pose (Meter, Ursprung = Basis beim Abdocken) → Kartenpixel. Ermittelt in docs/step0-koordinaten.md:
 * gleiche Umrechnung für jede Karte mit derselben Basis, gemessen 0 ± 1° Drehung.
 */
export const PX_PER_M = 25.5
const DOCK_OFFSET: [number, number] = [10.2, -2.3]

export interface MapPose { px: number; py: number; /** Blickrichtung im Bild, Bogenmaß */ heading: number }

export function poseToMap(map: MapData, p: { x: number; y: number; theta: number }): MapPose | undefined {
    if (!map.dock) return undefined
    return {
        px: map.dock.pixel_x + DOCK_OFFSET[0] + PX_PER_M * p.x,
        py: map.dock.pixel_y + DOCK_OFFSET[1] - PX_PER_M * p.y,
        heading: -(p.theta * Math.PI) / 180,
    }
}

/** Posen der laufenden Fahrt: alles nach der letzten Lücke von mehr als 15 min */
export function currentRun(poses: Pose[], now: number): Pose[] {
    if (!poses.length || now - poses[poses.length - 1].ts > 15 * 60) return []
    let start = 0
    for (let i = 1; i < poses.length; i++) if (poses[i].ts - poses[i - 1].ts > 15 * 60) start = i
    return poses.slice(start)
}

/** Position gilt nach 10 s ohne neue Messung als veraltet (DESIGN.md §12.3) */
export const POSE_STALE_S = 10
