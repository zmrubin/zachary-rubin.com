/**
 * sections.js — THE CONTENT FILE.
 *
 * This is the only file you need to touch to add, remove or reorder a section.
 * Everything else (3D placement, nav list, labels, detail panel, depth gauge)
 * is generated from this array at runtime.
 *
 * Fields
 *   realms    which 3D theme(s) this belongs in, by id from content/realms.js.
 *             The FIRST is the home realm: that's where the full node lives and
 *             where a deep link lands. Any further realms get a lighter
 *             cross-link marker that jumps home. Use this when a topic honestly
 *             spans two worlds rather than duplicating the section.
 *   at        position *within its home realm*, 0..1
 *   id        unique slug, also the URL hash (#robotics)
 *   nav       short label for the top-right nav + node caption
 *   title     headline shown on the node label and in the detail panel
 *   kicker    tiny monospace overline ("DOSSIER 03", "SYSTEM", ...)
 *   at        journey position, 0 (sea floor) .. 1 (orbit). Order doesn't
 *             matter — the registry sorts by `at`.
 *   radius    distance from the column axis. 14 = close/imposing, 26 = distant.
 *             Optional; defaults to 19.
 *   dy        vertical nudge in world units, for composition. Optional.
 *   image     path to a still, or null for a procedural "no-signal" card
 *   aspect    card aspect ratio (w/h). Optional; defaults to 1.5
 *   body      array of paragraphs for the detail panel
 *   tags      array of short strings
 *   links     array of { label, href }
 *   glyph     one of: 'ring' | 'sonar' | 'grid' | 'orbit' — the motif drawn
 *             behind/around the card. Optional; defaults to 'ring'.
 */

