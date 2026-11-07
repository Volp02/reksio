import { useEffect, useState, type ReactNode } from 'react'
import { BatteryMedium, Bot, ChevronRight, Cpu, Download, LayoutDashboard, Palette, Server, SlidersHorizontal, Smartphone } from 'lucide-react'
import { api, apkUrl, UI_VERSION } from '../api/client'
import { robot } from '../api/robot'
import { useI18n, type Lang } from '../i18n'
import { useStore } from '../state/store'
import { setPrefs, usePrefs } from '../state/prefs'
import { useTheme, type Density, type ThemePref } from '../ui/theme'
import { Button, Card, InputRow, KV, Label, Segmented, Switch, Toast } from '../ui/ui'
import { DiagnosticsCard } from './Diagnostics'
import { AccessCard } from './AccessCard'
import { fmtNumber } from '../format'
import './pages.css'

/** läuft in der Android-App (WebView mit eigener Kennung): dort lässt sich die Serveradresse ändern */
export const IN_APP = /ReksioApp\//.test(navigator.userAgent)

export function Settings() {
    const { t, lang, setLang, locale } = useI18n()
    const theme = useTheme()
    const prefs = usePrefs()
    const s = useStore()
    const [info, setInfo] = useState<{ model?: string; firmware?: string }>()
    const [name, setName] = useState<string>()
    const [toast, setToast] = useState<string>()
    const summary = s.serial ? s.robots?.[s.serial] : undefined

    useEffect(() => {
        setInfo(undefined)
        setName(undefined)
        if (!s.serial || !s.connected) return
        robot.info(s.serial).then(setInfo).catch(() => undefined)
    }, [s.serial, s.connected])

    const rename = async () => {
        if (!s.serial || !name?.trim()) return
        try {
            await api.rename(s.serial, name.trim())
            setName(undefined)
            setToast(t.zones.saved)
        } catch {
            setToast(t.zones.saveFailed)
        }
    }

    const none = t.common.none

    return (
        <div className="settings">
            <Card icon={<Palette />} title={t.settings.appearance}>
                <div className="field"><Label className="field-l">{t.settings.theme}</Label>
                    <Segmented<ThemePref> label={t.settings.theme} value={theme.pref} onChange={theme.setPref} options={[
                        { value: 'system', label: t.settings.system }, { value: 'light', label: t.settings.light }, { value: 'dark', label: t.settings.dark }]} />
                </div>
                <div className="field"><Label className="field-l">{t.settings.density}</Label>
                    <Segmented<Density> label={t.settings.density} value={theme.density} onChange={theme.setDensity} options={[
                        { value: 'comfy', label: t.settings.comfy }, { value: 'compact', label: t.settings.compact }]} />
                </div>
                <div className="field"><Label className="field-l">{t.settings.language}</Label>
                    <Segmented<Lang> label={t.settings.language} value={lang} onChange={setLang} options={[
                        { value: 'de', label: 'Deutsch' }, { value: 'en', label: 'English' }]} />
                </div>
            </Card>

            <Card icon={<LayoutDashboard />} title={t.nav.overview}>
                <Switch label={t.settings.showDiagnostics} checked={prefs.diagnostics} onChange={(v) => setPrefs({ diagnostics: v })} />
            </Card>

            <AccessCard />

            <Card icon={<SlidersHorizontal />} title={t.settings.advanced}>
                <ul className="rows">
                    <li><a className="row" href="#/settings/esp"><Cpu className="row-i" /><span className="row-main"><Label className="row-t">{t.esp.title}</Label></span><ChevronRight className="row-i" /></a></li>
                    {IN_APP && <li><a className="row" href="reksio-app://setup"><Smartphone className="row-i" /><span className="row-main"><Label className="row-t">{t.settings.appServer}</Label></span><ChevronRight className="row-i" /></a></li>}
                    <li><a className="row" href="#/settings/battery"><BatteryMedium className="row-i" /><span className="row-main"><Label className="row-t">{t.bat.title}</Label></span><ChevronRight className="row-i" /></a></li>
                </ul>
            </Card>

            {!IN_APP && s.server && (
                <Card icon={<Smartphone />} title={t.app.title}>
                    <ul className="rows">
                        <li><a className="row" href={apkUrl(s.server)}>
                            <Download className="row-i" />
                            <span className="row-main">
                                <Label className="row-t">{t.app.download}</Label>
                                <Label className="row-s">{s.server.android_app
                                    ? [s.server.android_app.version, `${fmtNumber(locale, s.server.android_app.size / 1e6, 1)} MB`].filter(Boolean).join(' · ')
                                    : s.server.reksio_version ?? 'GitHub'}</Label>
                            </span>
                        </a></li>
                    </ul>
                </Card>
            )}

            <Card icon={<Bot />} title={t.settings.robot}>
                <InputRow label={t.settings.name} value={name ?? s.name} onChange={(v) => setName(v.slice(0, 40))} />
                {name !== undefined && name.trim() !== s.name && (
                    <div className="actions">
                        <Button label={t.common.discard} onClick={() => setName(undefined)} />
                        <Button variant="primary" label={t.common.save} disabled={!name.trim()} onClick={rename} />
                    </div>
                )}
                <KV rows={[
                    [t.settings.model, info?.model ?? s.robot?.meta?.modelName ?? (summary?.type === 'neato.gen4' ? 'D8–D10' : none)],
                    [t.settings.serial, <span key="s" className="mono wrap">{summary?.label_serial ?? s.serial ?? none}</span>],
                    [t.settings.firmware, <span key="f" className="mono">{info?.firmware ?? s.robot?.meta?.firmware ?? none}</span>],
                ]} />
            </Card>

            <DiagnosticsCard />
            <Toast text={toast} onClose={() => setToast(undefined)} />

            <Card icon={<Server />} title={t.settings.server}>
                <KV rows={[
                    [t.settings.version, <span key="v" className="mono">{s.server?.reksio_version ?? s.server?.version ?? none}</span>],
                    ...(IN_APP ? [[t.app.title, <span key="a" className="mono">{UI_VERSION || none}</span>] as [string, ReactNode]] : []),
                    [t.settings.timezone, s.server?.timezone ?? none],
                ]} />
            </Card>
        </div>
    )
}
