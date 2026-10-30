import { useState, type ReactNode } from 'react'
import {
    BatteryCharging, BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, History, House, Map as MapIcon, Pause, Play, Square, TriangleAlert,
} from 'lucide-react'
import { gen3 } from '../api/client'
import { CleaningCategory, CleaningMode, NavigationMode } from '../api/types'
import { fill, useI18n } from '../i18n'
import { isFresh, TELEMETRY_STALE_S, useStore } from '../state/store'
import { activeMap, sortRuns, useBoundaries, useMapData, useMaps, useRuns } from '../state/data'
import { batteryPercent, batteryTone, cleaningSince, dischargeRate, isCleaning, problemText, robotStatus } from '../status'
import { fmtDuration, fmtNumber, fmtTime, fmtWhen, idToTs } from '../format'
import { MapView } from '../map/MapView'
import { Legend } from '../map/Legend'
import { BatteryChart } from './BatteryChart'
import { Button, Card, Confirm, Empty, KV, Label, Pill, Toast, Value } from '../ui/ui'
import { cleaningPrefs } from './Settings'
import './overview.css'

export function Overview() {
    return (
        <div className="ov">
            <div className="ov-col ov-col--main"><MapCard /><RunsCard /></div>
            <div className="ov-col ov-col--side"><ControlCard /><BatteryCard /></div>
        </div>
    )
}

type Cmd = 'primary' | 'stop' | 'dock'

