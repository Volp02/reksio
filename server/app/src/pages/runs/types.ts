import type { RobotDay } from "../../types/api"
import type { CleaningMode } from "../../types/state"

export interface ScheduleEvent {
    mode: CleaningMode
    day: RobotDay
    startTime: string // HH:MM
    boundaryId?: string // Zone cleaning
}

export interface GetSchedule {
    enabled: boolean
    events: ScheduleEvent[]
}
