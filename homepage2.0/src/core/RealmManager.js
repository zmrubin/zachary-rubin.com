import * as THREE from 'three';
import { REALMS, realmById, realmOrder, transitionFor } from '../../content/realms.js';
import { REALM_CLASSES } from '../realms/index.js';

const MODES = { gate: 0, ascend: 1, descend: 2 };

/**
 * RealmManager — owns the set of themed environments, decides which is active,
 * and runs the transition sequence between them.
 *
 * Realms are built lazily the first time they're entered, so a visitor who never
 * leaves the Abyss never pays to construct the other five.
 *
 * Sections are distributed here rather than in the realms: a section's first
 * `realms` entry is its home (full node, deep-link target), and any further
 * entries get a lighter cross-link marker placed automatically in the largest
 * free gap of that realm's column.
 */
export class RealmManager {
  constructor(world, rail, sections, loader) {
    this.world = world;
    this.rail = rail;
    this.loader = loader;
    this.instances = new Map();
    this.listeners = new Set();

    // Only realms that actually have an implementation take part in navigation.
    this.order = realmOrder().filter((m) => REALM_CLASSES[m.id]);

    this.assign(sections);

    this.active = null;
    this.transition = null;

    rail.onDepart = (dir) => this.step(dir);
  }

  // ------------------------------------------------------------- assignment
  /** Split sections into per-realm home and cross-link lists. */
  assign(sections) {
    this.byRealm = new Map(this.order.map((m) => [m.id, { home: [], cross: [] }]));
    this.homeRealmOf = new Map();

    for (const s of sections) {
      const declared = (s.realms ?? []).filter((id) => this.byRealm.has(id));
      const home = declared[0] ?? this.order[0].id;
      this.homeRealmOf.set(s.id, home);
      this.byRealm.get(home).home.push(s);
      for (const id of declared.slice(1)) this.byRealm.get(id).cross.push(s);
    }

    // Place cross-links in the roomiest parts of each realm's column, so they
    // never land on top of that realm's own stations.
    for (const [, bucket] of this.byRealm) {
      bucket.home.sort((a, b) => a.at - b.at);
      const taken = bucket.home.map((s) => s.at);
      bucket.crossAt = new Map();
      for (const s of bucket.cross) {
        const bounds = [0, ...taken, 1].sort((a, b) => a - b);
        let best = 0.5;
        let bestGap = -1;
        for (let i = 0; i < bounds.length - 1; i++) {
          const gap = bounds[i + 1] - bounds[i];
          if (gap > bestGap) {
            bestGap = gap;
            best = (bounds[i] + bounds[i + 1]) / 2;
          }
        }
        bucket.crossAt.set(s.id, best);
        taken.push(best);
      }
    }
  }

  /** Every station in a realm, as {section, at, crossLink} in column order. */
  stationsIn(realmId) {
    const b = this.byRealm.get(realmId);
    if (!b) return [];
    const out = [
      ...b.home.map((s) => ({ section: s, at: s.at, crossLink: false })),
      ...b.cross.map((s) => ({ section: s, at: b.crossAt.get(s.id), crossLink: true })),
    ];
    return out.sort((a, b2) => a.at - b2.at);
  }

  realmOf(sectionId) {
    return this.homeRealmOf.get(sectionId);
  }

