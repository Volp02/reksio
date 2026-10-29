// A tiny "loader": a module-level cache + fetcher, decoupled from any single
// component or Context. Any component can call `.useValue(...)` to subscribe
// to the current data, and `.request(...)` to (re)trigger a fetch — from
// anywhere, without needing to be under a specific provider.

import { useCallback, useSyncExternalStore } from 'react'

export interface LoaderEntry<T> {
    data: T | undefined
    loading: boolean
    error: unknown
    updatedAt: number | undefined
}

const EMPTY_ENTRY: LoaderEntry<any> = {
    data: undefined,
    loading: false,
    error: undefined,
    updatedAt: undefined
}

export interface Loader<Args extends unknown[], T> {
    /** Hook — subscribes to the cached entry for these args. Re-renders wherever it's called when the entry changes. */
    useValue: (...args: Args) => LoaderEntry<T>
    /** (Re)trigger the fetch. Concurrent calls with the same args share one in-flight request. */
    request: (...args: Args) => Promise<T>
    /** Non-reactive read, for use outside render (click handlers, etc). */
    peek: (...args: Args) => T | undefined
    /** Overwrite the cached value locally without hitting the network — handy for optimistic updates. */
    setData: (data: T | ((prev: T | undefined) => T), ...args: Args) => void
    /** Drop a cached entry so the next request() starts clean. */
    invalidate: (...args: Args) => void
}

export function createLoader<Args extends unknown[], T>(
    fetcher: (...args: Args) => Promise<T>,
    options?: { key?: (...args: Args) => string }
): Loader<Args, T> {
    const keyFn = options?.key ?? ((...args: Args) => JSON.stringify(args))

    const entries = new Map<string, LoaderEntry<T>>()
    const listeners = new Map<string, Set<() => void>>()
    const inFlight = new Map<string, Promise<T>>()

    const getEntry = (key: string): LoaderEntry<T> => entries.get(key) ?? EMPTY_ENTRY
    const notify = (key: string) => listeners.get(key)?.forEach(l => l())

    const patchEntry = (key: string, patch: Partial<LoaderEntry<T>>) => {
        entries.set(key, { ...getEntry(key), ...patch })
        notify(key)
    }

    const request = (...args: Args): Promise<T> => {
        const key = keyFn(...args)
        const pending = inFlight.get(key)
        if (pending) return pending // dedupe concurrent calls for the same args

        patchEntry(key, { loading: true, error: undefined })

        const promise = fetcher(...args)
            .then(data => {
                patchEntry(key, { data, loading: false, error: undefined, updatedAt: Date.now() })
                return data
            })
            .catch(error => {
                patchEntry(key, { loading: false, error })
                throw error
            })
            .finally(() => {
                if (inFlight.get(key) === promise) inFlight.delete(key)
            })

        inFlight.set(key, promise)
        return promise
    }

    const subscribe = (key: string, listener: () => void) => {
        let set = listeners.get(key)
        if (!set) { set = new Set(); listeners.set(key, set) }
        set.add(listener)
        return () => set!.delete(listener)
    }

    const useValue = (...args: Args): LoaderEntry<T> => {
        const key = keyFn(...args)
        return useSyncExternalStore(
            useCallback(listener => subscribe(key, listener), [key]),
            () => getEntry(key),
            () => getEntry(key)
        )
    }

    const peek = (...args: Args) => getEntry(keyFn(...args)).data

    const setData = (data: T | ((prev: T | undefined) => T), ...args: Args) => {
        const key = keyFn(...args)
        const prev = getEntry(key).data
        const next = typeof data === 'function' ? (data as (prev: T | undefined) => T)(prev) : data
        patchEntry(key, { data: next, error: undefined, updatedAt: Date.now() })
    }

    const invalidate = (...args: Args) => {
        const key = keyFn(...args)
        entries.delete(key)
        notify(key)
    }

    return { useValue, request, peek, setData, invalidate }
}