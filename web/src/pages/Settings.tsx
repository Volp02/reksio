import { useEffect, useState } from 'react'
import { Bot, Cpu, Palette, Server, Sparkles } from 'lucide-react'
import { gen3 } from '../api/client'
import { CleaningMode, NavigationMode, type GeneralInfo } from '../api/types'
import { useI18n, type Lang } from '../i18n'
import { isFresh, TELEMETRY_STALE_S, useStore } from '../state/store'
import { fmtNumber, fmtTime } from '../format'
import { useTheme, type Density, type ThemePref } from '../ui/theme'
import { Card, KV, Label, Segmented, Value } from '../ui/ui'
import './pages.css'

// gleiche Schlüssel wie die alte Vacuula-App, damit die Wahl erhalten bleibt
const MODE_KEY = 'vacuula.gen3.cleaningMode'
const NAV_KEY = 'vacuula.gen3.navigationMode'

export function cleaningPrefs(): { mode: CleaningMode; navigation: NavigationMode } {
    return {
        mode: Number(localStorage.getItem(MODE_KEY)) === CleaningMode.TURBO ? CleaningMode.TURBO : CleaningMode.ECO,
        navigation: ([NavigationMode.EXTRA_CARE, NavigationMode.DEEP] as number[]).includes(Number(localStorage.getItem(NAV_KEY)))
            ? Number(localStorage.getItem(NAV_KEY)) as NavigationMode : NavigationMode.NORMAL,
    }
}

export function Settings() {
    const { t, lang, setLang, locale } = useI18n()
    const theme = useTheme()
    const s = useStore()
    const [prefs, setPrefs] = useState(cleaningPrefs)
    const [info, setInfo] = useState<GeneralInfo>()

    useEffect(() => {
        if (!s.serial || !s.connected) return
        gen3.getGeneralInfo(s.serial).then((r) => setInfo(r.data)).catch(() => undefined)
    }, [s.serial, s.connected])

    const savePrefs = (p: typeof prefs) => {
        localStorage.setItem(MODE_KEY, String(p.mode))
        localStorage.setItem(NAV_KEY, String(p.navigation))
        setPrefs(p)
    }

    const tel = s.telemetry
    const fresh = isFresh(tel?.ts, s.now, TELEMETRY_STALE_S)
    const m = tel?.motors
    const none = t.common.none
    const num = (v: number | undefined, unit: string) => (v === undefined ? none : <Value value={fmtNumber(locale, v)} unit={unit} />)

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

            <Card icon={<Sparkles />} title={t.settings.cleaning}>
                <div className="field"><Label className="field-l">{t.settings.power}</Label>
                    <Segmented<string> label={t.settings.power} value={String(prefs.mode)} onChange={(v) => savePrefs({ ...prefs, mode: Number(v) })} options={[
                        { value: String(CleaningMode.ECO), label: t.overview.eco }, { value: String(CleaningMode.TURBO), label: t.overview.turbo }]} />
                </div>
                <div className="field"><Label className="field-l">{t.settings.navigation}</Label>
                    <Segmented<string> label={t.settings.navigation} value={String(prefs.navigation)} onChange={(v) => savePrefs({ ...prefs, navigation: Number(v) })} options={[
                        { value: String(NavigationMode.NORMAL), label: t.overview.normalNav },
                        { value: String(NavigationMode.EXTRA_CARE), label: t.overview.extraCare },
                        { value: String(NavigationMode.DEEP), label: t.overview.deep }]} />
                </div>
            </Card>

            <Card icon={<Bot />} title={t.settings.robot}>
                <KV rows={[
                    [t.settings.name, <Label key="n">{s.name}</Label>],
                    [t.settings.model, info?.model ?? s.robot?.meta?.modelName ?? none],
                    [t.settings.serial, <span key="s" className="mono wrap">{s.serial ?? none}</span>],
                    [t.settings.firmware, <span key="f" className="mono">{info?.firmware ?? s.robot?.meta?.firmware ?? none}</span>],
                ]} />
            </Card>

            <Card icon={<Cpu />} title={t.settings.diagnostics}
                aside={tel && <span className="meta">{fresh ? fmtTime(locale, s.server?.timezone, tel.ts, true) : t.settings.espStale}</span>}>
                <KV rows={[
                    [t.settings.espState, <span key="e" className="mono wrap">{tel?.state?.robotState ?? none}</span>],
                    [t.settings.brush, num(m?.brushRPM, 'rpm')],
                    [t.settings.vacuum, num(m?.vacuumRPM, 'rpm')],
                    [t.settings.sideBrush, num(m?.sideBrushMA, 'mA')],
                    [t.settings.wheelLoad, m ? <Value value={`${fmtNumber(locale, m.leftWheelLoad)} · ${fmtNumber(locale, m.rightWheelLoad)}`} unit="%" /> : none],
                ]} />
            </Card>

            <Card icon={<Server />} title={t.settings.server}>
                <KV rows={[
                    [t.settings.version, <span key="v" className="mono">{s.server?.version ?? none}</span>],
                    [t.settings.timezone, s.server?.timezone ?? none],
                ]} />
            </Card>
        </div>
    )
}
