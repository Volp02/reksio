import { useApp } from './useApp'
import type { Robot } from '../types'

export function useRobot() {
    const context = useApp()
    if (!context.robot) {
        throw new Error('robot needs to be defined!')
    }
    return context as typeof context & { robot: Robot }
}