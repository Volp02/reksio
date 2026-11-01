import { Radar } from 'lucide-react'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import { IconButton, Pill } from '../ui/ui'
import type { Live } from './useLive'

/** Reksio fährt gerade (der LIDAR dreht sich nur beim Reinigen) */
export const lidarAvailable = (live?: Live) => !!live?.robot && !live.robot.stale

/** LIDAR live ein/aus; nur sichtbar, solange Reksio fährt */
export function LidarToggle({ live, className = '' }: { live?: Live; className?: string }) {
    const { t } = useI18n()
    const { lidarOn, setLidarOn } = useStore()
    if (!lidarAvailable(live)) return null
    return <IconButton size="s" icon={<Radar />} label={t.map.lidar} aria-pressed={lidarOn}
        className={`${className}${lidarOn ? ' is-cur' : ''}`} onClick={() => setLidarOn(!lidarOn)} />
}

/** Hinweis „Experimentell“, solange LIDAR live an ist */
export function LidarTag({ live }: { live?: Live }) {
    const { t } = useI18n()
    const { lidarOn } = useStore()
    return lidarOn && lidarAvailable(live) ? <Pill label={t.map.experimental} /> : null
}
