# Inspo

A local-first visual reference library for product teardowns.

Every screenshot carries two pieces of human context:

- **FROM** the product it came from
- **FOR** the idea it might help

That relationship is the product. The screenshot is evidence; the tags make the
evidence retrievable. There is no account, no sync, no AI, and nothing here
needs the network.

```
FROM: Pixel Wild
FOR:  Four Crowns / Avatars
```

## Running it

```sh
npm install
npm run dev          # http://localhost:5173
```

In a browser you add references with the **+** button, or by dragging or
pasting an image. On iOS the same intake is fed by the share sheet.

```sh
npm test                  # unit tests: storage, tags, search, tag memory
npm run test:acceptance   # drives a real browser through the PRD scenario
npm run test:offline      # kills the server, checks the app still starts
npm run shots             # screenshots every screen in both themes
npm run build
```

`test:acceptance` and `shots` need a preview server already running
(`npm run preview`); `test:offline` builds and serves itself. All three need a
Chromium - set `CHROME_PATH` if Playwright's own download is not present.

## In a browser

The browser build is a real target, not a preview of the iOS one. It installs
to a home screen and starts with no connection: the service worker precaches
the built assets, and captures were already in IndexedDB.

One trap worth recording, because it costs an afternoon to find. Static hosts
answer assets with `Vary: Origin`, and Vite tags its own bundles `crossorigin`,
so the page requests them with an `Origin` header that the precached `Request`
does not carry. `Cache.match` honours `Vary` by default, so every asset misses
and the app fails to boot with a completely full cache. The worker looks these
up with `ignoreVary`, which is safe here because every entry is a same-origin
asset keyed by a content-hashed URL.

What the browser build does not have is the iOS share sheet, so references go
in through **+**, drag, or paste, and a DOM snapshot has to arrive as an
`.html` file alongside its image. Its library is also its own - there is no
sync, so a phone and a laptop hold separate collections.

## iOS

```sh
npm run ios          # build + cap sync + open Xcode
```

The Xcode project is committed, and so are the App Group and both Share
Extension targets. What is left on a Mac is signing, which needs an Apple
developer team; [`ios/SETUP.md`](ios/SETUP.md) walks through it. Until that is
done the app still builds and runs on the simulator.

## How it is put together

```
React + TypeScript  ->  Capacitor  ->  iOS
```

Deliberately the same shape as Pre-Purchase Pal, so this is not another
native-stack experiment.

| Concern | Where it lives |
| --- | --- |
| Capture metadata | IndexedDB (`src/lib/db.ts`) |
| Image bytes, iOS | app Data directory via Capacitor Filesystem |
| Image bytes, web | IndexedDB, as buffers rather than Blobs |
| Share sheet intake | App Group queue, drained by `ShareIntakePlugin` |

Image binaries never go into localStorage. Every capture gets a UUID and a
`created_at` on day one, so adding sync later means wrapping this store rather
than replacing it:

```ts
capture.id
capture.created_at
capture.local_image_uri
capture.source
capture.relevant_to[]
```

Supabase and Vercel are not in this path, and nothing at startup waits on a
network call.

### Capture speed

The behaviour that matters most is repeat capture. The sheet opens with
whatever context was used last, so the tenth screenshot of a teardown session
costs one tap on **Save**. Recently used tags sort to the front of both
pickers.

### Boards are just tags

There is no board management. Tapping a tag opens it:

- **Pixel Wild** — "what did I find interesting about Pixel Wild?"
- **Four Crowns / Avatars** — "what have I collected from anywhere that could
  help Four Crowns avatars?", headed `12 references from 6 products`

The second one is the useful inversion, and it is why search covers Source and
Relevant To together.

## Web references keep their page

When the reference is a web page rather than a native app, the markup behind it
is worth keeping: it is what makes a capture answer "how did they build this?"
as well as "what did it look like?".

A snapshot is the page's own markup plus its own stylesheets, not a pile of
inlined computed styles. That keeps it readable enough to hand to Claude Code,
and it still re-renders through a real layout engine, which is what the Figma
export needs to get geometry right. Two buttons appear on such a capture:

- **Copy for Claude Code** — the FROM and FOR tags, the URL, and the markup, as
  one pasteable block. The tags lead, because they are the part a model cannot
  infer from the HTML.
- **Figma layers** — the snapshot re-rendered offscreen and converted with
  [html-figma](https://github.com/sergcen/html-to-figma), saved as JSON for that
  project's Figma plugin. Downloads on the desktop, copies to the clipboard on a
  phone.

The exporter is loaded on demand, so it costs nothing until you use it.

### Where a snapshot comes from

iOS never hands over pixels and DOM in one gesture, so the app ships two share
buttons rather than one that guesses which you meant:

| Surface | Share sheet button | What arrives |
| --- | --- | --- |
| iOS: any image, any app | **Inspo** | image, no DOM |
| iOS: a page in Safari | **Inspo Page** | DOM via `share-preprocess.js`, no image |
| Desktop: drop or pick an image with an `.html` file | — | both |

Both buttons feed the same queue and the same capture sheet. A page-only share
still becomes a normal capture — the app renders the markup to an image so the
wall never shows a blank tile.

The serializer lives once, in `src/lib/domSnapshot.ts`; the script Safari runs
is generated from it by `npm run build:preprocess`.

**Native apps have no DOM.** Most of the products worth tearing down are apps,
not sites, so most captures will never carry markup. This is enrichment on top
of the screenshot, never a requirement for one.

## Not built, on purpose

Auth, accounts, cloud sync, OCR, vision tagging, embeddings, semantic search,
source inference, synthesis, notes, comments, sharing, collaborative boards, a
browser extension, a Mac app, subscriptions, onboarding, nested folders.

The first milestone is not "can this become a startup?" It is "can I delete
mymind from this workflow?"

## Tests

`npm test` covers the storage and retrieval logic — captures surviving a
restart, images and records deleting together, sticky tag defaults, and the
searches the PRD calls out (`pixel`, `avatars`, `four crowns`).

`npm run test:acceptance` walks a real browser through the acceptance scenario
end to end: ten one-tap captures from one product, avatar references from other
products, search finding them together, board headers, retag, delete, a
restart, and a capture saved with the network switched off. The last section
saves a web reference, checks the Claude Code handoff carries the real markup,
and converts it to Figma layers — asserting the layer tree comes back with the
page's text and colours in it.
