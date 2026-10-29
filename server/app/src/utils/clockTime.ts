/**
 * Clock-time helpers for schedules stored on the robot as "HH:MM" plus a
 * weekday, where the robot's clock runs in UTC (Gen3). The UI shows and
 * edits those in the server's local time; converting shifts the time by the
 * server's UTC offset and moves the weekday when the shift crosses midnight.
 */

/** Sunday = 0 … Saturday = 6, matching Gen3 RobotDay. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface ClockSlot {
    /** "HH:MM", 24-hour, zero-padded. */
    time: string
    day: Weekday
}

const MINUTES_PER_DAY = 24 * 60

/** "HH:MM" -> minutes since midnight, or null if the string is not a valid time. */
export function parseHHMM(text: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim())
    if (!m) return null
    const h = Number(m[1]), min = Number(m[2])
    if (h > 23 || min > 59) return null
    return h * 60 + min
}

export function formatHHMM(minutes: number): string {
    const m = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Shift a weekly slot by `deltaMinutes`. A positive delta moves it later; if
 * the result wraps past midnight the weekday advances (or goes back) so the
 * event still lands on the same real instant of the week.
 */
export function shiftClockSlot(slot: ClockSlot, deltaMinutes: number): ClockSlot {
    const minutes = parseHHMM(slot.time)
    if (minutes === null) return slot // leave unparseable input untouched
    const total = minutes + deltaMinutes
    const dayShift = Math.floor(total / MINUTES_PER_DAY)
    const day = ((((slot.day + dayShift) % 7) + 7) % 7) as Weekday
    return { time: formatHHMM(total), day }
}

/** Robot (UTC) slot -> server-local slot. */
export function utcSlotToLocal(slot: ClockSlot, utcOffsetMinutes: number): ClockSlot {
    return shiftClockSlot(slot, utcOffsetMinutes)
}

/** Server-local slot -> robot (UTC) slot. */
export function localSlotToUtc(slot: ClockSlot, utcOffsetMinutes: number): ClockSlot {
    return shiftClockSlot(slot, -utcOffsetMinutes)
}

/** "+01:00" / "-03:30" / "UTC" for labels. */
export function formatUtcOffset(utcOffsetMinutes: number): string {
    if (utcOffsetMinutes === 0) return 'UTC'
    const sign = utcOffsetMinutes < 0 ? '-' : '+'
    const abs = Math.abs(utcOffsetMinutes)
    return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}
