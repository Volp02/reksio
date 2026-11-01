import { Cpu } from 'lucide-react'
import { useI18n } from '../i18n'
import { isFresh, TELEMETRY_STALE_S, useStore } from '../state/store'
import { fmtNumber, fmtTime } from '../format'
import { Card, KV, Label, Value } from '../ui/ui'

/** Live-Werte vom ESP: Zustand, Motoren, Räder (Einstellungen und optional Übersicht) */
export function DiagnosticsCard({ className = '' }: { className?: string }) {
    const { t, locale } = useI18n()
    const s = useStore()
    const tel = s.telemetry
    const fresh = isFresh(tel?.ts, s.now, TELEMETRY_STALE_S)
    const m = fresh ? tel?.motors : undefined
    const a = fresh ? tel?.analog : undefined
    const acc = fresh ? tel?.accel : undefined
    const none = t.common.none
    const num = (v: number | undefined, unit: string) => (v === undefined ? none : <Value value={fmtNumber(locale, v)} unit={unit} />)
    const d = t.settings
    const sn = fresh ? tel?.sensors : undefined
    const wifi = tel?.robotWifi
    const yesNo = (v: boolean | undefined) => (v === undefined ? none : v ? t.bat.yes : t.bat.no)
    const bumpers = sn && [
        sn.bumperLeftSide && `${d.left} ${t.map.side}`, sn.bumperLeftFront && `${d.left} ${t.map.front}`, sn.bumperLeftLds && `${d.left} LDS`,
        sn.bumperRightSide && `${d.right} ${t.map.side}`, sn.bumperRightFront && `${d.right} ${t.map.front}`, sn.bumperRightLds && `${d.right} LDS`,
    ].filter(Boolean).join(', ')
    const pair = (l: number | undefined, r: number | undefined, unit: string, digits = 0) =>
        l === undefined || r === undefined ? none
            : <Value value={`${fmtNumber(locale, l, digits)} · ${fmtNumber(locale, r, digits)}`} unit={unit} />

    return (
        <Card className={`${className}${fresh ? '' : ' is-stale'}`} icon={<Cpu />} title={t.settings.diagnostics}
            aside={tel && <span className="meta">{fresh ? fmtTime(locale, s.server?.timezone, tel.ts, true) : t.settings.espStale}</span>}>
            <KV rows={[
                [t.settings.espState, <span key="e" className="mono wrap">{tel?.state?.robotState ?? none}</span>],
                [t.settings.brush, num(m?.brushRPM, 'rpm')],
                [t.settings.brushCurrent, num(m?.brushMA, 'mA')],
                [t.settings.vacuum, num(m?.vacuumRPM, 'rpm')],
                [d.vacuumCurrent, num(m?.vacuumMA ?? a?.vacuumMA, 'mA')],
                [t.settings.sideBrush, num(m?.sideBrushMA, 'mA')],
                [d.lidar, num(m?.laserRPM, 'rpm')],
                [t.settings.wheelSpeed, pair(m?.leftWheelSpeed, m?.rightWheelSpeed, 'mm/s')],
                [t.settings.wheelLoad, pair(m?.leftWheelLoad, m?.rightWheelLoad, '%')],
                [d.dustbin, sn ? (sn.dustbinIn ? d.inserted : d.missing) : none],
                [d.wheelsLifted, sn ? `${yesNo(sn.leftWheelExtended)} · ${yesNo(sn.rightWheelExtended)}` : none],
                [d.bumper, sn ? (bumpers || d.free) : none],
                [d.wallSensor, a?.wallMM === undefined ? none : a.wallMM >= 255 ? d.free : num(a.wallMM, 'mm')],
                [d.floorSensors, pair(a?.dropLeftMM, a?.dropRightMM, 'mm')],
                [d.tilt, pair(acc?.pitchDeg, acc?.rollDeg, '°', 1)],
                [d.robotWifi, wifi?.ssid ? <Label key="w">{wifi.ssid}</Label> : none],
                [d.robotIp, <span key="i" className="mono">{wifi?.ip ?? none}</span>],
                [d.cloudLink, wifi ? yesNo(wifi.cloud) : none],
            ]} />
        </Card>
    )
}
