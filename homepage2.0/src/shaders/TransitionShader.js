import * as THREE from 'three';

/**
 * TransitionShader — the full-screen effect that covers a realm change.
 *
 * Modes:
 *   0 `gate`    an aperture/blast-door wipe. Two shutters close from top and
 *               bottom, the seam flares in the destination's accent, then they
 *               open again on the new world.
 *   1 `ascend`  breaking upward out of one medium into another: the frame blooms
 *               white from the centre with vertical speed streaks.
 *   2 `descend` the inverse — an iris collapsing inward, streaks falling.
 *
 * `uProgress` runs 0..1 across the whole sequence; the realm swap happens at 0.5,
 * so each mode is written to be visually symmetric about that midpoint.
 */
export const TransitionShader = {
  uniforms: {
    tDiffuse: { value: null },
    uProgress: { value: 0 },
    uMode: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uColorFrom: { value: new THREE.Color('#3fe0f0') },
    uColorTo: { value: new THREE.Color('#ff8a3d') },
    uTime: { value: 0 },
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
    uniform float uProgress, uMode, uTime;
    uniform vec2 uResolution;
    uniform vec3 uColorFrom, uColorTo;
    varying vec2 vUv;

    float hash(vec2 p){
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    // Radial smear toward/away from centre — reads as punching through.
    vec3 streak(vec2 uv, float amount, float aniso){
      vec2 c = uv - 0.5;
      vec3 sum = vec3(0.0);
      float wsum = 0.0;
      for (int i = 0; i < 8; i++){
        float f = float(i) / 7.0;
        float s = 1.0 - amount * f;
        vec2 o = vec2(c.x * s, c.y * mix(s, 1.0 - amount * f * 2.2, aniso));
        float w = 1.0 - f * 0.75;
        sum += texture2D(tDiffuse, o + 0.5).rgb * w;
        wsum += w;
      }
      return sum / wsum;
    }

    void main(){
      vec2 uv = vUv;
      float p = clamp(uProgress, 0.0, 1.0);

      // 0 at both ends, 1 at the midpoint — the "intensity" of the effect.
      float peak = 1.0 - abs(p - 0.5) * 2.0;
      float ease = peak * peak * (3.0 - 2.0 * peak);

      // Colour crossfades from the outgoing realm's accent to the incoming one.
      vec3 accent = mix(uColorFrom, uColorTo, smoothstep(0.35, 0.65, p));

      vec3 col;

      if (uMode < 0.5) {
        // ---- gate: blast doors close, seam flares, doors open
        col = streak(uv, ease * 0.10, 0.0);

        // Half-height of the slot still open. close=1 -> fully shut.
        float close = ease;
        float halfOpen = 0.5 - close * 0.5;
        float dy = abs(uv.y - 0.5);

        // Interlocking teeth along each leading edge, so it reads as machinery.
        float teeth = step(0.5, fract(uv.x * 24.0)) * 0.013;
        float slot = halfOpen - teeth;
        float open = 1.0 - smoothstep(slot - 0.003, slot + 0.003, dy);

        // Door face: dark plate with vertical panel joints.
        vec3 door = vec3(0.020, 0.018, 0.016) + accent * 0.035;
        door += accent * 0.05 * step(0.62, fract(uv.x * 11.0));
        door *= 0.75 + 0.25 * smoothstep(0.5, 0.0, dy);

        // Only the leading edge is lit — a narrow band tracking the door lip.
        float lead = exp(-pow((dy - halfOpen) / 0.014, 2.0));
        door += accent * lead * 2.0;

        // Scan bar sweeping the closed doors.
        float scan = exp(-pow((fract(uv.y * 2.0 - uTime * 0.5) - 0.5) * 8.0, 2.0));
        door += accent * scan * 0.10;

        col = mix(door, col, open);

        // Seam flare at full closure.
        float seam = exp(-pow((uv.y - 0.5) * 30.0, 2.0));
        col += accent * seam * pow(ease, 6.0) * 2.2;

      } else if (uMode < 1.5) {
        // ---- ascend: bloom outward, vertical streaks, white-out
        col = streak(uv, ease * 0.42, 1.0);
        float r = length((uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0));
        float bloom = exp(-r * r * mix(9.0, 0.35, ease));
        col += (accent * 0.6 + vec3(0.85)) * bloom * pow(ease, 1.6) * 1.9;
        col += accent * pow(ease, 4.0) * 0.5;

      } else {
        // ---- descend: iris collapses inward, streaks fall
        col = streak(uv, -ease * 0.34, 1.0);
        float r = length((uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0));
        float iris = smoothstep(mix(1.6, 0.0, ease), mix(1.6, 0.0, ease) - 0.22, r);
        col = mix(vec3(0.004, 0.012, 0.018), col, iris);
        col += accent * exp(-pow((r - mix(1.6, 0.0, ease)) * 7.0, 2.0)) * ease * 1.4;
      }

      // Shared: sensor tearing while the effect is hot.
      float band = step(0.985, hash(vec2(floor(uv.y * 90.0), floor(uTime * 24.0))));
      col += accent * band * ease * 0.28;
      col += (hash(uv * uResolution + uTime) - 0.5) * ease * 0.06;

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
