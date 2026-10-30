import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/base.css'
import { I18nProvider } from './i18n'
import { StoreProvider } from './state/store'
import { ThemeProvider } from './ui/theme'
import { Shell, type Route } from './shell/Shell'
import { Overview } from './pages/Overview'
import { MapPage } from './pages/MapPage'
import { Runs } from './pages/Runs'
import { Schedule } from './pages/Schedule'
import { Settings } from './pages/Settings'
import { EspSettings } from './pages/EspSettings'
import { BatterySettings } from './pages/BatterySettings'
import { useI18n } from './i18n'

// Hash-Routing: funktioniert ohne Server-Fallback und hinter Präfixen
function parse(hash: string): { route: Route; arg?: string } {
    const [, page = '', arg] = hash.replace(/^#/, '').split('/')
    const route = (['map', 'runs', 'schedule', 'settings'] as const).find((r) => r === page) ?? 'overview'
    return { route, arg: arg ? decodeURIComponent(arg) : undefined }
}

function App() {
    const { t } = useI18n()
    const [loc, setLoc] = useState(() => parse(location.hash))
    useEffect(() => {
        const on = () => { setLoc(parse(location.hash)); window.scrollTo(0, 0) }
        window.addEventListener('hashchange', on)
        return () => window.removeEventListener('hashchange', on)
    }, [])
    return (
        <Shell route={loc.route} sub={loc.route === 'settings' && (loc.arg === 'esp' || loc.arg === 'battery')
            ? { title: loc.arg === 'esp' ? t.esp.title : t.bat.title, back: '#/settings' } : undefined}>
            {loc.route === 'overview' && <Overview />}
            {loc.route === 'map' && <MapPage />}
            {loc.route === 'runs' && <Runs selected={loc.arg} />}
            {loc.route === 'schedule' && <Schedule />}
            {loc.route === 'settings' && !loc.arg && <Settings />}
            {loc.route === 'settings' && loc.arg === 'esp' && <EspSettings />}
            {loc.route === 'settings' && loc.arg === 'battery' && <BatterySettings />}
        </Shell>
    )
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <ThemeProvider>
            <I18nProvider>
                <StoreProvider>
                    <App />
                </StoreProvider>
            </I18nProvider>
        </ThemeProvider>
    </StrictMode>,
)
