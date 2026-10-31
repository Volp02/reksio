import type { ReactNode } from 'react'
import type { EspSession } from '../api/types'
import type { Dict } from '../i18n/de'
import { fmtDuration, fmtNumber } from '../format'
import { Value } from '../ui/ui'

/** Kurzform für Listen: „58 m² · 2 h 53 min“ */
export function runStatsShort(locale: string, s: EspSession | undefined): string | undefined {
    const m = s?.summary
    if (!m) return undefined
    return `${fmtNumber(locale, m.areaCovered)} m² · ${fmtDuration(m.duration)}`
}

/** Schlüssel-Wert-Zeilen für das Detail einer Reinigung */
export function runStatsRows(t: Dict, locale: string, s: EspSession | undefined): [string, ReactNode][] {
    const m = s?.summary
    if (!m) return []
    return [
        [t.runs.duration, fmtDuration(m.duration)],
        [t.runs.area, <Value key="a" value={fmtNumber(locale, m.areaCovered, 1)} unit="m²" />],
        [t.runs.distance, <Value key="d" value={fmtNumber(locale, m.distanceTraveled)} unit="m" />],
        [t.runs.battery, <Value key="b" value={`${fmtNumber(locale, m.batteryStart)} → ${fmtNumber(locale, m.batteryEnd)}`} unit="%" />],
        [t.runs.recharges, fmtNumber(locale, m.recharges)],
        [t.runs.errors, fmtNumber(locale, m.errorsDuringClean)],
    ]
}
