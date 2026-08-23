/**
 * A very small promise wrapper over IndexedDB.
 *
 * Deliberately hand-rolled: the app needs three object stores and no queries
 * more exotic than "everything, newest first". A dependency would be more code
 * than this file.
 */

export const DB_NAME = 'inspo'
export const DB_VERSION = 1

export const STORE_CAPTURES = 'captures'
export const STORE_BLOBS = 'blobs'
export const STORE_PREFS = 'prefs'

let dbPromise: Promise<IDBDatabase> | null = null

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise

  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_CAPTURES)) {
        const captures = db.createObjectStore(STORE_CAPTURES, { keyPath: 'id' })
        // The home screen is always "newest first", so index the sort key.
        captures.createIndex('created_at', 'created_at')
      }
      if (!db.objectStoreNames.contains(STORE_BLOBS)) {
        db.createObjectStore(STORE_BLOBS)
      }
      if (!db.objectStoreNames.contains(STORE_PREFS)) {
        db.createObjectStore(STORE_PREFS)
      }
    }

    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB'))
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another tab'))
  })

  return dbPromise
}

/** Only for tests, which swap in a fresh fake-indexeddb between cases. */
export function resetDbForTests(): void {
  dbPromise = null
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb()
  const transaction = db.transaction(store, mode)
  const result = await run(transaction.objectStore(store))
  return new Promise<T>((resolve, reject) => {
    transaction.oncomplete = () => resolve(result)
    transaction.onerror = () => reject(transaction.error ?? new Error('Transaction failed'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'))
  })
}

export function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  return tx(store, 'readonly', (s) => request<T | undefined>(s.get(key)))
}

export function idbGetAll<T>(store: string): Promise<T[]> {
  return tx(store, 'readonly', (s) => request<T[]>(s.getAll()))
}

export function idbPut(store: string, value: unknown, key?: IDBValidKey): Promise<void> {
  return tx(store, 'readwrite', async (s) => {
    await request(key === undefined ? s.put(value) : s.put(value, key))
  })
}

export function idbDelete(store: string, key: IDBValidKey): Promise<void> {
  return tx(store, 'readwrite', async (s) => {
    await request(s.delete(key))
  })
}

export function idbClear(store: string): Promise<void> {
  return tx(store, 'readwrite', async (s) => {
    await request(s.clear())
  })
}
