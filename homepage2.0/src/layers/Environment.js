import * as THREE from 'three';
import {
  AXIS,
  BACKDROP_LEAN,
  NOISE_GLSL,
  WATERLINE_WIDTH,
  gradientGLSL,
} from '../core/theme.js';

/**
 * Environment — the abyss realm's water: the vertical colour column, the sea
 * floor, the surface with its caustics, and the god rays beneath it.
 *
 * `host` is the owning realm, which supplies `camera`, `t` and `world`.
 */
export class Environment {
  constructor(host) {
    this.host = host;
    this.object3D = new THREE.Group();

    this._buildColumn();
    this._buildFloor();
    this._buildSurface();
    this._buildShafts();

  }

  // -------------------------------------------------- the sky/water backdrop
  _buildColumn() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      // Classic skybox setup: painted first, never occludes, never occluded.
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: { uTime: { value: 0 }, uCamY: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uCamY;
        varying vec3 vDir;
        ${NOISE_GLSL}
        ${gradientGLSL()}

        void main(){
          // The backdrop is the medium you're in, sampled per view direction:
          // the ramp is read at an altitude that leans up or down with the ray.
          //
          // Sampling at the camera's altitude alone painted the entire sphere
          // with one stop; sampling by the sphere's own world-Y squashes the ramp
          // into a thin band at the horizon. Leaning by the ray gets both a
          // correct local medium colour and a sensible vertical gradient.
          float up = clamp(vDir.y, -1.0, 1.0);
          float sampleY = uCamY + up * ${BACKDROP_LEAN.toFixed(1)};
          vec3 col = columnColor(sampleY);

          // The waterline. Narrow in *altitude*, which makes it narrow in angle
          // however close to the surface you are — so crossing it reads as a
          // bright line at the horizon rather than a white-out.
          float wl = exp(-pow((sampleY - ${AXIS.surface.toFixed(1)}) / ${WATERLINE_WIDTH.toFixed(1)}, 2.0));
          col += vec3(0.30, 0.66, 0.80) * wl * 0.55;

          // Underwater: a soft cone of daylight leaking down from the surface,
          // strongest just below it and gone by the abyss.
          float depth = ${AXIS.surface.toFixed(1)} - uCamY;
          float underwater = smoothstep(-8.0, 14.0, depth);
          float reach = exp(-depth / 105.0);
          float cone = pow(max(up, 0.0), 2.0);
          col += vec3(0.16, 0.42, 0.5) * cone * reach * underwater * 1.35;
          // A little omnidirectional scatter too, so the deep never goes to
          // pure black — you can always read silhouettes against the water.
          col += vec3(0.014, 0.05, 0.062) * underwater * (0.35 + reach);

          // Horizontal current bands / thermoclines. Sampled against an
          // approximate world height for the view direction, so they scroll past
          // as you ascend instead of being painted onto the camera.
          float bandY = sampleY;
          float warp = fbm(vec2(bandY * 0.06, uTime * 0.03)) * 2.2;
          float bands = sin(bandY * 0.19 + warp) * 0.5 + 0.5;
          bands = pow(bands, 2.4);
          col += vec3(0.03, 0.085, 0.10) * bands * underwater * (0.3 + reach * 1.4);

          // Faint large-scale mottling so the gradient never looks like a ramp.
          float n = fbm(vec2(atan(vDir.z, vDir.x) * 2.4, up * 3.0 + uTime * 0.012));
          col *= 0.9 + n * 0.2;

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const geo = new THREE.SphereGeometry(300, 32, 48);
    this.column = new THREE.Mesh(geo, mat);
    this.column.frustumCulled = false;
    this.column.renderOrder = -1000;
    this.object3D.add(this.column);
  }

  // -------------------------------------------------------- abyssal plain
  /**
   * The sea floor. Grounds the start of the journey: without it, t=0 reads as
   * empty space rather than the bottom of an ocean. Ridged terrain plus a faint
   * survey grid, dissolving into the fog long before the plane's edge.
   */
  _buildFloor() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
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
        uniform float uTime, uOpacity;
        varying vec2 vP;
        varying vec3 vWorld;
        ${NOISE_GLSL}
        void main(){
          float vDist = length(vWorld - cameraPosition);

          // Ridged terrain: sediment dunes and the odd rocky outcrop.
          float h = fbm(vP * 0.035);
          float ridge = 1.0 - abs(fbm(vP * 0.09) - 0.5) * 2.0;
          float relief = h * 0.65 + pow(ridge, 3.0) * 0.4;

          vec3 silt = vec3(0.028, 0.055, 0.066);
          vec3 rock = vec3(0.052, 0.088, 0.098);
          vec3 col = mix(silt, rock, smoothstep(0.35, 0.78, relief));

          // Survey grid — a faint "this place has been mapped" cue, not a
          // light-cycle arena: wide spacing, hairline width, low intensity.
          vec2 g = abs(fract(vP * 0.02) - 0.5);
          float grid = smoothstep(0.488, 0.5, max(g.x, g.y));
          col += vec3(0.10, 0.36, 0.42) * grid * 0.22;

          // Scattered bioluminescent specks on the sediment.
          float spark = smoothstep(0.955, 1.0, fbm(vP * 1.4));
          col += vec3(0.2, 0.7, 0.8) * spark * 0.7 * (0.5 + 0.5 * sin(uTime * 1.3 + h * 30.0));

          // Dissolve into the water well before the geometry ends.
          float a = (1.0 - smoothstep(40.0, 135.0, vDist)) * uOpacity;
          if (a < 0.004) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
    });

