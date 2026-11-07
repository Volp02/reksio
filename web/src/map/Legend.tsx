import type { Boundary } from '../api/types'
import { Label } from '../ui/ui'

/** Zonen und No-Go-Linien als Liste unter der Karte (Farbe nie allein: immer mit Name) */
export function Legend({ boundaries, noGo, noGoArea }: { boundaries?: Boundary[]; noGo: string; noGoArea?: string }) {
    const items = (boundaries ?? []).filter((b) => b.enabled !== false)
    if (!items.length) return null
    return (
        <ul className="legend">
            {items.map((b) => (
                <li key={b.id} className={`legend-i legend-i--${b.function === 'nogo' && b.type === 'polygon' ? 'nogo' : b.type}`} style={{ ['--c' as string]: b.color }}>
                    <Label>{b.type === 'polyline' ? (b.name || noGo) : b.function === 'nogo' ? (b.name || noGoArea || noGo) : b.name}</Label>
                </li>
            ))}
        </ul>
    )
}
