import { useEffect, useState, type ReactNode } from 'react'
import { Bot, CalendarClock, ChevronLeft, Cpu, WifiOff, Download, History, LayoutDashboard, Map as MapIcon, Moon, RefreshCw, Settings, Smartphone, Sun, X } from 'lucide-react'
import { useI18n, fill } from '../i18n'
import { isFresh, TELEMETRY_STALE_S, useStore } from '../state/store'
import { espProblem, robotStatus } from '../status'
import { fmtTime } from '../format'
import { useTheme } from '../ui/theme'
import { IconButton, Label, Pill, Toast } from '../ui/ui'
import { APK_URL } from '../api/client'
import { IN_APP } from '../pages/Settings'
import './shell.css'

export type Route = 'overview' | 'map' | 'runs' | 'schedule' | 'settings'
export const NAV: Route[] = ['overview', 'map', 'runs', 'schedule']
const ICONS: Record<Route, ReactNode> = {
    overview: <LayoutDashboard />, map: <MapIcon />, runs: <History />, schedule: <CalendarClock />, settings: <Settings />,
}

const APP_HINT_KEY = 'reksio.appHint'
// Hinweis auf die App: nur Android-Browser (nicht in der App selbst), einmal pro Browser
const ANDROID_BROWSER = /Android/i.test(navigator.userAgent) && !IN_APP

/** einmaliger Hinweis am Android-Handy: App herunterladen */
function AppHint() {
    const { t } = useI18n()
    const store = useStore()
    const [hidden, setHidden] = useState(() => localStorage.getItem(APP_HINT_KEY) === '1')
    if (hidden || !ANDROID_BROWSER || !store.server?.android_app) return null
    const close = () => { localStorage.setItem(APP_HINT_KEY, '1'); setHidden(true) }
    return (
        <div className="apphint" role="status">
            <Smartphone className="apphint-i" />
            <Label className="apphint-t">{t.app.hint}</Label>
            <a className="btn btn--primary btn--s" href={APK_URL} download onClick={close}><Download /><Label>{t.app.download}</Label></a>
            <IconButton size="s" icon={<X />} label={t.app.close} onClick={close} />
        </div>
    )
}

/** `sub`: Unterseite (Titel + Zurück), z. B. Einstellungen → ESP */
export function Shell({ route, sub, children }: { route: Route; sub?: { title: string; back: string }; children: ReactNode }) {
    const { t, locale } = useI18n()
    const { resolved, toggle } = useTheme()
    const store = useStore()
    const status = robotStatus(t, store.connected, store.robot,
        espProblem(t, store.telemetry, isFresh(store.telemetry?.ts, store.now, TELEMETRY_STALE_S)))
    const tz = store.server?.timezone
    const asOf = Math.max(store.robotAt ?? 0, store.telemetry?.ts ?? 0)
    const espFresh = isFresh(store.telemetry?.ts, store.now, TELEMETRY_STALE_S)
    const title = sub?.title ?? t.nav[route]
    // Meldungen des Servers kurz anzeigen
    const [toast, setToast] = useState<string>()
    useEffect(() => {
        const text = ({
            dustbin_emptied: t.maint.emptied,
            zones_done: t.zones.finished,
            zones_failed: t.zones.failed,
            zones_partial: fill(t.zones.partial, { names: (store.notice?.failed ?? []).join(', ') }),
            zones_stopped: t.zones.stoppedBusy,
            plan_started: t.schedule.started_notice,
            plan_skipped: t.schedule.skipped_notice,
        } as Record<string, string>)[store.notice?.type ?? '']
        if (text) setToast(text)
    }, [store.notice, t])

    const themeBtn = (
        <IconButton icon={resolved === 'dark' ? <Sun /> : <Moon />} label={resolved === 'dark' ? t.common.toLight : t.common.toDark} onClick={toggle} />
    )
    const settingsBtn = (
        <a href="#/settings" className={`btn btn--ghost btn--m btn--icon${route === 'settings' ? ' is-cur' : ''}`}
            aria-label={t.nav.settings} title={t.nav.settings} aria-current={route === 'settings' ? 'page' : undefined}>
            <Settings />
        </a>
    )

    return (
        <div className="app" data-route={route}>
            <aside className="side">
                <a className="brand" href="#/"><span className="logo"><Bot /></span><Label className="brand-n">{store.name}</Label></a>
                <nav className="side-nav">
                    {NAV.map((r) => (
                        <a key={r} href={`#/${r === 'overview' ? '' : r}`} className="nav-item" aria-current={route === r ? 'page' : undefined} title={t.nav[r]}>
                            {ICONS[r]}<Label className="nav-l">{t.nav[r]}</Label>
                        </a>
                    ))}
                </nav>
                <div className="side-foot">
                    <Pill tone={store.connected ? 'ok' : 'neutral'} label={store.connected ? t.common.connected : t.common.offline} />
                    {store.telemetry && (
                        <div className={`side-esp${espFresh ? '' : ' is-offline'}`} title={`ESP · ${fmtTime(locale, tz, store.telemetry.ts, true)}`}>
                            {espFresh ? <Cpu /> : <WifiOff />}
                            <Label>{espFresh ? `ESP · ${fmtTime(locale, tz, store.telemetry.ts, true)}` : `${t.esp.offline} · ${fmtTime(locale, tz, store.telemetry.ts)}`}</Label>
                        </div>
                    )}
                </div>
            </aside>

            <header className="topbar">
                <a className="brand" href="#/"><span className="logo"><Bot /></span><Label className="brand-n">{store.name}</Label></a>
                <Pill tone={status.tone} label={status.label} />
                {themeBtn}
                {settingsBtn}
            </header>

            <main className="main">
                <div className="ph">
                    {sub && <a href={sub.back} className="btn btn--ghost btn--m btn--icon ph-back" aria-label={t.nav.back} title={t.nav.back}><ChevronLeft /></a>}
                    <h1 className="ph-t"><Label>{title}</Label></h1>
                    {asOf > 0 && <span className="meta ph-asof">{fill(t.common.asOf, { time: fmtTime(locale, tz, asOf) })}</span>}
                    <IconButton size="s" icon={<RefreshCw />} label={t.common.refresh} onClick={store.refresh} className="ph-refresh" />
                    <span className="ph-actions">{themeBtn}{settingsBtn}</span>
                </div>
                {store.serverError && <div className="banner" role="alert">{t.common.serverUnreachable}</div>}
                <AppHint />
                {children}
            </main>

            <Toast text={toast} onClose={() => setToast(undefined)} />

            <nav className="bnav">
                {NAV.map((r) => (
                    <a key={r} href={`#/${r === 'overview' ? '' : r}`} aria-current={route === r ? 'page' : undefined}>
                        <span className="bnav-i">{ICONS[r]}</span><Label className="bnav-l">{t.nav[r]}</Label>
                    </a>
                ))}
            </nav>
        </div>
    )
}
