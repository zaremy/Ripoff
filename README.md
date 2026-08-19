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
npm test             # unit tests: storage, tags, search, tag memory
npm run test:acceptance   # drives a real browser through the PRD scenario
npm run build
```

`test:acceptance` needs a preview server already running (`npm run preview`)
and a Chromium; set `CHROME_PATH` if Playwright's own download is not present.

## iOS

```sh
npm run ios          # build + cap sync + open Xcode
```

The Xcode project is committed. Two steps still have to happen on a Mac — the
App Group and the Share Extension target — and both are written out in
[`ios/SETUP.md`](ios/SETUP.md). Until then the app works fine; you just add
screenshots with **+** instead of through the share sheet.

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
restart, and a capture saved with the network switched off.
