import * as THREE from 'three';
import { AXIS, CAM_R, journeyY, pitchAt, thetaAt } from './theme.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Slow at both ends, fast in the middle. */
const easeInOutQuint = (x) =>
  x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2;

/**
 * Detents — the mapping from raw scroll input (`u`) to journey position (`t`).
 *
 * Without this, `t` is linear in scroll: the camera climbs ~38 world units
 * between adjacent sections while sitting only ~19 units away from them, so a
 * node sweeps from far above frame to far below it in a flick of the wheel and
 * is almost never actually composed.
 *
 * The column is split into segments whose boundaries are the section positions.
 * Each segment gets an equal share of scroll, and within a segment the position
 * eases in and out — so travel decelerates into every station and accelerates
 * away from it. Nodes become destinations you settle at, not things you fly past.
 */
class Detents {
  constructor(stops) {
    const set = new Set([0, ...stops, 1]);
    this.stops = [...set].sort((a, b) => a - b);
    this.segments = this.stops.length - 1;
  }

  /** raw scroll input -> journey position */
  toT(u) {
    const x = clamp(u, 0, 1) * this.segments;
    const i = Math.min(Math.floor(x), this.segments - 1);
    const a = this.stops[i];
    const b = this.stops[i + 1];
    return a + easeInOutQuint(x - i) * (b - a);
  }

  /** journey position -> raw scroll input (inverse of toT) */
  toU(t) {
    const target = clamp(t, 0, 1);
    let i = 0;
    while (i < this.segments - 1 && target > this.stops[i + 1]) i++;
    const a = this.stops[i];
    const b = this.stops[i + 1];
    if (b - a < 1e-9) return i / this.segments;

    // Section targets land exactly on a boundary; anything else is found by
    // bisecting the ease, which is monotonic.
    const want = (target - a) / (b - a);
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (easeInOutQuint(mid) < want) lo = mid;
      else hi = mid;
    }
    return (i + (lo + hi) / 2) / this.segments;
  }
}

/**
 * Rail — the whole navigation model.
 *
 * `t` (0..1) is where you are on the journey. Wheel, drag, keyboard and
 * programmatic `travelTo()` all write to `target`; the camera critically-damps
 * toward it so movement always feels like mass, never like a jump cut.
 *
 * The camera rides a small circle around the column axis and looks outward, so
 * each section's beacon swings into the center of frame at its own `t`.
 */
export class Rail {
  /** @param {number[]} stops section positions, for the scroll detents */
  constructor(world, stops = []) {
    this.world = world;
    this.camera = world.camera;
    this.detents = new Detents(stops);

    // `u` is raw scroll input, `t` is the journey position everything else
    // reads. `target` is where the input wants `u` to be.
    this.u = 0;
    this.t = 0;
    this.target = 0;
    this.velocity = 0;
    this.mouse = new THREE.Vector2(0, 0);
    this.mouseSmooth = new THREE.Vector2(0, 0);
    this.dragging = false;
    this.idle = 0;

    this._pos = new THREE.Vector3();
    this._look = new THREE.Vector3();

    this._bind();
  }

