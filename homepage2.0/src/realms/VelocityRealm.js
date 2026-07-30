import * as THREE from 'three';
import { Realm } from '../core/Realm.js';
import { NOISE_GLSL } from '../core/theme.js';
import { Nodes } from '../layers/Nodes.js';

const Z0 = 20;
const Z1 = -520;
const EYE = 1.75;
const zAt = (t) => Z0 + t * (Z1 - Z0);
// Stations sit this far up the road from the camera that's focused on them.
const AHEAD = 52;
const camAt = (t) => new THREE.Vector3(Math.sin(t * Math.PI * 2.4) * 2.6, EYE, zAt(t));

/**
 * VelocityRealm — a night proving ground. Low, fast, and wide: a dark surface
 * rushing underneath, sodium light standards flicking past, a warm horizon glow
 * where the track disappears.
 *
 * Motion: `run`. The camera sits low and travels a long way per unit of scroll,
 * so this realm feels quick even at the same input speed as the others.
 */
export class VelocityRealm extends Realm {
  build(stations, loader) {
    super.build(stations, loader);
    const q = this.world.quality;

    this._buildSky();
    this._buildGround();
    this._buildStreaks(q === 'high' ? 260 : 110);
    this._buildStandards(q === 'high' ? 26 : 14);
    this._buildGrit(q === 'high' ? 1400 : 600);

    this.nodes = this.addLayer(new Nodes(this, stations, loader));
    this._fog = new THREE.Color('#05060c');
  }

