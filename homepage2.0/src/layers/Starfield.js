import * as THREE from 'three';

/**
 * Starfield — a distant sphere of stars that only exists once you've climbed out
 * of the atmosphere. Two populations: a dense faint field and a sparse bright
 * one with visible color temperature.
 */
export class Starfield {
  constructor(host, count = 3200, opts = {}) {
    this.host = host;
    this.always = opts.always ?? false;
    this.fadeIn = opts.fadeIn ?? [0.6, 0.86];

    const pos = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    const scale = new Float32Array(count);
    const seed = new Float32Array(count);

    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      // Even distribution on a sphere shell.
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const R = 560 + Math.random() * 90;
      pos[i * 3] = Math.cos(a) * r * R;
      pos[i * 3 + 1] = u * R;
      pos[i * 3 + 2] = Math.sin(a) * r * R;

      const bright = Math.pow(Math.random(), 6);
      scale[i] = 0.6 + bright * 5.5;
      seed[i] = Math.random() * 100;

      // Blue-white to warm, weighted toward cool.
      const temp = Math.random();
      c.setHSL(temp < 0.75 ? 0.55 + Math.random() * 0.06 : 0.07 + Math.random() * 0.05, 0.45, 0.85);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aScale', new THREE.BufferAttribute(scale, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aColor;
        attribute float aScale;
        attribute float aSeed;
        uniform float uTime, uPixelRatio;
        varying vec3 vColor;
        varying float vTwinkle;
        void main(){
          vColor = aColor;
          vTwinkle = 0.72 + 0.28 * sin(uTime * 1.1 + aSeed * 21.7);
          vec4 mv = viewMatrix * vec4(position + cameraPosition, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = aScale * uPixelRatio * 1.35;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uOpacity;
        varying vec3 vColor;
        varying float vTwinkle;
        void main(){
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float core = exp(-d * d * 34.0);
          float halo = exp(-d * d * 7.0) * 0.28;
          float a = (core + halo) * uOpacity * vTwinkle;
          if (a < 0.003) discard;
          gl_FragColor = vec4(vColor * (1.0 + core * 1.4), a);
        }
      `,
    });

    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    // Just after the backdrop, so the planet still occludes them.
    this.points.renderOrder = -900;
    this.object3D = this.points;
  }

  update(dt, elapsed) {
    // Stars appear as the atmosphere thins — or are simply always there.
    const vis = this.always
      ? 1
      : THREE.MathUtils.smoothstep(this.host.t, this.fadeIn[0], this.fadeIn[1]);
    this.mat.uniforms.uOpacity.value = vis;
    this.mat.uniforms.uTime.value = elapsed;
    this.points.visible = vis > 0.01;
  }
}
