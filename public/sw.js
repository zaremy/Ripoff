/*
 * Offline for the browser build only.
 *
 * The packaged iOS app already loads from local files and never registers
 * this; it exists so the web build survives a dead connection the same way,
 * which is the whole promise of the product.
 *
 * Assets are content-hashed by the build, so they can be cached forever and
 * served cache-first. The page itself is fetched network-first, so a new
 * deploy is picked up on the next online load rather than being pinned to
 * whatever was cached first.
 */

/*
 * Both injected by scripts/build-sw.mjs, which knows the hashed filenames the
 * build produced. They have to be precached at install: by the time a worker
 * takes control of its first page, that page has already fetched everything it
 * needs over the network, so nothing passed through the handler below and the
 * cache would still be empty on a cold offline start.
 */
const PRECACHE = self.__INSPO_PRECACHE__ ?? ['/']
const CACHE = `inspo-${self.__INSPO_VERSION__ ?? 'dev'}`

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      const results = await Promise.allSettled(
        PRECACHE.map((path) => cache.add(new Request(path, { cache: 'reload' }))),
      )

      // A half-filled cache is worse than no new worker at all: activate below
      // deletes every older cache, so accepting a partial install would throw
      // away a complete offline shell and replace it with a broken one. Failing
      // the install leaves the previous worker, and its full cache, in charge.
      const missing = results.filter((result) => result.status === 'rejected').length
      if (missing > 0) {
        throw new Error(`precache incomplete: ${missing} of ${PRECACHE.length} failed`)
      }

      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
    return
  }

  event.respondWith(cacheFirst(request))
})

/*
 * Vary must be ignored on lookup.
 *
 * Static hosts answer these assets with `Vary: Origin`, and Vite tags its own
 * bundles `crossorigin`, so the page asks for them with an Origin header while
 * the Request this worker precached with has none. Honouring Vary makes every
 * one of those a miss, and the app fails to boot offline with a full cache -
 * which looks exactly like a caching bug that is not there. Everything stored
 * here is a same-origin asset keyed by a content-hashed URL, so the URL alone
 * identifies it.
 */
const LOOKUP = { ignoreVary: true }

async function networkFirst(request) {
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    // Offline: the last good copy of the page, or the app shell.
    return (
      (await cache.match(request, LOOKUP)) ??
      (await cache.match('/index.html', LOOKUP)) ??
      Response.error()
    )
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(request, LOOKUP)
  if (hit) return hit
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch {
    return Response.error()
  }
}
