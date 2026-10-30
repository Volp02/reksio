import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
export type Density = 'comfy' | 'compact'

interface Theme {
    pref: ThemePref
    resolved: 'light' | 'dark'
    density: Density
    setPref: (p: ThemePref) => void
    setDensity: (d: Density) => void
    toggle: () => void
}

const Ctx = createContext<Theme | null>(null)
const media = window.matchMedia('(prefers-color-scheme: dark)')
const contrast = window.matchMedia('(prefers-contrast: more)')

function load<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
    const v = localStorage.getItem(key) as T | null
    return v && allowed.includes(v) ? v : fallback
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [pref, setPrefState] = useState<ThemePref>(() => load('reksio.theme', ['system', 'light', 'dark'] as const, 'system'))
    const [density, setDensityState] = useState<Density>(() => load('reksio.density', ['comfy', 'compact'] as const, 'comfy'))
    const [systemDark, setSystemDark] = useState(media.matches)
    const [moreContrast, setMoreContrast] = useState(contrast.matches)

    useEffect(() => {
        const a = (e: MediaQueryListEvent) => setSystemDark(e.matches)
        const b = (e: MediaQueryListEvent) => setMoreContrast(e.matches)
        media.addEventListener('change', a)
        contrast.addEventListener('change', b)
        return () => { media.removeEventListener('change', a); contrast.removeEventListener('change', b) }
    }, [])

    const resolved = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref

    // Synchron beim Rendern setzen: Kinder (z. B. die Karte) lesen die Farben noch im selben Durchlauf
    const el = document.documentElement
    el.dataset.theme = resolved
    el.dataset.density = density
    if (moreContrast) el.dataset.contrast = 'more'
    else delete el.dataset.contrast
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#161920' : '#ffffff')

    const setPref = (p: ThemePref) => { localStorage.setItem('reksio.theme', p); setPrefState(p) }
    const setDensity = (d: Density) => { localStorage.setItem('reksio.density', d); setDensityState(d) }

    return (
        <Ctx.Provider value={{ pref, resolved, density, setPref, setDensity, toggle: () => setPref(resolved === 'dark' ? 'light' : 'dark') }}>
            {children}
        </Ctx.Provider>
    )
}

export function useTheme(): Theme {
    const v = useContext(Ctx)
    if (!v) throw new Error('useTheme outside ThemeProvider')
    return v
}
