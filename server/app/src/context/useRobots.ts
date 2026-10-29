import { useApp } from './useApp'
import type { QuickRobotInfo } from '../types'

export function useRobots() {
    const context = useApp()
    if (!context.robots) {
        throw new Error('robots needs to be defined! wrap this tree in <RequireRobot>')
    }
    return context as typeof context & { robots: QuickRobotInfo }
}