import { AlertTriangle, Check, CircleAlert, X } from 'lucide-react'
import type { Incident, Job, JobAttempt, JobZone, RunSummary } from '../api/types'
import type { Dict } from '../i18n/de'
import { fill } from '../i18n'
import { fmtDuration, fmtNumber, fmtTime, idToTs } from '../format'
import { Label } from '../ui/ui'

/** Eintrag im Verlauf: einzelne Reinigung oder Auftrag mit mehreren Zonen (Zeitplan, Zonenfolge) */
export type Entry =
    | { kind: 'run'; id: string; ts: number; run: RunSummary; job?: Job }
    | { kind: 'job'; id: string; ts: number; job: Job; runs: RunSummary[] }

export const JOB_PREFIX = 'job:'

/**
 * Runs den Aufträgen zuordnen: über die Run-ID der Versuche, Zeitplan-Starts der ganzen Karte über die Startzeit.
 * Aufträge mit mehreren Zonen oder ohne einen einzigen Run (alles fehlgeschlagen) werden zu einer Gruppe.
 */
export function historyEntries(runs: RunSummary[], jobs: Job[]): Entry[] {
    const byRun = new Map<string, Job>()
    for (const j of jobs) for (const z of j.zones) for (const a of z.attempts) if (a.run) byRun.set(a.run, j)
    const grouped = new Map<string, RunSummary[]>()
    const isGroup = (j: Job) => j.zones.length > 1
    const entries: Entry[] = []
    for (const r of runs) {
        const ts = idToTs(r.id) ?? 0
        const job = byRun.get(r.id) ?? jobs.find((j) => !j.zones.length && ts >= j.started - 30 && ts <= j.started + 120)
        if (job && isGroup(job)) {
            grouped.set(job.id, [...(grouped.get(job.id) ?? []), r])
            continue
        }
        entries.push({ kind: 'run', id: r.id, ts, run: r, job })
    }
    for (const j of jobs) {
        if (!j.zones.length || (!isGroup(j) && j.zones[0].attempts.some((a) => a.run && runs.some((r) => r.id === a.run)))) continue
        if (j.status === 'running' && !j.zones.some((z) => z.attempts.length)) continue
        entries.push({ kind: 'job', id: JOB_PREFIX + j.id, ts: j.started, job: j, runs: grouped.get(j.id) ?? [] })
    }
    return entries.sort((a, b) => b.ts - a.ts)
}

export function runArea(r: RunSummary | undefined): number | undefined {
    return r?.run?.cleaned_area
}

export function runDuration(r: RunSummary | undefined): number | undefined {
    const a = r?.run?.start_at && idToTs(r.run.start_at), b = r?.run?.end_at && idToTs(r.run.end_at)
    return a && b ? b - a : undefined
}

export function jobEnd(j: Job, now: number): number {
    const ends = j.zones.flatMap((z) => z.attempts.map((a) => a.end ?? now))
    return j.finished ?? (ends.length ? Math.max(...ends) : now)
}

// nur Ablauf, keine Störung: im Verlauf ausblenden
const QUIET = /^alert_(invalid|return_to_|charging_|busy_charging|info_thank_you|time_set|timer_|enable_timer|linkedapp|log|swupdate_success|acquiring_persistent_map_ids|creating_and_uploading_map|usb_disconnected|old_error|wait_for_power_switch_detect)/

export function isQuiet(code: string): boolean {
    return QUIET.test(code)
}

export function codeText(t: Dict, code: string, message?: string | null): string {
    return t.codes[code as keyof Dict['codes']]
        ?? t.errors[code.replace(/^(alert|error)_/, '') as keyof Dict['errors']]
        ?? message ?? code.replace(/^(alert|error)_/, '').replace(/_/g, ' ')
}

/** Störungen im Zeitraum eines Versuchs (etwas Luft am Ende: der Roboter meldet manches erst beim Andocken) */
function during(incidents: Incident[] | undefined, a: JobAttempt, now: number): Incident[] {
    const end = (a.end ?? now) + 15
    return (incidents ?? []).filter((i) => i.ts <= end && (i.end ?? now) >= a.start && !isQuiet(i.code))
}

