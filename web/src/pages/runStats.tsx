import type { ReactNode } from 'react'
import type { EspSession, RunSummary } from '../api/types'
import type { Dict } from '../i18n/de'
import { fmtDuration, fmtNumber, idToTs } from '../format'
import { Value } from '../ui/ui'

/** Fläche und Dauer aus den Run-Daten des Roboters, wenn der ESP die Fahrt nicht hat */
function fromRun(r: RunSummary | undefined) {
    const a = r?.run?.start_at && idToTs(r.run.start_at), b = r?.run?.end_at && idToTs(r.run.end_at)
    return r?.run?.cleaned_area !== undefined && a && b
        ? { area: r.run.cleaned_area, duration: b - a, batteryStart: r.run.run_charge_at_start, batteryEnd: r.run.run_charge_at_end }
        : undefined
}

/** Kurzform für Listen: „58 m² · 2 h 53 min“ */
export function runStatsShort(locale: string, s: EspSession | undefined, r?: RunSummary): string | undefined {
    const m = s?.summary
    if (!m) {
        const f = fromRun(r)
        return f && `${fmtNumber(locale, f.area)} m² · ${fmtDuration(f.duration)}`
    }
    return `${fmtNumber(locale, m.areaCovered)} m² · ${fmtDuration(m.duration)}`
}

/** Bericht des Roboters (eine Fahrt oder mehrere zusammengezählt): Hochheben, Positionsverlust, Störung, Pause, Ladestopps */
export function robotReportRows(t: Dict, locale: string, runs: (RunSummary | undefined)[], recharges = true): [string, ReactNode][] {
    const rs = runs.map((r) => r?.run).filter((r) => r?.picked_up_count !== undefined)
    if (!rs.length) return []
    const sum = (k: 'picked_up_count' | 'time_in_error' | 'time_in_pause' | 'suspended_cleaning_charging_count' | 'time_in_suspended_cleaning') =>
        rs.reduce((n, r) => n + (r?.[k] ?? 0), 0)
    const charges = sum('suspended_cleaning_charging_count'), chargeTime = sum('time_in_suspended_cleaning')
    return [
        [t.runs.pickedUp, `${fmtNumber(locale, sum('picked_up_count'))}×`],
        [t.runs.lost, rs.some((r) => r?.localization_lost || r?.teleported) ? t.runs.yes : t.runs.no],
        [t.runs.inError, fmtDuration(sum('time_in_error'))],
        [t.runs.paused, fmtDuration(sum('time_in_pause'))],
        ...(recharges ? [[t.runs.recharges, charges ? `${fmtNumber(locale, charges)} · ${fmtDuration(chargeTime)}` : '0'] as [string, ReactNode]] : []),
    ]
}

/** Schlüssel-Wert-Zeilen für das Detail einer Reinigung */
export function runStatsRows(t: Dict, locale: string, s: EspSession | undefined, r?: RunSummary): [string, ReactNode][] {
    const m = s?.summary
    if (!m) {
        const f = fromRun(r)
        if (!f) return []
        return [
            [t.runs.duration, fmtDuration(f.duration)],
            [t.runs.area, <Value key="a" value={fmtNumber(locale, f.area, 1)} unit="m²" />],
            ...(f.batteryStart !== undefined && f.batteryEnd !== undefined
                ? [[t.runs.battery, <Value key="b" value={`${fmtNumber(locale, f.batteryStart)} → ${fmtNumber(locale, f.batteryEnd)}`} unit="%" />] as [string, ReactNode]]
                : []),
            ...robotReportRows(t, locale, [r]),
        ]
    }
    return [
        [t.runs.duration, fmtDuration(m.duration)],
        [t.runs.area, <Value key="a" value={fmtNumber(locale, m.areaCovered, 1)} unit="m²" />],
        [t.runs.distance, <Value key="d" value={fmtNumber(locale, m.distanceTraveled)} unit="m" />],
        [t.runs.battery, <Value key="b" value={`${fmtNumber(locale, m.batteryStart)} → ${fmtNumber(locale, m.batteryEnd)}`} unit="%" />],
        [t.runs.recharges, fmtNumber(locale, m.recharges)],
        [t.runs.errors, fmtNumber(locale, m.errorsDuringClean)],
        ...robotReportRows(t, locale, [r], false),
    ]
}
