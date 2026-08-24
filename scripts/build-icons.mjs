/**
 * Renders the canonical square icon artwork to the PNG sizes the app needs.
 * Keep the source square and opaque; iOS applies the rounded app icon mask.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright'

const SOURCE = 'assets/app-icon-source.png'
const sourceData = readFileSync(SOURCE).toString('base64')
const sourceUrl = `data:image/png;base64,${sourceData}`

const icons = [
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['public/apple-touch-icon.png', 180],
  ['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png', 1024],
]

const browser = await chromium.launch(
  process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
)

for (const [path, size] of icons) {
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { width: size, height: size },
  })
  await page.setContent(`
    <html>
      <body style="margin:0;background:#fff">
        <img
          alt=""
          src="${sourceUrl}"
          style="display:block;width:${size}px;height:${size}px;object-fit:cover"
        />
      </body>
    </html>
  `)
  const buffer = await page.locator('img').screenshot({ omitBackground: false })
  writeFileSync(path, buffer)
  await page.close()
  console.log(`${path} (${size}px)`)
}

await browser.close()
