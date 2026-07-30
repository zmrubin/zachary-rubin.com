import * as THREE from 'three';
import { Realm } from '../core/Realm.js';
import { NOISE_GLSL } from '../core/theme.js';
import { Nodes } from '../layers/Nodes.js';

const Z0 = 12;
const Z1 = -300;
const zAt = (t) => Z0 + t * (Z1 - Z0);
// Stations sit this far ahead of the camera that's focused on them.
const AHEAD = 30;
const camAt = (t) =>
  new THREE.Vector3(Math.sin(t * Math.PI * 2.7) * 2.2, Math.cos(t * Math.PI * 2.1) * 1.6, zAt(t));

// The lattice is a jittered 3D grid; the camera flies down its middle.
const CELL = 9;
const NX = 7;
const NY = 5;
const NZ = 34;

/**
 * LatticeRealm — a compute volume. A jittered 3D graph of nodes and edges with
 * packets running along them, and a skeletal figure at the centre that keeps
 * re-evolving: the ML-morphologies work, made literal.
 *
 * Motion: `graph`. Straight flight through the middle of the structure with a
 * slow roll, so the lattice wheels around you.
 */
export class LatticeRealm extends Realm {
  build(stations, loader) {
    super.build(stations, loader);
    const q = this.world.quality;

    this._points = this._layout(q === 'high' ? 1 : 0.55);
    this._buildVoid();
    this._buildVertices();
    this._buildEdges(q === 'high' ? 2600 : 1100);
    this._buildMorphology();

    this.nodes = this.addLayer(new Nodes(this, stations, loader));
    this._fog = new THREE.Color('#01100a');
  }

