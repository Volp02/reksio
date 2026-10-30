import { useState } from 'react'
import { Map as MapIcon } from 'lucide-react'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import { activeMap, useBoundaries, useMapData, useMaps } from '../state/data'
import { MapView } from '../map/MapView'
import { Legend } from '../map/Legend'
import { Empty, Segmented } from '../ui/ui'
import './pages.css'

export function MapPage() {
    const { t } = useI18n()
    const s = useStore()
    const maps = useMaps(s.serial)
    const [chosen, setChosen] = useState<string>()
    const current = chosen ?? activeMap(maps.data)?.id
    const map = maps.data?.find((m) => m.id === current)
    const data = useMapData(s.serial, current)
    const bounds = useBoundaries(s.serial, current, s.connected)

    return (
        <div className="mappage">
            {(maps.data?.length ?? 0) > 1 && (
                <Segmented label={t.nav.map} value={current ?? ''} onChange={setChosen}
                    options={maps.data!.map((m) => ({ value: m.id, label: m.name || m.id }))} />
            )}
            <div className="mappage-view">
                {data.data
                    ? <MapView data={data.data} boundaries={bounds.data} label={map?.name || t.map.floor} fill />
                    : <Empty icon={<MapIcon />} label={data.loading || maps.loading ? t.common.loading : t.map.noMap} />}
            </div>
            <Legend boundaries={bounds.data} noGo={t.map.noGo} />
        </div>
    )
}
