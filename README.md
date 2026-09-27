# Mistake Notebook — v1

A lightweight, offline-first mistake notebook web app optimized for a Samsung Galaxy Tab A9+.

## Included

- Tablet-first landscape UI
- Black/smoky-black background only
- Light/white text
- Physics / Chemistry / Mathematics
- ALLEN-derived JEE Main + Advanced chapter taxonomy
- Wrong Questions + Unattempted Questions per chapter
- Add / edit / archive / permanently delete
- Multiple images per mistake
- Image reorder + cover image
- Search + filters
- Tags + mistake reasons
- Correct-thinking and lesson fields
- Difficulty and time tracking
- Revision schedule + revision history
- Re-attempt mode
- Related mistakes
- Pinning
- Bulk operations: select, archive, delete, and tag
- Statistics dashboard
- Timeline
- Local IndexedDB storage
- JSON backup
- ZIP backup
- Print/PDF report
- Import
- Keyboard shortcuts
- PWA/offline cache
- Optional Google Cloud Storage sync using the included Node server

## Run locally

### Easiest: any computer with Python

From this folder:

```bash
python -m http.server 8080 --directory public
```

Open:

`http://localhost:8080`

The notebook itself works locally and offline after the app has loaded.

### With the included Node server

Install Node.js, then:

```bash
npm install
npm start
```

Open:

`http://localhost:8080`

This server also exposes the cloud-sync API.

### Samsung tablet

For a fully offline local server on Android, a simple route is Termux + Python/Node. The browser can then open the local address shown by the server.

A static browser/PWA version does not require the Google Cloud server for normal notebook operations.

## Google Cloud Storage sync

The cloud feature is deliberately implemented on the server side so that service-account credentials never go into browser JavaScript.

1. Create a Google Cloud Storage bucket.
2. Create a service account with access to that bucket.
3. Set the credential environment variable:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

4. Set the bucket:

```bash
GCS_BUCKET=your-bucket-name
```

Optional:

```bash
GCS_PREFIX=mistake-notebook
PORT=8080
```

Then:

```bash
npm install
npm start
```

The app can upload:

- notebook metadata to `mistake-notebook/notebook.json`
- images to `mistake-notebook/images/<image-id>.bin`

The local database remains the offline working copy.

## Important cloud note

Do not put a Google Cloud service-account JSON key into the `public/` folder or frontend code.

## Keyboard shortcuts

- Ctrl + N — New mistake
- Ctrl + K — Global search
- Ctrl + F — Focus search
- Ctrl + S — Save current editor
- Ctrl + Z — Undo
- Ctrl + Shift + Z — Redo
- Esc — Close modal

## ALLEN syllabus source

The chapter taxonomy is derived from official ALLEN DLP JEE Main + Advanced syllabus/material pages:

https://dlp.allen.ac.in/common/download.asp

The current ALLEN DLP page lists the 2026–27 session and provides JEE Main + Advanced syllabus/material links. Detailed topic documents surfaced from the official page are used as the basis for the included taxonomy.

Because syllabus documents can change, the chapter data is isolated in:

`public/data/allen-jee-syllabus.json`

Edit that file to update the taxonomy without modifying the UI.

## Explicitly excluded

This build does NOT include:

- app lock / PIN / password / biometric lock
- light mode
- system theme
- alternate themes
- image annotation history
- duplicate detection
- pre-test revision mode
- exam danger list
- chapter mastery score
- social features
- leaderboards
- unnecessary AI chatbot/gamification

## Notes

This is intentionally a lightweight personal tool. The frontend has no external CDN dependency so normal UI/data operation remains offline-friendly.

Cloud synchronization requires a configured backend and internet connection. If the cloud is unavailable, local notebook data continues to work.


## Android / tablet notes

On a Samsung tablet, the simplest offline route is a local HTTP server. In Termux:

```bash
pkg install python
cd /path/to/mistake_notebook_v1
python -m http.server 8080 --directory public
```

Then open `http://127.0.0.1:8080` in the tablet browser.

For Google Cloud sync, use the Node server instead and configure the GCS variables described in `GOOGLE_CLOUD_SETUP.md`.