/** warum ein Versuch fehlschlug, so konkret wie möglich */
export function attemptProblem(t: Dict, a: JobAttempt, incidents: Incident[] | undefined, now: number): string {
    const alert = a.alerts.find((c) => !isQuiet(c))
    if (alert) return codeText(t, alert)
    const found = during(incidents, a, now)
    const inc = found.find((i) => i.code.startsWith('error_')) ?? found.find((i) => /fail|unreachable|wrong_floor/.test(i.code)) ?? found[0]
    if (inc) return codeText(t, inc.code, inc.message)
    if (a.result === 'notStarted') return t.history.notStarted
    return t.history.noRun
}

/** Zeile einer Zone: „4,1 m² · 5 min“, „Nicht gereinigt · Sucht Position“, … */
export function zoneLine(t: Dict, locale: string, z: JobZone, runs: RunSummary[], incidents: Incident[] | undefined, now: number): string {
    const tries = z.attempts.length > 1 ? fill(t.history.attempts, { n: z.attempts.length }) : undefined
    const run = runs.find((r) => z.attempts.some((a) => a.run === r.id))
    if (z.status === 'done') {
        const area = runArea(run), dur = runDuration(run)
        return [area !== undefined ? `${fmtNumber(locale, area, 1)} m²` : t.history.done, dur !== undefined ? fmtDuration(dur) : undefined, tries]
            .filter(Boolean).join(' · ')
    }
    if (z.status === 'failed') {
        const last = z.attempts[z.attempts.length - 1]
        return [t.history.failed, last ? attemptProblem(t, last, incidents, now) : undefined, tries].filter(Boolean).join(' · ')
    }
    return { pending: t.history.pending, cleaning: t.history.cleaning, stopped: t.history.stopped, skipped: t.history.skipped }[z.status]
}

/** Zonen eines Auftrags in ihrer Reihenfolge, mit Ergebnis */
export function ZoneSteps({ t, locale, job, runs, incidents, now, selected, link = true }: {
    t: Dict; locale: string; job: Job; runs: RunSummary[]; incidents: Incident[] | undefined; now: number; selected?: string; link?: boolean
}) {
    return (
        <ol className="rsteps">
            {job.zones.map((z, i) => {
                const run = runs.find((r) => z.attempts.some((a) => a.run === r.id))
                const body = (<>
                    <span className="zrow-c zrow-c--n rsteps-c" data-st={z.status} aria-hidden>
                        {z.status === 'done' ? <Check /> : z.status === 'failed' ? <X /> : i + 1}
                    </span>
                    <span className="row-main">
                        <Label className="row-t">{z.name || t.zones.unnamed}</Label>
                        <Label className={`row-s${z.status === 'failed' ? ' rsteps-bad' : ''}`}>{zoneLine(t, locale, z, runs, incidents, now)}</Label>
                    </span>
                </>)
                return (
                    <li key={z.id + i}>
                        {link && run
                            ? <a className="row rsteps-r" href={`#/runs/${encodeURIComponent(run.id)}`} aria-current={selected === run.id ? 'true' : undefined}>{body}</a>
                            : <div className="row rsteps-r">{body}</div>}
                    </li>
                )
            })}
        </ol>
    )
}

/** Störungen eines Zeitraums, ohne reine Ablauf-Hinweise */
export function IncidentList({ t, locale, tz, incidents, now }: { t: Dict; locale: string; tz?: string; incidents: Incident[]; now: number }) {
    const shown = incidents.filter((i) => !isQuiet(i.code))
    if (!shown.length) return null
    return (
        <ul className="rows rinc" aria-label={t.history.incidents}>
            {shown.map((i) => {
                const error = i.code.startsWith('error_')
                const end = i.end ?? now
                return (
                    <li key={`${i.source}${i.code}${i.ts}`} className="row rinc-r" data-kind={error ? 'error' : 'alert'}>
                        {error ? <CircleAlert className="row-i rinc-i" /> : <AlertTriangle className="row-i rinc-i" />}
                        <span className="row-main">
                            <Label className="row-t">{codeText(t, i.code, i.message)}</Label>
                            <Label className="row-s">{end - i.ts >= 60
                                ? `${fmtTime(locale, tz, i.ts)}–${fmtTime(locale, tz, end)}` : fmtTime(locale, tz, i.ts, true)}</Label>
                        </span>
                    </li>
                )
            })}
        </ul>
    )
}
