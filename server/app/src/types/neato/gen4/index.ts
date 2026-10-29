export * from './state'
export * from './api'
export * from './schedule'
export * from './runs'
export * from './settings'

export interface Floorplan {
    id: string
    name: string
    promoted: boolean
    base: [number, number, number],
    origin: [number, number],
    resolution: number,
    alignment: number,
    imgsize: [number, number],
    created_at: string
    in_maps_list: boolean
}
