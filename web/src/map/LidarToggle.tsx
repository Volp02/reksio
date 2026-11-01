import { Radar } from 'lucide-react'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import { IconButton } from '../ui/ui'
import type { Live } from './useLive'

/** LIDAR live ein/aus; nur sichtbar, solange Reksio fährt (der LIDAR dreht sich nur beim Reinigen) */
export function LidarToggle({ live, className = '' }: { live?: Live; className?: string }) {
    const { t } = useI18n()
    const { lidarOn, setLidarOn } = useStore()
    if (!live?.robot || live.robot.stale) return null
    return <IconButton size="s" icon={<Radar />} label={t.map.lidar} aria-pressed={lidarOn}
        className={`${className}${lidarOn ? ' is-cur' : ''}`} onClick={() => setLidarOn(!lidarOn)} />
}
