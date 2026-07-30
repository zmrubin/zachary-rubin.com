import * as THREE from 'three';
import { Realm } from '../core/Realm.js';
import { NOISE_GLSL } from '../core/theme.js';
import { Nodes } from '../layers/Nodes.js';
import { Starfield } from '../layers/Starfield.js';
import { Beacon } from '../layers/Beacon.js';

const R_EARTH = 2600;
const ALT = 320; // camera altitude above the surface
const TURNS = 0.55; // how far around the planet one pass takes

/**
 * OrbitRealm — low earth orbit. The planet's limb below, the terminator ahead,
 * hard sunlight and hard shadow, and the beacon motif returning as a satellite.
 *
 * Motion: `orbit`. The camera flies a circular track above the surface with the
 * planet always beneath, so progress reads as ground track rather than depth.
 */
export class OrbitRealm extends Realm {
  build(stations, loader) {
    super.build(stations, loader);
    const q = this.world.quality;

    this._buildSpace();
    this._buildPlanet();
    this.addLayer(new Starfield(this, q === 'high' ? 3400 : 1500, { always: true }));
    this._buildArcs();

    // The motif returns, cold-lamped and sunlit, closing the loop.
    this.addLayer(
      new Beacon(this, {
        position: new THREE.Vector3(0, R_EARTH + ALT + 16, 0),
        faces: new THREE.Vector3(0, R_EARTH + ALT, 40),
        scale: 1.1,
        lamp: '#dff2ff',
        accent: this.meta.accent,
        fade: null,
      })
    );

    this.nodes = this.addLayer(new Nodes(this, stations, loader));
    this._fog = new THREE.Color('#01030a');
  }

  /** Camera position on the orbital track at `t`. */
  _trackPos(t, out = new THREE.Vector3()) {
    const a = -0.35 + t * TURNS * Math.PI * 2;
    const r = R_EARTH + ALT;
    return out.set(Math.sin(a) * r, Math.cos(a) * r, 0);
  }

  // ------------------------------------------------------------------ space
  _buildSpace() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vDir;
        ${NOISE_GLSL}
        void main(){
          // Deep space with a whisper of zodiacal light and milky-way dust.
          vec3 col = vec3(0.0018, 0.0026, 0.006);
          float band = exp(-pow((vDir.y * 2.2 + vDir.x * 0.6), 2.0) * 3.0);
          col += vec3(0.02, 0.022, 0.038) * band * (0.5 + fbm(vDir.xz * 4.0) * 0.9);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const s = new THREE.Mesh(new THREE.SphereGeometry(4200, 24, 24), mat);
    s.frustumCulled = false;
    s.renderOrder = -1000;
    this.spaceMat = mat;
    this.space = s;
    this.object3D.add(s);
  }

