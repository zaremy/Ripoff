/**
 * Renders the app mark to the PNG sizes a home-screen install needs.
 * Run with `npm run build:icons` after changing the mark below.
 */
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

// Two overlapping frames: a capture, and the one behind it. Drawn rather than
// stored so the mark stays editable in one place.
const MARK = (size) => `
<html><body style="margin:0">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#17171c"/>
  <rect x="118" y="96" width="196" height="268" rx="26" fill="#494ec2" opacity="0.55"/>
  <rect x="198" y="148" width="196" height="268" rx="26" fill="#a3a7f5"/>
</svg>
</body></html>`

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
)

for (const [name, size] of [['icon-192', 192], ['icon-512', 512], ['apple-touch-icon', 180]]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(MARK(size))
  const buffer = await page.locator('svg').screenshot({ omitBackground: true })
  writeFileSync(`public/${name}.png`, buffer)
  await page.close()
  console.log(`public/${name}.png (${size}px)`)
}

await browser.close()
