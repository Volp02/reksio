import { CleaningMode, NavigationMode } from '../api/types'
import { useI18n } from '../i18n'
import { setPrefs, usePrefs } from '../state/prefs'
import { Label, Segmented } from '../ui/ui'

/** Saugstufe und Fahrweise für den nächsten Start (Übersicht und Zonen) */
export function CleanModes() {
    const { t } = useI18n()
    const prefs = usePrefs()
    return (
        <div className="ov-modes">
            <div className="field"><Label className="field-l">{t.settings.power}</Label>
                <Segmented<string> label={t.settings.power} value={String(prefs.mode)} onChange={(v) => setPrefs({ mode: Number(v) })} options={[
                    { value: String(CleaningMode.ECO), label: t.overview.eco }, { value: String(CleaningMode.TURBO), label: t.overview.turbo }]} />
            </div>
            <div className="field"><Label className="field-l">{t.settings.navigation}</Label>
                <Segmented<string> label={t.settings.navigation} value={String(prefs.navigation)} onChange={(v) => setPrefs({ navigation: Number(v) })} options={[
                    { value: String(NavigationMode.NORMAL), label: t.overview.normalNav },
                    { value: String(NavigationMode.EXTRA_CARE), label: t.overview.extraCare },
                    { value: String(NavigationMode.DEEP), label: t.overview.deep }]} />
            </div>
        </div>
    )
}
