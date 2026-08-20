/**
 * Injects the built asset list into the service worker.
 *
 * Vite content-hashes every asset, so the worker cannot know their names ahead
 * of time - and it has to know them at install, because a worker only starts
 * seeing fetches on the load *after* the one that registered it. Without this
 * the first offline start finds an empty cache.
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIST = 'dist'
const SW = join(DIST, 'sw.js')

if (!existsSync(SW)) {
  console.error('No dist/sw.js - run vite build first.')
  process.exit(1)
}

const assets = existsSync(join(DIST, 'assets'))
  ? readdirSync(join(DIST, 'assets')).map((name) => `/assets/${name}`)
  : []

const precache = ['/', '/index.html', '/manifest.webmanifest', ...assets]

// The asset names are already content-hashed, so their concatenation changes
// exactly when the build does - which is when the cache should be replaced.
const version = assets.join('|').replace(/[^a-zA-Z0-9]/g, '').slice(-16) || 'dev'

const header =
  `self.__INSPO_PRECACHE__ = ${JSON.stringify(precache)};\n` +
  `self.__INSPO_VERSION__ = ${JSON.stringify(version)};\n`

writeFileSync(SW, header + readFileSync(SW, 'utf8'))
console.log(`sw.js precaching ${precache.length} files (cache inspo-${version})`)
