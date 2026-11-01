import { useState, type ReactNode } from 'react'
import {
    BatteryCharging, Shapes, Trash2, BatteryFull, BatteryLow, BatteryMedium, BatteryWarning, History, House, Map as MapIcon, Pause, Play, Square, TriangleAlert,
} from 'lucide-react'
import { esp, gen3 } from '../api/client'
import { CleaningCategory, CleaningMode, NavigationMode } from '../api/types'
import { fill, useI18n } from '../i18n'
import { isFresh, TELEMETRY_STALE_S, useStore } from '../state/store'
import { activeMap, sessionFor, sortRuns, useBoundaries, useEspSessions, useMapData, useMaps, useRuns } from '../state/data'
import { runStatsShort } from './runStats'
import { batteryPercent, batteryTone, cleaningSince, dischargeRate, espProblem, isCleaning, problemText, robotStatus } from '../status'
import { fmtDuration, fmtNumber, fmtTime, fmtWhen, idToTs } from '../format'
import { MapView } from '../map/MapView'
import { Legend } from '../map/Legend'
import { useLive } from '../map/useLive'
import { BatteryChart } from './BatteryChart'
import { Button, Card, Confirm, Empty, IconButton, KV, Label, Pill, Toast, Value } from '../ui/ui'
import { getPrefs, setPrefs, usePrefs } from '../state/prefs'
import { DiagnosticsCard } from './Diagnostics'
import { CleanModes } from './CleanModes'
import { LidarTag, LidarToggle } from '../map/LidarToggle'
import './overview.css'

export function Overview() {
    const prefs = usePrefs()
    return (
        <div className="ov">
            <div className="ov-col ov-col--main"><MapCard /><RunsCard /></div>
            <div className="ov-col ov-col--side">
                <ControlCard />
                <BatteryCard />
                <MaintenanceCard />
                {prefs.diagnostics && <DiagnosticsCard className="ov-diag" />}
            </div>
        </div>
    )
}

type Cmd = 'primary' | 'stop' | 'dock' | 'dismiss'