export const SECTIONS = [
  {
    id: 'origin',
    realms: ['abyss'],
    nav: 'Origin',
    kicker: 'Dossier 01',
    title: 'Born on the beach, raised on Linux',
    at: 0.075,
    radius: 16,
    image: './public/media/portrait.jpg',
    aspect: 0.78,
    glyph: 'ring',
    body: [
      "I'm Zachary. I was born in Santa Barbara and grew up on the beaches of Southern California. As a kid, when I wasn't getting wet and sandy, I was taking apart computers, building robots and learning Linux.",
      'Santa Barbara was the perfect place to take a deeper dive into engineering before working with robotics in Osaka, studying industrial design in Milan, and technology entrepreneurship and product in the Bay Area.',
      'My interests have not changed so much since I was a kid — only the stakes have gotten higher.',
    ],
    tags: ['Santa Barbara', 'Osaka', 'Milan', 'Bay Area'],
    links: [],
  },
  {
    id: 'ocean',
    realms: ['abyss'],
    nav: 'The Ocean',
    kicker: 'Interest',
    title: 'The Ocean',
    at: 0.175,
    radius: 21,
    image: null,
    glyph: 'sonar',
    body: [
      "It's the source of the best foods, the most fun activities, and some very intelligent, mysterious life forms.",
      'Whether you want to talk about planning a dive trip or a moonshot project to extract plastic and revive coral reefs, oceans are always a topic of interest.',
    ],
    tags: ['Diving with sharks', 'Reef restoration', 'Plastic extraction'],
    links: [],
  },
  {
    id: 'robotics',
    realms: ['foundry'],
    nav: 'Robotics',
    kicker: 'Dossier 02',
    title: 'What makes a robot interesting?',
    at: 0.275,
    radius: 17,
    image: './public/media/battlebots.jpg',
    aspect: 1.52,
    glyph: 'grid',
    body: [
      "Some of the biggest and most advanced robotics projects of today — read: autonomous cars — don't look like robots. Others, like my beloved battlebots, would be outcast by the academic neckbeards as not being robots at all.",
      'What makes a robot a robot, and what makes a robot… interesting?',
      'Complete Control competed on ABC\'s BattleBots.',
    ],
    tags: ['BattleBots', 'Complete Control', 'Autonomy'],
    links: [],
  },
  {
    id: 'hardware',
    realms: ['foundry', 'lattice'],
    nav: 'Hardware',
    kicker: 'Dossier 03',
    title: 'Things built with hands',
    at: 0.375,
    radius: 20,
    image: './public/media/robogames.jpg',
    aspect: 0.8,
    glyph: 'ring',
    body: [
      'A very creepy looking humanoid robot built for RoboGames. Alongside it: the Santa Barbot bartending robot, a ferrofluid fountain, an LED display running open frameworks on embedded Linux to simulate particle physics — as a refrigerator magnet.',
      'Hardware is where the ideas stop being negotiable.',
    ],
    tags: ['RoboGames', 'Santa Barbot', 'Ferrofluid', 'Embedded Linux'],
    links: [],
  },
  {
    id: 'professional',
    realms: ['velocity', 'foundry'],
    nav: 'Professional',
    kicker: 'Dossier 04',
    title: 'Vehicles that carry humans at speed',
    at: 0.48,
    radius: 16,
    image: './public/media/mission-r.jpg',
    aspect: 1.5,
    glyph: 'orbit',
    body: [
      "Part of the teams behind Harley-Davidson LiveWire, Mission R, Boosted Boards and Mugen Shinden. Employed by Apple's Special Projects Group, an R&D division focused on new technologies and products for the Apple portfolio.",
      'Founder or partner in several ventures since.',
    ],
    tags: ['Apple SPG', 'H-D LiveWire', 'Mission R', 'Boosted Boards', 'Mugen Shinden'],
    links: [],
  },
  {
    id: 'patents',
    realms: ['atelier', 'foundry'],
    nav: 'Patents',
    kicker: 'Portfolio',
    title: 'An 8-figure patent portfolio',
    at: 0.585,
    radius: 22,
    image: null,
    glyph: 'grid',
    body: [
      'IP leader at both the strategic and inventorship level. After leading an innovation and intellectual property group at Apple, I went on to develop an 8-figure patent portfolio for my own company.',
      'Numerous US and international patents filed; currently advising companies on IP strategy.',
    ],
    tags: ['US + International', 'IP strategy', 'Advisory'],
    links: [],
  },
  {
    id: 'software',
    realms: ['lattice', 'foundry'],
    nav: 'Software',
    kicker: 'Dossier 05',
    title: 'Machine learning robot morphologies',
    at: 0.685,
    radius: 18,
    image: './public/media/morphologies.jpg',
    aspect: 1.85,
    glyph: 'grid',
    body: [
      'Evolving robot body plans in simulation, then building the survivors. Alongside it: an automated pairs-trading algorithm, a post-Fukushima radiation map, and interactive visualizations of very large library datasets.',
      'Currently spending time on geospatial OSINT — satellite imagery, maps and public data putting institutional-grade insight within reach of individuals.',
    ],
    tags: ['Evolutionary robotics', 'Pairs trading', 'Geospatial OSINT', 'Data viz'],
    links: [],
  },
  {
    id: 'travel',
    realms: ['orbit', 'velocity'],
    nav: 'Travel',
    kicker: 'Interest',
    title: 'Japan, Italy, Korea, China, Hong Kong',
    at: 0.785,
    radius: 21,
    image: './public/media/japan-robot.jpg',
    aspect: 0.75,
    glyph: 'orbit',
    body: [
      "I've been privileged to take on international work, research and motorcycle rides in Japan, Italy, Korea, China and Hong Kong.",
      'Able to converse respectfully in Japanese, and swear loudly in Italian.',
    ],
    tags: ['Osaka', 'Milan', 'Seoul', 'Hong Kong'],
    links: [],
  },
  {
    id: 'dogs',
    realms: ['abyss'],
    nav: 'Dogs',
    kicker: 'Interest',
    title: 'Dogs',
    at: 0.88,
    radius: 19,
    image: './public/media/dog.jpg',
    aspect: 0.75,
    glyph: 'ring',
    body: ['No explanation needed.'],
    tags: [],
    links: [],
  },
  {
    id: 'contact',
    realms: ['orbit'],
    nav: 'Contact',
    kicker: 'Uplink',
    title: 'Say hello',
    at: 0.965,
    radius: 15,
    dy: 3.2,
    image: null,
    glyph: 'sonar',
    body: [
      'Find technology worth getting excited about, build something the humans around you love, position it to thrive in an open market — that\'s when you change the world.',
      'Always happy to talk about any of the above.',
    ],
    tags: [],
    links: [{ label: 'zr@3na.co', href: 'mailto:zr@3na.co' }],
  },
];
