import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import de, { type Dict } from './de'
import en from './en'

export type Lang = 'de' | 'en'
const DICTS: Record<Lang, Dict> = { de, en: en as Dict }
const STORAGE_KEY = 'reksio.lang'

function initialLang(): Lang {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved === 'de' || saved === 'en') return saved
    return navigator.language.toLowerCase().startsWith('de') ? 'de' : 'en'
}

interface I18n {
    lang: Lang
    locale: string
    t: Dict
    setLang: (lang: Lang) => void
}

const Ctx = createContext<I18n | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
    const [lang, setLangState] = useState<Lang>(initialLang)
    const value = useMemo<I18n>(() => {
        document.documentElement.lang = lang
        return {
            lang,
            locale: lang === 'de' ? 'de-DE' : 'en-GB',
            t: DICTS[lang],
            setLang: (l) => { localStorage.setItem(STORAGE_KEY, l); setLangState(l) },
        }
    }, [lang])
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useI18n(): I18n {
    const v = useContext(Ctx)
    if (!v) throw new Error('useI18n outside I18nProvider')
    return v
}

/** '{time}'-Platzhalter ersetzen */
export function fill(text: string, values: Record<string, string | number>): string {
    return text.replace(/\{(\w+)\}/g, (_, k) => String(values[k] ?? ''))
}
