import * as THREE from 'three';
import { Realm } from '../core/Realm.js';
import { NOISE_GLSL } from '../core/theme.js';
import { Nodes } from '../layers/Nodes.js';

// The hall runs along -Z. `t` maps onto this span.
const Z0 = 14;
const Z1 = -236;
const HALF_W = 15; // distance from centreline to each wall
const CEIL = 13;
const EYE = 2.6;

const zAt = (t) => Z0 + t * (Z1 - Z0);
// How far down the hall a station sits ahead of the camera that's focused on it.
// In a forward-travelling realm a station at the camera's own z would be exactly
// 90 degrees to the side and never actually seen.
const AHEAD = 24;
/** Camera position at journey position `t`, without the per-frame bob. */
const camAt = (t) => new THREE.Vector3(Math.sin(t * Math.PI * 3.1) * 3.4, EYE, zAt(t));

/**
 * FoundryRealm — a robotics hall. Dark steel, warm work light, and the sense of
 * a very large indoor space with a floor you could drop a wrench on.
 *
 * Motion: `hall`. The camera walks the centreline looking forward, with a slow
 * weave and a little head-bob, so stations pass on alternating sides.
 *
 * Everything is procedural: the floor plate, wall ribs and overhead gantry are
 * long planes with pattern shaders, and the only real geometry is the lamp
 * instances, the arena cage and the spark field.
 */
export class FoundryRealm extends Realm {
  build(stations, loader) {
    super.build(stations, loader);
    const q = this.world.quality;

    this._buildFloor();
    this._buildWalls();
    this._buildCeiling();
    this._buildLamps(q === 'high' ? 15 : 9);
    this._buildArena();
    this._buildSparks(q === 'high' ? 900 : 340);
    this._buildHaze(q === 'high' ? 1200 : 500);

    this.nodes = this.addLayer(new Nodes(this, stations, loader));
    this._fogColor = new THREE.Color('#0b0906');
  }

