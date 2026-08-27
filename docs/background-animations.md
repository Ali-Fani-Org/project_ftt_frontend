# Animated Backgrounds

The app has six animated background variants, swapped from **Settings → Behavior →
Background style** (a dropdown). They live behind the app shell (`z-index: -2`) and
are theme-aware: every variant reads the active daisyUI theme's tokens
(`--p` primary, `--s` secondary, `--b1` base) and re-tints live when the theme
changes.

## Variants

| Style     | Component                     | Look                                              | Footprint |
|-----------|-------------------------------|---------------------------------------------------|-----------|
| `aurora`  | `AuroraDrift.svelte`          | Depth-layered particle field (750 drifting orbs)  | Light     |
| `wave`    | `WaveGrid.svelte`             | Flat animated wave grid                           | Light     |
| `bokeh`   | `BokehFloat.svelte`           | Floating bokeh orbs                               | Light     |
| `nebula`  | `Nebula.svelte`               | Deep-space fog layers + shooting stars            | Light     |
| `lattice` | `Lattice.svelte`              | Lattice/mesh animation                            | Light     |
| `ocean`   | `Ocean.svelte`                | Real-time spectral FFT ocean (WebGL2)             | **Heavy** |

The active style is a persisted store (`backgroundAnimationStyle`,
`src/lib/stores.ts`); `BackgroundAnimation.svelte` dispatches to the right
component. Ocean additionally takes the `oceanWaveCharacter` store (0 calm —
1 stormy).

## Theme bridging

`src/lib/backgrounds/themeColors.ts` resolves CSS custom properties to hex by
painting them onto a cached 1×1 canvas and reading the pixel back. A
`MutationObserver` (`createThemeObserver`) watches `data-theme` swaps on
`<html>` and re-resolves. Each variant keeps a hidden reference element that
carries `color: oklch(var(--p)); background-color: oklch(var(--b1));
--ref-secondary: oklch(var(--s))`.

## The Ocean engine

