import { useMemo } from 'react'
import type { MapData, Pose } from '../api/types'
import { useStore } from '../state/store'
import { currentRun, poseToMap, POSE_STALE_S, type MapPose } from './pose'

export interface Live {
    robot?: MapPose & { stale: boolean }
    trail: MapPose[]
    /** letzter LIDAR-Scan (Kartenpixel), nur wenn eingeschaltet und frisch */
    scan?: { px: number; py: number }[]
}

/** ein Scan gilt nach 10 s als veraltet und verschwindet */
const LIDAR_STALE_S = 10

/** gespeicherte Strecke einer Reinigung auf `map` (ohne Reksio) */
export function useTrail(map: MapData | undefined, poses: Pose[] | undefined): Live | undefined {
    return useMemo(() => (map?.dock && poses?.length ? { trail: poses.map((p) => poseToMap(map, p)!) } : undefined), [map, poses])
}

/** Live-Position und Spur der laufenden Fahrt auf `map`; leer, wenn gerade keine Fahrt läuft */
export function useLive(map: MapData | undefined): Live | undefined {
    const { poses, now, lidar } = useStore()
    // Spur nur bei neuen Posen neu berechnen, nicht im Sekundentakt
    const run = useMemo(() => currentRun(poses, Date.now() / 1000), [poses])
    const scan = useMemo(
        () => (map?.dock && lidar ? lidar.points.map(([x, y]) => poseToMap(map, { x, y, theta: 0 })!) : undefined),
        [map, lidar],
    )
    return useMemo(() => {
        if (!map?.dock || !run.length || now - run[run.length - 1].ts > 15 * 60) return undefined
        const trail = run.map((p) => poseToMap(map, p)!)
        const last = run[run.length - 1]
        const fresh = lidar && now - lidar.ts <= LIDAR_STALE_S
        return { trail, robot: { ...poseToMap(map, last)!, stale: now - last.ts > POSE_STALE_S }, scan: fresh ? scan : undefined }
    }, [map, run, now, lidar, scan])
}
