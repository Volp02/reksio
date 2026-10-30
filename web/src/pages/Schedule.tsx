import { useEffect, useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { gen3 } from '../api/client'
import type { ScheduleEvent } from '../api/types'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import { Button, Card, Empty, Label, Pill } from '../ui/ui'
import './pages.css'

export function Schedule() {
    const { t } = useI18n()
    const s = useStore()
    const [data, setData] = useState<{ enabled: boolean; events: ScheduleEvent[] }>()
    const [error, setError] = useState(false)
    const [version, setVersion] = useState(0)

    useEffect(() => {
        if (!s.serial || !s.connected) return
        setError(false)
        gen3.getSchedule(s.serial).then((r) => setData(r.data)).catch(() => setError(true))
    }, [s.serial, s.connected, version])

    const events = [...(data?.events ?? [])].sort((a, b) => ((a.day + 6) % 7) - ((b.day + 6) % 7) || a.startTime.localeCompare(b.startTime))

    return (
        <Card icon={<CalendarClock />} title={t.schedule.title}
            aside={data && <Pill tone={data.enabled ? 'ok' : 'neutral'} label={data.enabled ? t.schedule.enabled : t.schedule.disabled} />}>
            {!s.connected ? <Empty label={t.common.offline} />
                : error ? <Empty label={t.actions.failed} action={<Button size="s" label={t.common.retry} onClick={() => setVersion((v) => v + 1)} />} />
                    : !data ? <Empty label={t.common.loading} />
                        : events.length === 0 ? <Empty icon={<CalendarClock />} label={t.schedule.empty} />
                            : (
                                <ul className="rows">
                                    {events.map((e, i) => (
                                        <li key={i} className="row">
                                            <span className="row-main"><Label className="row-t">{t.schedule.days[e.day] ?? String(e.day)}</Label></span>
                                            <span className="row-n">{e.startTime}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
        </Card>
    )
}
