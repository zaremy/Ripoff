import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const BASE = 'http://localhost:4173'
const OUT = process.env.OUT_DIR

// A recognisably different PNG per capture so the grid is visually checkable.
function pngDataUrl(r, g, b, w = 300, h = 640) {
  return { r, g, b, w, h }
}

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
)
const context = await browser.newContext({
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 2,
  acceptDownloads: true,
  permissions: ['clipboard-read', 'clipboard-write'],
})
const page = await context.newPage()
page.on('pageerror', (e) => { console.error('PAGE ERROR:', e.message); process.exitCode = 1 })
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE ERROR:', m.text()) })

await page.goto(BASE, { waitUntil: 'networkidle' })

// Build a real PNG in-page and hand it to the hidden file input, which is the
// same path an iOS share hands its bytes to.
async function addScreenshot(spec) {
  const input = page.locator('input[type=file]')
  const buffer = await page.evaluate(async ({ r, g, b, w, h }) => {
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = `rgb(${r},${g},${b})`
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillRect(20, 60, w - 40, 120)
    ctx.fillRect(20, 220, w - 40, 300)
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
    const bytes = new Uint8Array(await blob.arrayBuffer())
    return Array.from(bytes)
  }, spec)
  await input.setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: Buffer.from(buffer) })
}

// The two tag fields, by position: FROM first, FOR second.
const fromField = () => page.locator('.picker').first().locator('.picker-input')
const forField = () => page.locator('.picker').nth(1).locator('.picker-input')

function assert(cond, msg) {
  if (!cond) { console.error('FAIL:', msg); process.exitCode = 1 } else { console.log('  ok -', msg) }
}

console.log('\n1. First capture, tagging from scratch')
await addScreenshot(pngDataUrl(90, 60, 180))
await page.waitForSelector('.sheet')
await fromField().fill('Pixel Wild')
await fromField().press('Enter')
await forField().fill('Four Crowns / Avatars')
await forField().press('Enter')
await page.getByRole('button', { name: 'Save', exact: true }).click()
await page.waitForSelector('.card')
assert(await page.locator('.card').count() === 1, 'first capture is on the wall')

console.log('\n2. Second capture defaults to the same context (one tap to Save)')
await addScreenshot(pngDataUrl(30, 140, 120))
await page.waitForSelector('.sheet')
const stickySource = await page.locator('.picker').first().locator('.tag.selected').innerText()
const stickyFor = await page.locator('.picker').nth(1).locator('.tag.selected').innerText()
assert(stickySource.includes('Pixel Wild'), 'FROM prefilled with Pixel Wild')
assert(stickyFor.includes('Four Crowns / Avatars'), 'FOR prefilled with Four Crowns / Avatars')
if (OUT) await page.screenshot({ path: `${OUT}/2-capture-sheet.png` })
await page.getByRole('button', { name: 'Save', exact: true }).click()
await page.waitForFunction(() => document.querySelectorAll('.card').length === 2)
assert(true, 'saved with a single tap')

console.log('\n3. Eight more from the same product, one tap each')
for (let i = 0; i < 8; i++) {
  await addScreenshot(pngDataUrl(40 + i * 20, 90, 200 - i * 15, 300, 500 + (i % 3) * 220))
  await page.waitForSelector('.sheet')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForFunction((n) => document.querySelectorAll('.card').length === n, 3 + i)
}
assert(await page.locator('.card').count() === 10, 'ten Pixel Wild references saved')

console.log('\n4. Avatar references from two other products')
for (const [source, tag, colour] of [
  ['Disco Elysium', 'Four Crowns / Avatars', [190, 60, 70]],
  ['mymind', 'Teardown App / Capture Flow', [230, 190, 60]],
]) {
  await addScreenshot(pngDataUrl(...colour, 300, 600))
  await page.waitForSelector('.sheet')
  await page.locator('.picker').first().locator('.tag.selected button').click()
  await fromField().fill(source)
  await fromField().press('Enter')
  await page.locator('.picker').nth(1).locator('.tag.selected button').click()
  await forField().fill(tag)
  await forField().press('Enter')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.waitForSelector('.sheet', { state: 'detached' })
}
assert(await page.locator('.card').count() === 12, 'twelve references total')
if (OUT) await page.screenshot({ path: `${OUT}/1-home.png`, fullPage: false })

console.log('\n5. Search finds avatar references across products')
await page.getByPlaceholder('Search references').fill('avatars')
await page.waitForFunction(() => document.querySelectorAll('.card').length === 11)
const sources = await page.locator('.tag-source').allInnerTexts()
assert(sources.includes('Disco Elysium') && sources.includes('Pixel Wild'),
  'avatar references from more than one product appear together')
if (OUT) await page.screenshot({ path: `${OUT}/3-search.png` })
await page.getByPlaceholder('Search references').fill('')

console.log('\n6. Tag boards')
await page.locator('.tag-relevant').filter({ hasText: 'Four Crowns / Avatars' }).first().click()
await page.waitForSelector('.board-title')
const boardHeader = await page.locator('.board-title').innerText()
assert(/11 references from 2 products/.test(boardHeader), `Relevant To board header: ${JSON.stringify(boardHeader)}`)
if (OUT) await page.screenshot({ path: `${OUT}/4-board.png` })
await page.getByRole('button', { name: 'Everything' }).click()

await page.locator('.tag-source').filter({ hasText: 'Pixel Wild' }).first().click()
await page.waitForSelector('.board-title')
assert(/10 references/.test(await page.locator('.board-title').innerText()), 'Source board header')
await page.getByRole('button', { name: 'Everything' }).click()