function ControlCard() {
    const { t, locale } = useI18n()
    const s = useStore()
    const r = s.robot
    const status = robotStatus(t, s.connected, r)
    const [busy, setBusy] = useState<Cmd>()
    const [confirmStop, setConfirmStop] = useState(false)
    const [toast, setToast] = useState<string>()
    const av = s.connected ? r?.availableCommands : undefined

    const primary = av?.pause
        ? { label: t.actions.pause, icon: <Pause />, run: () => gen3.pause(s.serial!) }
        : av?.resume
            ? { label: t.actions.resume, icon: <Play />, run: () => gen3.resume(s.serial!) }
            : { label: t.actions.start, icon: <Play />, run: () => { const p = cleaningPrefs(); return gen3.startHouse(s.serial!, p.mode, p.navigation) }, disabled: !av?.start }

    const send = async (cmd: Cmd, run: () => Promise<unknown>) => {
        setBusy(cmd)
        try {
            await run()
            await s.refreshRobot()
        } catch {
            setToast(t.actions.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const problem = r?.error ? problemText(t, r.error) : r?.alert ? problemText(t, r.alert) : undefined
    const since = isCleaning(r) ? cleaningSince(s.history) : undefined
    const mode = r && isCleaning(r) ? modeLabel(t, r.cleaning.category, r.cleaning.mode, r.cleaning.navigationMode) : undefined

    return (
        <Card className="ov-control">
            <div className="ov-status">
                <h2 className="ov-name"><Label>{s.name}</Label></h2>
                <Pill tone={status.tone} label={status.label} />
            </div>
            {problem && (
                <div className={`ov-problem ov-problem--${r?.error ? 'danger' : 'warn'}`} role="alert">
                    <TriangleAlert /><span className="wrap">{problem}</span>
                    {!r?.error && <Button size="s" variant="ghost" label={t.actions.dismiss} onClick={() => send('primary', () => gen3.dismissAlert(s.serial!))} />}
                </div>
            )}
            <div className="ov-ctrls">
                <Button grow variant="primary" icon={primary.icon} label={busy === 'primary' ? t.actions.sending : primary.label}
                    loading={busy === 'primary'} disabled={!s.connected || ('disabled' in primary && primary.disabled) || (!!busy && busy !== 'primary')}
                    onClick={() => send('primary', primary.run)} />
                <Button grow icon={<Square />} label={busy === 'stop' ? t.actions.sending : t.actions.stop}
                    loading={busy === 'stop'} disabled={!av?.stop || (!!busy && busy !== 'stop')} onClick={() => setConfirmStop(true)} />
                <Button grow icon={<House />} label={busy === 'dock' ? t.actions.sending : t.actions.dock}
                    loading={busy === 'dock'} disabled={!av?.goToBase || (!!busy && busy !== 'dock')}
                    onClick={() => send('dock', () => gen3.sendToBase(s.serial!))} />
            </div>
            {(mode || since) && (
                <KV rows={[
                    ...(mode ? [[t.overview.mode, <Label key="m">{mode}</Label>] as [string, ReactNode]] : []),
                    ...(since ? [[t.overview.since, `${fmtTime(locale, s.server?.timezone, since)} · ${fmtDuration(s.now - since)}`] as [string, ReactNode]] : []),
                ]} />
            )}
            <Confirm open={confirmStop} title={t.actions.stopConfirmTitle} confirmLabel={t.actions.stopConfirm} cancelLabel={t.common.cancel}
                onCancel={() => setConfirmStop(false)}
                onConfirm={() => { setConfirmStop(false); send('stop', () => gen3.stop(s.serial!)) }} />
            <Toast text={toast} onClose={() => setToast(undefined)} />
        </Card>
    )
}

function modeLabel(t: ReturnType<typeof useI18n>['t'], cat: CleaningCategory, mode: CleaningMode, nav: NavigationMode): string {
    const c = cat === CleaningCategory.SPOT ? t.overview.spotClean : cat === CleaningCategory.MAP ? t.overview.mapClean : t.overview.houseClean
    const m = mode === CleaningMode.TURBO ? t.overview.turbo : t.overview.eco
    const n = nav === NavigationMode.EXTRA_CARE ? ` · ${t.overview.extraCare}` : nav === NavigationMode.DEEP ? ` · ${t.overview.deep}` : ''
    return `${c} · ${m}${n}`
}

function BatteryCard() {
    const { t, locale } = useI18n()
    const s = useStore()
    const tel = s.telemetry
    const fresh = isFresh(tel?.ts, s.now, TELEMETRY_STALE_S)
    const pct = batteryPercent(s.robot, tel, fresh)
    const tone = batteryTone(pct)
    const charging = fresh ? !!tel?.charger?.chargingActive : !!s.robot?.details.isCharging
    const rate = charging ? undefined : dischargeRate(s.history)
    const icon = charging ? <BatteryCharging /> : pct === undefined ? <BatteryMedium />
        : pct < 15 ? <BatteryWarning /> : pct < 30 ? <BatteryLow /> : pct < 70 ? <BatteryMedium /> : <BatteryFull />
    const meta = charging ? t.battery.charging
        : rate ? `${fill(t.battery.perHour, { rate: fmtNumber(locale, rate) })}${pct ? ` · ${fill(t.battery.remaining, { time: fmtDuration((pct / rate) * 3600) })}` : ''}`
            : undefined
    const a = fresh ? tel?.analog : undefined
    const none = t.common.none

    return (
        <Card className={`ov-battery tone-${tone}${fresh ? '' : ' is-stale'}`} icon={icon} title={t.battery.title}
            aside={tel && <span className="meta">{fmtTime(locale, s.server?.timezone, tel.ts, true)}</span>}>
            <div className="ov-big-row">
                <div className="big">{pct === undefined ? none : fmtNumber(locale, pct)}<span className="unit">{locale.startsWith('de') ? ' %' : '%'}</span></div>
                {meta && <span className="meta ov-big-meta"><Label>{meta}</Label></span>}
            </div>
            <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t.battery.title}>
                <i style={{ width: `${pct ?? 0}%` }} />
            </div>
            <BatteryChart history={s.history} label={t.battery.history} />
            <KV rows={[
                [t.battery.voltage, a ? <Value value={fmtNumber(locale, a.batteryVoltageV, 1)} unit="V" /> : none],
                [t.battery.current, a ? <Value value={fmtNumber(locale, a.batteryCurrentMA)} unit="mA" /> : none],
                [t.battery.temperature, a ? <Value value={fmtNumber(locale, a.batteryTemperatureC, 1)} unit="°C" /> : none],
            ]} />
        </Card>
    )
}

function MapCard() {
    const { t } = useI18n()
    const s = useStore()
    const maps = useMaps(s.serial)
    const active = activeMap(maps.data)
    const data = useMapData(s.serial, active?.id)
    const bounds = useBoundaries(s.serial, active?.id, s.connected)
    return (
        <Card className="ov-map" icon={<MapIcon />} title={active?.name || t.map.floor}
            aside={<a href="#/map" className="btn btn--ghost btn--s"><Label>{t.nav.map}</Label></a>}>
            {data.data
                ? <MapView data={data.data} boundaries={bounds.data} label={active?.name || t.map.floor} />
                : <Empty icon={<MapIcon />} label={data.loading || maps.loading ? t.common.loading : t.map.noMap} />}
            <Legend boundaries={bounds.data} noGo={t.map.noGo} />
        </Card>
    )
}

function RunsCard() {
    const { t, locale } = useI18n()
    const s = useStore()
    const runs = useRuns(s.serial)
    const maps = useMaps(s.serial)
    const list = sortRuns(runs.data).slice(0, 3)
    const mapName = (id: string | null) => maps.data?.find((m) => m.id === id)?.name
    return (
        <Card className="ov-runs" icon={<History />} title={t.overview.lastRuns}
            aside={<a href="#/runs" className="btn btn--ghost btn--s"><Label>{t.common.all}</Label></a>}>
            {list.length === 0
                ? <Empty label={runs.loading ? t.common.loading : t.overview.noRuns} />
                : (
                    <ul className="rows">
                        {list.map((r) => {
                            const ts = idToTs(r.id)
                            return (
                                <li key={r.id}>
                                    <a className="row" href={`#/runs/${encodeURIComponent(r.id)}`}>
                                        <span className="row-main">
                                            <Label className="row-t">{ts ? fmtWhen(locale, s.server?.timezone, ts, s.now, t.overview, true) : r.id}</Label>
                                            {mapName(r.persistent_map) && <Label className="row-s">{mapName(r.persistent_map)!}</Label>}
                                        </span>
                                    </a>
                                </li>
                            )
                        })}
                    </ul>
                )}
        </Card>
    )
}

