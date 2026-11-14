import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, History, Route } from 'lucide-react'
import type { Job, MapData, Pose, RunSummary } from '../api/types'
import { fill, useI18n } from '../i18n'
import { useStore } from '../state/store'
import { runTs, sessionFor, useBoundaries, useEspSessions, useIncidents, useJobs, useMapData, useMaps, useRunData, useRunPath, useRuns } from '../state/data'
import { robotReportRows, runStatsRows, runStatsShort } from './runStats'
import { historyEntries, IncidentList, jobEnd, runArea, ZoneSteps, type Entry } from './runHistory'
import { fmtDuration, fmtNumber, fmtWhen, idToTs } from '../format'
import { MapView } from '../map/MapView'
import { useTrail } from '../map/useLive'
import { Card, Empty, IconButton, KV, Label, Value } from '../ui/ui'
import './pages.css'

const PATH_KEY = 'reksio.runPath'

/** gefahrene Strecke ein-/ausblenden, Einstellung bleibt gespeichert */
function usePathToggle() {
    const [show, setShow] = useState(() => localStorage.getItem(PATH_KEY) !== 'off')
    const toggle = () => setShow((v) => { localStorage.setItem(PATH_KEY, v ? 'off' : 'on'); return !v })
    return [show, toggle] as const
}

function PathMap({ data, run, poses, label, boundaries }: { data: MapData; run?: MapData; poses?: Pose[]; label: string; boundaries?: Parameters<typeof MapView>[0]['boundaries'] }) {
    const { t } = useI18n()
    const trail = useTrail(data, poses)
    const [show, toggle] = usePathToggle()
    return <MapView data={data} run={run} label={label} live={show ? trail : undefined} boundaries={boundaries}
        tools={trail && <div className="maptools-g">
            <IconButton size="s" icon={<Route />} label={t.runs.path} aria-pressed={show} onClick={toggle} />
        </div>} />
}

export function Runs({ selected }: { selected?: string }) {
    const { t, locale } = useI18n()
    const s = useStore()
    // Zonenfolge, Zeitplan oder Reinigung fertig / nach Pause wieder sichtbar: Verlauf neu laden
    const [noticeVer, setNoticeVer] = useState(0)
    useEffect(() => { if (/^(zones_|plan_|robot_finished)/.test(s.notice?.type ?? '')) setNoticeVer((v) => v + 1) }, [s.notice])
    const version = noticeVer + s.resumed
    const runs = useRuns(s.serial, version)
    const jobs = useJobs(s.serial, version)
    const maps = useMaps(s.serial)
    const sessions = useEspSessions(s.serial, version)
    const entries = useMemo(() => historyEntries(runs.data ?? [], jobs.data ?? []), [runs.data, jobs.data])
    const current = selected ?? entries[0]?.id
    const group = entries.find((e): e is Extract<Entry, { kind: 'job' }> => e.kind === 'job'
        && (e.id === current || e.runs.some((r) => r.id === current)))
    const tz = s.server?.timezone
    const when = (ts: number | undefined, fallback = '') => (ts ? fmtWhen(locale, tz, ts, s.now, t.overview, true) : fallback)
    const mapName = (id: string | null | undefined) => maps.data?.find((m) => m.id === id)?.name
    const sourceLabel = (j: Job | undefined) => (j?.source === 'plan' ? t.history.plan : j && j.zones.length > 1 ? t.history.zones : undefined)

    if (!entries.length) return <Card><Empty icon={<History />} label={runs.loading || jobs.loading ? t.common.loading : t.runs.empty} /></Card>

    const runRow = (e: Extract<Entry, { kind: 'run' }>) => {
        const sub = [sourceLabel(e.job), mapName(e.run.persistent_map), runStatsShort(locale, sessionFor(sessions.data, e.ts), e.run)].filter(Boolean).join(' · ')
        return (
            <li key={e.id}>
                <a className="row" href={`#/runs/${encodeURIComponent(e.id)}`} aria-current={e.id === current ? 'true' : undefined}>
                    <span className="row-main">
                        <Label className="row-t">{when(e.ts, e.id)}</Label>
                        {sub && <Label className="row-s">{sub}</Label>}
                    </span>
                </a>
            </li>
        )
    }

    const jobRow = (e: Extract<Entry, { kind: 'job' }>) => {
        const j = e.job
        const area = e.runs.reduce((sum, r) => sum + (runArea(r) ?? 0), 0)
        const failed = j.zones.filter((z) => z.status === 'failed').length
        const open = group?.id === e.id
        const sub = [sourceLabel(j), fill(t.history.zonesN, { n: j.zones.length }),
            area ? `${fmtNumber(locale, area)} m²` : undefined, fmtDuration(jobEnd(j, s.now) - j.started)].filter(Boolean).join(' · ')
        return (
            <li key={e.id} className="rgroup" data-open={open || undefined}>
                <a className="row" href={`#/runs/${encodeURIComponent(e.id)}`} aria-current={e.id === current ? 'true' : undefined} aria-expanded={open}>
                    <span className="row-main">
                        <Label className="row-t">{when(e.ts)}</Label>
                        <Label className="row-s">{sub}</Label>
                        {failed > 0 && <Label className="row-s rsteps-bad">{fill(failed === 1 ? t.history.failedOne : t.history.failedN, { n: failed })}</Label>}
                    </span>
                </a>
                {open && <ZoneSteps t={t} locale={locale} job={j} runs={e.runs} incidents={undefined} now={s.now} selected={current} />}
            </li>
        )
    }

    const entry = entries.find((e) => e.id === current)
    const detailRun = entry?.kind === 'run' ? entry.run : group?.runs.find((r) => r.id === current)
    return (
        <div className={`runs${selected ? ' has-detail' : ''}`}>
            <Card className="runs-list">
                <ul className="rows">{entries.map((e) => (e.kind === 'job' ? jobRow(e) : runRow(e)))}</ul>
            </Card>
            {entry?.kind === 'job'
                ? <JobDetail job={entry.job} runs={entry.runs} title={when(entry.ts)} />
                : current && <RunDetail id={current} title={when(runTs(detailRun) ?? idToTs(current), current)} run={detailRun}
                    partOf={group && { href: `#/runs/${encodeURIComponent(group.id)}`, label: [sourceLabel(group.job), when(group.ts)].filter(Boolean).join(' · ') }} />}
        </div>
    )
}