  // ----------------------------------------------------------------- planet
  _buildPlanet() {
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(R_EARTH, 120, 80),
      new THREE.ShaderMaterial({
        fog: false,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vN;
          varying vec3 vPos;
          void main(){
            vN = normalize(mat3(modelMatrix) * normal);
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uTime;
          varying vec3 vN;
          varying vec3 vPos;
          ${NOISE_GLSL}
          void main(){
            vec3 n = normalize(vN);
            vec3 sun = normalize(vec3(0.62, 0.30, -0.72));
            float lam = max(dot(n, sun), 0.0);

            // Continents and cloud, in a stable projection on the sphere.
            vec2 sp = vec2(atan(n.z, n.x) * 2.2, n.y * 3.4);
            float land = smoothstep(0.52, 0.68, fbm(sp * 2.2 + 4.0));
            float ice = smoothstep(0.72, 0.95, abs(n.y));
            float cloud = smoothstep(0.48, 0.84, fbm(sp * 3.4 - vec2(uTime * 0.004, 0.0)));

            vec3 ocean = vec3(0.012, 0.055, 0.17);
            vec3 earth = mix(vec3(0.07, 0.10, 0.07), vec3(0.16, 0.13, 0.08), fbm(sp * 6.0));
            vec3 col = mix(ocean, earth, land);
            col = mix(col, vec3(0.86, 0.90, 0.94), ice * 0.8);
            col = mix(col, vec3(0.92, 0.94, 0.97), cloud * 0.62);
            col *= 0.03 + lam * 1.35;

            // Night side: city light along the coasts.
            float night = 1.0 - lam;
            col += vec3(1.0, 0.66, 0.32) * night * land *
                   smoothstep(0.70, 0.96, fbm(sp * 11.0)) * 0.16;

            // Atmospheric rim, strongest on the terminator.
            vec3 v = normalize(cameraPosition - vPos);
            float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
            col += vec3(0.24, 0.5, 1.0) * fres * (0.2 + lam * 1.0);

            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
    );
    this.globeMat = globe.material;
    this.object3D.add(globe);

    // Outer atmosphere shell for the limb glow.
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(R_EARTH * 1.022, 96, 48),
      new THREE.ShaderMaterial({
        fog: false,
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {},
        vertexShader: /* glsl */ `
          varying vec3 vN;
          varying vec3 vPos;
          void main(){
            vN = normalize(mat3(modelMatrix) * normal);
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vPos = wp.xyz;
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vN;
          varying vec3 vPos;
          void main(){
            vec3 v = normalize(cameraPosition - vPos);
            float f = pow(max(dot(-vN, v), 0.0), 2.6);
            vec3 sun = normalize(vec3(0.62, 0.30, -0.72));
            float lam = max(dot(-vN, sun), 0.0);
            float a = f * (0.10 + lam * 0.85);
            gl_FragColor = vec4(vec3(0.3, 0.6, 1.0) * a * 1.7, a);
          }
        `,
      })
    );
    this.object3D.add(halo);
  }

  // ------------------------------------------------------------------- arcs
  /** Great-circle flight paths between the places the passport has been. */
  _buildArcs() {
    const cities = [
      [34.4, -119.7], // Santa Barbara
      [34.7, 135.5], // Osaka
      [45.5, 9.2], // Milan
      [37.6, 127.0], // Seoul
      [22.3, 114.2], // Hong Kong
      [25.8, -80.2], // Miami
    ];
    const toVec = ([latDeg, lonDeg]) => {
      const lat = (latDeg * Math.PI) / 180;
      const lon = (lonDeg * Math.PI) / 180;
      return new THREE.Vector3(
        Math.cos(lat) * Math.cos(lon),
        Math.sin(lat),
        Math.cos(lat) * Math.sin(lon)
      );
    };

    const positions = [];
    const along = [];
    const seeds = [];
    const pts = cities.map(toVec);

    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const seed = Math.random();
      const STEPS = 64;
      let prev = null;
      for (let s = 0; s <= STEPS; s++) {
        const k = s / STEPS;
        // Slerp along the great circle, lifted into a shallow arc.
        const p = a.clone().lerp(b, k).normalize();
        const lift = 1 + Math.sin(k * Math.PI) * 0.055;
        p.multiplyScalar(R_EARTH * 1.004 * lift);
        if (prev) {
          positions.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
          along.push((s - 1) / STEPS, k);
          seeds.push(seed, seed);
        }
        prev = p;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('aAlong', new THREE.Float32BufferAttribute(along, 1));
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(seeds, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uAccent: { value: this.accent },
        uWarm: { value: this.accentWarm },
      },
      vertexShader: /* glsl */ `
        attribute float aAlong;
        attribute float aSeed;
        varying float vAlong;
        varying float vSeed;
        void main(){
          vAlong = aAlong;
          vSeed = aSeed;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uAccent, uWarm;
        varying float vAlong;
        varying float vSeed;
        void main(){
          float head = fract(uTime * 0.09 + vSeed * 3.7);
          float trail = clamp((head - vAlong) / 0.22, 0.0, 1.0);
          float shown = step(vAlong, head) * trail;
          float tip = exp(-pow((vAlong - head) * 40.0, 2.0));
          vec3 col = uAccent * 0.7 + uWarm * tip * 2.0;
          float a = shown * 0.32 + tip * 0.9;
          if (a < 0.004) discard;
          gl_FragColor = vec4(col * a * 1.6, a);
        }
      `,
    });

    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    this.arcMat = mat;
    this.object3D.add(lines);
  }

  // ---------------------------------------------------------------- motion
  placeCamera(camera, t, ctx) {
    const drift = ctx.reducedMotion ? 0 : 1;
    const pos = this._trackPos(t);
    camera.position.copy(pos);

    // "Down" is toward the planet; look along the track, pitched at the limb.
    const down = pos.clone().normalize().multiplyScalar(-1);
    const ahead = this._trackPos(t + 0.004).sub(this._trackPos(t)).normalize();

    const pitch = -0.32 - ctx.mouse.y * 0.06;
    const dir = ahead
      .clone()
      .multiplyScalar(Math.cos(pitch))
      .addScaledVector(down, -Math.sin(pitch))
      .normalize();

    // Yaw a little with the mouse, around the local "down" axis.
    dir.applyAxisAngle(down, ctx.mouse.x * 0.08);

    camera.up.copy(down).multiplyScalar(-1);
    camera.lookAt(pos.clone().addScaledVector(dir, 200));
    camera.rotateZ(Math.sin(ctx.elapsed * 0.15) * 0.01 * drift);
  }

  exit() {
    super.exit();
    // Leave the shared camera's up vector as we found it.
    this.world.camera.up.set(0, 1, 0);
  }

  nodeTransform(section, index, at, crossLink) {
    const pos = this._trackPos(at);
    const up = pos.clone().normalize();
    const ahead = this._trackPos(at + 0.004).sub(this._trackPos(at)).normalize();
    const side = up.clone().cross(ahead).normalize();

    // Ahead along the track, modestly to one side, and dropped to meet the
    // camera's downward pitch — otherwise a station sits above the frame.
    const AHEAD = 34;
    const PITCH = 0.32;
    const offset = (index % 2 === 0 ? 1 : -1) * (crossLink ? 15 : 11);
    const lift = -Math.tan(PITCH) * AHEAD + (crossLink ? -2 : 1.5);

    const p = pos
      .clone()
      .addScaledVector(side, offset)
      .addScaledVector(ahead, AHEAD)
      .addScaledVector(up, lift);

    return { position: p, faces: pos, scale: crossLink ? 1.1 : 1.3 };
  }

  applyAtmosphere(scene, t) {
    scene.fog.color.copy(this._fog);
    scene.fog.density = 0.0;
  }

  update(dt, elapsed, ctx) {
    super.update(dt, elapsed, ctx);
    this.space.position.copy(this.world.camera.position);
    if (this.globeMat) this.globeMat.uniforms.uTime.value = elapsed;
    if (this.spaceMat) this.spaceMat.uniforms.uTime.value = elapsed;
    if (this.arcMat) this.arcMat.uniforms.uTime.value = elapsed;
  }

  // --------------------------------------------------------------- readout
  readout(t) {
    const lon = Math.round(-20 + t * TURNS * 360);
    return {
      value: `+${ALT} km`,
      zone: `${Math.abs(lon)}° ${lon < 0 ? 'W' : 'E'}`,
      code: 'LOW EARTH ORBIT',
      axis: 'Ground track',
    };
  }

  get axisEnds() {
    return ['Insertion', 'Ground station'];
  }

  get axisTicks() {
    return Array.from({ length: 7 }, (_, i) => ({
      at: i / 6,
      label: `${Math.round(-20 + (i / 6) * TURNS * 360)}°`,
    }));
  }
}
