/**
 * Seeds a library of believable teardown material and shoots every screen in
 * both themes, so a design change can be reviewed as pictures rather than as a
 * diff. Needs `npm run preview` already running.
 *
 *   OUT=./shots LABEL=before npm run shots
 */
import { chromium } from 'playwright'

const OUT = process.env.OUT
const LABEL = process.env.LABEL ?? 'before'
const BASE = 'http://localhost:4173'

// Believable teardown material: mock product screens, not colour swatches.
const SEED = [
  ['Pixel Wild', ['Four Crowns / Avatars'], 'gallery', ['#2b1d3d', '#7d5bab'], 'Discover'],
  ['Pixel Wild', ['Four Crowns / Avatars', 'AI Native UI'], 'paywall', ['#1a1526', '#c084fc'], 'Upgrade to see all cards'],
  ['Pixel Wild', ['Four Crowns / Generative Art'], 'feed', ['#241a33', '#a78bfa'], 'Today'],
  ['Disco Elysium', ['Four Crowns / Dialogue'], 'dialogue', ['#2a1113', '#e0564f'], 'Inland Empire'],
  ['Disco Elysium', ['Four Crowns / Dialogue'], 'stats', ['#1d0e10', '#f0917a'], 'Skills'],
  ['Arc Browser', ['Teardown App / Navigation'], 'nav', ['#101828', '#6aa8ff'], 'Spaces'],
  ['Arc Browser', ['Teardown App / Navigation', 'AI Native UI'], 'command', ['#0d1420', '#8fd3ff'], 'Ask on page'],
  ['Huckleberry', ['Baby Tracker / Logging'], 'log', ['#0f2019', '#5ec49a'], 'Last feed 2h ago'],
  ['Huckleberry', ['Baby Tracker / Logging'], 'empty', ['#12241d', '#7fd9b4'], 'Nothing logged yet'],
  ['Civ V', ['Four Crowns / Map VFX'], 'map', ['#14200f', '#93c46a'], 'Turn 84'],
  ['mymind', ['Teardown App / Capture Flow'], 'capture', ['#221a0f', '#e8b04b'], 'Good find!'],
  ['mymind', ['Teardown App / Capture Flow', 'Four Crowns / Avatars'], 'grid', ['#1c1710', '#f0c674'], 'Everything'],
  ['Linear', ['Teardown App / Navigation'], 'list', ['#16161d', '#9ca0ff'], 'In Progress'],
  ['Duolingo', ['Four Crowns / Avatars'], 'streak', ['#0f1c0d', '#8ee063'], '14 day streak'],
]

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH })

