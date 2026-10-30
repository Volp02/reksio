import { useCallback, useEffect, useMemo, useState } from 'react'
import { Cpu, RotateCcw, Settings2, Volume2, Wrench } from 'lucide-react'
import { esp } from '../api/client'
import { useI18n, fill } from '../i18n'
import { fmtDuration, fmtNumber } from '../format'
import { Button, Card, Confirm, Empty, InputRow, KV, Label, Pill, SelectRow, Switch, Toast, Value } from '../ui/ui'
import './pages.css'

/**
 * Einstellungen der OpenNeato-Firmware (GET/PUT /api/settings am ESP). Der ESP läuft headless und nur zum Einstellen
 * und Auslesen: Zeitplan, Benachrichtigungen und manuelle Reinigung der Firmware sind aus und hier nicht einstellbar.
 */
interface EspSettingsData {
    hostname: string
    tz: string
    logLevel: number
    wifiTxPower: number
    uartTxPin: number
    uartRxPin: number
    maxGpioPin: number
    navMode: string
    stallThreshold: number
    brushRpm: number
    vacuumSpeed: number
    sideBrushPower: number
    apFallbackOnDisconnect: boolean
    syslogEnabled: boolean
    syslogIp: string
    ntfyTopic: string
    ntfyEnabled: boolean
    ntfyOnDone: boolean
    ntfyOnError: boolean
    ntfyOnAlert: boolean
    ntfyOnDocking: boolean
    scheduleEnabled: boolean
    autoRestartEnabled: boolean
    autoRestartHour: number
    autoRestartMinute: number
    restartBeforeClean: boolean
    [sched: `sched${string}`]: number | boolean
}

/** Einstellungen im Roboter selbst (SetUserSettings über den ESP) */
interface RobotUserSettings {
    buttonClick: boolean
    melodies: boolean
    warnings: boolean
    ecoMode: boolean
    intenseClean: boolean
    binFullDetect: boolean
    wallEnable: boolean
    wifi: boolean
    stealthLed: boolean
}
const ROBOT_KEYS: Record<keyof RobotUserSettings, string> = {
    buttonClick: 'ButtonClick', melodies: 'Melodies', warnings: 'Warnings', ecoMode: 'EcoMode', intenseClean: 'IntenseClean',
    binFullDetect: 'BinFullDetect', wallEnable: 'WallEnable', wifi: 'WiFi', stealthLed: 'StealthLED',
}

interface Wifi { staConnected: boolean; ssid: string; ip: string; rssi: number }
interface System { uptime: number; heap: number; heapTotal: number; rssi: number }
interface FwVersion { version: string; chip: string }

const TX_POWER = [34, 44, 52, 60, 68, 78]
const TIMEZONES: { label: string; tz: string }[] = [
    { label: 'UTC', tz: 'UTC0' },
    { label: 'Mitteleuropa / Central Europe', tz: 'CET-1CEST,M3.5.0,M10.5.0/3' },
    { label: 'UK / Ireland', tz: 'GMT0BST,M3.5.0/1,M10.5.0' },
    { label: 'Osteuropa / Eastern Europe', tz: 'EET-2EEST,M3.5.0/3,M10.5.0/4' },
]

const pad = (n: number) => String(n).padStart(2, '0')
const toTime = (h: number, m: number) => `${pad(h)}:${pad(m)}`
const fromTime = (v: string): [number, number] => {
    const [h, m] = v.split(':').map(Number)
    return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0]
}

