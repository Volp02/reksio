// Zahlen, Einheiten, Zeit (DESIGN.md §12.5). Zeitzone kommt vom Server.

export function fmtNumber(locale: string, value: number, digits = 0): string {
    return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
        .replace('-', '−')
}

export function fmtPercent(locale: string, value: number): string {
    return locale.startsWith('de') ? `${fmtNumber(locale, value)} %` : `${fmtNumber(locale, value)}%`
}

export function fmtTime(locale: string, tz: string | undefined, ts: number, seconds = false): string {
    return new Intl.DateTimeFormat(locale, {
        hour: '2-digit', minute: '2-digit', second: seconds ? '2-digit' : undefined, timeZone: tz,
    }).format(ts * 1000)
}

function dayKey(tz: string | undefined, ts: number): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts * 1000)
}

/** heute „14:12“, gestern „Gestern, 14:12“, sonst „29.10. 14:12“ (älter als ein Jahr mit Jahr) */
export function fmtWhen(
    locale: string, tz: string | undefined, ts: number, now: number,
    words: { today: string; yesterday: string }, withTodayWord = false,
): string {
    const time = fmtTime(locale, tz, ts)
    const d = dayKey(tz, ts)
    if (d === dayKey(tz, now)) return withTodayWord ? `${words.today}, ${time}` : time
    if (d === dayKey(tz, now - 86400)) return `${words.yesterday}, ${time}`
    const sameYear = now - ts < 330 * 86400
    const date = new Intl.DateTimeFormat(locale, {
        day: '2-digit', month: locale.startsWith('de') ? '2-digit' : 'short', year: sameYear ? undefined : 'numeric', timeZone: tz,
    }).format(ts * 1000)
    return `${date} ${time}`
}

/** „1 h 12 min“, „38 min“ */
export function fmtDuration(seconds: number): string {
    const m = Math.max(0, Math.round(seconds / 60))
    if (m < 60) return `${m} min`
    const h = Math.floor(m / 60)
    return `${h} h ${String(m % 60).padStart(2, '0')} min`
}

/** Vacuula-IDs sind ISO-Zeitpunkte, z. B. 2026-10-29T23:12:26Z */
export function idToTs(id: string): number | undefined {
    const ms = Date.parse(id)
    return Number.isNaN(ms) ? undefined : ms / 1000
}
