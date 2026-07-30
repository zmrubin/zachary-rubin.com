import * as THREE from 'three';
import { Realm } from '../core/Realm.js';
import { NOISE_GLSL } from '../core/theme.js';
import { Nodes } from '../layers/Nodes.js';

const ORBIT_R = 26;
const EYE = 3.2;
const TURNS = 0.85;

/**
 * AtelierRealm — the drafting floor. The one light room in the building, and a
 * deliberate jolt after five dark ones: warm paper, a blue drafting grid, and an
 * exploded orthographic assembly you walk around.
 *
 * Motion: `turntable`. The camera orbits a central object rather than travelling
 * through a space, so progress is angle rather than distance.
 */
export class AtelierRealm extends Realm {
  build(stations, loader) {
    super.build(stations, loader);

    this._buildPaper();
    this._buildDeck();
    this._buildAssembly();
    this._buildDimensions();

    this.nodes = this.addLayer(new Nodes(this, stations, loader));
    this._fog = new THREE.Color('#e8e4d9');
  }

  // ------------------------------------------------------------------ paper
  _buildPaper() {
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
          // Warm paper, very slightly cooler and darker toward the floor.
          vec3 hi = vec3(0.86, 0.85, 0.80);
          vec3 lo = vec3(0.58, 0.60, 0.61);
          vec3 col = mix(lo, hi, smoothstep(-0.5, 0.7, up));
          // Paper tooth.
          col *= 0.97 + fbm(vDir.xy * 26.0) * 0.06;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const s = new THREE.Mesh(new THREE.SphereGeometry(200, 24, 24), mat);
    s.frustumCulled = false;
    s.renderOrder = -1000;
    this.paperMat = mat;
    this.paper = s;
    this.object3D.add(s);
  }

