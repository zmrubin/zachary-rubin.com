/**
 * realms.js — THE THEME MAP.
 *
 * Six 3D environments, one per cluster of interests. Each is a completely
 * separate scene with its own palette, atmosphere, camera motion and props;
 * you move between them through a transition sequence.
 *
 * Sections declare which realms they belong to (see content/sections.js).
 * A section's FIRST realm is its home — that's where its full node lives and
 * where deep links land. Listing further realms places a lighter "cross-link"
 * marker there too, which jumps to the home realm. That's how a topic that
 * genuinely spans two worlds (fitness tech is both a workshop thing and a
 * software thing; geospatial OSINT is both orbital and computational) can be
 * reached from either without being authored twice.
 *
 * `order` is the default tour order — the sequence you walk if you just keep
 * scrolling from the beginning.
 */

export const REALMS = [
  {
    id: 'abyss',
    order: 0,
    label: 'Abyss',
    code: 'ABY',
    kicker: 'Pacific · abyssal plain to surface',
    blurb: 'Where it started: the beaches of Southern California, and everything under them.',
    accent: '#3fe0f0',
    accentWarm: '#ffb45c',
    ink: '#dff6fb',
    scheme: 'dark',
    // Vertical ascent through water. The camera climbs a column and rotates,
    // so each station swings into frame.
    motion: 'column',
  },
  {
    id: 'foundry',
    order: 1,
    label: 'Foundry',
    code: 'FDY',
    kicker: 'Robotics hall · bay 04',
    blurb: 'Robots that fight, robots that pour drinks, robots that shouldn\'t look at you like that.',
    accent: '#ff8a3d',
    accentWarm: '#ffd166',
    ink: '#f6e8dc',
    scheme: 'dark',
    // Travel down a long industrial hall under gantry rails.
    motion: 'hall',
  },
  {
    id: 'velocity',
    order: 2,
    label: 'Velocity',
    code: 'VEL',
    kicker: 'Proving ground · night run',
    blurb: 'Vehicles that carry humans at highway speeds, and the teams that built them.',
    accent: '#ffe14d',
    accentWarm: '#ff7a3d',
    ink: '#fbf6e2',
    scheme: 'dark',
    // Forward flight at speed over a dark plain, light streaks rushing past.
    motion: 'run',
  },
  {
    id: 'lattice',
    order: 3,
    label: 'Lattice',
    code: 'LTC',
    kicker: 'Compute volume · unbounded',
    blurb: 'Evolving morphologies, trading algorithms, and very large datasets made legible.',
    accent: '#7cffb2',
    accentWarm: '#4de0ff',
    ink: '#e4fff0',
    scheme: 'dark',
    // Flight through a 3D graph of nodes and edges.
    motion: 'graph',
  },
  {
    id: 'atelier',
    order: 4,
    label: 'Atelier',
    code: 'ATL',
    kicker: 'Drafting floor · Milan',
    blurb: 'Industrial design and an eight-figure patent portfolio, in orthographic projection.',
    accent: '#1b6f8c',
    accentWarm: '#c8642a',
    ink: '#1a2024',
    // The one light room in the building — a deliberate jolt after five dark ones.
    scheme: 'light',
    // Slow orbit around a central exploded assembly.
    motion: 'turntable',
  },
  {
    id: 'orbit',
    order: 5,
    label: 'Orbit',
    code: 'ORB',
    kicker: 'Low earth orbit · 420 km',
    blurb: 'Satellite imagery, open-source intelligence, and everywhere the passport has been.',
    accent: '#9fd0ff',
    accentWarm: '#ffb45c',
    ink: '#eaf4ff',
    scheme: 'dark',
    // Drifting above the planet limb.
    motion: 'orbit',
  },
];

export const realmById = (id) => REALMS.find((r) => r.id === id);

/** Realms in tour order. */
export const realmOrder = () => [...REALMS].sort((a, b) => a.order - b.order);

/**
 * Transitions. Most realm pairs use the generic `gate` sequence, but a few
 * routes get bespoke choreography because the two worlds are physically
 * adjacent in the fiction.
 */
export const TRANSITIONS = {
  // The original continuous ascent: break the surface and keep climbing.
  'abyss>orbit': 'ascend',
  'orbit>abyss': 'descend',
  // Everything else: an airlock/gate wipe with a readout of where you're going.
  default: 'gate',
};

export const transitionFor = (fromId, toId) =>
  TRANSITIONS[`${fromId}>${toId}`] ?? TRANSITIONS.default;
