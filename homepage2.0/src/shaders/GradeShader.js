import * as THREE from 'three';

/**
 * GradeShader — one combined finishing pass: chromatic aberration, vignette,
 * animated grain and a faint CRT/telemetry scanline. Cheaper than stacking
 * three separate ShaderPasses.
 */
export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uChroma: { value: 1.0 },
    uGrain: { value: 0.055 },
    uVignette: { value: 1.0 },
    uScanline: { value: 0.035 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform vec2  uResolution;
    uniform float uChroma;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uScanline;
    varying vec2 vUv;

    float hash(vec2 p){
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main(){
      vec2 uv = vUv;
      vec2 c  = uv - 0.5;
      float r2 = dot(c, c);

      // Radial chromatic aberration, strongest at the corners.
      vec2 off = c * (r2 * 0.0075 * uChroma);
      vec3 col;
      col.r = texture2D(tDiffuse, uv - off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv + off).b;

      // Vignette.
      float vig = smoothstep(0.95, 0.18, r2 * 1.55);
      col *= mix(1.0, vig, uVignette);

      // Cool the shadows a touch, keeps the whole frame feeling submerged.
      float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * vec3(0.86, 1.0, 1.06), (1.0 - lum) * 0.2);

      // Telemetry scanline.
      float sl = sin(uv.y * uResolution.y * 1.05 + uTime * 2.0) * 0.5 + 0.5;
      col *= 1.0 - uScanline * sl;

      // Animated grain, scaled down in the highlights so it reads as sensor noise.
      float g = hash(uv * uResolution + fract(uTime) * 431.7) - 0.5;
      col += g * uGrain * (1.0 - lum * 0.65);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
