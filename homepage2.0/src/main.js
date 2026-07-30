import * as THREE from 'three';
import { SECTIONS } from '../content/sections.js';
import { World } from './core/World.js';
import { Rail } from './core/Rail.js';
import { RealmManager } from './core/RealmManager.js';
import { Hud } from './ui/Hud.js';
import { Panel } from './ui/Panel.js';
import { Chart } from './ui/Chart.js';

const canvas = document.getElementById('gl');
const world = new World(canvas);
const rail = new Rail(world);

const loadingManager = new THREE.LoadingManager();
const loader = new THREE.TextureLoader(loadingManager);

const realms = new RealmManager(world, rail, SECTIONS, loader);

// ----------------------------------------------------------------------- ui
const panel = new Panel();
const chart = new Chart(rail, realms);
const hud = new Hud(rail, realms, (s) => panel.show(s));
document.getElementById('chart-toggle').addEventListener('click', () => chart.toggle());

// -------------------------------------------------------------- interaction
const pointer = new THREE.Vector2(-2, -2);
let pointerMoved = false;
let downAt = null;

const blocked = () => chart.open || panel.open || rail.locked;

window.addEventListener('pointermove', (e) => {
  pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  pointerMoved = true;
});

window.addEventListener('pointerdown', (e) => {
  downAt = { x: e.clientX, y: e.clientY, time: performance.now() };
});

window.addEventListener('pointerup', (e) => {
  if (!downAt || blocked()) return;
  if (e.target.closest?.('a, button, [data-ui], #chart, #panel')) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  const quick = performance.now() - downAt.time < 500;
  downAt = null;
  if (moved > 8 || !quick) return; // that was a drag, not a click

  const nodes = realms.active?.nodes;
  const hit = nodes?.pick(pointer, world.camera);
  if (!hit) return;

  if (hit.crossLink) {
    // Cross-links always send you to the section's home realm.
    realms.goToSection(hit.section.id);
  } else if (hit.focus > 0.75) {
    panel.show(hit.section);
  } else {
    rail.travelTo(hit.at);
  }
});

// Hover picking on its own cheap tick rather than every frame.
setInterval(() => {
  if (!pointerMoved || blocked()) return;
  pointerMoved = false;
  const nodes = realms.active?.nodes;
  if (!nodes) return;
  const hit = nodes.pick(pointer, world.camera);
  nodes.hovered = hit;
  document.body.classList.toggle('is-pointing', !!hit);
}, 80);

// ----------------------------------------------------------------- routing
/** `#robotics` goes to that section; `#foundry` goes to that realm. */
function applyHash(instant = false) {
  const id = location.hash.replace('#', '');
  if (!id) return false;

  const section = SECTIONS.find((s) => s.id === id);
  if (section) {
    const loc = realms.locate(section.id);
    if (!loc) return false;
    if (instant) {
      realms.activate(loc.realmId, loc.at);
    } else {
      realms.goToSection(section.id);
    }
    return true;
  }

  const realm = realms.all.find((r) => r.id === id);
  if (realm) {
    if (instant) realms.activate(realm.id, 0);
    else realms.travelTo(realm.id, 0);
    return true;
  }
  return false;
}
window.addEventListener('hashchange', () => applyHash());

// ------------------------------------------------------------------- launch
if (!applyHash(true)) realms.activate(realms.all[0].id, 0);

world.add(rail);
world.add(realms);
world.add(hud);
world.add(chart);

loadingManager.onLoad = () => document.body.classList.add('is-ready');
// Don't let a slow image hold the whole site hostage.
setTimeout(() => document.body.classList.add('is-ready'), 2500);

world.start();

// Exposed for console tinkering while we iterate on the design.
window.ZR = { world, rail, realms, chart, panel, hud, SECTIONS };
