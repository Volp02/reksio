import { Cpu } from 'lucide-react'
import { useI18n } from '../i18n'
import { isFresh, TELEMETRY_STALE_S, useStore } from '../state/store'
import { fmtNumber, fmtTime } from '../format'
import { Card, KV, Value } from '../ui/ui'

/** Live-Werte vom ESP: Zustand, Motoren, Räder (Einstellungen und optional Übersicht) */
export function DiagnosticsCard({ className = '' }: { className?: string }) {
    const { t, locale } = useI18n()
    const s = useStore()
    const tel = s.telemetry
    const fresh = isFresh(tel?.ts, s.now, TELEMETRY_STALE_S)
    const m = fresh ? tel?.motors : undefined
    const none = t.common.none
    const num = (v: number | undefined, unit: string) => (v === undefined ? none : <Value value={fmtNumber(locale, v)} unit={unit} />)
    const pair = (a: number | undefined, b: number | undefined, unit: string) =>
        a === undefined || b === undefined ? none : <Value value={`${fmtNumber(locale, a)} · ${fmtNumber(locale, b)}`} unit={unit} />

    return (
        <Card className={`${className}${fresh ? '' : ' is-stale'}`} icon={<Cpu />} title={t.settings.diagnostics}
            aside={tel && <span className="meta">{fresh ? fmtTime(locale, s.server?.timezone, tel.ts, true) : t.settings.espStale}</span>}>
            <KV rows={[
                [t.settings.espState, <span key="e" className="mono wrap">{tel?.state?.robotState ?? none}</span>],
                [t.settings.brush, num(m?.brushRPM, 'rpm')],
                [t.settings.brushCurrent, num(m?.brushMA, 'mA')],
                [t.settings.vacuum, num(m?.vacuumRPM, 'rpm')],
                [t.settings.sideBrush, num(m?.sideBrushMA, 'mA')],
                [t.settings.wheelSpeed, pair(m?.leftWheelSpeed, m?.rightWheelSpeed, 'mm/s')],
                [t.settings.wheelLoad, pair(m?.leftWheelLoad, m?.rightWheelLoad, '%')],
            ]} />
        </Card>
    )
}
