import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Maximize, Minus, Plus } from 'lucide-react'
import type { MapData } from '../api/types'
import { useI18n } from '../i18n'
import { useTheme } from '../ui/theme'
import { IconButton } from '../ui/ui'
import { renderMap } from './render'
import './map.css'

const MAX_SCALE = 8 // CSS-Pixel pro Kartenpixel

interface View { scale: number; x: number; y: number }

export function MapView({ data, kind, controls = 'full', label, fill = false }:
    { data: MapData; kind: 'floor' | 'run'; controls?: 'full' | 'fit'; label: string; fill?: boolean }) {
    const { t } = useI18n()
    const { resolved } = useTheme()
    const wrap = useRef<HTMLDivElement>(null)
    const canvas = useRef<HTMLCanvasElement>(null)
    const view = useRef<View>({ scale: 1, x: 0, y: 0 })
    const fitted = useRef(true)
    const frame = useRef(0)

    // Kartenbild nur bei neuer Karte oder neuem Thema neu erzeugen
    const { canvas: bitmap, bounds } = useMemo(() => renderMap(data, kind), [data, kind, resolved])

    const draw = useCallback(() => {
        cancelAnimationFrame(frame.current)
        frame.current = requestAnimationFrame(() => {
            const c = canvas.current
            if (!c) return
            const g = c.getContext('2d')!
            const dpr = window.devicePixelRatio || 1
            g.setTransform(1, 0, 0, 1, 0, 0)
            g.clearRect(0, 0, c.width, c.height)
            const v = view.current
            g.setTransform(dpr * v.scale, 0, 0, dpr * v.scale, dpr * v.x, dpr * v.y)
            g.imageSmoothingEnabled = v.scale < 2
            g.drawImage(bitmap, 0, 0)
        })
    }, [bitmap])

    const fitScale = useCallback(() => {
        const el = wrap.current
        if (!el) return 1
        return Math.min(el.clientWidth / bounds.w, el.clientHeight / bounds.h)
    }, [bounds])

    const fit = useCallback(() => {
        const el = wrap.current
        if (!el) return
        const s = fitScale()
        view.current = {
            scale: s,
            x: (el.clientWidth - bounds.w * s) / 2 - bounds.x * s,
            y: (el.clientHeight - bounds.h * s) / 2 - bounds.y * s,
        }
        fitted.current = true
        draw()
    }, [bounds, draw, fitScale])

    const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
        const v = view.current
        const min = fitScale() * 0.8
        const scale = Math.min(MAX_SCALE, Math.max(min, v.scale * factor))
        const k = scale / v.scale
        view.current = { scale, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
        fitted.current = false
        draw()
    }, [draw, fitScale])

    // Größe: Canvas an Container anpassen, eingepasst bleiben, solange nicht gezoomt wurde
    useEffect(() => {
        const el = wrap.current
        const c = canvas.current
        if (!el || !c) return
        const ro = new ResizeObserver(() => {
            const dpr = window.devicePixelRatio || 1
            c.width = Math.round(el.clientWidth * dpr)
            c.height = Math.round(el.clientHeight * dpr)
            if (fitted.current) fit()
            else draw()
        })
        ro.observe(el)
        return () => ro.disconnect()
    }, [fit, draw])

    useEffect(() => { fit() }, [data, fit])
    useEffect(() => { draw() }, [bitmap, draw])

    // Mausrad und Gesten
    useEffect(() => {
        const el = wrap.current
        if (!el || controls !== 'full') return
        const pointers = new Map<number, { x: number; y: number }>()
        let pinch: { d: number } | null = null
        const local = (e: { clientX: number; clientY: number }) => {
            const r = el.getBoundingClientRect()
            return { x: e.clientX - r.left, y: e.clientY - r.top }
        }
        const onWheel = (e: WheelEvent) => {
            e.preventDefault()
            const p = local(e)
            zoomAt(Math.exp(-e.deltaY * 0.0015), p.x, p.y)
        }
        const onDown = (e: PointerEvent) => {
            el.setPointerCapture(e.pointerId)
            pointers.set(e.pointerId, local(e))
        }
        const onMove = (e: PointerEvent) => {
            const prev = pointers.get(e.pointerId)
            if (!prev) return
            const cur = local(e)
            pointers.set(e.pointerId, cur)
            if (pointers.size === 1) {
                const v = view.current
                view.current = { ...v, x: v.x + cur.x - prev.x, y: v.y + cur.y - prev.y }
                fitted.current = false
                draw()
            } else if (pointers.size === 2) {
                const [a, b] = [...pointers.values()]
                const d = Math.hypot(a.x - b.x, a.y - b.y)
                if (pinch) zoomAt(d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2)
                pinch = { d }
            }
        }
        const onUp = (e: PointerEvent) => {
            pointers.delete(e.pointerId)
            if (pointers.size < 2) pinch = null
        }
        const onDbl = (e: MouseEvent) => { const p = local(e); zoomAt(2, p.x, p.y) }
        el.addEventListener('wheel', onWheel, { passive: false })
        el.addEventListener('pointerdown', onDown)
        el.addEventListener('pointermove', onMove)
        el.addEventListener('pointerup', onUp)
        el.addEventListener('pointercancel', onUp)
        el.addEventListener('dblclick', onDbl)
        return () => {
            el.removeEventListener('wheel', onWheel)
            el.removeEventListener('pointerdown', onDown)
            el.removeEventListener('pointermove', onMove)
            el.removeEventListener('pointerup', onUp)
            el.removeEventListener('pointercancel', onUp)
            el.removeEventListener('dblclick', onDbl)
        }
    }, [controls, draw, zoomAt])

    const center = () => {
        const el = wrap.current!
        return [el.clientWidth / 2, el.clientHeight / 2] as const
    }

    return (
        <div className={`mapview${controls === 'full' ? ' mapview--interactive' : ''}${fill ? ' mapview--full' : ''}`} ref={wrap}
            style={{ aspectRatio: `${bounds.w} / ${bounds.h}` }}>
            <canvas ref={canvas} role="img" aria-label={label} />
            <div className="mapctl">
                {controls === 'full' && <>
                    <IconButton size="s" variant="default" icon={<Plus />} label={t.map.zoomIn} onClick={() => zoomAt(1.5, ...center())} />
                    <IconButton size="s" variant="default" icon={<Minus />} label={t.map.zoomOut} onClick={() => zoomAt(1 / 1.5, ...center())} />
                </>}
                <IconButton size="s" variant="default" icon={<Maximize />} label={t.map.fit} onClick={fit} />
            </div>
        </div>
    )
}