`Ocean.svelte` is a thin wrapper around **abyssal-ocean**
(https://github.com/squall01337/abyssal-ocean), vendored into
`static/abyssal/abyssal-ocean.html` with three.js (`three.module.js` +
`three.core.js`) — fully offline, no CDN, WebGL2 + `EXT_color_buffer_float`
required. It runs a JONSWAP/TMA spectrum, three GPU FFT cascades, physical
foam, a Preetham sky, and a textured moon.

### Host ⇄ engine bridge (postMessage)

`Ocean.svelte` pushes `{ type: 'abyssal', ... }` to the iframe's contentWindow:

| Field        | Source                                            | Effect                                  |
|--------------|---------------------------------------------------|------------------------------------------|
| `scatter`    | theme primary blended 62% toward engine teal      | water color                             |
| `sss`        | theme secondary blended 55% toward engine teal    | subsurface glow                          |
| `wind`       | `2 + 22 * character` (the wave knob)              | JONSWAP spectrum (rebuilds h0)          |
| `sunElev`/`sunAzim` | NOAA-style solar position from the **local wall clock**, 35°N | Preetham sky, sun disc, water reflections, foam shading |
| `moonElev`/`moonAzim`/`moonE` | moon arcs opposite the sun at 15° elevation, `moonE: 1.4` | moonlit night rendering                |

Pushes happen on mount (retried until the engine is listening), every 60 s
(sun keeps following the clock), on theme changes (observer), and whenever the
wave-character knob moves (`$: if (ready ...) pushToEngine()` — `character` is
referenced directly so Svelte tracks it).

The engine exposes `window.__abyssal` with `theme()`, `wind()`, `sun()`,
`moon()`, `get()` and `mem()` (diagnostics: JS heap, texture/geometry/program
counts, estimated GPU MB).

### Sun & moon

- **Sun** tracks the real local clock (NOAA-style approximation, no equation
  of time). Elevation < 0 is night. Uses local `getHours()` — not
  `getTime() % day`, which would be UTC.
- **Night** — below ~−2° the sky mixes to a deep-blue night term scaled by
  `uNightGain` (baked default 1.4, calibrated against the engine's ACES
  tonemap). Without this the engine's sun fades to pitch black below the
  horizon.
- **Moon** — a textured sphere (see below). In background mode the camera
  orbits continuously, so the engine re-aims the moon azimuth to sit **15°
  right of the camera look direction** every frame (`P.moonAzim` update in
  `updateCamera`), keeping it in view as the camera glides.

### The moon (textured, self-luminous)

- **Asset**: `static/abyssal/moon/moon.jpg` — a 1k NASA albedo of the Moon
  (equirectangular), vendored from `homer-jay/solar-system-textures`
  (CC-BY 4.0, based on NASA imagery). Loaded relative to the engine page, so
  it works offline. **Commit the `moon/` dir.**
- **Rendering**: a `SphereGeometry` (radius 400 at distance 14000 → ~2°
  apparent disc) with **`MeshBasicMaterial`** — deliberately *unlit*, because
  the real Moon outshines the night sky. A Phong material made it dark
  (light-dependent); the basic material shows the full albedo (maria +
  craters) at bright moonlight. Base color `1.35` is HDR so the centre blooms
  slightly through ACES; the dark side keeps a faint `0x141b26` emissive so it
  never reads pure black. Positioned along `MOON.dir` from the camera every
  frame (`placeMoonMesh()`).
- **Halo**: the sky shader's `skyRadiance` adds a smooth radial halo
  (`pow((mct − cos(0.058)) / (1 − cos(0.058)), 3)`, spans ~3.3°) plus a faint
  Henyey-Greenstein aureole, so the sphere's hard limb blends into a soft
  glow. A sharp inner "disc" term was removed — it created a visible ring at
  the mesh rim. The halo also drives the **moonglade** (the shimmering
  reflection column on the water, since the water reflects `skyRadiance`).
- **Fill lighting**: a dim bluish `AmbientLight` (`0x2a3a5c`) gives the night
  seafloor/island a hint of visibility; its intensity is scoped to the night
  amount so daytime is untouched.
- **Note**: the moon always renders near-full (camera-lit for readability).
  True lunar phases would need lighting from the real sun direction.

## Performance review (2026-08)

Measured in the live preview (Electron webview, `performance.memory` +
`renderer.info` via `__abyssal.mem()`):

| State                          | JS heap (process) | GPU (est.) | Textures / Programs |
|--------------------------------|-------------------|------------|----------------------|
| **Ocean** (first mount)        | ~151–161 MB       | ~53 MB     | 32 / 17              |
| **Ocean** (warm remount)       | ~97–109 MB        | ~53 MB     | 32 / 17              |
| **Aurora** (light)             | ~49 MB            | ~0 MB (no RTs) | few / 1-2        |

**Conclusion: yes — a lighter animation drops memory substantially.** Ocean
costs roughly **+50–110 MB JS heap and ~53 MB GPU** over the light variants.
The heavy footprint comes from the FFT pipeline: per-cascade float ping-pong
targets (3 cascades × ~5 MB), full-resolution `sceneRT`/`mainRT`, a 5-level
bloom chain, and 17 compiled programs.

**Leak check (passed):** repeated ocean → aurora → ocean cycles return the
heap to the same baseline (~49 MB). The iframe and its WebGL context are fully
torn down on switch (`Ocean.svelte`'s component removal destroys the browsing
context; GPU memory is released). `Ocean.svelte` clears its intervals and
disconnects its observer on destroy. Ocean's heap is stable over time — the
only "growth" observed was GC lag, not a leak.

**Per-frame allocation fixes applied** (were ~4–5 small allocations/frame in
the engine's hot path, i.e. GC churn):
- `updateCamera` created `new THREE.Euler(...)` every frame → hoisted a
  module-scope scratch `_euler`.
- `updateSun` (runs every frame via `refreshSkyUniforms`) built 2–3 arrays
  per call for the transmittance factor → inlined into scalar `fx0/fx1/fx2`.

The hot path (`loop → updateCamera/syncUniforms/placeMoonMesh`) is now
allocation-free.

**Guidance:** if memory is a concern (low-end machines, many app windows), the
default `aurora` and the other light variants cost ~1/3 of Ocean's heap and
none of its GPU render targets. Ocean is the premium background — worth its
cost on capable hardware, and it auto-pauses render work via the visibility
handling in the light variants (Ocean's iframe keeps simulating while visible).
