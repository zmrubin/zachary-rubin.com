import * as THREE from 'three';
import { CAM_R, PALETTE, journeyY, thetaAt } from '../core/theme.js';

/**
 * Beacon — the site's recurring motif: a lamp inside a faceted hull, wrapped in
 * gimbal rings and instrument spikes.
 *
 * You meet one on the sea floor at the start of the journey (warm lamp, the only
 * light in the abyss) and its sibling in orbit at the end (cold lamp, sunlit).
 * Same object, two environments — it bookends the ascent.
 *
 * @param {object} opts
 *   at        journey position it sits at
 *   angle     angular offset from the camera's heading at `at`, in radians.
 *             Positive puts it to the right of frame.
 *   radius    distance from the column axis
 *   dy        vertical nudge
 *   scale     overall size
 *   lamp      lamp color
 *   fade      [inT, outT] — the window over which it fades out
 */
export class Beacon {
  constructor(host, opts = {}) {
    const {
      at = 0,
      angle = 0.46,
      radius = 26,
      dy = -2.4,
      scale = 0.9,
      lamp = PALETTE.accentWarm,
      fade = [0.03, 0.17],
      // Realms other than the abyss place it explicitly instead of deriving
      // the position from the water column's geometry.
      position = null,
      faces = null,
      accent: accentHex = PALETTE.accent,
    } = opts;

    this.host = host;
    this.fade = fade;
    this.at = at;
    this.object3D = new THREE.Group();

    if (position) {
      this.object3D.position.copy(position);
      this.object3D.lookAt(faces ?? new THREE.Vector3(0, position.y, 0));
    } else {
      const theta = thetaAt(at) + angle;
      const y = journeyY(at);
      this.object3D.position.set(Math.cos(theta) * radius, y + dy, Math.sin(theta) * radius);
      this.object3D.lookAt(Math.cos(thetaAt(at)) * CAM_R, y, Math.sin(thetaAt(at)) * CAM_R);
    }
    this.object3D.scale.setScalar(scale);

    const accent = new THREE.Color(accentHex);
    const lampColor = new THREE.Color(lamp);

    // ---- the lamp
    this.glow = new THREE.Mesh(
      new THREE.SphereGeometry(0.9, 24, 18),
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        uniforms: { uTime: { value: 0 }, uColor: { value: lampColor }, uOpacity: { value: 1 } },
        vertexShader: /* glsl */ `
          varying vec3 vN; varying vec3 vP;
          void main(){
            vN = normalize(normalMatrix * normal);
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vP = mv.xyz;
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime, uOpacity; uniform vec3 uColor;
          varying vec3 vN; varying vec3 vP;
          void main(){
            // Bright, tight core with a fresnel skirt — a lamp, not a planet.
            float f = pow(1.0 - abs(dot(normalize(vN), normalize(-vP))), 2.2);
            float pulse = 0.8 + 0.2 * sin(uTime * 1.7);
            float a = (0.2 + f * 0.6) * pulse * uOpacity;
            gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.3 + f * 0.45) * a * 3.0, a * 0.85);
          }
        `,
      })
    );
    this.object3D.add(this.glow);

    // ---- faceted hull, inner and outer
    this.shells = [
      [2.0, 1, 0.36],
      [2.9, 0, 0.15],
    ].map(([r, detail, opacity]) => {
      const m = new THREE.Mesh(
        new THREE.IcosahedronGeometry(r, detail),
        new THREE.MeshBasicMaterial({
          color: accent,
          wireframe: true,
          transparent: true,
          opacity,
          fog: false,
        })
      );
      m.userData.baseOpacity = opacity;
      this.object3D.add(m);
      return m;
    });

    // ---- gimbal rings
    this.rings = [];
    for (let i = 0; i < 3; i++) {
      const opacity = 0.4 - i * 0.08;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(3.4 + i * 0.62, 0.026, 6, 96),
        new THREE.MeshBasicMaterial({
          color: i === 1 ? lampColor : accent,
          transparent: true,
          opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        })
      );
      ring.rotation.set(Math.random() * 2, Math.random() * 2, Math.random() * 2);
      ring.userData.axis = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();
      ring.userData.speed = 0.08 + Math.random() * 0.16;
      ring.userData.baseOpacity = opacity;
      this.rings.push(ring);
      this.object3D.add(ring);
    }

    // ---- instrument spikes
    this.spikeMat = new THREE.MeshBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.5,
      fog: false,
    });
    this.spikeMat.userData = { baseOpacity: 0.5 };
    for (let i = 0; i < 11; i++) {
      const len = 0.7 + Math.random() * 1.5;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.006, len, 4), this.spikeMat);
      const dir = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.5,
        Math.random() - 0.5
      ).normalize();
      s.position.copy(dir).multiplyScalar(2.0 + len / 2);
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      this.object3D.add(s);
    }
  }

  update(dt, elapsed) {
    const t = this.host.t;
    if (!this.fade) {
      this._apply(1, dt, elapsed);
      return;
    }
    const [a, b] = this.fade;
    // Visible in a window around its own position; `fade` is authored so the
    // sea-floor beacon fades out as you leave and the orbital one fades in.
    const vis =
      a < b
        ? 1 - THREE.MathUtils.smoothstep(t, a, b)
        : THREE.MathUtils.smoothstep(t, b, a);

    this._apply(vis, dt, elapsed);
  }

  _apply(vis, dt, elapsed) {
    this.object3D.visible = vis > 0.01;
    if (!this.object3D.visible) return;

    const drift = this.host.world.reducedMotion ? 0 : 1;
    this.glow.material.uniforms.uTime.value = elapsed;
    this.glow.material.uniforms.uOpacity.value = vis;

    this.shells[0].rotation.y += dt * 0.09 * drift;
    this.shells[0].rotation.x += dt * 0.03 * drift;
    this.shells[1].rotation.y -= dt * 0.05 * drift;
    for (const s of this.shells) s.material.opacity = s.userData.baseOpacity * vis;

    for (const r of this.rings) {
      r.rotateOnAxis(r.userData.axis, dt * r.userData.speed * drift);
      r.material.opacity = r.userData.baseOpacity * vis;
    }
    this.spikeMat.opacity = this.spikeMat.userData.baseOpacity * vis;
  }
}
