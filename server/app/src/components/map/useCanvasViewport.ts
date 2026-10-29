import { useState } from 'react'
import type { Offset, TouchState } from './types'
import { DRAWING } from './constants'
import { getTouchDistance, getTouchAngle } from './utils'

interface Props {
    initialZoom: number
    initialOffset: Offset
}

export const useCanvasViewport = ({
    initialZoom,
    initialOffset
}: Props) => {
    const [zoom, setZoom] = useState(initialZoom)
    const [offset, setOffset] = useState(initialOffset)

    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
    const [touchStart, setTouchStart] = useState<TouchState | null>(null)
    const [hasMoved, setHasMoved] = useState(false)

    const pan = (dx: number, dy: number) => {
        setOffset(prev => ({
            x: prev.x + dx,
            y: prev.y + dy
        }))
    }

    // Nests the offset update inside the zoom update's functional form so both always read
    // the truly-latest committed state, rather than the `zoom`/`offset` closed over when
    // this render's handleTouchMove was created — matters during fast pinches, where several
    // touchmove events can fire before React re-renders in between.
    const zoomAt = (newZoom: number, centerX: number, centerY: number) => {
        setZoom(prevZoom => {
            setOffset(prevOffset => {
                const worldX = (centerX - prevOffset.x) / prevZoom
                const worldY = (centerY - prevOffset.y) / prevZoom

                return {
                    x: centerX - worldX * newZoom,
                    y: centerY - worldY * newZoom
                }
            })
            return newZoom
        })
    }

    // ─────────────────────────────
    // Mouse
    // ─────────────────────────────

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true)
        setDragStart({ x: e.clientX, y: e.clientY })
        setHasMoved(false)
    }

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return

        const dx = e.clientX - dragStart.x
        const dy = e.clientY - dragStart.y

        if (
            Math.abs(dx) >= DRAWING.MIN_MOVEMENT ||
            Math.abs(dy) >= DRAWING.MIN_MOVEMENT
        ) {
            setHasMoved(true)
            pan(dx, dy)

            setDragStart({
                x: e.clientX,
                y: e.clientY
            })
        }
    }

    const handleMouseUp = () => {
        setIsDragging(false)
        setHasMoved(false)
    }

    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
        e.preventDefault()

        const rect = e.currentTarget.getBoundingClientRect()
        const mouseX = e.clientX - rect.left
        const mouseY = e.clientY - rect.top

        const worldX = (mouseX - offset.x) / zoom
        const worldY = (mouseY - offset.y) / zoom
        const factor = e.deltaY < 0 ? DRAWING.ZOOM_FACTOR : 1 / DRAWING.ZOOM_FACTOR
        const newZoom = Math.max(DRAWING.MIN_ZOOM, Math.min(DRAWING.MAX_ZOOM, zoom * factor))
        const newOffsetX = mouseX - worldX * newZoom
        const newOffsetY = mouseY - worldY * newZoom

        setZoom(newZoom)
        setOffset({ x: newOffsetX, y: newOffsetY })
    }

    // ─────────────────────────────
    // Touch
    // ─────────────────────────────

    const handleTouchStart = (e: React.TouchEvent) => {
        const t = e.touches

        if (t.length === 1) {
            setIsDragging(true)
            setDragStart({ x: t[0].clientX, y: t[0].clientY })
            setTouchStart(null)
            setHasMoved(false)
        } else if (t.length === 2) {
            const distance = getTouchDistance(t[0], t[1])
            // Guard: fingers landing almost on top of each other give a near-zero
            // distance, which would blow up the ratio in handleTouchMove on the very
            // first move and snap zoom to an extreme it then gets stuck at.
            setTouchStart(distance > DRAWING.MIN_PINCH_DISTANCE
                ? { distance, angle: getTouchAngle(t[0], t[1]) }
                : null)
            setIsDragging(false)
        }
    }

    const handleTouchMove = (e: React.TouchEvent) => {
        const t = e.touches
        setHasMoved(true)

        if (t.length === 1 && isDragging) {
            const dx = t[0].clientX - dragStart.x
            const dy = t[0].clientY - dragStart.y

            if (
                Math.abs(dx) >= DRAWING.MIN_MOVEMENT ||
                Math.abs(dy) >= DRAWING.MIN_MOVEMENT
            ) {
                pan(dx, dy)

                setDragStart({
                    x: t[0].clientX,
                    y: t[0].clientY
                })
            }
        }

        if (t.length === 2 && touchStart) {
            const rect = e.currentTarget.getBoundingClientRect()
            const distance = getTouchDistance(t[0], t[1])

            // Same guard as touchstart — fingers sliding to briefly overlap mid-gesture
            // shouldn't divide by near-zero either.
            if (distance > DRAWING.MIN_PINCH_DISTANCE) {
                const ratio = distance / touchStart.distance

                const newZoom = Math.max(
                    DRAWING.MIN_ZOOM,
                    Math.min(DRAWING.MAX_ZOOM, zoom * Math.pow(ratio, DRAWING.PINCH_ZOOM_POWER))
                )

                const centerX = (t[0].clientX + t[1].clientX) / 2 - rect.left
                const centerY = (t[0].clientY + t[1].clientY) / 2 - rect.top

                zoomAt(newZoom, centerX, centerY)

                setTouchStart({ distance, angle: getTouchAngle(t[0], t[1]) })
            }
        }
    }

    // *** The main fix ***
    // Previously this unconditionally cleared everything, so lifting either finger out of
    // a pinch a moment before the other (the normal case — hands don't lift in perfect
    // sync) killed the gesture. Now it checks what's still down: with one finger
    // remaining, hand off cleanly into a single-finger pan from its current position
    // instead of losing tracking until every finger comes up.
    const handleTouchEnd = (e: React.TouchEvent) => {
        const remaining = e.touches

        if (remaining.length === 1) {
            setIsDragging(true)
            setDragStart({ x: remaining[0].clientX, y: remaining[0].clientY })
            setTouchStart(null)
        } else {
            setIsDragging(false)
            setTouchStart(null)
        }

        if (remaining.length === 0) {
            setHasMoved(false)
        }
    }

    const centerView = (
    mapWidth: number,
    mapHeight: number,
    baseZoom: number,
    canvasWidth: number,
    canvasHeight: number
    ) => {
        setZoom(baseZoom)

        setOffset({
            x: canvasWidth / 2 - (mapWidth * baseZoom) / 2,
            y: canvasHeight / 2 - (mapHeight * baseZoom) / 2
        })
    }

    return {
        // viewport state
        zoom,
        offset,

        // interaction state
        isDragging,
        hasMoved,

        // handlers
        handleMouseDown,
        handleMouseMove,
        handleMouseUp,
        handleWheel,
        handleTouchStart,
        handleTouchMove,
        handleTouchEnd,

        centerView,
        setZoom,
        setOffset
    }
}