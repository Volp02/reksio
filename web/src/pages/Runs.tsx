import { useState } from 'react'
import { ChevronLeft, History, Route } from 'lucide-react'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import { sessionFor, sortRuns, useEspSessions, useMapData, useMaps, useRunData, useRunPath, useRuns } from '../state/data'
import { runStatsRows, runStatsShort } from './runStats'
import { fmtWhen, idToTs } from '../format'
import { MapView } from '../map/MapView'
import { useTrail } from '../map/useLive'
import { Card, Empty, IconButton, KV, Label } from '../ui/ui'
import './pages.css'

const PATH_KEY = 'reksio.runPath'

export function Runs({ selected }: { selected?: string }) {
    const { t, locale } = useI18n()
    const s = useStore()
    const runs = useRuns(s.serial)
    const maps = useMaps(s.serial)
    const sessions = useEspSessions()
    const sessionOf = (id: string) => sessionFor(sessions.data, idToTs(id))
    const list = sortRuns(runs.data)
    const current = selected ?? list[0]?.id
    const run = useRunData(s.serial, current)
    // jede Reinigung hat eine Bodenkarte mit derselben ID und demselben Raster
    const floor = useMapData(s.serial, current)
    const session = current ? sessionOf(current) : undefined
    const path = useRunPath(s.serial, current ? idToTs(current) : undefined, session?.summary?.time)
    const trail = useTrail(floor.data, path.data)
    const [showPath, setShowPath] = useState(() => localStorage.getItem(PATH_KEY) !== 'off')
    const togglePath = () => setShowPath((v) => { localStorage.setItem(PATH_KEY, v ? 'off' : 'on'); return !v })
    const when = (id: string) => {
        const ts = idToTs(id)
        return ts ? fmtWhen(locale, s.server?.timezone, ts, s.now, t.overview, true) : id
    }
    const mapName = (id: string | null) => maps.data?.find((m) => m.id === id)?.name

    if (!list.length) return <Card><Empty icon={<History />} label={runs.loading ? t.common.loading : t.runs.empty} /></Card>

    return (
        <div className={`runs${selected ? ' has-detail' : ''}`}>
            <Card className="runs-list">
                <ul className="rows">
                    {list.map((r) => (
                        <li key={r.id}>
                            <a className="row" href={`#/runs/${encodeURIComponent(r.id)}`} aria-current={r.id === current ? 'true' : undefined}>
                                <span className="row-main">
                                    <Label className="row-t">{when(r.id)}</Label>
                                    {(mapName(r.persistent_map) || runStatsShort(locale, sessionOf(r.id))) &&
                                        <Label className="row-s">{[mapName(r.persistent_map), runStatsShort(locale, sessionOf(r.id))].filter(Boolean).join(' · ')}</Label>}
                                </span>
                            </a>
                        </li>
                    ))}
                </ul>
            </Card>
            {current && (
                <Card className="runs-detail" title={when(current)}
                    icon={<a href="#/runs" className="btn btn--ghost btn--s btn--icon runs-back" aria-label={t.nav.back}><ChevronLeft /></a>}>
                    {floor.data
                        ? <MapView data={floor.data} run={run.data} label={when(current)} live={showPath ? trail : undefined}
                            tools={trail && <div className="maptools-g">
                                <IconButton size="s" icon={<Route />} label={t.runs.path} aria-pressed={showPath} onClick={togglePath} />
                            </div>} />
                        : <Empty label={floor.loading || run.loading ? t.common.loading : t.map.noMap} />}
                    {runStatsRows(t, locale, sessionOf(current)).length > 0 && <KV rows={runStatsRows(t, locale, sessionOf(current))} />}
                </Card>
            )}
        </div>
    )
}
