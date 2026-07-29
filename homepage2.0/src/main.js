import * as THREE from 'three';
import { SECTIONS } from '../content/sections.js';
import { World } from './core/World.js';
import { Rail } from './core/Rail.js';
import { journeyY, pitchAt, thetaAt } from './core/theme.js';
import { Environment } from './layers/Environment.js';
import { Particulate } from './layers/Particulate.js';
import { Starfield } from './layers/Starfield.js';
import { Tethers } from './layers/Tethers.js';
import { Nodes } from './layers/Nodes.js';
import { Beacon } from './layers/Beacon.js';
import { Hud } from './ui/Hud.js';
import { Panel } from './ui/Panel.js';
import { Chart } from './ui/Chart.js';

// Sections are authored in any order; the journey is defined by `at`.
const sections = [...SECTIONS].sort((a, b) => a.at - b.at);

const canvas = document.getElementById('gl');
const world = new World(canvas);
// Section positions double as scroll detents, so travel settles at each one.
const rail = new Rail(world, sections.map((s) => s.at));

const loadingManager = new THREE.LoadingManager();
const loader = new THREE.TextureLoader(loadingManager);

// ------------------------------------------------------------------- layers
const env = world.add(new Environment(rail));

const counts = world.quality === 'high' ? [2600, 900, 1400] : [1100, 400, 600];
world.add(new Particulate(rail, 'snow', counts[0]));
world.add(new Particulate(rail, 'bubbles', counts[1]));
world.add(new Particulate(rail, 'dust', counts[2]));
world.add(new Starfield(rail, world.quality === 'high' ? 3200 : 1400));

// A tether at each section's position, plus structural ones for volume.
const anchors = sections.map((s) => {
  const theta = thetaAt(s.at);
  const r = s.radius ?? 19;
  return { x: Math.cos(theta) * r, z: Math.sin(theta) * r, opacity: 0.9 };
});
world.add(new Tethers(rail, [...anchors, ...Tethers.structural(world.quality === 'high' ? 9 : 5)]));

// The recurring motif, at both ends of the journey.
world.add(new Beacon(rail, { at: 0, angle: 0.46, radius: 26, scale: 0.9, fade: [0.03, 0.17] }));
world.add(
  new Beacon(rail, {
    at: 1,
    angle: -0.5,
    radius: 30,
    dy: -4,
    scale: 1.05,
    lamp: '#dff2ff',
    fade: [1.0, 0.82], // reversed window: fades *in* on approach to orbit
  })
);
const nodes = world.add(new Nodes(rail, sections, loader));

// ----------------------------------------------------------------------- ui
const panel = new Panel();
const chart = new Chart(rail, sections);
const hud = new Hud(rail, nodes, sections, (s) => panel.show(s));
document.getElementById('chart-toggle').addEventListener('click', () => chart.toggle());

world.add(rail);
world.add(hud);
world.add(chart);

// -------------------------------------------------------------- interaction
const pointer = new THREE.Vector2(-2, -2);
let pointerMoved = false;
let downAt = null;

window.addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  pointerMoved = true;
});

window.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY, time: performance.now() };
});

window.addEventListener('pointerup', (e) => {
  if (!downAt || chart.open || panel.open) return;
  if (e.target.closest?.('a, button, [data-ui], #chart, #panel')) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  const quick = performance.now() - downAt.time < 500;
  downAt = null;
  if (moved > 8 || !quick) return; // that was a drag, not a click

  const hit = nodes.pick(pointer, world.camera);
  if (!hit) return;
  // First click brings a node to centre; once centred, it opens.
  if (hit.focus > 0.75) panel.show(hit.section);
  else rail.travelTo(hit.section.at);
});

// Hover picking runs on its own cheap tick rather than every frame.
setInterval(() => {
  if (!pointerMoved || panel.open) return;
  pointerMoved = false;
  const hit = nodes.pick(pointer, world.camera);
  nodes.hovered = hit;
  document.body.classList.toggle('is-pointing', !!hit);
}, 80);

// Deep links: #robotics travels straight to that section.
function applyHash(instant = false) {
  const id = location.hash.replace('#', '');
  const s = sections.find((x) => x.id === id);
  if (!s) return;
  if (instant) rail.jumpTo(s.at);
  else rail.travelTo(s.at);
}
window.addEventListener('hashchange', () => applyHash());

// ------------------------------------------------------------------- launch
loadingManager.onLoad = () => {
  document.body.classList.add('is-ready');
};
// Don't let a slow image hold the whole site hostage.
setTimeout(() => document.body.classList.add('is-ready'), 2500);

applyHash(true);
world.start();

// Expose for console tinkering while we iterate on the design.
window.ZR = { world, rail, nodes, env, sections, journeyY };
