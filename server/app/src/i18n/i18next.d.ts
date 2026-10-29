import 'i18next'
import type en from './locales/en.json'

// Typed translation keys: t('settings.name') autocompletes and a mistyped
// key is a compile error. English is the reference file.
declare module 'i18next' {
    interface CustomTypeOptions {
        defaultNS: 'translation'
        resources: {
            translation: typeof en
        }
    }
}
