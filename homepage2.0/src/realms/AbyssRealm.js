import * as THREE from 'three';
import { Realm } from '../core/Realm.js';
import {
  AXIS,
  CAM_R,
  GRADIENT,
  altitudeAt,
  fogDensityAt,
  formatAltitude,
  journeyY,
  pitchAt,
  rampColor,
  thetaAt,
  zoneAt,
} from '../core/theme.js';
import { Environment } from '../layers/Environment.js';
import { Particulate } from '../layers/Particulate.js';
import { Tethers } from '../layers/Tethers.js';
import { Beacon } from '../layers/Beacon.js';
import { Nodes } from '../layers/Nodes.js';

/**
 * AbyssRealm — a vertical column of water. You start on the abyssal plain and
 * climb; `t = 1` is just above the waterline, so *leaving* this realm always
 * breaches the surface.
 *
 * Motion: the camera rides a small circle around the column axis and looks
 * outward, so each station swings into the centre of frame at its own position.
 */
export class AbyssRealm extends Realm {
  build(stations, loader) {
    super.build(stations, loader);
    const q = this.world.quality;

    this.env = this.addLayer(new Environment(this));

    const counts = q === 'high' ? [2600, 900] : [1100, 400];
    this.addLayer(new Particulate(this, 'snow', counts[0]));
    this.addLayer(new Particulate(this, 'bubbles', counts[1]));

    const anchors = stations.map((st, i) => {
      const { position } = this.nodeTransform(st.section, i, st.at, st.crossLink);
      return { x: position.x, z: position.z, opacity: 0.9 };
    });
    this.addLayer(new Tethers(this, [...anchors, ...Tethers.structural(q === 'high' ? 9 : 5)]));

    // The recurring motif, waiting on the sea floor.
    this.addLayer(
      new Beacon(this, { at: 0, angle: 0.46, radius: 26, scale: 0.9, fade: [0.04, 0.2] })
    );

    this.nodes = this.addLayer(new Nodes(this, stations, loader));

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

    camera.position.set(Math.cos(theta + sway) * CAM_R, y + bob, Math.sin(theta + sway) * CAM_R);

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

  nodeTransform(section, index, at, crossLink) {
    const theta = thetaAt(at);
    const radius = section.radius ?? (crossLink ? 24 : 19);
    const camY = journeyY(at);

    // Sit on the camera's sight line, not merely at its altitude: the scripted
    // pitch would otherwise shove nodes out of frame.
    const y = camY + Math.tan(pitchAt(at)) * radius + (crossLink ? 0 : section.dy ?? 0);

    return {
      position: new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius),
      faces: new THREE.Vector3(Math.cos(theta) * CAM_R, camY, Math.sin(theta) * CAM_R),
    };
  }

  applyAtmosphere(scene, t) {
    const camY = this.world.camera.position.y;
    scene.fog.density = fogDensityAt(camY);
    scene.fog.color.set(rampColor(GRADIENT, camY, this._c0, this._c1));
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
    return ['Sea floor', 'Waterline'];
  }

  get axisTicks() {
    return Array.from({ length: 11 }, (_, i) => ({
      at: i / 10,
      label: formatAltitude(altitudeAt(i / 10)),
    }));
  }
}

export { AXIS };
