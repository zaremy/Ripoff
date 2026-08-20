/*
 * Proves the browser build survives having nothing to talk to.
 *
 * The server is killed rather than emulated away, because emulated offline
 * hides the failure this exists to catch: a cache that looks full but whose
 * entries never match the requests the page actually makes.
 *
 * Builds and serves itself - no preview server needed. `npm run test:offline`.
 */
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'

const PORT = 4271
const BASE = `http://localhost:${PORT}`
let bad = false
const ok = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'} - ${m}`); if (!c) bad = true }

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT)], {
  cwd: process.cwd(), stdio: 'ignore', detached: true,
})
const waitFor = async (want) => {
  for (let i = 0; i < 30; i++) {
    try {
      await fetch(BASE)
      if (want) return true
    } catch {
      if (!want) return true
    }
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}
if (!(await waitFor(true))) throw new Error('server never came up')

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH })
const page = await browser.newPage({ viewport: { width: 402, height: 874 } })
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 })

const buffer = await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 300; c.height = 520
  const x = c.getContext('2d'); x.fillStyle = '#3b2a5a'; x.fillRect(0, 0, 300, 520)
  const b = await new Promise((r) => c.toBlob(r, 'image/png'))
  return Array.from(new Uint8Array(await b.arrayBuffer()))
})
await page.locator('input[type=file]').setInputFiles({ name: 's.png', mimeType: 'image/png', buffer: Buffer.from(buffer) })
await page.waitForSelector('.sheet')
await page.locator('.picker').first().locator('.picker-input').fill('Pixel Wild')
await page.locator('.picker').first().locator('.picker-input').press('Enter')
await page.locator('.picker').nth(1).locator('.picker-input').fill('Four Crowns / Avatars')
await page.locator('.picker').nth(1).locator('.picker-input').press('Enter')
await page.getByRole('button', { name: 'Save', exact: true }).click()
await page.waitForSelector('.card')
await page.waitForTimeout(800)

console.log('\nkilling the server, then cold-starting the app:')
process.kill(-server.pid, 'SIGKILL')
if (!(await waitFor(false))) throw new Error('server would not die')
ok(true, 'server is down')

await page.reload({ waitUntil: 'domcontentloaded' })
try {
  await page.waitForSelector('.card', { timeout: 15000 })
  ok(true, 'the app booted with nothing serving it')
  ok(await page.locator('.card').count() === 1, 'the saved reference was still there')
  ok((await page.locator('.tag-source').first().innerText()).includes('Pixel Wild'), 'its tags survived')
  await page.getByPlaceholder('Search references').fill('avatars')
  await page.waitForTimeout(300)
  ok(await page.locator('.card').count() === 1, 'search still works')
} catch (e) {
  ok(false, `cold start failed: ${e.message.split('\n')[0]}`)
}

await browser.close()
console.log(bad ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED')
process.exitCode = bad ? 1 : 0