  /** Jittered grid positions, skipping a tube down the middle for the camera. */
  _layout(density) {
    const pts = [];
    for (let ix = 0; ix < NX; ix++) {
      for (let iy = 0; iy < NY; iy++) {
        for (let iz = 0; iz < NZ; iz++) {
          if (Math.random() > density) continue;
          const x = (ix - (NX - 1) / 2) * CELL + (Math.random() - 0.5) * 3.4;
          const y = (iy - (NY - 1) / 2) * CELL + (Math.random() - 0.5) * 3.4;
          const z = Z0 - iz * ((Z0 - Z1) / (NZ - 1)) + (Math.random() - 0.5) * 3.4;
          // Keep a clear corridor so the camera never flies through a vertex.
          if (Math.hypot(x, y) < 5.5) continue;
          pts.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    return pts;
  }

  // ------------------------------------------------------------------- void
  _buildVoid() {
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
          // Near-black, with a faint green wash ahead and a slow scanning band.
          float ahead = pow(max(-vDir.z, 0.0), 3.0);
          vec3 col = vec3(0.002, 0.008, 0.006);
          col += uAccent * ahead * 0.045;
          float band = exp(-pow(vDir.y * 6.0 - sin(uTime * 0.25) * 2.0, 2.0));
          col += uAccent * band * 0.02;
          col += uAccent * fbm(vDir.xy * 3.0 + uTime * 0.02) * 0.014;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const s = new THREE.Mesh(new THREE.SphereGeometry(280, 24, 24), mat);
    s.frustumCulled = false;
    s.renderOrder = -1000;
    this.voidMat = mat;
    this.voidMesh = s;
    this.object3D.add(s);
  }

  // --------------------------------------------------------------- vertices
  _buildVertices() {
    const n = this._points.length;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    this._points.forEach((p, i) => {
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
      seed[i] = Math.random();
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uAccent: { value: this.accent },
        uWarm: { value: this.accentWarm },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime, uPixelRatio;
        varying float vAlpha;
        varying float vSeed;
        varying float vFire;
        void main(){
          vec3 p = position;
          p.x += sin(uTime * 0.3 + aSeed * 30.0) * 0.5;
          p.y += cos(uTime * 0.26 + aSeed * 19.0) * 0.5;

          vec4 mv = viewMatrix * vec4(p, 1.0);
          float d = -mv.z;
          gl_Position = projectionMatrix * mv;

          // Vertices "fire" periodically, like activations.
          vFire = pow(max(0.0, sin(uTime * 1.1 + aSeed * 44.0)), 22.0);
          gl_PointSize = (1.4 + vFire * 4.5) * uPixelRatio * (110.0 / max(d, 1.0));
          vAlpha = smoothstep(2.0, 12.0, d) * (1.0 - smoothstep(90.0, 190.0, d));
          vSeed = aSeed;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uAccent, uWarm;
        varying float vAlpha;
        varying float vSeed;
        varying float vFire;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float core = exp(-d * d * 26.0);
          float halo = exp(-d * d * 5.0) * 0.3;
          vec3 col = mix(uAccent, uWarm, vFire * 0.8);
          float a = (core + halo) * vAlpha * (0.22 + vFire * 0.8);
          if (a < 0.003) discard;
          gl_FragColor = vec4(col * a * 2.2, a);
        }
      `,
    });

    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.vertexMat = mat;
    this.object3D.add(pts);
  }

  // ------------------------------------------------------------------ edges
  /** Connect nearby vertices, with packets running along each edge. */
  _buildEdges(maxEdges) {
    const pts = this._points;
    const positions = [];
    const along = [];
    const seeds = [];

    const maxDist = CELL * 1.5;
    outer: for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        if (pts[i].distanceTo(pts[j]) > maxDist) continue;
        positions.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z);
        const s = Math.random();
        along.push(0, 1);
        seeds.push(s, s);
        if (positions.length / 6 >= maxEdges) break outer;
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
        varying float vFade;
        void main(){
          vAlong = aAlong;
          vSeed = aSeed;
          vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
          float d = -mv.z;
          vFade = smoothstep(2.0, 14.0, d) * (1.0 - smoothstep(70.0, 160.0, d));
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uAccent, uWarm;
        varying float vAlong;
        varying float vSeed;
        varying float vFade;
        void main(){
          // Faint wire, plus a packet sliding from one end to the other.
          float head = fract(uTime * (0.22 + vSeed * 0.5) + vSeed * 9.0);
          float packet = exp(-pow((vAlong - head) * 9.0, 2.0));
          vec3 col = uAccent * 0.16 + mix(uAccent, uWarm, 0.4) * packet * 2.2;
          float a = (0.055 + packet * 0.85) * vFade;
          if (a < 0.003) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
    });

    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    this.edgeMat = mat;
    this.object3D.add(lines);
  }

  // ------------------------------------------------------------- morphology
  /**
   * A skeletal creature at the centre of the volume, rebuilt continuously from
   * a handful of limb segments — the evolutionary-robotics work as a mascot.
   */
  _buildMorphology() {
    const g = new THREE.Group();
    g.position.set(0, 0, (Z0 + Z1) * 0.5);

    const mat = new THREE.MeshBasicMaterial({
      color: this.accent,
      transparent: true,
      opacity: 0.5,
      fog: false,
    });
    const jointMat = new THREE.MeshBasicMaterial({
      color: this.accentWarm,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });

    this.limbs = [];
    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 1.1), mat);
    g.add(torso);
    this.torso = torso;

    // Four limbs, each two segments, hung off the torso corners.
    for (let i = 0; i < 4; i++) {
      const hip = new THREE.Group();
      const sx = i < 2 ? -1 : 1;
      const sy = i % 2 === 0 ? 1 : -1;
      hip.position.set(sx * 0.9, sy * 1.0, 0);
      g.add(hip);

      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 2.0, 6), mat);
      upper.position.y = -1.0;
      hip.add(upper);

      const knee = new THREE.Group();
      knee.position.y = -2.0;
      hip.add(knee);

      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 1.8, 6), mat);
      lower.position.y = -0.9;
      knee.add(lower);

      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), jointMat);
      foot.position.y = -1.8;
      knee.add(foot);

      this.limbs.push({ hip, knee, phase: i * 1.7, sx, sy });
    }

    this.morph = g;
    this.morphMat = mat;
    this.object3D.add(g);
  }

  // ---------------------------------------------------------------- motion
  placeCamera(camera, t, ctx) {
    const drift = ctx.reducedMotion ? 0 : 1;
    const z = zAt(t);

    // Weave through the lattice rather than flying dead straight.
    const x = Math.sin(t * Math.PI * 2.7) * 2.2;
    const y = Math.cos(t * Math.PI * 2.1) * 1.6;
    camera.position.set(x, y, z);

    const yaw = -Math.PI / 2 + Math.cos(t * Math.PI * 2.7) * 0.12 + ctx.mouse.x * 0.09;
    const pitch = -Math.sin(t * Math.PI * 2.1) * 0.06 - ctx.mouse.y * 0.07;
    const d = 60;
    camera.lookAt(
      camera.position.x + Math.cos(yaw) * Math.cos(pitch) * d,
      camera.position.y + Math.sin(pitch) * d,
      camera.position.z + Math.sin(yaw) * Math.cos(pitch) * d
    );
    // Slow continuous roll: there's no "up" in a compute volume.
    camera.rotateZ(Math.sin(ctx.elapsed * 0.13) * 0.18 * drift + t * 0.4);
  }

  nodeTransform(section, index, at, crossLink) {
    // Spiral the stations around the flight path so they arrive from all sides,
    // set ahead of the camera so each is square in frame on approach.
    const ang = index * 2.1 + 0.6;
    const r = crossLink ? 11 : 8.5;
    const eye = camAt(at);
    return {
      position: new THREE.Vector3(
        eye.x + Math.cos(ang) * r,
        eye.y + Math.sin(ang) * r * 0.8,
        zAt(at) - AHEAD
      ),
      faces: eye,
      scale: crossLink ? 1.1 : 1.35,
    };
  }

  applyAtmosphere(scene, t) {
    scene.fog.color.copy(this._fog);
    scene.fog.density = 0.009;
  }

  update(dt, elapsed, ctx) {
    super.update(dt, elapsed, ctx);
    const cam = this.world.camera;
    this.voidMesh.position.copy(cam.position);
    for (const m of [this.voidMat, this.vertexMat, this.edgeMat]) {
      if (m?.uniforms.uTime) m.uniforms.uTime.value = elapsed;
    }

    // Gait cycle plus a slow mutation of the limb proportions.
    if (this.morph && !this.reducedMotion) {
      this.morph.rotation.y = elapsed * 0.25;
      const mutate = Math.sin(elapsed * 0.12);
      for (const l of this.limbs) {
        const ph = elapsed * 2.2 + l.phase;
        l.hip.rotation.x = Math.sin(ph) * 0.55;
        l.knee.rotation.x = Math.max(0, Math.sin(ph + 1.1)) * 0.9;
        l.hip.scale.setScalar(0.85 + mutate * 0.15 * l.sx);
      }
      this.torso.rotation.z = Math.sin(elapsed * 1.1) * 0.06;
    }
  }

  // --------------------------------------------------------------- readout
  readout(t) {
    const gen = Math.round(120 + t * 8600);
    return {
      value: `gen ${gen}`,
      zone: `${(0.42 + t * 0.55).toFixed(3)} fitness`,
      code: 'COMPUTE VOLUME',
      axis: 'Generation',
    };
  }

  get axisEnds() {
    return ['Seed', 'Converged'];
  }

  get axisTicks() {
    return Array.from({ length: 9 }, (_, i) => ({
      at: i / 8,
      label: `${Math.round(120 + (i / 8) * 8600)}`,
    }));
  }
}