  // ------------------------------------------------------------------ input
  _bind() {
    const el = document.body;

    // Wheel / trackpad. Line and page deltas are normalized to pixels first.
    window.addEventListener(
      'wheel',
      (e) => {
        if (e.target.closest?.('[data-scrollable]')) return;
        e.preventDefault();
        const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
        this.target = clamp(this.target + (e.deltaY * scale) / 9000, 0, 1);
        this.idle = 0;
      },
      { passive: false }
    );

    // Pointer drag — vertical drag travels, and a little horizontal drag helps
    // on touch where vertical is the scroll gesture.
    let last = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.target.closest?.('a, button, [data-ui], #chart, #panel')) return;
      this.dragging = true;
      last = { x: e.clientX, y: e.clientY };
      el.setPointerCapture?.(e.pointerId);
    });
    window.addEventListener('pointermove', (e) => {
      this.mouse.set(
        (e.clientX / window.innerWidth) * 2 - 1,
        (e.clientY / window.innerHeight) * 2 - 1
      );
      if (!this.dragging || !last) return;
      const dy = e.clientY - last.y;
      const dx = e.clientX - last.x;
      last = { x: e.clientX, y: e.clientY };
      this.target = clamp(this.target - (dy * 1.6 + dx * 0.5) / 2400, 0, 1);
      this.idle = 0;
    });
    const end = () => {
      this.dragging = false;
      last = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    // Keyboard.
    window.addEventListener('keydown', (e) => {
      const step = { ArrowUp: -0.02, ArrowDown: 0.02, PageUp: -0.12, PageDown: 0.12 }[e.key];
      if (step !== undefined) {
        e.preventDefault();
        this.target = clamp(this.target + step, 0, 1);
        this.idle = 0;
      } else if (e.key === 'Home') {
        this.travelTo(0);
      } else if (e.key === 'End') {
        this.travelTo(1);
      }
    });
  }

  /** @param {number} t a journey position (not raw input) */
  travelTo(t) {
    this.target = clamp(this.detents.toU(t), 0, 1);
    this.idle = 0;
  }

  /** Jump with no travel time — used for deep links on first load. */
  jumpTo(t) {
    this.travelTo(t);
    this.u = this.target;
    this.t = this.detents.toT(this.u);
  }

  // ------------------------------------------------------------------ frame
  update(dt, elapsed) {
    // Critically damped approach; `1 - exp` keeps it frame-rate independent.
    const k = 1 - Math.exp(-dt * 3.4);
    const prev = this.t;
    this.u += (this.target - this.u) * k;
    this.t = this.detents.toT(this.u);
    this.velocity = (this.t - prev) / Math.max(dt, 1e-4);

    this.idle += dt;

    // Mouse parallax, also damped.
    const mk = 1 - Math.exp(-dt * 4.0);
    this.mouseSmooth.x += (this.mouse.x - this.mouseSmooth.x) * mk;
    this.mouseSmooth.y += (this.mouse.y - this.mouseSmooth.y) * mk;

    const drift = this.world.reducedMotion ? 0 : 1;
    const theta = thetaAt(this.t);
    const y = journeyY(this.t);

    // Slow idle breathing so the frame is never dead still.
    const bob = Math.sin(elapsed * 0.31) * 0.55 * drift;
    const sway = Math.sin(elapsed * 0.23 + 1.1) * 0.04 * drift;

    this._pos.set(
      Math.cos(theta + sway) * CAM_R,
      y + bob,
      Math.sin(theta + sway) * CAM_R
    );
    this.camera.position.copy(this._pos);

    // Look outward from the axis, with scripted pitch plus mouse parallax.
    const yaw = theta + this.mouseSmooth.x * 0.075;
    const pitch = pitchAt(this.t) - this.mouseSmooth.y * 0.06;
    const dist = 60;
    this._look.set(
      this._pos.x + Math.cos(yaw) * Math.cos(pitch) * dist,
      this._pos.y + Math.sin(pitch) * dist,
      this._pos.z + Math.sin(yaw) * Math.cos(pitch) * dist
    );
    this.camera.lookAt(this._look);

    // A whisper of roll, biased by travel speed — reads as inertia.
    const roll = Math.sin(elapsed * 0.19) * 0.012 * drift - this.velocity * 0.05;
    this.camera.rotateZ(roll);

    // Field of view opens slightly while travelling fast.
    const fov = 56 + Math.min(Math.abs(this.velocity) * 26, 5);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** World-space position of the camera at an arbitrary `t` (used for aiming nodes). */
  static cameraPositionAt(t, out = new THREE.Vector3()) {
    const theta = thetaAt(t);
    return out.set(Math.cos(theta) * CAM_R, journeyY(t), Math.sin(theta) * CAM_R);
  }

  static get span() {
    return AXIS.top - AXIS.bottom;
  }
}
