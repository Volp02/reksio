// Maps the day values used by the robots (Gen4: "mon".."sun",

import { Neato } from "../types"

// Gen3: enum names "MONDAY".."SUNDAY") to the keys in locales/*.json (days.*).
export type DayKey = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'

const DAY_ALIASES: Record<(Neato.Gen3.RobotDay | Neato.Gen4.Days), DayKey> = {
    [Neato.Gen3.RobotDay.MONDAY]: 'monday', [Neato.Gen4.Days.MONDAY]: 'monday',
    [Neato.Gen3.RobotDay.TUESDAY]: 'tuesday', [Neato.Gen4.Days.TUESDAY]: 'tuesday',
    [Neato.Gen3.RobotDay.WEDNESDAY]: 'wednesday', [Neato.Gen4.Days.WEDNESDAY]: 'wednesday',
    [Neato.Gen3.RobotDay.THURSDAY]: 'thursday', [Neato.Gen4.Days.THURSDAY]: 'thursday',
    [Neato.Gen3.RobotDay.FRIDAY]: 'friday', [Neato.Gen4.Days.FRIDAY]: 'friday',
    [Neato.Gen3.RobotDay.SATURDAY]: 'saturday', [Neato.Gen4.Days.SATURDAY]: 'saturday',
    [Neato.Gen3.RobotDay.SUNDAY]: 'sunday', [Neato.Gen4.Days.SUNDAY]: 'sunday',
}

export function dayKey(value: (Neato.Gen3.RobotDay | Neato.Gen4.Days)): DayKey {
    return DAY_ALIASES[value] ?? 'monday'
}
