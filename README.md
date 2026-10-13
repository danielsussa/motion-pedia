# motion·pedia

**209 motion graphics in pure JavaScript** (Canvas 2D + a shared WebGL context), with a gallery, a live parameter
editor and a frame-by-frame renderer to MP4 or ProRes with alpha.

**Try it in the browser: https://dekah.tech/motion-pedia/**

- **210 motions** in 7 categories: typography, backgrounds & loops, shapes & geometry, particles & simulation,
  transitions & overlays, UI/data/broadcast and image & photo. Every one works in 16:9, 9:16, 1:1 and 4:5.
- **Compositions**: short films with scenes, a 2.5D camera and DOM/CSS UI, using the motions as layers.
- **Renderer** (`scripts/render.mjs`): headless Chrome + ffmpeg, motion blur by sub-sampling, alpha output. Every
  `render` is a pure function of time, so frames are exact no matter how slow the machine is.

```bash
npm install
npm run dev                                   # gallery at http://127.0.0.1:5179 (with the Render button)
npm run render -- --motion aurora --fps 30    # video in renders/
```

The renderer needs Google Chrome and ffmpeg installed. The online gallery is a static build: you can play with every
parameter and record a quick video in the browser; the frame-by-frame render runs locally.

How to write a motion, the contract rules and known pitfalls are in [CLAUDE.md](CLAUDE.md) (Portuguese), plans and
studies in [docs/](docs/).

Sample photos: Unsplash (see [public/samples/CREDITS.md](public/samples/CREDITS.md)).