  // ---------------------------------------------------------------- lifecycle
  get(realmId) {
    if (this.instances.has(realmId)) return this.instances.get(realmId);
    const meta = realmById(realmId);
    const Cls = REALM_CLASSES[realmId];
    if (!meta || !Cls) return null;

    const realm = new Cls(this.world, meta);
    realm.rail = this.rail;
    realm.build(this.stationsIn(realmId), this.loader);
    this.world.scene.add(realm.object3D);
    this.instances.set(realmId, realm);
    return realm;
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  _emit(phase) {
    for (const fn of this.listeners) fn(this.active, phase, this);
  }

  /** Activate a realm immediately, with no transition. */
  activate(realmId, entryT = 0) {
    const realm = this.get(realmId);
    if (!realm) return;
    if (this.active && this.active !== realm) this.active.exit();

    this.active = realm;
    realm.enter();
    this.world.applyPost(realm.post);
    this.rail.setRealm(realm, this.stationsIn(realmId).map((s) => s.at), entryT);
    this._updateNeighbours();
    this._emit('enter');
  }

  _updateNeighbours() {
    const i = this.order.findIndex((m) => m.id === this.active?.id);
    this.rail.canDepart = {
      prev: i > 0,
      next: i >= 0 && i < this.order.length - 1,
    };
    this.index = i;
  }

  /** Move one realm forward (+1) or back (-1) in tour order. */
  step(dir) {
    const next = this.order[this.index + dir];
    if (next) this.travelTo(next.id, dir > 0 ? 0 : 1);
  }

  /** Where a section lives, and the position to arrive at. */
  locate(sectionId) {
    const realmId = this.homeRealmOf.get(sectionId);
    if (!realmId) return null;
    const st = this.stationsIn(realmId).find((s) => s.section.id === sectionId);
    return { realmId, at: st?.at ?? 0.5 };
  }

  /** Go to a section wherever it lives, transitioning realms if needed. */
  goToSection(sectionId) {
    const loc = this.locate(sectionId);
    if (!loc) return;
    if (loc.realmId === this.active?.id) this.rail.travelTo(loc.at);
    else this.travelTo(loc.realmId, loc.at);
  }

  // -------------------------------------------------------------- transition
  /**
   * Transition to another realm. Owns the camera for the duration: the outgoing
   * realm keeps rendering through the first half, the swap happens under cover of
   * the full-screen effect at the midpoint, and the incoming realm plays its own
   * arrival for the second half.
   */
  travelTo(realmId, entryT = 0) {
    if (this.transition || realmId === this.active?.id) return;
    const from = this.active;
    const to = this.get(realmId);
    if (!to) return;

    const mode = transitionFor(from?.id ?? '', realmId);
    const duration = mode === 'gate' ? 1.75 : 2.1;

    this.transition = {
      from,
      to,
      entryT,
      mode,
      duration,
      elapsed: 0,
      swapped: false,
    };

    this.rail.locked = true;
    this.world.transitionPass.enabled = true;
    this.world.transitionPass.uniforms.uMode.value = MODES[mode] ?? 0;
    this.world.transitionPass.uniforms.uColorFrom.value.set(from?.meta.accent ?? '#3fe0f0');
    this.world.transitionPass.uniforms.uColorTo.value.set(to.meta.accent);

    this._emit('depart');
  }

  update(dt, elapsed) {
    const tr = this.transition;

    if (tr) {
      tr.elapsed += dt;
      const p = Math.min(tr.elapsed / tr.duration, 1);
      this.world.transitionPass.uniforms.uProgress.value = p;
      this.world.transitionPass.uniforms.uTime.value = elapsed;

      // Departure: keep flying the outgoing realm past its own end so the exit
      // has momentum rather than freezing on the last frame.
      if (!tr.swapped) {
        const push = p / 0.5;
        const ctx = this.rail.ctx;
        ctx.elapsed = elapsed;
        ctx.velocity = 0.6 * push;
        const overshoot = tr.entryT === 0 ? 1 + push * 0.16 : -push * 0.16;
        tr.from?.placeCamera(this.world.camera, overshoot, ctx);
        tr.from?.update(dt, elapsed, ctx);
        tr.from?.applyAtmosphere(this.world.scene, overshoot);

        if (p >= 0.5) {
          // Swap under full cover.
          tr.from?.exit();
          this.active = tr.to;
          tr.to.enter();
          this.world.applyPost(tr.to.post);
          this.rail.setRealm(
            tr.to,
            this.stationsIn(tr.to.id).map((s) => s.at),
            tr.entryT
          );
          this._updateNeighbours();
          tr.swapped = true;
          this._emit('arrive');
        }
      } else {
        // Arrival: ease in from just outside the entry end.
        const push = (1 - p) / 0.5;
        const ctx = this.rail.ctx;
        ctx.elapsed = elapsed;
        ctx.velocity = 0.6 * push;
        const from = tr.entryT === 0 ? -push * 0.16 : 1 + push * 0.16;
        this.active.t = Math.max(0, Math.min(1, from));
        this.active.placeCamera(this.world.camera, from, ctx);
        this.active.update(dt, elapsed, ctx);
        this.active.applyAtmosphere(this.world.scene, this.active.t);
      }

      if (p >= 1) {
        this.transition = null;
        this.rail.locked = false;
        this.world.transitionPass.enabled = false;
        this.world.transitionPass.uniforms.uProgress.value = 0;
        this._emit('settled');
      }
      return;
    }

    if (!this.active) return;
    this.active.update(dt, elapsed, this.rail.ctx);
    this.active.applyAtmosphere(this.world.scene, this.rail.t);
  }

  /** Progress through the current transition, or null. */
  get transitionProgress() {
    if (!this.transition) return null;
    return {
      p: Math.min(this.transition.elapsed / this.transition.duration, 1),
      from: this.transition.from?.meta,
      to: this.transition.to.meta,
    };
  }

  get all() {
    return this.order;
  }
}

export { REALMS };
