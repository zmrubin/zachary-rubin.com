import * as THREE from 'three';
import { AXIS, gradientGLSL } from '../core/theme.js';

/**
 * Particulate — the volumetric grit that makes the column feel like a *place*:
 * marine snow in the deep, rising bubbles near the surface, dust motes above it.
 *
 * All motion happens in the vertex shader and the field wraps around the camera
 * (`mod` on world Y), so a few thousand points cover the entire 380-unit column
 * with no CPU work and no pop-in.
 */
export class Particulate {
  /**
   * @param {'snow'|'bubbles'|'dust'} kind
   */
  constructor(rail, kind = 'snow', count = 2600) {
    this.rail = rail;
    this.kind = kind;

    const cfg = {
      // `alpha` is the master brightness — marine snow should read as suspended
      // grit catching a little light, never as a starfield.
      snow: { span: 110, radius: 42, size: 0.62, rise: 0.4, sway: 0.9, glow: 0.2, alpha: 0.34, near: 2.5, far: 52 },
      bubbles: { span: 80, radius: 26, size: 0.52, rise: 6.0, sway: 0.4, glow: 0.75, alpha: 0.5, near: 2.0, far: 40 },
      dust: { span: 150, radius: 58, size: 0.45, rise: -0.12, sway: 1.6, glow: 0.1, alpha: 0.22, near: 3.0, far: 70 },
    }[kind];
    this.cfg = cfg;

    const pos = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const scale = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Cylindrical shell, biased toward the outside so the middle stays clear.
      const a = Math.random() * Math.PI * 2;
      const r = cfg.radius * (0.12 + 0.88 * Math.sqrt(Math.random()));
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = Math.random() * cfg.span;
      pos[i * 3 + 2] = Math.sin(a) * r;
      seed[i] = Math.random() * 100;
      scale[i] = 0.35 + Math.pow(Math.random(), 2.2) * 2.4;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uCamY: { value: 0 },
        uSpan: { value: cfg.span },
        uSize: { value: cfg.size },
        uRise: { value: cfg.rise },
        uSway: { value: cfg.sway },
        uGlow: { value: cfg.glow },
        uAlpha: { value: cfg.alpha },
        uNear: { value: cfg.near },
        uFar: { value: cfg.far },
        uOpacity: { value: 1 },
        uPixelRatio: { value: 1 },
      },
      vertexShader: /* glsl */ `
        attribute float aSeed;
        attribute float aScale;
        uniform float uTime, uCamY, uSpan, uSize, uRise, uSway, uPixelRatio, uNear, uFar;
        varying float vAlpha;
        varying float vY;
        varying float vSeed;

        void main(){
          vec3 p = position;

          // Rise (or sink) and wrap into a window centred on the camera.
          float y = p.y + uTime * uRise;
          y = mod(y - (uCamY - uSpan * 0.5), uSpan) + (uCamY - uSpan * 0.5);
          p.y = y;

          // Lazy horizontal drift.
          p.x += sin(uTime * 0.11 + aSeed * 6.283) * uSway;
          p.z += cos(uTime * 0.09 + aSeed * 4.712) * uSway;

          vec4 mv = viewMatrix * vec4(p, 1.0);
          float dist = -mv.z;

          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * aScale * uPixelRatio * (140.0 / max(dist, 1.0));

          // Fade at both ends of the depth range: nothing pops at the near
          // plane, nothing crowds the horizon.
          vAlpha = smoothstep(uNear, uNear + 6.0, dist) * (1.0 - smoothstep(uFar * 0.35, uFar, dist));
          vY = y;
          vSeed = aSeed;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uGlow, uOpacity, uAlpha;
        varying float vAlpha;
        varying float vY;
        varying float vSeed;
        ${gradientGLSL()}
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;

          // Soft core with a small halo.
          float core = exp(-d * d * 24.0);
          float halo = exp(-d * d * 6.0) * 0.22;

          // Mostly the color of the water at this depth, nudged toward a
          // bioluminescent cyan for the brighter kinds.
          vec3 amb = columnColor(vY);
          vec3 col = mix(amb * 2.4, vec3(0.42, 0.86, 1.0), 0.3 + uGlow * 0.5);

          // Slow individual twinkle.
          float tw = 0.62 + 0.38 * sin(uTime * 1.4 + vSeed * 12.9);

          float a = (core + halo) * vAlpha * uOpacity * tw * uAlpha;
          if (a < 0.002) discard;
          gl_FragColor = vec4(col * (0.5 + uGlow * 0.8), a);
        }
      `,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.object3D = this.points;
    this.mat = mat;

    mat.uniforms.uPixelRatio.value = Math.min(window.devicePixelRatio || 1, 2);
  }

  update(dt, elapsed) {
    const camY = this.rail.camera.position.y;
    const u = this.mat.uniforms;
    u.uTime.value = elapsed;
    u.uCamY.value = camY;

    // Keep the field centred on the camera horizontally too.
    this.points.position.x = this.rail.camera.position.x;
    this.points.position.z = this.rail.camera.position.z;

    // Each kind only exists where it makes sense.
    let vis = 1;
    if (this.kind === 'snow') {
      vis = 1 - THREE.MathUtils.smoothstep(camY, AXIS.surface - 20, AXIS.surface + 40);
    } else if (this.kind === 'bubbles') {
      vis =
        THREE.MathUtils.smoothstep(camY, -40, 20) *
        (1 - THREE.MathUtils.smoothstep(camY, AXIS.surface - 12, AXIS.surface + 8));
    } else {
      vis = THREE.MathUtils.smoothstep(camY, AXIS.surface - 10, AXIS.surface + 70);
    }
    u.uOpacity.value = vis;
    this.points.visible = vis > 0.01;
  }
}
