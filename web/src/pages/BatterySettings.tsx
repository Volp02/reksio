import { useCallback, useEffect, useState } from 'react'
import { BatteryCharging, BatteryFull, Gauge, History } from 'lucide-react'
import { esp } from '../api/client'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import { fmtDuration, fmtNumber, fmtTime } from '../format'
import { Button, Card, Confirm, Empty, KV, Label, Pill, Toast, Value } from '../ui/ui'
import { BatteryChart } from './BatteryChart'
import './pages.css'

interface Charger {
    fuelPercent: number; batteryOverTemp: boolean; chargingActive: boolean; chargingEnabled: boolean; confidOnFuel: boolean
    onReservedFuel: boolean; emptyFuel: boolean; batteryFailure: boolean; extPwrPresent: boolean; vBattV: number; vExtV: number
    chargerMAH: number; dischargeMAH: number
}
interface Analog { batteryVoltageV: number; batteryCurrentMA: number; batteryTemperatureC: number; externalVoltageV: number }
interface Warranty { cumulativeCleaningTimeSeconds: number; cumulativeBatteryCycles: number }
interface Version {
    smartBatteryChemistry?: string; smartBatteryDeviceName?: string; smartBatteryManufacturerName?: string
    smartBatteryMfgDate?: string; smartBatterySerialNumber?: string; smartBatterySoftwareVersion?: string
}

const POLL_MS = 30000

/** Akku-Diagnose wie in OpenNeato: Ladegerät, Analogwerte, Garantie-Zähler, Akku-Kennung (alles über den ESP) */
export function BatterySettings() {
    const { t, locale } = useI18n()
    const b = t.bat
    const s = useStore()
    const [charger, setCharger] = useState<Charger>()
    const [analog, setAnalog] = useState<Analog>()
    const [warranty, setWarranty] = useState<Warranty>()
    const [version, setVersion] = useState<Version>()
    const [at, setAt] = useState<number>()
    const [error, setError] = useState(false)
    const [confirm, setConfirm] = useState(false)
    const [busy, setBusy] = useState(false)
    const [toast, setToast] = useState<string>()

    const load = useCallback(async () => {
        try {
            const [c, a] = await Promise.all([esp.get<Charger>('charger'), esp.get<Analog>('analog')])
            setCharger(c)
            setAnalog(a)
            setAt(Date.now() / 1000)
            setError(false)
            esp.get<Warranty>('warranty').then(setWarranty).catch(() => undefined)
            esp.get<Version>('version').then(setVersion).catch(() => undefined)
        } catch {
            setError(true)
        }
    }, [])
    useEffect(() => {
        load()
        const id = setInterval(load, POLL_MS)
        return () => clearInterval(id)
    }, [load])

    const none = t.common.none
    const yesNo = (v: boolean | undefined) => (v === undefined ? none : v ? b.yes : b.no)
    const num = (v: number | undefined, unit: string, digits = 0) => (v === undefined ? none : <Value value={fmtNumber(locale, v, digits)} unit={unit} />)
    const state = !charger ? none : charger.chargingActive ? b.charging : charger.extPwrPresent ? b.docked : b.onBattery
    const year = Number(version?.smartBatteryMfgDate?.split('-')[0])
    const mfgUnreliable = Number.isFinite(year) && year > new Date().getFullYear()
    // NewBattery schaltet den Roboter kurz in den Testmodus: nicht während einer Reinigung
    const cleaning = s.robot?.state !== undefined && s.robot.state !== 1
    const problems = charger && [
        charger.batteryFailure && b.failure, charger.batteryOverTemp && b.overTemp, charger.emptyFuel && b.empty,
    ].filter(Boolean) as string[]

    if (!charger && !analog) {
        return <Card><Empty label={error ? t.common.offline : t.common.loading}
            action={error ? <Button size="s" label={t.common.retry} onClick={load} /> : undefined} /></Card>
    }

    return (
        <div className="settings">
            <Card icon={charger?.chargingActive ? <BatteryCharging /> : <BatteryFull />} title={b.now}
                aside={at && <span className="meta">{fmtTime(locale, s.server?.timezone, at, true)}</span>}>
                {problems && problems.length > 0 && problems.map((p) => <Pill key={p} tone="danger" label={p} />)}
                <KV rows={[
                    [b.charge, num(charger?.fuelPercent, '%')],
                    [b.state, state],
                    [b.voltage, num(charger?.vBattV, 'V', 2)],
                    [b.current, num(analog?.batteryCurrentMA, 'mA')],
                    [b.temperature, num(analog?.batteryTemperatureC, '°C', 1)],
                    [b.extVoltage, num(analog?.externalVoltageV, 'V', 2)],
                ]} />
                <BatteryChart history={s.history} label={t.battery.history} />
            </Card>

            <Card icon={<Gauge />} title={b.charger}>
                <KV rows={[
                    [b.chargingEnabled, yesNo(charger?.chargingEnabled)],
                    [b.fuelConfidence, yesNo(charger?.confidOnFuel)],
                    [b.reserved, yesNo(charger?.onReservedFuel)],
                    [b.charged, num(charger?.chargerMAH, 'mAh')],
                    [b.discharged, num(charger?.dischargeMAH, 'mAh')],
                ]} />
            </Card>

            <Card icon={<History />} title={b.lifetime}>
                <KV rows={[
                    [b.cycles, warranty ? fmtNumber(locale, warranty.cumulativeBatteryCycles) : none],
                    [b.cleaningTime, warranty ? fmtDuration(warranty.cumulativeCleaningTimeSeconds) : none],
                    [b.vendor, <Label key="v">{version?.smartBatteryManufacturerName || none}</Label>],
                    [b.chemistry, <span key="c" className="mono">{version?.smartBatteryChemistry || none}</span>],
                    [b.device, <span key="d" className="mono wrap">{version?.smartBatteryDeviceName || none}</span>],
                    [b.serial, <span key="s" className="mono">{version?.smartBatterySerialNumber || none}</span>],
                    [b.mfgDate, version?.smartBatteryMfgDate
                        ? <span key="m" className="mono">{version.smartBatteryMfgDate}{mfgUnreliable ? ` (${b.unreliable})` : ''}</span> : none],
                ]} />
                <div className="actions">
                    <Button size="s" variant="danger" label={b.newBattery} loading={busy} disabled={cleaning}
                        onClick={() => setConfirm(true)} />
                </div>
            </Card>

            <Confirm open={confirm} title={b.newBatteryConfirm} confirmLabel={b.newBattery} cancelLabel={t.common.cancel}
                onCancel={() => setConfirm(false)}
                onConfirm={async () => {
                    setConfirm(false)
                    setBusy(true)
                    try { await esp.post('battery/new'); setToast(b.newBatteryDone); load() } catch { setToast(t.actions.failed) } finally { setBusy(false) }
                }} />
            <Toast text={toast} onClose={() => setToast(undefined)} />
        </div>
    )
}