    this.floorMat = mat;
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(460, 460, 24, 24), mat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = AXIS.bottom - 26;
    this.object3D.add(this.floor);
  }

  // ----------------------------------------------------------- sea surface
  _buildSurface() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uCamY: { value: 0 },
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
        uniform float uCamY;
        varying vec2 vP;
        varying vec3 vWorld;
        ${NOISE_GLSL}

        // Cheap caustic: layered ridged noise, sharpened into filaments.
        float caustic(vec2 p, float t){
          float a = fbm(p * 0.09 + vec2(t * 0.05, -t * 0.03));
          float b = fbm(p * 0.17 - vec2(t * 0.04, t * 0.06) + a * 0.6);
          float v = abs(a - b);
          v = 1.0 - smoothstep(0.0, 0.34, v);
          return pow(v, 2.6);
        }

        void main(){
          float vDist = length(vWorld - cameraPosition);

          float t = uTime;
          float c = caustic(vP, t) * 0.75 + caustic(vP * 2.1 + 37.0, t * 1.4) * 0.35;

          // Fade out with distance, and fade the whole sheet away when the
          // camera is far above or below the surface.
          float dfade = 1.0 - smoothstep(40.0, 260.0, vDist);
          // Tighter proximity falloff: the surface only blazes when you're
          // actually near it, and reads as a faint ceiling from the twilight zone.
          float prox = exp(-pow(uCamY / 46.0, 2.0)) * 0.8 + 0.06;
          // Right at the waterline the sheet is edge-on and would smear a bright
          // band across the frame; fade it until there's some distance to it.
          prox *= smoothstep(0.0, 4.0, abs(uCamY));

          vec3 tint = mix(vec3(0.45, 0.92, 1.0), vec3(0.85, 0.98, 1.0), c);
          float a = c * dfade * prox * 0.4;
          if (a < 0.002) discard;
          gl_FragColor = vec4(tint * (0.45 + c * 0.8), a);
        }
      `,
    });

    this.surface = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200, 32, 32), mat);
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.position.y = AXIS.surface;
    this.object3D.add(this.surface);
  }

  // ------------------------------------------------------------- god rays
  _buildShafts() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vY;
        void main(){
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vY = wp.y;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform float uOpacity;
        varying vec2 vUv;
        varying float vY;
        ${NOISE_GLSL}
        void main(){
          // Shafts vary around the cylinder (u) and shimmer slowly in time.
          float s = fbm(vec2(vUv.x * 26.0, uTime * 0.07));
          s = pow(smoothstep(0.42, 0.95, s), 2.2);
          s += pow(smoothstep(0.55, 1.0, fbm(vec2(vUv.x * 61.0 + 11.0, uTime * 0.11))), 3.0) * 0.6;

          // Bright where they leave the surface, gone by the time they're deep.
          float fall = pow(clamp(vUv.y, 0.0, 1.0), 2.1);
          float a = s * fall * 0.2 * uOpacity;
          if (a < 0.002) discard;
          gl_FragColor = vec4(vec3(0.55, 0.93, 1.0) * a * 2.2, a);
        }
      `,
    });

    const h = 165;
    const geo = new THREE.CylinderGeometry(58, 74, h, 96, 1, true);
    this.shafts = new THREE.Mesh(geo, mat);
    this.shafts.position.y = AXIS.surface - h / 2 + 6;
    this.object3D.add(this.shafts);
  }



  // ---------------------------------------------------------------- frame
  update(dt, elapsed) {
    const t = this.host.t;
    const camY = this.host.camera.position.y;

    this.column.material.uniforms.uTime.value = elapsed;
    this.column.material.uniforms.uCamY.value = camY;
    // Locked to the camera: the backdrop has no parallax of its own.
    this.column.position.copy(this.host.camera.position);

    this.surface.material.uniforms.uTime.value = elapsed;
    this.surface.material.uniforms.uCamY.value = camY - AXIS.surface;
    this.surface.visible = Math.abs(camY - AXIS.surface) < 190;

    this.floorMat.uniforms.uTime.value = elapsed;
    this.floor.visible = camY < AXIS.bottom + 90;

    this.shafts.material.uniforms.uTime.value = elapsed;
    const depth = AXIS.surface - camY;
    const shaftFade =
      THREE.MathUtils.smoothstep(depth, 5, 30) * (1 - THREE.MathUtils.smoothstep(depth, 95, 155));
    this.shafts.material.uniforms.uOpacity.value = shaftFade;
    this.shafts.visible = shaftFade > 0.01;



  }
}