  // -------------------------------------------------------------------- sky
  _buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: { uTime: { value: 0 }, uAccent: { value: this.accent } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uAccent;
        varying vec3 vDir;
        ${NOISE_GLSL}
        void main(){
          float up = clamp(vDir.y, -1.0, 1.0);

          // Night sky: near-black overhead, warming toward the horizon.
          vec3 top = vec3(0.006, 0.008, 0.020);
          vec3 mid = vec3(0.020, 0.024, 0.048);
          vec3 col = mix(mid, top, smoothstep(0.0, 0.75, up));

          // Sodium haze sitting on the horizon, brightest dead ahead.
          float horizon = exp(-up * up * 90.0);
          float ahead = pow(max(-vDir.z, 0.0), 2.0);
          col += uAccent * horizon * (0.05 + ahead * 0.22);
          col += vec3(0.55, 0.22, 0.06) * horizon * (0.03 + ahead * 0.10);

          // A low ridge line breaking up the horizon.
          float ridge = fbm(vec2(atan(vDir.z, vDir.x) * 2.6, 0.0)) * 0.045;
          col *= 1.0 - smoothstep(ridge + 0.004, ridge - 0.004, up) * 0.55;

          // Sparse stars above the haze.
          float st = smoothstep(0.985, 1.0, hash21(floor(vDir.xz * 260.0)));
          col += vec3(0.7, 0.78, 0.95) * st * smoothstep(0.06, 0.4, up) * 0.7;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 32), mat);
    sky.frustumCulled = false;
    sky.renderOrder = -1000;
    this.skyMat = mat;
    this.sky = sky;
    this.object3D.add(sky);
  }

  // ----------------------------------------------------------------- ground
  _buildGround() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 }, uAccent: { value: this.accent } },
      vertexShader: /* glsl */ `
        varying vec2 vP;
        varying vec3 vWorld;
        void main(){
          vP = position.xy;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uAccent;
        varying vec2 vP;
        varying vec3 vWorld;
        ${NOISE_GLSL}
        void main(){
          float dist = length(vWorld - cameraPosition);
          float x = vP.x;
          float z = vP.y;

          // Coarse asphalt.
          float grain = fbm(vP * 1.4);
          vec3 col = vec3(0.016, 0.017, 0.021) * (0.6 + grain * 1.1);

          // Centreline: long dashes.
          float dash = step(0.42, fract(z * 0.055));
          col += uAccent * dash * exp(-x * x * 5.0) * 0.55;

          // Lane edges.
          float lane = exp(-pow(abs(x) - 7.0, 2.0) * 5.0);
          col += vec3(0.55, 0.56, 0.6) * lane * 0.22;

          // Chevrons in the run-off either side, pointing the way.
          float band = smoothstep(9.0, 10.0, abs(x)) * (1.0 - smoothstep(15.0, 17.0, abs(x)));
          float chev = step(0.6, fract(z * 0.09 + abs(x) * 0.06));
          col += uAccent * band * chev * 0.16;

          // Reflected light standards smeared along the wet surface.
          float pole = exp(-pow(mod(z + 15.0, 30.0) - 15.0, 2.0) * 0.02);
          col += uAccent * pole * exp(-pow(abs(x) - 8.5, 2.0) * 0.06) * 0.3;

          float a = 1.0 - smoothstep(120.0, 300.0, dist);
          if (a < 0.004) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
    });

    const g = new THREE.Mesh(new THREE.PlaneGeometry(90, 620, 20, 100), mat);
    g.rotation.x = -Math.PI / 2;
    g.position.set(0, 0, (Z0 + Z1) / 2);
    this.groundMat = mat;
    this.object3D.add(g);
  }

  // ---------------------------------------------------------------- streaks
  /** Long thin light trails flying past — the core sensation of speed. */
  _buildStreaks(count) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uCamZ: { value: 0 },
        uSpeed: { value: 0 },
        uAccent: { value: this.accent },
        uWarm: { value: this.accentWarm },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aOffset;   // x, y, seed
        uniform float uTime, uCamZ, uSpeed;
        varying vec2 vUv;
        varying float vSeed;
        varying float vFade;
        void main(){
          vUv = uv;
          vSeed = aOffset.z;

          float span = 220.0;
          // Wrap each streak into a band that follows the camera down the track.
          float z = mod(aOffset.z * span - uCamZ, span) + uCamZ - span * 0.75;

          // Length grows with travel speed — at rest they're dots, at speed lines.
          float len = 2.0 + uSpeed * 130.0 + aOffset.z * 6.0;
          vec3 p = vec3(aOffset.x, aOffset.y, z + position.y * len);
          p.x += position.x * 0.09;

          vec4 mv = viewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          vFade = smoothstep(3.0, 18.0, d) * (1.0 - smoothstep(90.0, 200.0, d));
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uAccent, uWarm;
        varying vec2 vUv;
        varying float vSeed;
        varying float vFade;
        void main(){
          // Bright head fading to a tail.
          float along = smoothstep(0.0, 1.0, vUv.y);
          float across = 1.0 - abs(vUv.x - 0.5) * 2.0;
          float a = across * across * along * vFade * 0.7;
          if (a < 0.004) discard;
          vec3 col = mix(uWarm, uAccent, fract(vSeed * 7.3));
          gl_FragColor = vec4(col * a * 2.6, a);
        }
      `,
    });

    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const off = new Float32Array(count * 3);
    const m = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      off[i * 3] = side * (6 + Math.random() * 26);
      off[i * 3 + 1] = 0.4 + Math.random() * 9;
      off[i * 3 + 2] = Math.random();
      mesh.setMatrixAt(i, m.identity());
    }
    mesh.instanceMatrix.needsUpdate = true;
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
    mesh.frustumCulled = false;
    this.streakMat = mat;
    this.object3D.add(mesh);
  }

  // -------------------------------------------------------------- standards
  /** Light standards down both sides: a lamp head plus its glow. */
  _buildStandards(count) {
    const geo = new THREE.PlaneGeometry(2.2, 2.2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: { uTime: { value: 0 }, uWarm: { value: this.accentWarm } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vDist;
        void main(){
          vUv = uv;
          vec4 centre = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec3 toCam = normalize(cameraPosition - centre.xyz);
          vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), toCam));
          vec3 up = cross(toCam, right);
          vec3 wp = centre.xyz + right * position.x + up * position.y;
          vDist = length(wp - cameraPosition);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uWarm;
        varying vec2 vUv;
        varying float vDist;
        void main(){
          vec2 c = vUv - 0.5;
          float r = length(c);
          float core = exp(-r * r * 120.0);
          float halo = exp(-r * r * 9.0) * 0.45;
          float a = (core + halo) * (1.0 - smoothstep(120.0, 260.0, vDist));
          if (a < 0.004) discard;
          gl_FragColor = vec4(mix(uWarm, vec3(1.0), core * 0.7) * a * 2.6, a);
        }
      `,
    });

    const total = count * 2;
    const mesh = new THREE.InstancedMesh(geo, mat, total);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let k = 0; k < count; k++) {
      const z = Z0 - k * 30;
      for (const side of [-1, 1]) {
        m.makeTranslation(side * 9.5, 8.5, z);
        mesh.setMatrixAt(i++, m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    this.standardMat = mat;
    this.object3D.add(mesh);
  }

  // ------------------------------------------------------------------ grit
  /** Dust and insects in the headlight wash. */
  _buildGrit(count) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = Math.random() * 12;
      pos[i * 3 + 2] = 0;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uCamZ: { value: 0 },
        uAccent: { value: this.accent },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime, uCamZ, uPixelRatio;
        varying float vAlpha;
        void main(){
          vec3 p = position;
          float span = 70.0;
          p.z = mod(aSeed * span - uCamZ, span) + uCamZ - span * 0.6;
          p.x += sin(uTime * 0.9 + aSeed * 40.0) * 0.6;
          vec4 mv = viewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.4 + aSeed * 0.8) * uPixelRatio * (80.0 / max(d, 1.0));
          vAlpha = smoothstep(1.5, 7.0, d) * (1.0 - smoothstep(24.0, 55.0, d));
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uAccent;
        varying float vAlpha;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = exp(-d * d * 20.0) * vAlpha * 0.16;
          if (a < 0.002) discard;
          gl_FragColor = vec4(uAccent * a * 1.8, a);
        }
      `,
    });

    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.gritMat = mat;
    this.object3D.add(pts);
  }

  // ---------------------------------------------------------------- motion
  placeCamera(camera, t, ctx) {
    const drift = ctx.reducedMotion ? 0 : 1;
    const z = zAt(t);

    // Drift between lanes, leaning into it like a rider.
    const lane = Math.sin(t * Math.PI * 2.4) * 2.6;
    const bob = Math.sin(ctx.elapsed * 3.1) * 0.035 * drift;

    camera.position.set(lane, EYE + bob, z);

    const yaw = -Math.PI / 2 + Math.cos(t * Math.PI * 2.4) * 0.1 + ctx.mouse.x * 0.07;
    const pitch = 0.02 - ctx.mouse.y * 0.05;
    const d = 80;
    camera.lookAt(
      camera.position.x + Math.cos(yaw) * Math.cos(pitch) * d,
      camera.position.y + Math.sin(pitch) * d,
      camera.position.z + Math.sin(yaw) * Math.cos(pitch) * d
    );
    // Bank into the lane change; speed adds to the lean.
    camera.rotateZ(-Math.cos(t * Math.PI * 2.4) * 0.05 * drift - ctx.velocity * 0.12);
  }

  nodeTransform(section, index, at, crossLink) {
    const side = index % 2 === 0 ? 1 : -1;
    const eye = camAt(at);
    const z = zAt(at) - AHEAD;
    return {
      position: new THREE.Vector3(side * (crossLink ? 15 : 12), crossLink ? 5.4 : 6.2, z),
      faces: eye,
      scale: crossLink ? 1.2 : 1.5,
    };
  }

  applyAtmosphere(scene, t) {
    scene.fog.color.copy(this._fog);
    scene.fog.density = 0.006;
  }

  update(dt, elapsed, ctx) {
    super.update(dt, elapsed, ctx);
    const cam = this.world.camera;
    this.sky.position.copy(cam.position);
    for (const m of [
      this.skyMat,
      this.groundMat,
      this.streakMat,
      this.standardMat,
      this.gritMat,
    ]) {
      if (m?.uniforms.uTime) m.uniforms.uTime.value = elapsed;
      if (m?.uniforms.uCamZ) m.uniforms.uCamZ.value = cam.position.z;
    }
    // Streaks stretch with how fast you're actually travelling.
    if (this.streakMat) {
      const u = this.streakMat.uniforms.uSpeed;
      u.value += (Math.min(Math.abs(ctx?.velocity ?? 0), 1.2) - u.value) * Math.min(1, dt * 5);
    }
  }

  // --------------------------------------------------------------- readout
  readout(t) {
    const km = (t * 6.4).toFixed(2);
    const kph = Math.round(60 + Math.abs(this.rail?.velocity ?? 0) * 900);
    return {
      value: `${km} km`,
      zone: `${kph} km/h`,
      code: 'PROVING GROUND',
      axis: 'Distance',
    };
  }

  get axisEnds() {
    return ['Start line', 'Far marker'];
  }

  get axisTicks() {
    return Array.from({ length: 9 }, (_, i) => ({
      at: i / 8,
      label: `${((i / 8) * 6.4).toFixed(1)} km`,
    }));
  }
}
