import { useEffect, useState } from 'react'
import { History, RotateCcw, X } from 'lucide-react'
import { api } from '../api/client'
import type { Boundary, BoundaryBackup } from '../api/types'
import { fmtWhen } from '../format'
import { fill, useI18n } from '../i18n'
import { useStore } from '../state/store'
import { Button, Confirm, Empty, IconButton, Label } from '../ui/ui'

const shape = (b: Boundary) => JSON.stringify([b.name, b.type, b.color, b.enabled !== false, b.vertices])

/** Was der gesicherte Stand gegenüber dem aktuellen anders hat */
function diff(backup: Boundary[], current: Boundary[]) {
    const cur = new Map(current.map((b) => [b.id, b]))
    const old = new Set(backup.map((b) => b.id))
    return {
        added: backup.filter((b) => !cur.has(b.id)),
        removed: current.filter((b) => !old.has(b.id)),
        changed: backup.filter((b) => cur.has(b.id) && shape(cur.get(b.id)!) !== shape(b)),
    }
}

/** Gesicherte Stände der Zonen und Linien einer Karte; Wiederherstellen ersetzt die ganze Liste */
export function BoundaryHistory({ mapId, current, busy, onRestore, onClose }: {
    mapId: string
    current: Boundary[]
    busy: boolean
    onRestore: (list: Boundary[]) => void
    onClose: () => void
}) {
    const { t, locale } = useI18n()
    const s = useStore()
    const [list, setList] = useState<BoundaryBackup[]>()
    const [failed, setFailed] = useState(false)
    const [confirm, setConfirm] = useState<BoundaryBackup>()

    useEffect(() => {
        if (!s.serial) return
        let alive = true
        api.boundaryBackups(s.serial, mapId)
            .then((l) => alive && setList(l))
            .catch(() => alive && setFailed(true))
        return () => { alive = false }
    }, [s.serial, mapId])

    const when = (ts: number) => fmtWhen(locale, s.server?.timezone, ts, s.now, t.overview, true)
    const label = (b: Boundary) => b.name || (b.type === 'polyline' ? t.zones.line : t.zones.unnamed)
    const names = (bs: Boundary[]) => bs.map(label).join(', ')
    const count = (n: number, one: string, many: string) => (n === 1 ? one : fill(many, { n }))

    return (<>
        <div className="zedit-h">
            <Label className="zedit-t">{t.zones.history}</Label>
            <IconButton size="s" icon={<X />} label={t.common.cancel} onClick={onClose} />
        </div>
        {list?.length ? (
            <ul className="rows">
                {list.map((e) => {
                    const d = diff(e.boundaries, current)
                    const same = !d.added.length && !d.removed.length && !d.changed.length
                    const zones = e.boundaries.filter((b) => b.type === 'polygon').length
                    return (
                        <li key={e.id} className="row zhist">
                            <span className="row-main">
                                <Label className="row-t">{when(e.ts)}</Label>
                                <Label className="row-s">{`${count(zones, t.zones.zonesOne, t.zones.zonesN)} · ${count(e.boundaries.length - zones, t.zones.linesOne, t.zones.linesN)}`}</Label>
                                {d.added.length > 0 && <Label className="row-s zhist-d">{fill(t.zones.historyAdded, { names: names(d.added) })}</Label>}
                                {d.removed.length > 0 && <Label className="row-s zhist-d">{fill(t.zones.historyRemoved, { names: names(d.removed) })}</Label>}
                                {d.changed.length > 0 && <Label className="row-s zhist-d">{fill(t.zones.historyChanged, { names: names(d.changed) })}</Label>}
                            </span>
                            {same
                                ? <Label className="row-s">{t.zones.historyCurrent}</Label>
                                : <Button size="s" icon={<RotateCcw />} label={t.zones.restore} disabled={busy || !s.connected}
                                    onClick={() => setConfirm(e)} />}
                        </li>
                    )
                })}
            </ul>
        ) : <Empty icon={<History />} label={failed ? t.actions.failed : list ? t.zones.historyNone : t.common.loading} />}
        <Confirm open={!!confirm} tone="primary" title={confirm ? fill(t.zones.restoreConfirm, { when: when(confirm.ts) }) : ''}
            confirmLabel={t.zones.restore} cancelLabel={t.common.cancel} onCancel={() => setConfirm(undefined)}
            onConfirm={() => { onRestore(confirm!.boundaries); setConfirm(undefined) }} />
    </>)
}
