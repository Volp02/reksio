import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, Check, Plus, SkipForward, Trash2, Undo2, X } from 'lucide-react'
import { api } from '../api/client'
import { robot } from '../api/robot'
import { CleaningMode, NavigationMode, type Plan, type ScheduleEvent } from '../api/types'
import { fmtTime, fmtWhen } from '../format'
import { fill, useI18n } from '../i18n'
import { activeMap, useBoundaries, useMaps } from '../state/data'
import { useStore } from '../state/store'
import { Button, Card, Confirm, Empty, IconButton, InputRow, Label, Segmented, Toast } from '../ui/ui'
import { CleanModes } from './CleanModes'
import './pages.css'

/** Wochentage ab Montag (0 = Sonntag wie beim Roboter) */
const WEEK = [1, 2, 3, 4, 5, 6, 0]

type Target = 'map' | 'zones'

function newPlan(mapId: string | null): Plan {
    return { id: '', enabled: true, days: [1, 2, 3, 4, 5], time: '10:00', mapId, zones: [], mode: CleaningMode.ECO, navigationMode: NavigationMode.NORMAL }
}

export function Schedule() {
    const { t, locale } = useI18n()
    const s = useStore()
    const [plans, setPlans] = useState<Plan[]>()
    const [error, setError] = useState(false)
    const [version, setVersion] = useState(0)
    const [draft, setDraft] = useState<Plan>()
    const [target, setTarget] = useState<Target>('map')
    const [invalid, setInvalid] = useState<string>()
    const [busy, setBusy] = useState(false)
    const [confirm, setConfirm] = useState(false)
    const [toast, setToast] = useState<string>()
    const [robotSchedule, setRobotSchedule] = useState<ScheduleEvent[]>()
    const editor = useRef<HTMLDivElement>(null)

    const maps = useMaps(s.serial)
    const mapId = activeMap(maps.data)?.id
    const bounds = useBoundaries(s.serial, mapId, s.connected)
    const zones = useMemo(() => (bounds.data ?? []).filter((b) => b.type === 'polygon' && b.function !== 'nogo'), [bounds.data])
    const zoneColor = (id: string) => zones.find((z) => z.id === id)?.color

    useEffect(() => {
        if (!s.serial) return
        setError(false)
        api.plans(s.serial).then(setPlans).catch(() => setError(true))
    }, [s.serial, version, s.plansAt])

    // eigener Zeitplan des Roboters: nur zeigen, wenn dort Termine liegen (sonst starten beide)
    useEffect(() => {
        if (!s.serial || !s.connected) return
        setRobotSchedule(undefined)
        robot.getSchedule(s.serial).then(setRobotSchedule).catch(() => undefined)
    }, [s.serial, s.connected])

    // Editor auf dem Handy (unter der Liste) ins Bild holen
    const draftKey = draft ? draft.id || 'new' : undefined
    useEffect(() => { if (draftKey) editor.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }) }, [draftKey])

    const tz = s.server?.timezone
    const today = useMemo(() => {
        const wd = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(s.now * 1000)
        return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd)
    }, [tz, s.now])

    // Kalenderdatum (YYYY-MM-DD) in der Zeitzone des Servers, wie `skip` beim Server
    const dateOf = (ts: number) => new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz }).format(ts * 1000)
    const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay()
    const dayName = (date: string) => (date === dateOf(s.now) ? t.schedule.today
        : date === dateOf(s.now + 86400) ? t.schedule.tomorrow : t.schedule.daysLong[weekday(date)])
    const waitingDue = (p: Plan) => (p.last?.result === 'waiting' && s.now - Date.parse(p.last.due) / 1000 < 3600 ? Date.parse(p.last.due) / 1000 : undefined)
    /** ausgelassener Start, solange er noch bevorsteht */
    const skipped = (p: Plan) => (p.enabled && p.skip && p.skip >= dateOf(s.now) ? p.skip : undefined)
    /** Start, den „auslassen“ träfe: der gerade wartende, sonst der nächste */
    const upcoming = (p: Plan) => {
        const ts = waitingDue(p) ?? p.next ?? undefined
        return p.enabled && ts ? dateOf(ts) : undefined
    }

    const sorted = useMemo(() => [...(plans ?? [])].sort((a, b) => a.time.localeCompare(b.time)), [plans])

    const daysLabel = (days: number[]) => {
        const set = new Set(days)
        if (set.size === 7) return t.schedule.daily
        if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return t.schedule.weekdays
        if (set.size === 2 && set.has(0) && set.has(6)) return t.schedule.weekend
        return WEEK.filter((d) => set.has(d)).map((d) => t.schedule.days[d]).join(', ')
    }
    const targetLabel = (p: Plan) => (p.zones.length ? p.zones.map((z) => z.name || t.zones.unnamed).join(' → ') : t.schedule.wholeMap)

    const status = (p: Plan): { text: string; tone?: 'warn' } | undefined => {
        const last = p.last
        const skip = skipped(p)
        if (skip) return { text: [fill(t.schedule.skippedDay, { day: dayName(skip) }), nextText(p)].filter(Boolean).join(' · ') }
        if (last?.result === 'skipped' && last.reason === 'user' && s.now - last.ts < 86400) {
            return { text: [fill(t.schedule.skippedDay, { day: dayName(dateOf(Date.parse(last.due) / 1000)) }), nextText(p)].filter(Boolean).join(' · ') }
        }
        if (waitingDue(p) !== undefined && last) {
            return { text: [t.schedule.waiting, t.schedule.reasons[last.reason ?? ''] ?? last.reason].filter(Boolean).join(' · '), tone: 'warn' }
        }
        if (last?.result === 'skipped' && s.now - last.ts < 86400) {
            return { text: [fill(t.schedule.skipped, { when: fmtWhen(locale, tz, last.ts, s.now, t.overview, true) }), t.schedule.reasons[last.reason ?? '']].filter(Boolean).join(' · '), tone: 'warn' }
        }
        const next = nextText(p)
        return next ? { text: next } : undefined
    }
    function nextText(p: Plan) {
        return p.enabled && p.next ? fill(t.schedule.next, { when: `${dayName(dateOf(p.next))}, ${fmtTime(locale, tz, p.next)}` }) : undefined
    }
    const setSkip = (p: Plan, skip: string | null) =>
        store((plans ?? []).map((x) => (x.id === p.id ? { ...x, skip } : x)), skip ? fill(t.schedule.skippedDay, { day: dayName(skip) }) : undefined)

    const store = async (next: Plan[], done?: string) => {
        if (!s.serial) return false
        setBusy(true)
        try {
            setPlans(await api.setPlans(s.serial, next))
            if (done) setToast(done)
            return true
        } catch {
            setToast(t.zones.saveFailed)
            return false
        } finally {
            setBusy(false)
        }
    }

    const open = (p: Plan) => {
        setDraft({ ...p, days: [...p.days], zones: [...p.zones] })
        setTarget(p.zones.length ? 'zones' : 'map')
        setInvalid(undefined)
    }

    const save = async () => {
        if (!draft) return
        const p: Plan = { ...draft, mapId: draft.mapId ?? mapId ?? null, zones: target === 'zones' ? draft.zones : [] }
        if (!p.days.length) return setInvalid(t.schedule.noDays)
        if (target === 'zones' && !p.zones.length) return setInvalid(t.schedule.noZones)
        const list = plans ?? []
        if (await store(p.id ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p], t.zones.saved)) setDraft(undefined)
    }

    const remove = async () => {
        setConfirm(false)
        if (!draft) return
        if (await store((plans ?? []).filter((x) => x.id !== draft.id), t.maps.deleted)) setDraft(undefined)
    }

    const toggleDay = (d: number) => draft && setDraft({ ...draft, days: draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d] })
    const toggleZone = (id: string, name: string) => draft && setDraft({
        ...draft, zones: draft.zones.some((z) => z.id === id) ? draft.zones.filter((z) => z.id !== id) : [...draft.zones, { id, name }],
    })
    // Zonen der Karte, dazu gespeicherte, die es dort nicht (mehr) gibt
    const zoneChoices = draft ? [
        ...zones.map((z) => ({ id: z.id, name: z.name })),
        ...draft.zones.filter((z) => !zones.some((x) => x.id === z.id)),
    ] : []

    return (
        <div className={`sched${draft ? ' sched--edit' : ''}`}>
            <Card icon={<CalendarClock />} title={t.schedule.title}
                aside={<Button size="s" icon={<Plus />} label={t.schedule.newPlan} disabled={!plans || busy}
                    onClick={() => open(newPlan(mapId ?? null))} />}>
                {error ? <Empty label={t.actions.failed} action={<Button size="s" label={t.common.retry} onClick={() => setVersion((v) => v + 1)} />} />
                    : !plans ? <Empty label={t.common.loading} />
                        : (<>
                            <div className="week" role="list" aria-label={t.schedule.dayList}>
                                {WEEK.map((d) => (
                                    <div key={d} role="listitem" className="week-d" aria-current={d === today ? 'date' : undefined}>
                                        <Label className="week-h">{t.schedule.days[d]}</Label>
                                        {sorted.filter((p) => p.days.includes(d)).map((p) => (
                                            <button key={p.id} type="button" className="week-p" data-off={!p.enabled || undefined}
                                                data-skip={(skipped(p) && weekday(skipped(p)!) === d) || undefined}
                                                aria-pressed={draft?.id === p.id} title={`${p.time} · ${targetLabel(p)}`} onClick={() => open(p)}>
                                                {p.time}
                                            </button>
                                        ))}
                                    </div>
                                ))}
                            </div>
                            {sorted.length === 0 ? <Empty icon={<CalendarClock />} label={t.schedule.empty} /> : (
                                <ul className="rows">
                                    {sorted.map((p) => {
                                        const st = status(p)
                                        return (
                                            <li key={p.id} className="row splan" data-off={!p.enabled || undefined}>
                                                <button type="button" className="splan-b" aria-pressed={draft?.id === p.id} onClick={() => open(p)}>
                                                    <span className="splan-t">{p.time}</span>
                                                    <span className="row-main">
                                                        <Label className="row-t">{daysLabel(p.days)}</Label>
                                                        <Label className="row-s">{targetLabel(p)}</Label>
                                                        {st && <Label className={`row-s splan-st${st.tone ? ' splan-warn' : ''}`}>{st.text}</Label>}
                                                    </span>
                                                </button>
                                                {skipped(p) ? (
                                                    <Button size="s" variant="ghost" className="splan-skip" icon={<Undo2 />} label={t.schedule.unskip}
                                                        disabled={busy} onClick={() => setSkip(p, null)} />
                                                ) : upcoming(p) && (
                                                    <Button size="s" variant="ghost" className="splan-skip" icon={<SkipForward />}
                                                        label={fill(t.schedule.skipDay, { day: dayName(upcoming(p)!) })}
                                                        disabled={busy} onClick={() => setSkip(p, upcoming(p)!)} />
                                                )}
                                                <label className="switch splan-sw">
                                                    <input type="checkbox" role="switch" checked={p.enabled} disabled={busy} aria-label={`${p.time} ${daysLabel(p.days)}`}
                                                        onChange={(e) => store((plans ?? []).map((x) => (x.id === p.id ? { ...x, enabled: e.target.checked } : x)))} />
                                                    <span className="switch-t" aria-hidden />
                                                </label>
                                            </li>
                                        )
                                    })}
                                </ul>
                            )}
                        </>)}
            </Card>

            {draft && (<div ref={editor} className="sched-ed">
                <Card title={draft.id ? t.schedule.plan : t.schedule.newPlan}
                    aside={<IconButton size="s" icon={<X />} label={t.common.cancel} onClick={() => setDraft(undefined)} />}>
                    <div className="zedit">
                        <div className="field">
                            <Label className="field-l">{t.schedule.dayList}</Label>
                            <div className="dayp" role="group" aria-label={t.schedule.dayList}>
                                {WEEK.map((d) => (
                                    <button key={d} type="button" className="dayp-b" aria-pressed={draft.days.includes(d)}
                                        aria-label={t.schedule.daysLong[d]} onClick={() => toggleDay(d)}>{t.schedule.days[d]}</button>
                                ))}
                            </div>
                        </div>
                        <InputRow label={t.schedule.time} type="time" value={draft.time}
                            onChange={(v) => /^\d{2}:\d{2}$/.test(v) && setDraft({ ...draft, time: v })} />
                        <div className="field">
                            <Label className="field-l">{t.schedule.target}</Label>
                            <Segmented<Target> label={t.schedule.target} value={target} onChange={setTarget}
                                options={[{ value: 'map', label: t.schedule.wholeMap }, { value: 'zones', label: t.schedule.zones }]} />
                        </div>
                        {target === 'zones' && (zoneChoices.length ? (
                            <ul className="rows">
                                {zoneChoices.map((z) => {
                                    const n = draft.zones.findIndex((x) => x.id === z.id)
                                    return (
                                        <li key={z.id}>
                                            <button type="button" className="row zrow" aria-pressed={n >= 0} onClick={() => toggleZone(z.id, z.name)}>
                                                <span className="zrow-c" style={{ ['--c' as string]: zoneColor(z.id) ?? 'var(--text-3)' }} aria-hidden>{n >= 0 ? n + 1 : ''}</span>
                                                <span className="row-main"><Label className="row-t">{z.name || t.zones.unnamed}</Label></span>
                                                {n >= 0 && <Check className="row-i zrow-ok" />}
                                            </button>
                                        </li>
                                    )
                                })}
                            </ul>
                        ) : <Empty label={bounds.loading ? t.common.loading : t.zones.none} />)}
                        <CleanModes value={{ mode: draft.mode, navigation: draft.navigationMode }}
                            onChange={(v) => setDraft({ ...draft, mode: v.mode ?? draft.mode, navigationMode: v.navigation ?? draft.navigationMode })} />
                        {invalid && <div className="zedit-err" role="alert">{invalid}</div>}
                        <div className="actions">
                            {draft.id && <Button variant="danger" icon={<Trash2 />} label={t.zones.delete} disabled={busy} onClick={() => setConfirm(true)} />}
                            <Button variant="primary" label={busy ? t.actions.sending : t.common.save} loading={busy} onClick={save} />
                        </div>
                    </div>
                </Card>
            </div>)}

            {!!robotSchedule?.length && (
                <Card icon={<CalendarClock />} title={t.schedule.robotSchedule}>
                    <ul className="rows">
                        {[...robotSchedule].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7) || a.startTime.localeCompare(b.startTime)).map((e, i) => (
                            <li key={i} className="row">
                                <span className="row-main"><Label className="row-t">{t.schedule.days[e.day] ?? String(e.day)}</Label></span>
                                <span className="row-n">{e.startTime}</span>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            <Confirm open={confirm} title={t.schedule.deleteConfirm} confirmLabel={t.zones.delete} cancelLabel={t.common.cancel}
                onCancel={() => setConfirm(false)} onConfirm={remove} />
            <Toast text={toast} onClose={() => setToast(undefined)} />
        </div>
    )
}
