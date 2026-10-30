import { useEffect, useState } from 'react'
import { BatteryMedium, Bot, ChevronRight, Cpu, LayoutDashboard, Palette, Server, SlidersHorizontal } from 'lucide-react'
import { gen3 } from '../api/client'
import type { GeneralInfo } from '../api/types'
import { useI18n, type Lang } from '../i18n'
import { useStore } from '../state/store'
import { setPrefs, usePrefs } from '../state/prefs'
import { useTheme, type Density, type ThemePref } from '../ui/theme'
import { Card, KV, Label, Segmented, Switch } from '../ui/ui'
import { DiagnosticsCard } from './Diagnostics'
import './pages.css'

export function Settings() {
    const { t, lang, setLang } = useI18n()
    const theme = useTheme()
    const prefs = usePrefs()
    const s = useStore()
    const [info, setInfo] = useState<GeneralInfo>()

    useEffect(() => {
        if (!s.serial || !s.connected) return
        gen3.getGeneralInfo(s.serial).then((r) => setInfo(r.data)).catch(() => undefined)
    }, [s.serial, s.connected])

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

            <Card icon={<SlidersHorizontal />} title={t.settings.advanced}>
                <ul className="rows">
                    <li><a className="row" href="#/settings/esp"><Cpu className="row-i" /><span className="row-main"><Label className="row-t">{t.esp.title}</Label></span><ChevronRight className="row-i" /></a></li>
                    <li><a className="row" href="#/settings/battery"><BatteryMedium className="row-i" /><span className="row-main"><Label className="row-t">{t.bat.title}</Label></span><ChevronRight className="row-i" /></a></li>
                </ul>
            </Card>

            <Card icon={<Bot />} title={t.settings.robot}>
                <KV rows={[
                    [t.settings.name, <Label key="n">{s.name}</Label>],
                    [t.settings.model, info?.model ?? s.robot?.meta?.modelName ?? none],
                    [t.settings.serial, <span key="s" className="mono wrap">{s.serial ?? none}</span>],
                    [t.settings.firmware, <span key="f" className="mono">{info?.firmware ?? s.robot?.meta?.firmware ?? none}</span>],
                ]} />
            </Card>

            <DiagnosticsCard />

            <Card icon={<Server />} title={t.settings.server}>
                <KV rows={[
                    [t.settings.version, <span key="v" className="mono">{s.server?.version ?? none}</span>],
                    [t.settings.timezone, s.server?.timezone ?? none],
                ]} />
            </Card>
        </div>
    )
}
