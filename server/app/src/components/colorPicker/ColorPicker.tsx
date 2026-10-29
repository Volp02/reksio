import { useEffect, useState } from 'react'
import { HexColorPicker } from 'react-colorful'
import styles from './colorPicker.module.scss'
import { BOUNDARY_PRESETS, normalizeHex } from '../map/color'

interface ColorPickerProps {
    /** Current colour, "#rrggbb". */
    value: string
    /** Called with a normalised "#rrggbb" only. */
    onChange: (color: string) => void
    presets?: readonly string[]
}

/**
 * Inline colour picker for zones / no-go lines: a swatch row of presets, a
 * touch-friendly hue/saturation picker (react-colorful) and an editable hex
 * field. Meant to live inside the map drawer, so it expands in place instead
 * of opening a popover over the canvas.
 */
export default function ColorPicker({ value, onChange, presets = BOUNDARY_PRESETS }: ColorPickerProps) {
    const [open, setOpen] = useState(false)
    const [hexText, setHexText] = useState(value)
    const current = normalizeHex(value) ?? '#888888'

    // Keep the text field in sync when the colour changes from the picker/presets.
    useEffect(() => { setHexText(value) }, [value])

    const commitHex = (text: string) => {
        setHexText(text)
        const hex = normalizeHex(text)
        if (hex) onChange(hex)
    }

    return (
        <div className={styles.picker}>
            <button
                type="button"
                className={styles.current}
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
            >
                <span className={styles.swatchLarge} style={{ background: current }} />
                <span className={styles.hex}>{current}</span>
                <span className={styles.chevron}>{open ? '▲' : '▼'}</span>
            </button>

            <div className={styles.presets} role="listbox" aria-label="presets">
                {presets.map(p => (
                    <button
                        key={p}
                        type="button"
                        role="option"
                        aria-selected={p === current}
                        className={`${styles.preset} ${p === current ? styles.presetActive : ''}`}
                        style={{ background: p }}
                        onClick={() => onChange(p)}
                    />
                ))}
            </div>

            {open && (
                <div className={styles.custom}>
                    <HexColorPicker
                        className={styles.colorful}
                        color={current}
                        onChange={c => onChange(normalizeHex(c) ?? current)}
                    />
                    <input
                        className={styles.hexInput}
                        type="text"
                        inputMode="text"
                        autoCapitalize="off"
                        autoCorrect="off"
                        spellCheck={false}
                        maxLength={7}
                        value={hexText}
                        onChange={e => commitHex(e.target.value)}
                        onBlur={() => setHexText(current)}
                        aria-label="hex"
                    />
                </div>
            )}
        </div>
    )
}