function BackLink() {
    const { t } = useI18n()
    return <a href="#/runs" className="btn btn--ghost btn--s btn--icon runs-back" aria-label={t.nav.back}><ChevronLeft /></a>
}

function RunDetail({ id, title, run, partOf }: { id: string; title: string; run?: RunSummary; partOf?: { href: string; label: string } }) {
    const { t, locale } = useI18n()
    const s = useStore()
    const data = useRunData(s.serial, id)
    // jede Reinigung hat eine Bodenkarte mit derselben ID und demselben Raster
    const floor = useMapData(s.serial, id)
    const sessions = useEspSessions(s.serial)
    const start = runTs(run) ?? idToTs(id)
    const session = sessionFor(sessions.data, start)
    const end = (run?.run?.end_at && idToTs(run.run.end_at)) || session?.summary?.time
    const path = useRunPath(s.serial, start, end)
    const incidents = useIncidents(s.serial, start, end ?? (start && start + 3 * 3600))
    const rows = runStatsRows(t, locale, session, run)
    return (
        <Card className="runs-detail" title={title} icon={<BackLink />}>
            {partOf && <a className="rpart" href={partOf.href}>{fill(t.history.partOf, { what: partOf.label })}</a>}
            {floor.data
                ? <PathMap data={floor.data} run={data.data} poses={path.data} label={title} />
                : <Empty label={floor.loading || data.loading ? t.common.loading : t.map.noMap} />}
            {rows.length > 0 && <KV rows={rows} />}
            {incidents.data && <IncidentList t={t} locale={locale} tz={s.server?.timezone} incidents={incidents.data} now={s.now} />}
        </Card>
    )
}

function JobDetail({ job, runs, title }: { job: Job; runs: RunSummary[]; title: string }) {
    const { t, locale } = useI18n()
    const s = useStore()
    const end = jobEnd(job, s.now)
    const floor = useMapData(s.serial, job.mapId ?? undefined)
    const bounds = useBoundaries(s.serial, job.mapId ?? undefined, s.connected)
    const zones = useMemo(() => (bounds.data ?? []).filter((b) => job.zones.some((z) => z.id === b.id)), [bounds.data, job.zones])
    const path = useRunPath(s.serial, job.started, end)
    const incidents = useIncidents(s.serial, job.started, end)
    const area = runs.reduce((sum, r) => sum + (runArea(r) ?? 0), 0)
    const done = job.zones.filter((z) => z.status === 'done').length
    const status: Record<Job['status'], string> = {
        running: t.history.running, done: t.history.statusDone, partial: t.history.statusPartial,
        failed: t.history.statusFailed, stopped: t.history.statusStopped, started: t.history.running,
    }
    const rows: [string, ReactNode][] = [
        [t.history.status, status[job.status]],
        [t.runs.duration, fmtDuration(end - job.started)],
        [t.runs.area, <Value key="a" value={fmtNumber(locale, area, 1)} unit="m²" />],
        [t.history.zonesDone, fill(t.history.ofN, { i: done, n: job.zones.length })],
        ...robotReportRows(t, locale, runs),
    ]
    return (
        <Card className="runs-detail" title={title} icon={<BackLink />}>
            {floor.data
                ? <PathMap data={floor.data} poses={path.data} label={title} boundaries={zones} />
                : <Empty label={floor.loading ? t.common.loading : t.map.noMap} />}
            <KV rows={rows} />
            <ZoneSteps t={t} locale={locale} job={job} runs={runs} incidents={incidents.data} now={s.now} />
            {incidents.data && <IncidentList t={t} locale={locale} tz={s.server?.timezone} incidents={incidents.data} now={s.now} />}
        </Card>
    )
}
