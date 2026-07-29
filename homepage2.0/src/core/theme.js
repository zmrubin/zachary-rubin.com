/**
 * theme.js — the single source of truth for the world's geometry, palette and
 * "zones". Everything else reads from here, so retuning the look of the site is
 * mostly a matter of editing this file.
 */

// ---------------------------------------------------------------- world axis
// The site is one continuous vertical column. `t` (0..1) is journey progress:
// t=0 is the abyssal sea floor, t=1 is low earth orbit.
export const AXIS = {
  bottom: -80,
  top: 300,
  surface: 100, // world-Y of the sea surface
};

export const journeyY = (t) => AXIS.bottom + t * (AXIS.top - AXIS.bottom);
export const surfaceT = (AXIS.surface - AXIS.bottom) / (AXIS.top - AXIS.bottom);

// How far the camera rotates around the column over the whole journey.
export const TURNS = 1.32;
export const THETA0 = -0.35;
export const CAM_R = 3.2; // camera's orbit radius around the column axis

export const thetaAt = (t) => THETA0 + t * TURNS * Math.PI * 2;

// -------------------------------------------------------------------- colors
export const PALETTE = {
  accent: '#3fe0f0',
  accentWarm: '#ffb45c',
  accentHot: '#ff6b4a',
  ink: '#dff6fb',
  inkDim: '#7d9aa5',
};

/**
 * Vertical color ramp of the whole column, as [worldY, hex] stops.
 *
 * Deliberately has NO bright spike at the surface. The backdrop samples this at
 * `camY + viewDir.y * LEAN`, so a pale stop anywhere in the ramp gets smeared
 * over tens of degrees of sky — a near-white stop at y=100 turned the entire
 * frame white at the surface crossing. The bright waterline is instead a narrow
 * additive band in the backdrop shader, keyed to the sampled altitude, so it
 * stays a crisp line at the horizon.
 */
export const GRADIENT = [
  [-110, '#020d13'],
  [-40, '#05222e'],
  [30, '#07404e'],
  [88, '#1c7d90'],
  [100, '#3fa3bd'],
  [112, '#4f9ed6'],
  [150, '#3e7fc0'],
  [200, '#16295e'],
  [250, '#040a20'],
  [320, '#01020a'],
];

/** World-Y half-width of the additive waterline band in the backdrop. */
export const WATERLINE_WIDTH = 5.5;
/** How far the backdrop leans its ramp sample along the view ray. */
export const BACKDROP_LEAN = 42;

/** Fog density along the column, as [worldY, density] stops. */
export const FOG = [
  [-110, 0.034],
  [-30, 0.024],
  [50, 0.016],
  [100, 0.012],
  [130, 0.007],
  [180, 0.003],
  [230, 0.0006],
  [320, 0.0],
];

/** Named zones, keyed by the journey progress at which they begin. */
export const ZONES = [
  { at: 0.0, name: 'Abyssal Zone', code: 'HADAL' },
  { at: 0.14, name: 'Midnight Zone', code: 'BATHYAL' },
  { at: 0.27, name: 'Twilight Zone', code: 'MESOPELAGIC' },
  { at: 0.375, name: 'Sunlit Zone', code: 'EPIPELAGIC' },
  { at: surfaceT, name: 'Surface', code: 'AIR/WATER' },
  { at: 0.58, name: 'Troposphere', code: 'ATMOS-01' },
  { at: 0.72, name: 'Mesosphere', code: 'ATMOS-03' },
  { at: 0.85, name: 'Low Earth Orbit', code: 'LEO' },
];

export const zoneAt = (t) => {
  let z = ZONES[0];
  for (const zone of ZONES) if (t >= zone.at) z = zone;
  return z;
};

// Camera pitch keyframes — [t, radians]. Lets us script cinematic beats such as
// looking up through the surface, then down at the planet from orbit.
export const PITCH = [
  [0.0, -0.155],
  [0.09, -0.05],
  [0.2, 0.02],
  [0.42, 0.18],
  [surfaceT, 0.24],
  [0.6, 0.04],
  [0.78, -0.1],
  [1.0, -0.34],
];

// ------------------------------------------------------------------ readouts
/** Flavor altimeter: -3800 m at the floor, 0 at the surface, 420 km in orbit. */
export function altitudeAt(t) {
  if (t < surfaceT) return -3800 * (1 - t / surfaceT);
  const u = (t - surfaceT) / (1 - surfaceT);
  return 420000 * Math.pow(u, 2.6);
}

export function formatAltitude(m) {
  const a = Math.abs(m);
  const sign = m < 0 ? '−' : '+';
  if (a < 1000) return `${sign}${Math.round(a)} m`;
  return `${sign}${(a / 1000).toFixed(a < 10000 ? 2 : 0)} km`;
}

// --------------------------------------------------------------- ramp helper
/** Sample a [position, value] ramp. `mix` blends two values of the same kind. */
export function sampleRamp(ramp, x, mix) {
  if (x <= ramp[0][0]) return ramp[0][1];
  const last = ramp[ramp.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 0; i < ramp.length - 1; i++) {
    const [x0, v0] = ramp[i];
    const [x1, v1] = ramp[i + 1];
    if (x <= x1) return mix(v0, v1, (x - x0) / (x1 - x0));
  }
  return last[1];
}

export const fogDensityAt = (y) =>
  sampleRamp(FOG, y, (a, b, k) => a + (b - a) * k);

export const pitchAt = (t) =>
  sampleRamp(PITCH, t, (a, b, k) => a + (b - a) * k);

// ----------------------------------------------------------------- glsl bits
/**
 * Injectable GLSL that reproduces GRADIENT as `columnColor(float y)`.
 * Unrolled into a smoothstep chain so it stays GLSL ES 1.00 compatible
 * (no dynamically indexed const arrays).
 */
export function gradientGLSL() {
  const lin = (v) => Math.pow(v, 2.2).toFixed(5);
  const vec = (hex) => {
    const c = hex.replace('#', '');
    const p = (i) => lin(parseInt(c.slice(i, i + 2), 16) / 255);
    return `vec3(${p(0)}, ${p(2)}, ${p(4)})`;
  };

  let body = `  vec3 c = ${vec(GRADIENT[0][1])};\n`;
  for (let i = 0; i < GRADIENT.length - 1; i++) {
    const [y0] = GRADIENT[i];
    const [y1, hex1] = GRADIENT[i + 1];
    body += `  c = mix(c, ${vec(hex1)}, smoothstep(${y0.toFixed(1)}, ${y1.toFixed(1)}, y));\n`;
  }

  return /* glsl */ `
    vec3 columnColor(float y) {
    ${body}  return c;
    }
  `;
}

export const NOISE_GLSL = /* glsl */ `
  float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float noise2(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1,0)), u.x),
               mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++){ v += a * noise2(p); p *= 2.02; a *= 0.5; }
    return v;
  }
`;