async function shoot(scheme) {
  const context = await browser.newContext({
    viewport: { width: 402, height: 874 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(BASE, { waitUntil: 'networkidle' })

  for (const [source, tags, kind, colours, caption] of SEED) {
    const buffer = await page.evaluate(async ([kind, colours, caption]) => {
      const [bg, accent] = colours
      const w = 320
      const h = kind === 'map' || kind === 'grid' ? 300 : kind === 'dialogue' ? 720 : 640
      const c = document.createElement('canvas')
      c.width = w; c.height = h
      const x = c.getContext('2d')
      x.fillStyle = bg; x.fillRect(0, 0, w, h)

      // status bar
      x.fillStyle = 'rgba(255,255,255,0.55)'
      x.font = '600 11px Helvetica, Arial'; x.fillText('9:41', 14, 22)
      x.fillRect(w - 40, 14, 22, 9)

      const soft = (a) => `rgba(255,255,255,${a})`
      if (kind === 'gallery' || kind === 'grid' || kind === 'feed') {
        for (let i = 0; i < 6; i++) {
          const cw = (w - 42) / 2, ch = 110
          const cx = 14 + (i % 2) * (cw + 14), cy = 56 + Math.floor(i / 2) * (ch + 14)
          const g = x.createLinearGradient(cx, cy, cx + cw, cy + ch)
          g.addColorStop(0, accent); g.addColorStop(1, bg)
          x.fillStyle = g; x.fillRect(cx, cy, cw, ch)
        }
      } else if (kind === 'dialogue') {
        x.fillStyle = soft(0.08); x.fillRect(14, 56, w - 28, 200)
        x.fillStyle = accent; x.font = '600 15px Helvetica, Arial'
        x.fillText(caption, 26, 84)
        x.fillStyle = soft(0.5); x.font = '13px Helvetica, Arial'
        for (let i = 0; i < 7; i++) x.fillRect(26, 100 + i * 18, w - 60 - (i % 3) * 30, 6)
        for (let i = 0; i < 3; i++) {
          x.strokeStyle = accent; x.lineWidth = 1
          x.strokeRect(14, 280 + i * 52, w - 28, 40)
          x.fillStyle = soft(0.6); x.fillRect(28, 296 + i * 52, 150 - i * 20, 7)
        }
      } else if (kind === 'paywall') {
        const g = x.createLinearGradient(0, 56, 0, 300)
        g.addColorStop(0, accent); g.addColorStop(1, bg)
        x.fillStyle = g; x.fillRect(0, 56, w, 250)
        x.fillStyle = '#fff'; x.font = '700 20px Helvetica, Arial'
        x.fillText(caption, 22, 350)
        x.fillStyle = accent; x.fillRect(22, 380, w - 44, 44)
      } else if (kind === 'map') {
        for (let i = 0; i < 90; i++) {
          x.fillStyle = i % 5 ? soft(0.05 + (i % 7) * 0.02) : accent
          const s = 26
          x.fillRect((i % 12) * s + 6, Math.floor(i / 12) * s + 56, s - 3, s - 3)
        }
      } else {
        x.fillStyle = '#fff'; x.font = '700 18px Helvetica, Arial'
        x.fillText(caption, 18, 84)
        for (let i = 0; i < 5; i++) {
          x.fillStyle = soft(0.07); x.fillRect(14, 106 + i * 62, w - 28, 50)
          x.fillStyle = accent; x.beginPath(); x.arc(38, 131 + i * 62, 12, 0, 7); x.fill()
          x.fillStyle = soft(0.45); x.fillRect(60, 124 + i * 62, 140 - i * 12, 6)
          x.fillStyle = soft(0.2); x.fillRect(60, 138 + i * 62, 90, 5)
        }
      }
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    }, [kind, colours, caption])

    await page.locator('input[type=file]').setInputFiles({
      name: `${kind}.png`, mimeType: 'image/png', buffer: Buffer.from(buffer),
    })
    await page.waitForSelector('.sheet')
    const from = page.locator('.picker').first()
    if (await from.locator('.tag.selected').count()) await from.locator('.tag.selected button').click()
    await from.locator('.picker-input').fill(source)
    await from.locator('.picker-input').press('Enter')
    const forField = page.locator('.picker').nth(1)
    while (await forField.locator('.tag.selected').count()) {
      await forField.locator('.tag.selected button').first().click()
    }
    for (const tag of tags) {
      await forField.locator('.picker-input').fill(tag)
      await forField.locator('.picker-input').press('Enter')
    }
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForSelector('.sheet', { state: 'detached' })
  }

  const shot = (name) => page.screenshot({ path: `${OUT}/${LABEL}-${scheme}-${name}.png` })

  await page.waitForTimeout(500)
  await shot('1-home')

  await page.getByPlaceholder('Search references').fill('avatars')
  await page.waitForTimeout(300)
  await shot('2-search')
  await page.getByPlaceholder('Search references').fill('')

  await page.locator('.tag-relevant, .card-relevant button').first().click()
  await page.waitForSelector('.board-title')
  await shot('3-board')
  await page.getByRole('button', { name: 'Everything' }).click()

  await page.locator('.card-image').first().click()
  await page.waitForSelector('.detail')
  await shot('4-detail')
  await page.getByRole('button', { name: 'Edit tags' }).click()
  await page.waitForTimeout(200)
  await shot('5-edit')
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Back' }).click()

  // The capture sheet, mid-teardown, with defaults already filled in.
  const buffer = await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 320; c.height = 640
    const x = c.getContext('2d'); x.fillStyle = '#2b1d3d'; x.fillRect(0, 0, 320, 640)
    const g = x.createLinearGradient(0, 0, 320, 640)
    g.addColorStop(0, '#7d5bab'); g.addColorStop(1, '#2b1d3d')
    x.fillStyle = g; x.fillRect(20, 60, 280, 380)
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  await page.locator('input[type=file]').setInputFiles({
    name: 'next.png', mimeType: 'image/png', buffer: Buffer.from(buffer),
  })
  await page.waitForSelector('.sheet')
  await shot('6-capture')

  console.log(`${scheme}: ${errors.length ? 'ERRORS ' + errors.join('; ') : 'no page errors'}`)
  await context.close()
}

await shoot('light')
await shoot('dark')
await browser.close()
console.log('done')
