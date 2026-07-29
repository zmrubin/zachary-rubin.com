import * as THREE from 'three';
import { AXIS, NOISE_GLSL } from '../core/theme.js';

/**
 * Tethers — vertical cables running the full height of the column, each with
 * emissive rings and data pulses climbing them. They give the volume a sense of
 * scale and verticality, and they're the main "this is a machine" cue.
 *
 * Every section node gets a tether at its own radius/angle, plus a handful of
 * anonymous structural ones to populate the space between.
 */
export class Tethers {
  /** @param {{x:number,z:number,accent?:number}[]} anchors */
  constructor(rail, anchors) {
    this.rail = rail;
    this.object3D = new THREE.Group();

    const height = AXIS.top - AXIS.bottom + 140;
    const geo = new THREE.CylinderGeometry(0.085, 0.085, height, 6, 1, true);

    this.mats = [];
    for (const a of anchors) {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        uniforms: {
          uTime: { value: 0 },
          uCamY: { value: 0 },
          uSeed: { value: Math.random() * 100 },
          uAccent: { value: new THREE.Color(a.accent ?? 0x3fe0f0) },
          uOpacity: { value: a.opacity ?? 1 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          varying float vY;
          varying float vDist;
          void main(){
            vUv = uv;
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vY = wp.y;
            vDist = length(wp.xyz - cameraPosition);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime, uCamY, uSeed, uOpacity;
          uniform vec3 uAccent;
          varying vec2 vUv;
          varying float vY;
          varying float vDist;
          ${NOISE_GLSL}

          void main(){
            // Structural body: almost invisible on its own. The cable is read
            // through its machined bands and the light running along it, so it
            // never turns into a flat grey slab up close.
            float band = smoothstep(0.72, 0.99, sin(vY * 2.1 + uSeed) * 0.5 + 0.5);
            vec3 col = vec3(0.012, 0.03, 0.038) + uAccent * band * 0.22;
            float a = 0.10 + band * 0.20;

            // Data pulses climbing the cable — three offset trains.
            for (int i = 0; i < 3; i++){
              float fi = float(i);
              float speed = 11.0 + fi * 7.0;
              float period = 46.0 + fi * 23.0;
              float head = mod(uTime * speed + uSeed * 37.0 + fi * 15.0, period);
              float d = mod(vY - uCamY + 70.0, period) - head;
              float pulse = exp(-abs(d) * 2.2) + exp(-abs(d) * 0.3) * 0.09;
              col += uAccent * pulse * 2.6;
              a += pulse * 0.55;
            }

            // Distance falloff so far cables read as thin lines, not clutter.
            float f = smoothstep(1.5, 6.0, vDist) * (1.0 - smoothstep(30.0, 100.0, vDist));
            a *= f * uOpacity;
            if (a < 0.004) discard;
            gl_FragColor = vec4(col, min(a, 1.0));
          }
        `,
      });

      const m = new THREE.Mesh(geo, mat);
      m.position.set(a.x, (AXIS.bottom + AXIS.top) / 2, a.z);
      m.frustumCulled = false;
      this.object3D.add(m);
      this.mats.push(mat);
    }
  }

  /** A ring of anonymous structural cables, for volume. */
  static structural(count = 9, radius = 34) {
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.4;
      const r = radius * (0.7 + Math.random() * 0.9);
      out.push({
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        opacity: 0.42,
        accent: 0x2a9fb5,
      });
    }
    return out;
  }

  update(dt, elapsed) {
    const camY = this.rail.camera.position.y;
    for (const m of this.mats) {
      m.uniforms.uTime.value = elapsed;
      m.uniforms.uCamY.value = camY;
    }
  }
}