function ControlCard() {
    const { t, locale } = useI18n()
    const s = useStore()
    const r = s.robot
    const espP = espProblem(t, s.telemetry, isFresh(s.telemetry?.ts, s.now, TELEMETRY_STALE_S))
    const status = robotStatus(t, s.connected, r, espP)
    // quittierte ESP-Meldung ausblenden, bis ein anderer Code kommt
    const [dismissed, setDismissed] = useState<string>()
    const [busy, setBusy] = useState<Cmd>()
    const [confirmStop, setConfirmStop] = useState(false)
    const [toast, setToast] = useState<string>()
    const av = s.connected ? r?.availableCommands : undefined
    const mapId = activeMap(useMaps(s.serial).data)?.id

    const primary = av?.pause
        ? { label: t.actions.pause, icon: <Pause />, run: () => gen3.pause(s.serial!) }
        : av?.resume
            ? { label: t.actions.resume, icon: <Play />, run: () => gen3.resume(s.serial!) }
            : { label: t.actions.start, icon: <Play />, run: () => { const p = getPrefs(); return gen3.startWhole(s.serial!, mapId, p.mode, p.navigation) }, disabled: !av?.start }

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

    // Cloud-Fehler/-Hinweis vor ESP-Meldung; ESP-Meldungen kommen per GetErr direkt vom Roboter
    const cloud = r?.error ? problemText(t, r.error) : r?.alert ? problemText(t, r.alert) : undefined
    const espShown = espP && espP.code !== dismissed ? espP : undefined
    const problem = cloud
        ? { text: cloud, tone: r?.error ? 'danger' : 'warn', dismiss: r?.error ? undefined : () => gen3.dismissAlert(s.serial!) }
        : espShown
            ? { text: espShown.text, tone: espShown.kind === 'error' ? 'danger' : 'warn', dismiss: async () => { await esp.post('clear-errors'); setDismissed(espShown.code) } }
            : undefined
    const since = isCleaning(r) ? cleaningSince(s.history) : undefined
    const mode = r && isCleaning(r) ? modeLabel(t, r.cleaning.category, r.cleaning.mode, r.cleaning.navigationMode) : undefined

    return (
        <Card className="ov-control">
            <div className="ov-status">
                <h2 className="ov-name"><Label>{s.name}</Label></h2>
                <Pill tone={status.tone} label={status.label} />
            </div>
            {problem && (
                <div className={`ov-problem ov-problem--${problem.tone}`} role="alert">
                    <TriangleAlert /><span className="wrap">{problem.text}</span>
                    {problem.dismiss && <Button size="s" variant="ghost" label={t.actions.dismiss} loading={busy === 'dismiss'}
                        onClick={() => send('dismiss', problem.dismiss!)} />}
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
            {!mode && <CleanModes />}
            {s.zoneQueue && <a className="ov-queue" href="#/map"><Shapes /><Label>{fill(t.zones.step, { i: Math.min(s.zoneQueue.index + 1, s.zoneQueue.zones.length), n: s.zoneQueue.zones.length })
                + (s.zoneQueue.zones[s.zoneQueue.index]?.name ? ` · ${s.zoneQueue.zones[s.zoneQueue.index].name}` : '')}</Label></a>}
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
    const prefs = usePrefs()
    const maps = useMaps(s.serial)
    const active = activeMap(maps.data)
    const data = useMapData(s.serial, active?.id)
    // Zonen nur laden, wenn eingeblendet
    const bounds = useBoundaries(s.serial, prefs.zones ? active?.id : undefined, s.connected)
    const zones = prefs.zones ? bounds.data : undefined
    const live = useLive(data.data)
    return (
        <Card className="ov-map" icon={<MapIcon />} title={active?.name || t.map.floor}
            aside={<>
                {live && <Pill tone={live.robot?.stale ? 'neutral' : 'info'} label={t.map.live} />}
                <LidarToggle live={live} />
                <IconButton size="s" icon={<Shapes />} label={t.map.zones} aria-pressed={prefs.zones}
                    className={prefs.zones ? 'is-cur' : ''} onClick={() => setPrefs({ zones: !prefs.zones })} />
                <a href="#/map" className="btn btn--ghost btn--s"><Label>{t.nav.map}</Label></a>
            </>}>
            {data.data
                ? <MapView data={data.data} boundaries={zones} live={live} label={active?.name || t.map.floor}
                    tools={<LidarTag live={live} />} />
                : <Empty icon={<MapIcon />} label={data.loading || maps.loading ? t.common.loading : t.map.noMap} />}
            <Legend boundaries={zones} noGo={t.map.noGo} />
        </Card>
    )
}

function RunsCard() {
    const { t, locale } = useI18n()
    const s = useStore()
    const runs = useRuns(s.serial)
    const maps = useMaps(s.serial)
    const sessions = useEspSessions()
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
                                        {runStatsShort(locale, sessionFor(sessions.data, ts)) && <span className="row-n">{runStatsShort(locale, sessionFor(sessions.data, ts))}</span>}
                                    </a>
                                </li>
                            )
                        })}
                    </ul>
                )}
        </Card>
    )
}


/** Füllstand des Staubbehälters (Laufzeit seit dem Leeren gegen das Erinnerungsintervall) und Wartungsintervalle */
function MaintenanceCard() {
    const { t, locale } = useI18n()
    const s = useStore()
    const m = s.telemetry?.maintenance
    if (!m || m.binRuntimeMin == null) return null
    const max = m.binReminderMin || 0
    const pct = max ? Math.min(100, (m.binRuntimeMin / max) * 100) : 0
    const tone = pct >= 100 ? 'danger' : pct >= 80 ? 'warn' : 'neutral'
    return (
        <Card className={`ov-maint tone-${tone}`} icon={<Trash2 />} title={t.maint.title}>
            <div className="ov-maint-bin">
                <div className="ov-maint-row">
                    <Label className="ov-maint-l">{t.maint.bin}</Label>
                    <span className="meta">{max ? fill(t.maint.binOf, { used: fmtNumber(locale, m.binRuntimeMin), max: fmtNumber(locale, max) }) : fmtNumber(locale, m.binRuntimeMin)}</span>
                </div>
                {max > 0 && <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={m.binRuntimeMin} aria-label={t.maint.bin}><i style={{ width: `${pct}%` }} /></div>}
            </div>
            <KV rows={[
                ...(m.binFullCount != null ? [[t.maint.binFull, fill(t.maint.binTimes, { n: fmtNumber(locale, m.binFullCount) })] as [string, ReactNode]] : []),
                ...(m.filterChangeS ? [[t.maint.filter, fmtDuration(m.filterChangeS)] as [string, ReactNode]] : []),
                ...(m.brushChangeS ? [[t.maint.brush, fmtDuration(m.brushChangeS)] as [string, ReactNode]] : []),
                ...(s.telemetry?.warranty ? [[t.maint.cleaningTotal, fmtDuration(s.telemetry.warranty.cumulativeCleaningTimeSeconds)] as [string, ReactNode]] : []),
            ]} />
        </Card>
    )
}
