import { useEffect, useRef, useState } from 'react'
import type { Telemetry } from '../api/types'
import { useI18n } from '../i18n'
import { useStore } from '../state/store'
import { fmtTime } from '../format'

const H = 120
const PAD = { l: 34, r: 8, t: 8, b: 22 }
const Y_TICKS = [0, 50, 100]

/** Akkuverlauf (ESP) mit Achsen: y = 0–100 %, x = Uhrzeit; Ladephasen hinterlegt */
export function BatteryChart({ history, label }: { history: Telemetry[]; label: string }) {
    const { locale } = useI18n()
    const { server } = useStore()
    const ref = useRef<HTMLDivElement>(null)
    const [w, setW] = useState(0)
    const [hover, setHover] = useState<number>()

    useEffect(() => {
        const el = ref.current
        if (!el) return
        const ro = new ResizeObserver(() => setW(el.clientWidth))
        ro.observe(el)
        return () => ro.disconnect()
    }, [])

    const pts = history.filter((h) => h.charger)
    if (pts.length < 2) return <div ref={ref} className="bchart" />

    const t0 = pts[0].ts, t1 = pts[pts.length - 1].ts
    const iw = Math.max(1, w - PAD.l - PAD.r), ih = H - PAD.t - PAD.b
    const x = (ts: number) => PAD.l + ((ts - t0) / Math.max(1, t1 - t0)) * iw
    const y = (p: number) => PAD.t + ih - (p / 100) * ih
    const line = pts.map((p) => `${x(p.ts).toFixed(1)},${y(p.charger!.fuelPercent).toFixed(1)}`).join(' ')
    const pct = (v: number) => (locale.startsWith('de') ? `${v} %` : `${v}%`)
    const tz = server?.timezone

    // Ladephasen zusammenfassen
    const bands: [number, number][] = []
    for (const p of pts) {
        if (!p.charger!.chargingActive) continue
        const last = bands[bands.length - 1]
        if (last && p.ts - last[1] < 120) last[1] = p.ts
        else bands.push([p.ts, p.ts])
    }

    // x-Achse: volle Stunden bzw. halbe Stunden, je nach Länge
    const span = t1 - t0
    const step = span > 2.5 * 3600 ? 3600 : span > 3600 ? 1800 : 900
    const xTicks: number[] = []
    for (let s = Math.ceil(t0 / step) * step; s <= t1; s += step) xTicks.push(s)

    const hp = hover !== undefined ? pts[hover] : undefined

    return (
        <div ref={ref} className="bchart">
            {w > 0 && (
                <svg width={w} height={H} role="img" aria-label={label}
                    onPointerMove={(e) => {
                        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
                        const ts = t0 + ((e.clientX - r.left - PAD.l) / iw) * (t1 - t0)
                        let best = 0
                        for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].ts - ts) < Math.abs(pts[best].ts - ts)) best = i
                        setHover(best)
                    }}
                    onPointerLeave={() => setHover(undefined)}>
                    {bands.map(([a, b], i) => (
                        <rect key={i} className="bchart-band" x={x(a)} y={PAD.t} width={Math.max(1, x(b) - x(a))} height={ih} />
                    ))}
                    {Y_TICKS.map((v) => (
                        <g key={v}>
                            <line className="bchart-grid" x1={PAD.l} x2={w - PAD.r} y1={y(v)} y2={y(v)} />
                            <text className="bchart-ylab" x={PAD.l - 6} y={y(v)}>{pct(v)}</text>
                        </g>
                    ))}
                    {xTicks.map((s) => (
                        <text key={s} className="bchart-xlab" x={x(s)} y={H - 6}>{fmtTime(locale, tz, s)}</text>
                    ))}
                    <polyline className="bchart-line" points={line} />
                    {hp && (
                        <g>
                            <line className="bchart-cursor" x1={x(hp.ts)} x2={x(hp.ts)} y1={PAD.t} y2={PAD.t + ih} />
                            <circle className="bchart-dot" cx={x(hp.ts)} cy={y(hp.charger!.fuelPercent)} r={4} />
                            <text className="bchart-tip" x={Math.min(Math.max(x(hp.ts), PAD.l + 40), w - PAD.r - 40)} y={PAD.t + 12}>
                                {`${pct(hp.charger!.fuelPercent)} · ${fmtTime(locale, tz, hp.ts)}`}
                            </text>
                        </g>
                    )}
                </svg>
            )}
        </div>
    )
}
