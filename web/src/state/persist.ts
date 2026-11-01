/**
 * Letzte Antworten auf dem Gerät (IndexedDB): Karten, Zonen und Verlauf erscheinen sofort, frische Daten kommen
 * danach. Fehler (privater Modus, voller Speicher) sind egal, dann eben ohne.
 */
const DB = 'reksio'
const STORE = 'cache'

let db: Promise<IDBDatabase | undefined> | undefined

function open(): Promise<IDBDatabase | undefined> {
    db ??= new Promise((resolve) => {
        try {
            const req = indexedDB.open(DB, 1)
            req.onupgradeneeded = () => req.result.createObjectStore(STORE)
            req.onsuccess = () => resolve(req.result)
            req.onerror = () => resolve(undefined)
        } catch {
            resolve(undefined)
        }
    })
    return db
}

export async function stored<T>(key: string): Promise<T | undefined> {
    const d = await open()
    if (!d) return undefined
    return new Promise((resolve) => {
        try {
            const req = d.transaction(STORE).objectStore(STORE).get(key)
            req.onsuccess = () => resolve(req.result as T | undefined)
            req.onerror = () => resolve(undefined)
        } catch {
            resolve(undefined)
        }
    })
}

export async function store(key: string, value: unknown): Promise<void> {
    const d = await open()
    try {
        d?.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key)
    } catch {
        // z. B. Speicher voll
    }
}
