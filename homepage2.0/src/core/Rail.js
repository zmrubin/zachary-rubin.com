import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Slow at both ends, fast in the middle. */
const easeInOutQuint = (x) =>
  x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2;

/**
 * Detents — the mapping from raw scroll input (`u`) to journey position (`t`).
 *
 * Without this, `t` is linear in scroll: the camera can cover tens of world units
 * between adjacent sections while sitting only ~19 units away from them, so a
 * node sweeps from far above frame to far below it in a flick of the wheel and is
 * almost never actually composed.
 *
 * The realm is split into segments whose boundaries are the section positions.
 * Each segment gets an equal share of scroll, and within a segment the position
 * eases in and out — so travel decelerates into every station and accelerates
 * away from it. Nodes become destinations you settle at, not things you fly past.
 */
class Detents {
  constructor(stops) {
    const set = new Set([0, ...stops, 1]);
    this.stops = [...set].sort((a, b) => a - b);
    this.segments = Math.max(1, this.stops.length - 1);
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

/** How much overscroll past a realm's end commits to a transition. */
const DEPART_THRESHOLD = 0.34;

/**
 * Rail — navigation. Owns exactly one number: `t`, the journey position within
 * the *active realm*. Wheel, drag, keys, nav rows, chart clicks and deep links
 * all write to it; the camera critically-damps toward it so movement has mass.
 *
 * Where the camera actually goes for a given `t` is the realm's job
 * (`Realm.placeCamera`) — this class is realm-agnostic.
 *
 * Scrolling past either end builds `overscroll` pressure instead of doing
 * nothing; past a threshold it fires `onDepart(direction)`, which the
 * RealmManager turns into a transition to the neighbouring realm.
 */
export class Rail {
  constructor(world) {
    this.world = world;
    this.camera = world.camera;

    this.realm = null;
    this.detents = new Detents([]);

    // `u` is raw scroll input, `t` is the journey position everything reads.
    this.u = 0;
    this.t = 0;
    this.target = 0;
    this.velocity = 0;

    // Pressure past a realm boundary, signed. Drives the departure affordance.
    this.overscroll = 0;
    this.canDepart = { prev: false, next: false };
    this.onDepart = null;

    // Locked while a transition owns the camera.
    this.locked = false;

    this.mouse = new THREE.Vector2(0, 0);
    this.mouseSmooth = new THREE.Vector2(0, 0);
    this.dragging = false;
    this.idle = 0;

    this._ctx = {
      mouse: this.mouseSmooth,
      elapsed: 0,
      velocity: 0,
      reducedMotion: world.reducedMotion,
      t: 0,
    };

    this._bind();
  }

  // ------------------------------------------------------------------ realm
  /**
   * Swap the active realm.
   * @param {import('./Realm.js').Realm} realm
   * @param {number[]} stops section positions inside it, for the detents
   * @param {number} entryT where to arrive (0 when entering forwards, 1 backwards)
   */
  setRealm(realm, stops, entryT = 0) {
    this.realm = realm;
    this.detents = new Detents(stops);
    this.overscroll = 0;
    this.u = this.detents.toU(entryT);
    this.target = this.u;
    this.t = this.detents.toT(this.u);
    this.velocity = 0;
  }

  // ------------------------------------------------------------------ input
  /** Apply a signed scroll delta, routing anything past the ends to overscroll. */
  _push(delta) {
    if (this.locked) return;
    this.idle = 0;
    const next = this.target + delta;

    if (next > 1) {
      this.target = 1;
      this.overscroll = Math.max(0, this.overscroll) + (next - 1);
    } else if (next < 0) {
      this.target = 0;
      this.overscroll = Math.min(0, this.overscroll) + next;
    } else {
      this.target = next;
      // Moving back inside the realm releases the pressure immediately.
      this.overscroll = 0;
    }

    if (this.overscroll > DEPART_THRESHOLD && this.canDepart.next) {
      this.overscroll = 0;
      this.onDepart?.(1);
    } else if (this.overscroll < -DEPART_THRESHOLD && this.canDepart.prev) {
      this.overscroll = 0;
      this.onDepart?.(-1);
    }
  }

  _bind() {
    const el = document.body;

    window.addEventListener(
      'wheel',
      (e) => {
        if (e.target.closest?.('[data-scrollable]')) return;
        e.preventDefault();
        const scale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1;
        this._push((e.deltaY * scale) / 9000);
      },
      { passive: false }
    );

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
      this._push(-(dy * 1.6 + dx * 0.5) / 2400);
    });
    const end = () => {
      this.dragging = false;
      last = null;
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    window.addEventListener('keydown', (e) => {
      const step = { ArrowUp: -0.02, ArrowDown: 0.02, PageUp: -0.12, PageDown: 0.12 }[e.key];
      if (step !== undefined) {
        e.preventDefault();
        this._push(step);
      } else if (e.key === 'Home') {
        this.travelTo(0);
      } else if (e.key === 'End') {
        this.travelTo(1);
      }
    });
  }

  /** @param {number} t a journey position (not raw input) */
  travelTo(t) {
    if (this.locked) return;
    this.target = clamp(this.detents.toU(t), 0, 1);
    this.overscroll = 0;
    this.idle = 0;
  }

  /** Jump with no travel time — deep links, and arriving in a new realm. */
  jumpTo(t) {
    this.target = clamp(this.detents.toU(t), 0, 1);
    this.u = this.target;
    this.t = this.detents.toT(this.u);
    this.overscroll = 0;
  }

  // ------------------------------------------------------------------ frame
  update(dt, elapsed) {
    const k = 1 - Math.exp(-dt * 3.4);
    const prev = this.t;
    this.u += (this.target - this.u) * k;
    this.t = this.detents.toT(this.u);
    this.velocity = (this.t - prev) / Math.max(dt, 1e-4);

    // Overscroll bleeds away when you stop pushing.
    this.overscroll *= Math.exp(-dt * 2.6);
    if (Math.abs(this.overscroll) < 1e-4) this.overscroll = 0;

    this.idle += dt;

    const mk = 1 - Math.exp(-dt * 4.0);
    this.mouseSmooth.x += (this.mouse.x - this.mouseSmooth.x) * mk;
    this.mouseSmooth.y += (this.mouse.y - this.mouseSmooth.y) * mk;

    const ctx = this._ctx;
    ctx.elapsed = elapsed;
    ctx.velocity = this.velocity;
    ctx.t = this.t;

    if (this.realm && !this.locked) {
      this.realm.t = this.t;
      this.realm.placeCamera(this.camera, this.t, ctx);
    }
  }

  get ctx() {
    return this._ctx;
  }
}