console.log('\n7. Detail: open, retag, delete')
await page.locator('.card-image').first().click()
await page.waitForSelector('.detail')
if (OUT) await page.screenshot({ path: `${OUT}/5-detail.png` })
await page.getByRole('button', { name: 'Edit tags' }).click()
await forField().fill('Four Crowns / Map VFX')
await forField().press('Enter')
await page.getByRole('button', { name: 'Done' }).click()
await page.waitForSelector('.detail-meta')
assert((await page.locator('.detail-meta').innerText()).includes('Map VFX'), 'retag persisted')
await page.getByRole('button', { name: 'Delete' }).click()
await page.getByRole('button', { name: 'Delete', exact: true }).click()
await page.waitForFunction(() => document.querySelectorAll('.card').length === 11)
assert(true, 'delete removed the capture')

console.log('\n8. Everything survives a restart, and works with no network')
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.card')
const afterReload = await page.locator('.card').count()
assert(afterReload === 11, `library reloaded with ${afterReload} references`)
const imgSrc = await page.locator('.card-image img').first().getAttribute('src')
assert(imgSrc?.startsWith('blob:'), 'images render from local storage, not a URL')

// The page itself is served over HTTP here; in the packaged app it is a local
// file. What matters is that nothing the app *does* needs the network.
await context.setOffline(true)
await page.getByPlaceholder('Search references').fill('avatars')
await page.waitForFunction(() => document.querySelectorAll('.card').length === 11)
assert(true, 'search works offline')
await page.getByPlaceholder('Search references').fill('')
await addScreenshot(pngDataUrl(10, 60, 30))
await page.waitForSelector('.sheet')
await page.getByRole('button', { name: 'Save', exact: true }).click()
await page.waitForFunction(() => document.querySelectorAll('.card').length === 12)
assert(true, 'a capture saves offline')
// blob: and data: loads are local by definition; only real hosts count.
const requests = []
page.on('request', (r) => {
  if (/^https?:/.test(r.url())) requests.push(r.url())
})
await page.locator('.card-image').first().click()
await page.waitForSelector('.detail')
assert(requests.length === 0, `opening a capture hit the network ${requests.length} times`)
await page.getByRole('button', { name: 'Back' }).click()
await context.setOffline(false)

console.log('\n9. A web reference carries its page, for Claude Code and Figma')
const PAGE_HTML = `<!doctype html><html><head><title>Discover</title><style>
body{margin:0;font-family:Helvetica,Arial,sans-serif;background:#101014}
.card{width:320px;padding:24px;background:rgb(28,27,22);color:rgb(242,240,234)}
.title{font-size:22px;font-weight:700;margin:0 0 8px}
.tag{display:inline-block;background:rgb(231,238,251);color:rgb(38,64,110);padding:4px 10px}
</style></head><body><div class="card"><h1 class="title">Pixel Wild</h1><span class="tag">Avatar treatment</span></div></body></html>`

{
  const buffer = await page.evaluate(async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 320; canvas.height = 600
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, 320, 600)
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  await page.locator('input[type=file]').setInputFiles([
    { name: 'shot.png', mimeType: 'image/png', buffer: Buffer.from(buffer) },
    { name: 'discover.html', mimeType: 'text/html', buffer: Buffer.from(PAGE_HTML) },
  ])
}
await page.waitForSelector('.sheet')
assert((await page.locator('.sheet-note').innerText()).includes('discover.html'),
  'the capture sheet reports the page came along')
await page.getByRole('button', { name: 'Save', exact: true }).click()
await page.waitForSelector('.sheet', { state: 'detached' })

await page.locator('.card-image').first().click()
await page.waitForSelector('.detail')
assert(await page.locator('.handoff').count() === 1, 'the web reference offers a handoff')
if (OUT) {
  await page.locator('.handoff').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${OUT}/6-handoff.png` })
}

await page.getByRole('button', { name: 'Copy for Claude Code' }).click()
await page.waitForFunction(() => document.querySelector('.handoff-status')?.textContent?.includes('copied'))
const clip = await page.evaluate(() => navigator.clipboard.readText())
assert(clip.includes('**From:**') && clip.includes('**For:**'), 'handoff leads with FROM and FOR')
assert(clip.includes('<h1 class="title">Pixel Wild</h1>'), 'handoff carries the real markup')

const download = page.waitForEvent('download')
await page.getByRole('button', { name: 'Figma layers' }).click()
const file = await download
const figmaPath = `${OUT ?? "/tmp"}/${file.suggestedFilename()}`
await file.saveAs(figmaPath)
const layers = JSON.parse(readFileSync(figmaPath, 'utf8'))
assert(file.suggestedFilename().endsWith('-figma-layers.json'), `named ${file.suggestedFilename()}`)
assert(layers.type === 'FRAME', `root layer is a FRAME (got ${layers.type})`)
const text = []
;(function walk(n) { if (n?.type === 'TEXT') text.push(n.characters); (n?.children || []).forEach(walk) })(layers)
assert(text.includes('Pixel Wild'), `figma layers carry the page text (found ${JSON.stringify(text)})`)
const solid = []
;(function walk(n) { (n?.fills || []).forEach((f) => f.color && solid.push(f.color)); (n?.children || []).forEach(walk) })(layers)
assert(solid.some((c) => Math.round(c.r * 255) === 231 && Math.round(c.g * 255) === 238),
  'figma layers carry the page colours')
await page.getByRole('button', { name: 'Back' }).click()

console.log('\n10. Sticky context survived the restart too')
await addScreenshot(pngDataUrl(120, 120, 120))
await page.waitForSelector('.sheet')
const afterRestartSource = await page.locator('.picker').first().locator('.tag.selected').innerText()
assert(afterRestartSource.includes('mymind'), `FROM still defaults to the last product used (${afterRestartSource.trim()})`)
await page.getByRole('button', { name: 'Discard' }).click()

await browser.close()
console.log(process.exitCode ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED')