export function EspSettings() {
    const { t, locale } = useI18n()
    const e = t.esp
    const [host, setHost] = useState('')
    const [conn, setConn] = useState<{ host: string; online: boolean }>()
    const [saved, setSaved] = useState<EspSettingsData>()
    const [draft, setDraft] = useState<EspSettingsData>()
    const [robot, setRobot] = useState<RobotUserSettings>()
    const [wifi, setWifi] = useState<Wifi>()
    const [system, setSystem] = useState<System>()
    const [fw, setFw] = useState<FwVersion>()
    const [loadError, setLoadError] = useState(false)
    const [busy, setBusy] = useState<string>()
    const [toast, setToast] = useState<string>()
    const [confirm, setConfirm] = useState<'restart' | 'robotWifi'>()
    const [reload, setReload] = useState(0)

    const load = useCallback(async () => {
        setLoadError(false)
        try {
            const c = await esp.config()
            setConn(c)
            setHost(c.host)
            if (!c.host) return
            const s = await esp.get<EspSettingsData>('settings')
            setSaved(s)
            setDraft(s)
            esp.get<RobotUserSettings>('user-settings').then(setRobot).catch(() => undefined)
            esp.get<Wifi>('wifi/status').then(setWifi).catch(() => undefined)
            esp.get<System>('system').then(setSystem).catch(() => undefined)
            esp.get<FwVersion>('firmware/version').then(setFw).catch(() => undefined)
        } catch {
            setLoadError(true)
        }
    }, [])
    useEffect(() => { load() }, [load, reload])

    const changes = useMemo(() => {
        if (!saved || !draft) return {}
        return Object.fromEntries(Object.entries(draft).filter(([k, v]) => saved[k as keyof EspSettingsData] !== v))
    }, [saved, draft])
    const dirty = Object.keys(changes).length > 0
    const set = <K extends keyof EspSettingsData>(k: K, v: EspSettingsData[K]) => setDraft((d) => d && { ...d, [k]: v })

    const run = async (name: string, f: () => Promise<unknown>, ok?: string) => {
        setBusy(name)
        try {
            await f()
            if (ok) setToast(ok)
        } catch {
            setToast(t.actions.failed)
        } finally {
            setBusy(undefined)
        }
    }

    const saveHost = () => run('host', async () => {
        const c = await esp.setHost(host.trim())
        setConn(c)
        setReload((n) => n + 1)
    }, e.saved)

    const save = () => run('save', async () => {
        const s = await esp.put<EspSettingsData>('settings', changes)
        setSaved(s)
        setDraft(s)
    }, e.saved)

    const setRobotSetting = (k: keyof RobotUserSettings, v: boolean) => run(`robot-${k}`, async () => {
        await esp.post(`user-settings?key=${ROBOT_KEYS[k]}&value=${v ? 'ON' : 'OFF'}`)
        setRobot((r) => r && { ...r, [k]: v })
    })

    const hostValid = /^[A-Za-z0-9.-]{0,253}(:\d{1,5})?$/.test(host.trim())
    const d = draft

    return (
        <div className="settings">
            <Card icon={<Cpu />} title={e.connection}
                aside={conn?.host ? <Pill tone={conn.online ? 'ok' : 'neutral'} label={conn.online ? t.common.connected : t.common.offline} /> : undefined}>
                <InputRow label={e.address} value={host} onChange={setHost} placeholder="192.168.178.148" mono invalid={!hostValid} />
                <div className="actions">
                    <Button size="s" variant="primary" label={t.common.save} disabled={!hostValid || host.trim() === conn?.host}
                        loading={busy === 'host'} onClick={saveHost} />
                </div>
                {(wifi || system || fw) && (
                    <KV rows={[
                        [e.network, wifi ? <Label key="w">{`${wifi.ssid} · ${wifi.ip}`}</Label> : t.common.none],
                        [e.signal, wifi ? <Value value={fmtNumber(locale, wifi.rssi)} unit="dBm" /> : t.common.none],
                        [e.firmware, <span key="f" className="mono">{fw ? `${fw.version} · ${fw.chip}` : t.common.none}</span>],
                        [e.uptime, system ? fmtDuration(system.uptime / 1000) : t.common.none],
                        [e.memory, system ? <Value value={`${fmtNumber(locale, system.heap / 1024)} / ${fmtNumber(locale, system.heapTotal / 1024)}`} unit="KB" /> : t.common.none],
                    ]} />
                )}
                {conn?.host && (
                    <div className="actions">
                        <Button size="s" icon={<RotateCcw />} label={e.restart} loading={busy === 'restart'} onClick={() => setConfirm('restart')} />
                    </div>
                )}
            </Card>

            {!conn ? <Card><Empty label={loadError ? t.common.offline : t.common.loading} /></Card>
                : !conn.host ? null
                    : !d ? <Card><Empty label={loadError ? t.common.offline : t.common.loading}
                        action={loadError ? <Button size="s" label={t.common.retry} onClick={() => setReload((n) => n + 1)} /> : undefined} /></Card>
                        : <>
                            <Card icon={<Volume2 />} title={e.robot}>
                                {robot ? (Object.keys(ROBOT_KEYS) as (keyof RobotUserSettings)[]).map((k) => (
                                    <Switch key={k} label={e.robotKeys[k]} checked={robot[k]}
                                        onChange={(v) => (k === 'wifi' && !v ? setConfirm('robotWifi') : setRobotSetting(k, v))} />
                                )) : <Empty label={t.common.loading} />}
                            </Card>

                            <Card icon={<Settings2 />} title={e.device}>
                                <InputRow label={e.hostname} value={d.hostname} onChange={(v) => set('hostname', v)} mono />
                                <SelectRow label={e.timezone} value={d.tz} onChange={(v) => set('tz', v)}
                                    options={[...TIMEZONES.map((z) => ({ value: z.tz, label: z.label })), ...(TIMEZONES.some((z) => z.tz === d.tz) ? [] : [{ value: d.tz, label: d.tz }])]} />
                                <SelectRow label={e.txPower} value={d.wifiTxPower} onChange={(v) => set('wifiTxPower', v)}
                                    options={[...new Set([...TX_POWER, d.wifiTxPower])].sort((a, b) => a - b).map((v) => ({ value: v, label: `${fmtNumber(locale, v / 4, v % 4 ? 1 : 0)} dBm` }))} />
                                <InputRow type="number" label={e.uartTx} min={0} max={d.maxGpioPin} value={d.uartTxPin} onChange={(v) => set('uartTxPin', Number(v))} />
                                <InputRow type="number" label={e.uartRx} min={0} max={d.maxGpioPin} value={d.uartRxPin} onChange={(v) => set('uartRxPin', Number(v))} />
                                <SelectRow label={e.logLevel} value={d.logLevel} onChange={(v) => set('logLevel', v)}
                                    options={[{ value: 0, label: e.logOff }, { value: 1, label: 'Info' }, { value: 2, label: 'Debug' }]} />
                                <Switch label={e.syslog} checked={d.syslogEnabled} onChange={(v) => set('syslogEnabled', v)} />
                                {d.syslogEnabled && <InputRow label={e.syslogIp} value={d.syslogIp} onChange={(v) => set('syslogIp', v)} placeholder="192.168.178.45" mono />}
                                <Switch label={e.apFallback} checked={d.apFallbackOnDisconnect} onChange={(v) => set('apFallbackOnDisconnect', v)} />
                            </Card>

                            <Card icon={<Wrench />} title={e.maintenance}>
                                <Switch label={e.autoRestart} checked={d.autoRestartEnabled} onChange={(v) => set('autoRestartEnabled', v)} />
                                {d.autoRestartEnabled && (
                                    <InputRow type="time" label={e.autoRestartAt} value={toTime(d.autoRestartHour, d.autoRestartMinute)}
                                        onChange={(v) => { const [hh, mm] = fromTime(v); setDraft((x) => x && { ...x, autoRestartHour: hh, autoRestartMinute: mm }) }} />
                                )}
                            </Card>
                        </>}

            {dirty && (
                <div className="savebar" role="region" aria-label={e.unsaved}>
                    <Label className="savebar-l">{fill(e.changes, { n: Object.keys(changes).length })}</Label>
                    <Button size="s" variant="ghost" label={t.common.discard} onClick={() => setDraft(saved)} />
                    <Button size="s" variant="primary" label={t.common.save} loading={busy === 'save'} onClick={save} />
                </div>
            )}

            <Confirm open={confirm === 'restart'} title={e.restartConfirm} confirmLabel={e.restart} cancelLabel={t.common.cancel}
                onCancel={() => setConfirm(undefined)}
                onConfirm={() => { setConfirm(undefined); run('restart', () => esp.post('system/restart'), e.restarting) }} />
            <Confirm open={confirm === 'robotWifi'} title={e.robotWifiConfirm} confirmLabel={e.turnOff} cancelLabel={t.common.cancel}
                onCancel={() => setConfirm(undefined)}
                onConfirm={() => { setConfirm(undefined); setRobotSetting('wifi', false) }} />
            <Toast text={toast} onClose={() => setToast(undefined)} />
        </div>
    )
}
