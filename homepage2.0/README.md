# zachary-rubin.com 2.0

A hardware-accelerated WebGL site. Self-hosted, no build step, no CDN — three.js is
vendored into `vendor/`, so this directory can be dropped onto any static host as-is.

## Run it

```bash
python3 -m http.server 5180 --directory homepage2.0
```

Then open http://localhost:5180. (There's also a `.claude/launch.json` entry named
`homepage2.0`.)

Everything is native ES modules resolved through an import map in `index.html`:

```
"three"          -> ./vendor/three/build/three.module.js
"three/addons/"  -> ./vendor/three/addons/
```

## Adding content

**A new section** — edit `content/sections.js` only. Add an object to `SECTIONS`.
Its 3D node, tether, nav row, projected label, chart station, depth readout and
detail panel are all generated from it. The fields are documented at the top of
that file; the ones that matter most are `at` (position within its realm, 0..1),
`realms`, `image` and `body`.

**Retuning the look** — `src/core/theme.js` holds the world's geometry, the
vertical colour ramp, fog densities, zone names and camera pitch keyframes. Most
visual changes are edits to a table there rather than to a shader.

**A new theme (realm)** — add an entry to `content/realms.js`, subclass
`src/core/Realm.js`, and point some sections at it. See "Realms" below.

## Layout

```
index.html            shell: import map, HUD markup
css/app.css           the entire HUD/instrument layer
content/
  sections.js         ALL content. The only file needed for routine updates.
  realms.js           the theme map: six environments + transition routes
src/
  main.js             bootstrap and wiring
  core/
    World.js          renderer, camera, post-processing chain, frame loop
    Rail.js           navigation: input, damping, scroll detents
    Realm.js          base class for a themed environment
    theme.js          world geometry, palette, ramps, readouts, GLSL helpers
  shaders/
    GradeShader.js    finishing pass: chroma, vignette, grain, scanline
  layers/             composable scene pieces (environment, particles, nodes…)
  realms/             one file per theme
  ui/
    Hud.js            nav, depth gauge, telemetry, projected node labels
    Chart.js          the sounding chart — jump-to-any-depth navigator
    Panel.js          section detail overlay
public/media/         stills, pulled from the old Wix site and resized
vendor/three/         three.js r185 (core + the addons actually used)
```

## Navigation model

`Rail` owns one number: journey position `t`, in 0..1. Wheel, drag, arrow keys,
nav rows, chart clicks and `#deep-links` all write to it; the camera
critically-damps toward it so movement always has mass.

Raw scroll input is mapped through **detents** before becoming `t`. The column is
split into segments whose boundaries are the section positions, each segment gets
an equal share of scroll, and within a segment the position eases in and out.
Travel therefore decelerates into every station and accelerates away from it —
sections are destinations you settle at rather than things you fly past. Without
this the camera climbs ~38 world units between adjacent sections while sitting
only ~19 units from them, and nodes are almost never actually composed.

Where the camera goes for a given `t` is the **realm's** job
(`Realm.placeCamera`), as is where each section's node sits
(`Realm.nodeTransform`). Everything else is realm-agnostic.

## Realms

Six environments, one per cluster of interests. Each is a separate scene with its
own palette, atmosphere, camera motion and props.

| Realm | Motion | Content |
|---|---|---|
| **Abyss** `ABY` | vertical ascent through water | origin, the ocean, dogs |
| **Foundry** `FDY` | travel down an industrial hall | robotics, BattleBots, hardware, fitness |
| **Velocity** `VEL` | forward run at speed, light streaks | LiveWire, Mission R, Boosted, Mugen, Apple SPG |
| **Lattice** `LTC` | flight through a node/edge graph | ML morphologies, trading, data viz, OSINT tooling |
| **Atelier** `ATL` | turntable orbit, **light scheme** | patents, industrial design, Milan |
| **Orbit** `ORB` | drift above the planet limb | satellite imagery, travel, contact |

A section's `realms` array lists every realm it belongs to. The **first is home**:
the full node lives there and deep links land there. Further entries place a
lighter cross-link marker in those realms which jumps home — so a topic that
honestly spans two worlds (fitness tech is workshop *and* software; geospatial
OSINT is orbital *and* computational) is reachable from either without being
authored twice.

Transitions are declared in `TRANSITIONS` in `content/realms.js`. Most pairs use
the generic `gate` wipe; `abyss <-> orbit` keeps the bespoke continuous ascent,
since those two worlds are physically adjacent in the fiction.

### Status

Built and working: **Abyss** (including the ascent through the surface to orbit),
the navigation model, the sounding chart, the HUD, and the section/detail system.

Specified but not yet built: **Foundry**, **Velocity**, **Lattice**, **Atelier**,
the standalone **Orbit** realm, and the realm-to-realm transition sequences.
`src/core/Realm.js` and `src/realms/AbyssRealm.js` are the interface those will
implement; `main.js` still drives the Abyss layers directly.

## Notes on the rendering

- **Backdrop.** A camera-locked sphere sampling the vertical colour ramp at
  `camY + viewDir.y * BACKDROP_LEAN`. Sampling at the camera's altitude alone
  paints the whole sphere one colour (the surface crossing turns white); sampling
  by the sphere's own world-Y squashes the ramp into a band at the horizon.
  Leaning by the ray gives both a correct local medium colour and a sensible
  vertical gradient. The bright waterline is a *separate narrow additive band*
  keyed to the sampled altitude — a pale stop in the ramp itself gets smeared
  over tens of degrees of sky.
- **Plane shaders compute distance per fragment.** Passing distance-to-camera as
  a vertex varying on a low-segment quad interpolates between corner distances,
  which silently disabled the sea floor and the surface caustics. Ground sheets
  interpolate world position and take `length()` in the fragment shader.
- **God rays fade with depth.** The shaft cylinder is brightest at its top, which
  is exactly where the camera is at the surface, so it flooded the frame. Shafts
  are a seen-from-below effect and fade in with depth, out again in the abyss.
- **Quality tiers.** Particle counts, pixel ratio and chroma strength scale off
  `hardwareConcurrency`/`devicePixelRatio`; `prefers-reduced-motion` disables idle
  drift and most of the grain.
- **Labels are DOM.** Node captions are HTML positioned by projecting the card's
  corner each frame, so type stays crisp, selectable and accessible.
