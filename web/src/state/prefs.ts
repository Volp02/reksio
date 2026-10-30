import { useSyncExternalStore } from 'react'
import { CleaningMode, NavigationMode } from '../api/types'

// Lokale Vorlieben (pro Browser). Reinigungs-Schlüssel wie in der alten Vacuula-App, damit die Wahl erhalten bleibt.
const KEYS = {
    mode: 'vacuula.gen3.cleaningMode',
    navigation: 'vacuula.gen3.navigationMode',
    diagnostics: 'reksio.overview.diagnostics',
    zones: 'reksio.overview.zones',
} as const

export interface Prefs {
    mode: CleaningMode
    navigation: NavigationMode
    /** Diagnose-Karte auf der Übersicht */
    diagnostics: boolean
    /** Zonen auf der Übersichtskarte (Standard: aus) */
    zones: boolean
}

function read(): Prefs {
    const nav = Number(localStorage.getItem(KEYS.navigation))
    return {
        mode: Number(localStorage.getItem(KEYS.mode)) === CleaningMode.TURBO ? CleaningMode.TURBO : CleaningMode.ECO,
        navigation: nav === NavigationMode.EXTRA_CARE || nav === NavigationMode.DEEP ? nav : NavigationMode.NORMAL,
        diagnostics: localStorage.getItem(KEYS.diagnostics) === '1',
        zones: localStorage.getItem(KEYS.zones) === '1',
    }
}

let current = read()
const listeners = new Set<() => void>()

export function setPrefs(patch: Partial<Prefs>) {
    current = { ...current, ...patch }
    localStorage.setItem(KEYS.mode, String(current.mode))
    localStorage.setItem(KEYS.navigation, String(current.navigation))
    localStorage.setItem(KEYS.diagnostics, current.diagnostics ? '1' : '0')
    localStorage.setItem(KEYS.zones, current.zones ? '1' : '0')
    listeners.forEach((l) => l())
}

export function getPrefs(): Prefs {
    return current
}

export function usePrefs(): Prefs {
    return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l) }, () => current)
}
