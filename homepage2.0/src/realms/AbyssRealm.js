import * as THREE from 'three';
import { Realm } from '../core/Realm.js';
import {
  AXIS,
  CAM_R,
  GRADIENT,
  TURNS,
  altitudeAt,
  fogDensityAt,
  formatAltitude,
  journeyY,
  pitchAt,
  sampleRamp,
  thetaAt,
  zoneAt,
} from '../core/theme.js';
import { Environment } from '../layers/Environment.js';
import { Particulate } from '../layers/Particulate.js';
import { Starfield } from '../layers/Starfield.js';
import { Tethers } from '../layers/Tethers.js';
import { Beacon } from '../layers/Beacon.js';

/**
 * AbyssRealm — the ocean column: abyssal plain, through the twilight zone, out
 * through the surface and up to low earth orbit.
 *
 * Camera motion is `column`: it climbs the axis while rotating around it, so each
 * station swings into the centre of frame at its own position.
 */
export class AbyssRealm extends Realm {
  build(sections, loader) {
    super.build(sections, loader);

    const q = this.world.quality;

    this.env = this.addLayer(new Environment(this));
    const counts = q === 'high' ? [2600, 900, 1400] : [1100, 400, 600];
    this.addLayer(new Particulate(this, 'snow', counts[0]));
    this.addLayer(new Particulate(this, 'bubbles', counts[1]));
    this.addLayer(new Particulate(this, 'dust', counts[2]));
    this.addLayer(new Starfield(this, q === 'high' ? 3200 : 1400));

    // A tether at each station, plus anonymous structural ones for volume.
    const anchors = sections.map((s, i) => {
      const { position } = this.nodeTransform(s, i);
      return { x: position.x, z: position.z, opacity: 0.9 };
    });
    this.addLayer(new Tethers(this, [...anchors, ...Tethers.structural(q === 'high' ? 9 : 5)]));

    // The recurring motif, at both ends of the ascent.
    this.addLayer(
      new Beacon(this, { at: 0, angle: 0.46, radius: 26, scale: 0.9, fade: [0.03, 0.17] })
    );
    this.addLayer(
      new Beacon(this, {
        at: 1,
        angle: -0.5,
        radius: 30,
        dy: -4,
        scale: 1.05,
        lamp: '#dff2ff',
        fade: [1.0, 0.82],
      })
    );

    this._c0 = new THREE.Color();
    this._c1 = new THREE.Color();
  }

  // ---------------------------------------------------------------- motion
  placeCamera(camera, t, ctx) {
    const drift = ctx.reducedMotion ? 0 : 1;
    const theta = thetaAt(t);
    const y = journeyY(t);

    const bob = Math.sin(ctx.elapsed * 0.31) * 0.55 * drift;
    const sway = Math.sin(ctx.elapsed * 0.23 + 1.1) * 0.04 * drift;

    camera.position.set(
      Math.cos(theta + sway) * CAM_R,
      y + bob,
      Math.sin(theta + sway) * CAM_R
    );

    const yaw = theta + ctx.mouse.x * 0.075;
    const pitch = pitchAt(t) - ctx.mouse.y * 0.06;
    const d = 60;
    camera.lookAt(
      camera.position.x + Math.cos(yaw) * Math.cos(pitch) * d,
      camera.position.y + Math.sin(pitch) * d,
      camera.position.z + Math.sin(yaw) * Math.cos(pitch) * d
    );
    camera.rotateZ(Math.sin(ctx.elapsed * 0.19) * 0.012 * drift - ctx.velocity * 0.05);
  }

  nodeTransform(section, index) {
    const theta = thetaAt(section.at);
    const radius = section.radius ?? 19;
    const camY = journeyY(section.at);

    // Sit on the camera's sight line, not merely at its altitude: the scripted
    // pitch would otherwise shove nodes out of frame.
    const y = camY + Math.tan(pitchAt(section.at)) * radius + (section.dy ?? 0);

    return {
      position: new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius),
      faces: new THREE.Vector3(Math.cos(theta) * CAM_R, camY, Math.sin(theta) * CAM_R),
    };
  }

  /** Where the camera will be at `t` — used to aim nodes. */
  static cameraPositionAt(t, out = new THREE.Vector3()) {
    const theta = thetaAt(t);
    return out.set(Math.cos(theta) * CAM_R, journeyY(t), Math.sin(theta) * CAM_R);
  }

  applyAtmosphere(scene, t) {
    const camY = this.world.camera.position.y;
    scene.fog.density = fogDensityAt(camY);
    scene.fog.color.set(
      sampleRamp(GRADIENT, camY, (a, b, k) => {
        this._c0.set(a);
        this._c1.set(b);
        return this._c0.lerp(this._c1, k).getHex();
      })
    );
  }

  // --------------------------------------------------------------- readout
  readout(t) {
    const zone = zoneAt(t);
    return {
      value: formatAltitude(altitudeAt(t)),
      zone: zone.name,
      code: zone.code,
      axis: 'Depth',
    };
  }

  get axisEnds() {
    return ['Sea floor', 'Low earth orbit'];
  }

  /** Kept for layers that still reason in journey space. */
  get t() {
    return this.rail?.t ?? 0;
  }
}

export { AXIS, TURNS };
