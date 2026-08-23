# Nira Kova

The immersive home for [nirakova.com](https://nirakova.com): a full-screen, audio-reactive music experience built around Nira Kova's track, **Meet Me in the Deep**.

The interface responds to the music in real time. Bass drives impact waves and camera pressure, mids shape the particle field, highs reveal lightning and chromatic trails, and pointer, touch, or device tilt bends the visual field.

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Then open the local URL printed in the terminal. For the production build:

```bash
npm test
npm run preview
```

## Deploy with Cloudflare Pages

Connect this GitHub repository in **Cloudflare Dashboard → Workers & Pages → Create → Pages → Import an existing Git repository** and use:

- Production branch: `main`
- Framework preset: `React (Vite)`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: leave blank

Cloudflare will publish each push to `main` and create preview deployments for pull requests. Add `nirakova.com` under the Pages project's **Custom domains** section.

The included `wrangler.jsonc` also supports deploying the same static build directly as a Cloudflare Worker:

```bash
npx wrangler login
npm run deploy:workers
```

## Project structure

- `app/Experience.tsx` — audio playback, analyser, canvas field, and interaction
- `app/experience.css` — art direction, responsive layout, and motion
- `public/` — artist photography, demo audio, social card, and response headers
- `src/main.tsx` — browser entry point

## Content

Artist imagery, audio, name, and related creative assets are the property of their respective rights holders. This repository intentionally includes no open-source license; its contents are not granted for reuse or redistribution.
