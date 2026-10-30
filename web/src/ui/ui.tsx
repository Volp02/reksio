import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import type { Tone } from '../status'
import './ui.css'

/** Einzeiler mit Ellipse; voller Text als Tooltip, sobald abgeschnitten (DESIGN.md §9) */
export function Label({ children, className = '' }: { children: string | number; className?: string }) {
    const ref = useRef<HTMLSpanElement>(null)
    const [title, setTitle] = useState<string>()
    const check = () => {
        const el = ref.current
        setTitle(el && el.scrollWidth > el.clientWidth ? String(children) : undefined)
    }
    return <span ref={ref} className={`lbl ${className}`} title={title} onMouseEnter={check} onFocus={check}>{children}</span>
}

type BtnVariant = 'default' | 'primary' | 'ghost' | 'danger'

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    variant?: BtnVariant
    size?: 'm' | 's'
    icon?: ReactNode
    label: string
    loading?: boolean
    grow?: boolean
}

export function Button({ variant = 'default', size = 'm', icon, label, loading, grow, className = '', disabled, ...rest }: ButtonProps) {
    return (
        <button
            type="button"
            className={`btn btn--${variant} btn--${size}${grow ? ' btn--grow' : ''} ${className}`}
            disabled={disabled || loading}
            data-loading={loading || undefined}
            {...rest}
        >
            {loading ? <span className="spinner" aria-hidden /> : icon}
            <Label>{label}</Label>
        </button>
    )
}

export function IconButton({ icon, label, size = 'm', variant = 'ghost', className = '', ...rest }:
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & { icon: ReactNode; label: string; size?: 'm' | 's'; variant?: BtnVariant }) {
    return (
        <button type="button" className={`btn btn--${variant} btn--${size} btn--icon ${className}`} aria-label={label} title={label} {...rest}>
            {icon}
        </button>
    )
}

export function Pill({ tone = 'neutral', label }: { tone?: Tone; label: string }) {
    return <span className={`pill pill--${tone}`} role="status"><Label>{label}</Label></span>
}

export function Card({ icon, title, aside, children, className = '' }:
    { icon?: ReactNode; title?: string; aside?: ReactNode; children: ReactNode; className?: string }) {
    return (
        <section className={`card ${className}`}>
            {(title || aside) && (
                <header className="card-h">
                    {icon}
                    {title && <h3 className="card-t"><Label>{title}</Label></h3>}
                    {aside}
                </header>
            )}
            {children}
        </section>
    )
}

/** Schlüssel-Wert-Liste; Wert kann Einheit enthalten */
export function KV({ rows }: { rows: [string, ReactNode][] }) {
    return (
        <dl className="kv">
            {rows.map(([k, v]) => (
                <div className="kv-row" key={k}><dt><Label>{k}</Label></dt><dd>{v}</dd></div>
            ))}
        </dl>
    )
}

export function Value({ value, unit }: { value: string; unit?: string }) {
    return <>{value}{unit && <span className="unit"> {unit}</span>}</>
}

export function Segmented<T extends string>({ value, options, onChange, label }:
    { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
    return (
        <div className="seg" role="radiogroup" aria-label={label}>
            {options.map((o) => (
                <button key={o.value} type="button" role="radio" aria-checked={o.value === value} onClick={() => onChange(o.value)}>
                    <Label>{o.label}</Label>
                </button>
            ))}
        </div>
    )
}

/** Schalter mit Beschriftung links; ganze Zeile klickbar */
export function Switch({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
    return (
        <label className="switch">
            <Label className="switch-l">{label}</Label>
            <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            <span className="switch-t" aria-hidden />
        </label>
    )
}

export function Empty({ icon, label, action }: { icon?: ReactNode; label: string; action?: ReactNode }) {
    return <div className="empty">{icon}<Label className="empty-l">{label}</Label>{action}</div>
}

/** Bestätigung (nur für Befehle, die eine Reinigung beenden) */
export function Confirm({ open, title, confirmLabel, cancelLabel, onConfirm, onCancel }:
    { open: boolean; title: string; confirmLabel: string; cancelLabel: string; onConfirm: () => void; onCancel: () => void }) {
    const ref = useRef<HTMLDialogElement>(null)
    useEffect(() => {
        const d = ref.current
        if (!d) return
        if (open && !d.open) d.showModal()
        if (!open && d.open) d.close()
    }, [open])
    return (
        <dialog ref={ref} className="dialog" onCancel={(e) => { e.preventDefault(); onCancel() }}
            onClick={(e) => { if (e.target === ref.current) onCancel() }}>
            <h2 className="dialog-t">{title}</h2>
            <div className="dialog-a">
                <Button label={cancelLabel} onClick={onCancel} autoFocus />
                <Button label={confirmLabel} variant="danger" onClick={onConfirm} />
            </div>
        </dialog>
    )
}

export function Toast({ text, onClose }: { text?: string; onClose: () => void }) {
    useEffect(() => {
        if (!text) return
        const id = setTimeout(onClose, 4000)
        return () => clearTimeout(id)
    }, [text, onClose])
    if (!text) return null
    return <div className="toast" role="alert">{text}</div>
}
