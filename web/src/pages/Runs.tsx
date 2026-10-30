import { ChevronLeft, History } from 'lucide-react'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import { sortRuns, useMaps, useRunData, useRuns } from '../state/data'
import { fmtWhen, idToTs } from '../format'
import { MapView } from '../map/MapView'
import { Card, Empty, Label } from '../ui/ui'
import './pages.css'

export function Runs({ selected }: { selected?: string }) {
    const { t, locale } = useI18n()
    const s = useStore()
    const runs = useRuns(s.serial)
    const maps = useMaps(s.serial)
    const list = sortRuns(runs.data)
    const current = selected ?? list[0]?.id
    const run = useRunData(s.serial, current)
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
                                    {mapName(r.persistent_map) && <Label className="row-s">{mapName(r.persistent_map)!}</Label>}
                                </span>
                            </a>
                        </li>
                    ))}
                </ul>
            </Card>
            {current && (
                <Card className="runs-detail" title={when(current)}
                    icon={<a href="#/runs" className="btn btn--ghost btn--s btn--icon runs-back" aria-label={t.nav.back}><ChevronLeft /></a>}>
                    {run.data
                        ? <MapView data={run.data} kind="run" label={when(current)} />
                        : <Empty label={run.loading ? t.common.loading : t.map.noMap} />}
                </Card>
            )}
        </div>
    )
}