  // ------------------------------------------------------------------- deck
  /** The drafting surface: a fine blue grid with heavier decade lines. */
  _buildDeck() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uAccent: { value: this.accent } },
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
        uniform vec3 uAccent;
        varying vec2 vP;
        varying vec3 vWorld;
        void main(){
          float dist = length(vWorld - cameraPosition);

          // Two grid scales: 1 unit fine, 10 unit heavy.
          vec2 f = abs(fract(vP) - 0.5);
          float fine = smoothstep(0.49, 0.5, max(f.x, f.y));
          vec2 c = abs(fract(vP * 0.1) - 0.5);
          float coarse = smoothstep(0.492, 0.5, max(c.x, c.y));

          // Centre axes, heavier still.
          float axis = smoothstep(0.06, 0.0, min(abs(vP.x), abs(vP.y)));

          float ink = fine * 0.3 + coarse * 0.7 + axis * 0.9;
          float a = ink * (1.0 - smoothstep(30.0, 95.0, dist));
          if (a < 0.004) discard;
          gl_FragColor = vec4(uAccent * 0.55, a);
        }
      `,
    });
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(180, 180, 8, 8), mat);
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = -4;
    this.deckMat = mat;
    this.object3D.add(deck);
  }

  // --------------------------------------------------------------- assembly
  /** An exploded assembly: plates, rings and fasteners separated along Y. */
  _buildAssembly() {
    const g = new THREE.Group();
    const ink = new THREE.Color('#12313d');

    const line = (geo, opacity = 0.75) =>
      new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 25),
        new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: Math.min(1, opacity * 1.25), fog: false })
      );
    // Solids are a pale fill so the wireframe reads as an object, not a mesh.
    const solid = (geo, opacity = 0.55) =>
      new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: '#f4f2ec',
          transparent: true,
          opacity,
          depthWrite: true,
          fog: true,
        })
      );

    this.parts = [];
    const addPart = (geo, y, spin) => {
      const p = new THREE.Group();
      p.add(solid(geo));
      p.add(line(geo));
      p.position.y = y;
      p.userData = { baseY: y, spin };
      g.add(p);
      this.parts.push(p);
      return p;
    };

    // Bottom-up: base plate, stator ring, rotor, cover, fastener ring.
    addPart(new THREE.CylinderGeometry(6, 6, 0.5, 32), -3.0, 0.05);
    addPart(new THREE.TorusGeometry(4.6, 0.9, 8, 40), -0.6, -0.09);
    addPart(new THREE.CylinderGeometry(3.1, 3.1, 1.6, 24), 1.6, 0.14);
    addPart(new THREE.ConeGeometry(2.4, 2.0, 20), 4.2, -0.07);

    // A ring of bolts, exploded outward above the stack.
    const bolts = new THREE.Group();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const b = new THREE.Group();
      const geo = new THREE.CylinderGeometry(0.22, 0.22, 1.1, 8);
      b.add(solid(geo, 0.6));
      b.add(line(geo, 0.6));
      b.position.set(Math.cos(a) * 5.4, 0, Math.sin(a) * 5.4);
      bolts.add(b);
    }
    bolts.position.y = 6.6;
    bolts.userData = { baseY: 6.6, spin: 0.11 };
    g.add(bolts);
    this.parts.push(bolts);

    // Centre line the parts explode along.
    const axisGeo = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, -5, 0, 0, 9, 0], 3)
    );
    g.add(
      new THREE.LineSegments(
        axisGeo,
        new THREE.LineDashedMaterial({
          color: ink,
          transparent: true,
          opacity: 0.4,
          dashSize: 0.5,
          gapSize: 0.35,
          fog: false,
        })
      )
    );
    g.children[g.children.length - 1].computeLineDistances();

    this.assembly = g;
    this.object3D.add(g);
  }

  // ------------------------------------------------------------- dimensions
  /** Dimension lines with arrow ticks, the way a patent figure would show them. */
  _buildDimensions() {
    const ink = new THREE.Color('#12313d');
    const pts = [];
    const tick = (x, y, z) => {
      pts.push(x - 0.35, y, z, x + 0.35, y, z);
    };

    // Vertical extension between two parts.
    const x = 8.4;
    pts.push(x, -3.0, 0, x, 4.2, 0);
    tick(x, -3.0, 0);
    tick(x, 4.2, 0);
    // Leaders out to the parts they measure.
    pts.push(6.2, -3.0, 0, x, -3.0, 0);
    pts.push(2.6, 4.2, 0, x, 4.2, 0);

    // Horizontal diameter callout on the base plate.
    pts.push(-6.2, -3.0, 0, 6.2, -3.0, 0);
    for (const s of [-1, 1]) pts.push(s * 6.2, -3.35, 0, s * 6.2, -2.65, 0);

    const geo = new THREE.BufferGeometry().setAttribute(
      'position',
      new THREE.Float32BufferAttribute(pts, 3)
    );
    const lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: ink, transparent: true, opacity: 0.75, fog: false })
    );
    this.dimensions = lines;
    this.object3D.add(lines);
  }

  // ---------------------------------------------------------------- motion
  placeCamera(camera, t, ctx) {
    const drift = ctx.reducedMotion ? 0 : 1;
    const ang = -0.6 + t * TURNS * Math.PI * 2;

    // Rise slightly as you go round, so the assembly is read from several angles.
    const y = EYE + Math.sin(t * Math.PI) * 4.5 + Math.sin(ctx.elapsed * 0.4) * 0.12 * drift;
    camera.position.set(Math.cos(ang) * ORBIT_R, y, Math.sin(ang) * ORBIT_R);

    // Always looking back at the assembly, with a little mouse parallax.
    const target = new THREE.Vector3(
      ctx.mouse.x * 1.4,
      1.2 - ctx.mouse.y * 1.4,
      ctx.mouse.x * 0.6
    );
    camera.lookAt(target);
    camera.rotateZ(Math.sin(ctx.elapsed * 0.21) * 0.004 * drift);
  }

  nodeTransform(section, index, at, crossLink) {
    // Stations stand on the turntable's rim, angled to face the centre.
    const ang = -0.6 + at * TURNS * Math.PI * 2;
    const r = crossLink ? 15.5 : 13;
    const y = 2.4 + (index % 2 === 0 ? 1.6 : -0.6);
    return {
      position: new THREE.Vector3(Math.cos(ang) * r, y, Math.sin(ang) * r),
      // Face outward, toward where the camera will be at that angle.
      faces: new THREE.Vector3(Math.cos(ang) * ORBIT_R, y, Math.sin(ang) * ORBIT_R),
      scale: crossLink ? 1 : 1.0,
    };
  }

  applyAtmosphere(scene, t) {
    // Light fog on a light room reads as depth haze, not murk.
    scene.fog.color.copy(this._fog);
    scene.fog.density = 0.0075;
  }

  update(dt, elapsed, ctx) {
    super.update(dt, elapsed, ctx);
    this.paper.position.copy(this.world.camera.position);

    if (this.reducedMotion) return;
    // Parts breathe along the explode axis and rotate at their own rates.
    const breathe = 1 + Math.sin(elapsed * 0.35) * 0.12;
    for (const p of this.parts) {
      p.position.y = p.userData.baseY * breathe;
      p.rotation.y += p.userData.spin * dt;
    }
  }

  // --------------------------------------------------------------- readout
  readout(t) {
    const sheet = 1 + Math.floor(t * 5.999);
    return {
      value: `${Math.round(-0.6 * 57.3 + t * TURNS * 360)}°`,
      zone: `Sheet ${sheet} of 6`,
      code: 'DRAFTING FLOOR',
      axis: 'Rotation',
    };
  }

  get axisEnds() {
    return ['Front elevation', 'Full turn'];
  }

  get post() {
    // A paper-white room: bloom would erase every drafted line, and the
    // exposure that suits five dark realms blows this one out.
    return { bloom: 0.05, radius: 0.3, threshold: 0.985, exposure: 0.78 };
  }

  get axisTicks() {
    return Array.from({ length: 7 }, (_, i) => ({
      at: i / 6,
      label: `${Math.round((i / 6) * TURNS * 360)}°`,
    }));
  }
}