  // ------------------------------------------------------------------ floor
  _buildFloor() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uAccent: { value: this.accent },
      },
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

          // Steel deck plate: 2m panels with recessed seams and bolt rows.
          vec2 cell = vP / 6.0;
          vec2 g = abs(fract(cell) - 0.5);
          float seam = smoothstep(0.46, 0.5, max(g.x, g.y));

          // Diamond tread inside each panel.
          vec2 tp = fract(vP * 0.9) - 0.5;
          float tread = smoothstep(0.34, 0.3, abs(tp.x) + abs(tp.y));

          float wear = fbm(vP * 0.06);
          vec3 col = vec3(0.030, 0.028, 0.026) * (0.7 + wear * 0.9);
          col += vec3(0.05, 0.046, 0.042) * tread * 0.5;
          col *= 1.0 - seam * 0.55;

          // Pools of light under the wall lamps, every 16m down both sides.
          float lampZ = abs(fract(vP.y / 16.0 + 0.5) - 0.5) * 16.0;
          float across = 1.0 - smoothstep(2.0, 15.0, abs(vP.x));
          float pool = exp(-lampZ * lampZ * 0.05) * across;
          col += uAccent * pool * 0.30;

          // Wet-looking specular streak along the centreline.
          float centre = exp(-vP.x * vP.x * 0.02);
          col += uAccent * centre * pool * 0.22;

          // Safety hatching along the edges of the walkway.
          float edge = smoothstep(9.5, 10.2, abs(vP.x)) * (1.0 - smoothstep(11.4, 12.0, abs(vP.x)));
          float hatch = step(0.5, fract((vP.y + vP.x) * 0.35));
          col = mix(col, mix(vec3(0.06, 0.05, 0.04), uAccent * 0.5, hatch), edge * 0.5);

          float a = 1.0 - smoothstep(70.0, 190.0, dist);
          if (a < 0.004) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2 + 14, 300, 24, 60), mat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, (Z0 + Z1) / 2);
    this.floorMat = mat;
    this.object3D.add(floor);
  }

  // ------------------------------------------------------------------ walls
  _buildWalls() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
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
          float h = vP.y;   // height up the wall
          float z = vP.x;   // along the hall

          // Structural ribs every 8m, with a shadow either side.
          float rib = exp(-pow(mod(z + 4.0, 8.0) - 4.0, 2.0) * 1.6);
          vec3 col = vec3(0.022, 0.020, 0.019);
          col += vec3(0.030, 0.027, 0.024) * rib;

          // Corrugated cladding between the ribs.
          float corr = sin(z * 3.1) * 0.5 + 0.5;
          col += vec3(0.008) * corr * (1.0 - rib);

          // Grime rising from the floor, cleaner up high.
          col *= 0.55 + 0.75 * smoothstep(0.0, 9.0, h) + fbm(vP * 0.09) * 0.3;

          // Hazard stripe at working height.
          float stripe = (1.0 - smoothstep(1.5, 1.8, abs(h - 1.5)));
          float diag = step(0.5, fract((z + h) * 0.6));
          col = mix(col, mix(vec3(0.05, 0.04, 0.03), uAccent * 0.55, diag), stripe * 0.28);

          // Lamp bloom washing the wall every 16m.
          float lampZ = abs(fract(z / 16.0 + 0.5) - 0.5) * 16.0;
          float lampH = abs(h - 7.0);
          col += uAccent * exp(-lampZ * lampZ * 0.12) * exp(-lampH * lampH * 0.05) * 0.5;

          float a = 1.0 - smoothstep(70.0, 190.0, dist);
          if (a < 0.004) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
    });

    this.wallMat = mat;
    for (const side of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(300, CEIL, 60, 6), mat);
      wall.rotation.y = side * Math.PI * 0.5;
      wall.position.set(side * HALF_W, CEIL / 2, (Z0 + Z1) / 2);
      this.object3D.add(wall);
    }
  }

  // ---------------------------------------------------------------- ceiling
  _buildCeiling() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
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
          float x = vP.x;   // across the hall
          float z = vP.y;   // along it

          vec3 col = vec3(0.012, 0.011, 0.010);

          // Two gantry rails running the length of the hall.
          float rail = exp(-pow(abs(x) - 7.0, 2.0) * 3.0);
          col += vec3(0.045, 0.040, 0.035) * rail;

          // Cross-members every 5m: the roof truss.
          float truss = exp(-pow(mod(z + 2.5, 5.0) - 2.5, 2.0) * 5.0);
          col += vec3(0.030, 0.027, 0.024) * truss * (1.0 - smoothstep(9.0, 11.0, abs(x)));

          // Diagonal bracing in the bays.
          float brace = step(0.86, fract((z * 0.4 + abs(x) * 0.4)));
          col += vec3(0.016) * brace * (1.0 - truss);

          // A crane trolley parked partway down, lit from below.
          float trolley = exp(-pow(z + 96.0, 2.0) * 0.06) * exp(-x * x * 0.05);
          col += uAccent * trolley * 0.5;

          // Duct runs picking up lamp light.
          col += uAccent * rail * exp(-pow(mod(z / 16.0 + 0.5, 1.0) - 0.5, 2.0) * 40.0) * 0.35;

          float a = (1.0 - smoothstep(60.0, 170.0, dist)) * 0.95;
          if (a < 0.004) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
    });

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, 300, 20, 60), mat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, CEIL, (Z0 + Z1) / 2);
    this.ceilMat = mat;
    this.object3D.add(ceil);
  }

  // ------------------------------------------------------------------ lamps
  /** Caged work lights down both walls — the signature light source. */
  _buildLamps(count) {
    const geo = new THREE.PlaneGeometry(1.5, 1.5);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: { uTime: { value: 0 }, uAccent: { value: this.accent } },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        varying vec2 vUv;
        varying float vSeed;
        varying float vDist;
        void main(){
          vUv = uv;
          vSeed = aSeed;
          // Billboard each lamp toward the camera.
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
        uniform float uTime;
        uniform vec3 uAccent;
        varying vec2 vUv;
        varying float vSeed;
        varying float vDist;
        void main(){
          vec2 c = vUv - 0.5;
          float r = length(c);

          // Hot filament, warm halo, and the shadow of the protective cage.
          float core = exp(-r * r * 90.0);
          float halo = exp(-r * r * 8.0) * 0.5;
          float bars = 1.0 - 0.35 * step(0.82, abs(sin(atan(c.y, c.x) * 5.0)));

          // Mains flicker, unique per lamp.
          float flick = 0.86 + 0.14 * sin(uTime * (7.0 + vSeed * 5.0) + vSeed * 40.0);
          flick *= 1.0 - 0.5 * step(0.995, fract(sin(floor(uTime * 9.0) + vSeed * 21.0) * 43758.5));

          float a = (core + halo) * bars * flick;
          a *= 1.0 - smoothstep(90.0, 190.0, vDist);
          if (a < 0.004) discard;
          vec3 col = mix(uAccent, vec3(1.0, 0.93, 0.82), core * 0.8);
          gl_FragColor = vec4(col * a * 2.4, a);
        }
      `,
    });

    const total = count * 2;
    const mesh = new THREE.InstancedMesh(geo, mat, total);
    const seeds = new Float32Array(total);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let k = 0; k < count; k++) {
      const z = Z0 - 8 - k * 16;
      for (const side of [-1, 1]) {
        m.makeTranslation(side * (HALF_W - 0.9), 7, z);
        mesh.setMatrixAt(i, m);
        seeds[i] = Math.random();
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    mesh.frustumCulled = false;
    this.lampMat = mat;
    this.object3D.add(mesh);
  }

  // ------------------------------------------------------------------ arena
  /** A caged fighting box partway down the hall — the BattleBots callback. */
  _buildArena() {
    const g = new THREE.Group();
    const zc = -100;

    const cageMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 }, uAccent: { value: this.accent } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying vec3 vWorld;
        void main(){
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uAccent;
        varying vec2 vUv;
        varying vec3 vWorld;
        void main(){
          float dist = length(vWorld - cameraPosition);
          // Chain-link: two crossing diagonal families.
          vec2 p = vUv * vec2(150.0, 26.0);
          float d1 = abs(fract(p.x + p.y) - 0.5);
          float d2 = abs(fract(p.x - p.y) - 0.5);
          float link = smoothstep(0.42, 0.5, max(d1, d2));

          // Heavier frame posts.
          float post = smoothstep(0.9, 1.0, abs(sin(vUv.x * 40.0)));

          float a = link * 0.5 + post * 0.35;
          a *= 1.0 - smoothstep(50.0, 130.0, dist);
          if (a < 0.005) discard;
          vec3 col = vec3(0.06, 0.055, 0.05) + uAccent * (0.18 + post * 0.3);
          gl_FragColor = vec4(col, a);
        }
      `,
    });

    const cage = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, 6.5, 40, 1, true), cageMat);
    cage.position.set(0, 3.25, zc);
    g.add(cage);
    this.cageMat = cageMat;

    // Floodlit arena floor inside the cage.
    const pad = new THREE.Mesh(
      new THREE.CircleGeometry(10.6, 48),
      new THREE.MeshBasicMaterial({
        color: this.accent,
        transparent: true,
        opacity: 0.07,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.set(0, 0.05, zc);
    g.add(pad);

    this.object3D.add(g);
  }

  // ----------------------------------------------------------------- sparks
  /** Weld sparks from a work cell, arcing and dying. */
  _buildSparks(count) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const origins = [
      [-9, 1.6, -46],
      [8.5, 1.2, -150],
      [-7, 2.0, -196],
    ];
    for (let i = 0; i < count; i++) {
      const o = origins[i % origins.length];
      pos[i * 3] = o[0];
      pos[i * 3 + 1] = o[1];
      pos[i * 3 + 2] = o[2];
      seed[i] = Math.random();
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -110), 400);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uAccent: { value: this.accent },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime, uPixelRatio;
        varying float vLife;
        varying float vSeed;
        void main(){
          // Each spark has its own ballistic arc, restarting on a loop.
          float period = 0.7 + aSeed * 0.9;
          float life = fract(uTime / period + aSeed * 7.31);
          float speed = 3.5 + aSeed * 7.0;
          float ang = aSeed * 43.0;

          vec3 v = vec3(cos(ang) * 0.9, 1.4 + fract(aSeed * 13.0) * 1.6, sin(ang) * 0.9) * speed;
          vec3 p = position + v * life;
          p.y -= 9.0 * life * life;               // gravity
          p.y = max(p.y, 0.04);                    // skitter along the deck

          vec4 mv = viewMatrix * vec4(p, 1.0);
          float dist = -mv.z;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.0 - life * 0.7) * 2.4 * uPixelRatio * (110.0 / max(dist, 1.0));
          vLife = life;
          vSeed = aSeed;
          if (dist > 130.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uAccent;
        varying float vLife;
        varying float vSeed;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float core = exp(-d * d * 26.0);
          // White-hot at birth, cooling to ember, then out.
          vec3 col = mix(vec3(1.0, 0.95, 0.85), uAccent * 0.9, smoothstep(0.0, 0.5, vLife));
          col = mix(col, vec3(0.5, 0.09, 0.02), smoothstep(0.5, 1.0, vLife));
          float a = core * (1.0 - vLife) * (1.0 - vLife);
          if (a < 0.004) discard;
          gl_FragColor = vec4(col * a * 3.0, a);
        }
      `,
    });

    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.sparkMat = mat;
    this.object3D.add(pts);
  }

  // ------------------------------------------------------------------ haze
  /** Dust and extraction haze hanging in the lamp beams. */
  _buildHaze(count) {
    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * HALF_W * 2;
      pos[i * 3 + 1] = Math.random() * CEIL;
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
        varying float vSeed;
        void main(){
          vec3 p = position;
          // Wrap a 90m band of dust around the camera as it walks the hall.
          float span = 90.0;
          p.z = mod(aSeed * span - uCamZ + uTime * 0.6, span) + uCamZ - span * 0.5;
          p.x += sin(uTime * 0.2 + aSeed * 30.0) * 1.5;
          p.y += cos(uTime * 0.17 + aSeed * 21.0) * 0.7;

          vec4 mv = viewMatrix * vec4(p, 1.0);
          float dist = -mv.z;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.5 + aSeed) * uPixelRatio * (90.0 / max(dist, 1.0));
          vAlpha = smoothstep(2.0, 9.0, dist) * (1.0 - smoothstep(28.0, 70.0, dist));
          vSeed = aSeed;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uAccent;
        varying float vAlpha;
        varying float vSeed;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float core = exp(-d * d * 14.0);
          float tw = 0.6 + 0.4 * sin(uTime * 1.1 + vSeed * 33.0);
          float a = core * vAlpha * tw * 0.13;
          if (a < 0.002) discard;
          gl_FragColor = vec4(uAccent * a * 1.6, a);
        }
      `,
    });

    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    this.hazeMat = mat;
    this.object3D.add(pts);
  }

  // ---------------------------------------------------------------- motion
  placeCamera(camera, t, ctx) {
    const drift = ctx.reducedMotion ? 0 : 1;
    const z = zAt(t);

    // Weave gently across the hall so the walls parallax and stations pass by.
    const weave = Math.sin(t * Math.PI * 3.1) * 3.4;
    const bob = Math.sin(ctx.elapsed * 1.6) * 0.06 * drift;

    camera.position.set(weave, EYE + bob, z);

    // Look down the hall, leaning into the weave.
    const yaw = -Math.PI / 2 + Math.cos(t * Math.PI * 3.1) * 0.16 + ctx.mouse.x * 0.09;
    const pitch = 0.03 - ctx.mouse.y * 0.07;
    const d = 60;
    camera.lookAt(
      camera.position.x + Math.cos(yaw) * Math.cos(pitch) * d,
      camera.position.y + Math.sin(pitch) * d,
      camera.position.z + Math.sin(yaw) * Math.cos(pitch) * d
    );
    camera.rotateZ(Math.sin(ctx.elapsed * 0.7) * 0.006 * drift - ctx.velocity * 0.04);
  }

  nodeTransform(section, index, at, crossLink) {
    // Stations alternate sides of the hall, standing off the wall and set far
    // enough down it that they're square in frame when you arrive.
    const side = index % 2 === 0 ? -1 : 1;
    const eye = camAt(at);
    const z = zAt(at) - AHEAD;
    const x = side * (crossLink ? 9.5 : 7.8);
    const y = crossLink ? 3.6 : 4.0;

    return {
      position: new THREE.Vector3(x, y, z),
      faces: eye, // angle each card back toward the walker
      scale: crossLink ? 1 : 1.15,
    };
  }

  applyAtmosphere(scene, t) {
    // Warm, sooty air. Dense enough that the hall's end is never visible.
    scene.fog.color.copy(this._fogColor);
    scene.fog.density = 0.024;
  }

  update(dt, elapsed, ctx) {
    super.update(dt, elapsed, ctx);
    const camZ = this.world.camera.position.z;
    for (const m of [
      this.floorMat,
      this.wallMat,
      this.ceilMat,
      this.lampMat,
      this.cageMat,
      this.sparkMat,
      this.hazeMat,
    ]) {
      if (m?.uniforms.uTime) m.uniforms.uTime.value = elapsed;
    }
    if (this.hazeMat) this.hazeMat.uniforms.uCamZ.value = camZ;
  }

  // --------------------------------------------------------------- readout
  readout(t) {
    const bay = 1 + Math.floor(t * 7.999);
    return {
      value: `${Math.round(-zAt(t) + Z0)} m`,
      zone: `Bay ${String(bay).padStart(2, '0')}`,
      code: 'ROBOTICS HALL',
      axis: 'Station',
    };
  }

  get axisEnds() {
    return ['Airlock', 'Test cell'];
  }

  get axisTicks() {
    return Array.from({ length: 9 }, (_, i) => ({
      at: i / 8,
      label: `${Math.round((i / 8) * (Z0 - Z1))} m`,
    }));
  }
}
