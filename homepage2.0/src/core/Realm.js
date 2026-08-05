import * as THREE from 'three';

/**
 * Realm — the base class for a themed 3D environment.
 *
 * A realm owns everything visual about one world: its props, its atmosphere, how
 * the camera moves through it, and where content nodes sit. The rest of the app
 * (input handling, HUD, chart, detail panel) is realm-agnostic and talks to the
 * active realm only through this interface.
 *
 * To add a theme: subclass this, implement `build`, `placeCamera`,
 * `nodeTransform` and `readout`, register it in src/realms/index.js, and add an
 * entry to content/realms.js. Nothing else needs to change.
 */
export class Realm {
  /** @param {object} world the World (renderer/scene/camera) */
  /** @param {object} meta  the matching entry from content/realms.js */
  constructor(world, meta) {
    this.world = world;
    this.meta = meta;
    this.id = meta.id;
    this.object3D = new THREE.Group();
    this.object3D.visible = false;
    this.layers = [];
    this.sections = [];
    this.built = false;

    this.accent = new THREE.Color(meta.accent);
    this.accentWarm = new THREE.Color(meta.accentWarm ?? meta.accent);

    // Journey position within this realm, written by the RealmManager each frame.
    this.t = 0;
  }

  // Layers are handed the realm as their host, so they read camera/time/quality
  // through it rather than reaching for globals.
  get camera() {
    return this.world.camera;
  }

  get reducedMotion() {
    return this.world.reducedMotion;
  }

  /** Register a layer: added to the scene graph and ticked every frame. */
  addLayer(layer) {
    this.layers.push(layer);
    if (layer.object3D) this.object3D.add(layer.object3D);
    return layer;
  }

  // ------------------------------------------------------------- lifecycle
  /**
   * Construct the realm's contents. Called lazily the first time the realm is
   * needed, so a visitor who never leaves the Abyss never pays for the others.
   * @param {object[]} sections the sections homed in (or cross-linked to) this realm
   * @param {THREE.TextureLoader} loader
   */
  build(sections, loader) {
    this.sections = sections;
    this.built = true;
  }

  /** Called when this realm becomes the active one. */
  enter() {
    this.object3D.visible = true;
  }

  /** Called once the transition away from this realm has finished. */
  exit() {
    this.object3D.visible = false;
    // Only the active realm is updated, so layers holding live resources
    // (video decoding, say) need a chance to stand down.
    for (const layer of this.layers) layer.onExit?.();
  }

  dispose() {
    this.object3D.traverse((o) => {
      o.geometry?.dispose?.();
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose?.());
      else o.material?.dispose?.();
    });
    this.layers.length = 0;
  }

  // -------------------------------------------------------------- motion
  /**
   * Position and aim the camera for journey position `t` (0..1 within this realm).
   * @param {THREE.PerspectiveCamera} camera
   * @param {number} t
   * @param {{mouse: THREE.Vector2, elapsed: number, velocity: number, reducedMotion: boolean}} ctx
   */
  placeCamera(camera, t, ctx) {
    camera.position.set(0, 0, 0);
    camera.lookAt(0, 0, -1);
  }

  /**
   * Where a section's node sits in this realm, and what it faces.
   * @returns {{position: THREE.Vector3, faces: THREE.Vector3, scale?: number}}
   */
  nodeTransform(section, index) {
    return {
      position: new THREE.Vector3(0, 0, -20),
      faces: new THREE.Vector3(0, 0, 0),
    };
  }

  /** Fog colour/density and any other scene-wide state, per frame. */
  applyAtmosphere(scene, t) {}

  update(dt, elapsed, ctx) {
    for (const layer of this.layers) layer.update?.(dt, elapsed, ctx);
  }

  // --------------------------------------------------------------- readout
  /**
   * What the HUD gauge shows here. Every realm has *some* one-dimensional
   * measure of progress; naming it per realm is most of what makes the
   * instrument panel feel native to each world.
   * @returns {{value: string, zone: string, code: string, axis: string}}
   */
  readout(t) {
    return {
      value: `${Math.round(t * 100)}%`,
      zone: this.meta.label,
      code: this.meta.code,
      axis: 'Progress',
    };
  }

  /** Labels for the two ends of the depth gauge. */
  get axisEnds() {
    return ['Start', 'End'];
  }

  /**
   * Post-processing profile for this realm, applied on enter.
   * A light room needs almost no bloom — the same settings that make emissives
   * glow in a dark realm turn a paper-white scene into a flat white rectangle.
   */
  get post() {
    return { bloom: 0.34, radius: 0.5, threshold: 0.9, exposure: 0.98 };
  }
}
