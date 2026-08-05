/**
 * sections.js — THE CONTENT FILE.
 *
 * This is the only file you need to touch to add, remove or reorder a section.
 * Everything else (3D placement, nav list, projected labels, detail panel, depth
 * gauge, sounding chart) is generated from this array at runtime.
 *
 * Fields
 *   id        unique slug, also the URL hash (#robotics)
 *   realms    which 3D theme(s) this belongs to, by id from content/realms.js.
 *             The FIRST is the home realm: that's where the full station lives
 *             and where a deep link lands. Any further realms get a lighter
 *             cross-link marker, placed automatically in that realm's roomiest
 *             stretch, which jumps back home. Use it when a topic honestly spans
 *             two worlds rather than duplicating the section.
 *   at        position WITHIN ITS HOME REALM, 0..1. Order in this array doesn't
 *             matter; each realm sorts its own stations by `at`.
 *   nav       short label for the navigator and the chart
 *   kicker    tiny monospace overline ("Dossier 03", "Interest", …)
 *   title     headline for the projected label and the detail panel
 *   image     path to a still, or null for a procedural instrument card
 *   video     optional looping alpha WebM played on the card instead of the
 *             still. Its transparency is kept, so the subject floats in the
 *             frame rather than sitting on a lit rectangle. `image` stays on as
 *             the chart thumbnail and the fallback if the video can't play.
 *   aspect    card aspect ratio (w/h). Optional; defaults to 1.5
 *   glyph     motif drawn behind the card:
 *             'ring' | 'sonar' | 'grid' | 'orbit' | 'run'. Optional.
 *   radius    abyss only — distance from the water column's axis. Optional.
 *   dy        abyss only — vertical nudge for composition. Optional.
 *   body      array of paragraphs for the detail panel
 *   tags      array of short strings
 *   links     array of { label, href }
 */

export const SECTIONS = [
  // ───────────────────────────────────────────────────────────────── abyss
  {
    id: 'origin',
    realms: ['abyss'],
    at: 0.1,
    nav: 'Origin',
    kicker: 'Dossier 01',
    title: 'Born on the beach, raised on Linux',
    image: './public/media/portrait.jpg',
    aspect: 0.78,
    glyph: 'ring',
    radius: 16,
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
    at: 0.46,
    nav: 'The Ocean',
    kicker: 'Interest',
    title: 'The best food, the best days, the strangest life',
    image: null,
    glyph: 'sonar',
    radius: 21,
    body: [
      "It's the source of the best foods, the most fun activities, and some very intelligent, mysterious life forms.",
      'Whether you want to talk about planning a dive trip or a moonshot project to extract plastic and revive coral reefs, oceans are always a topic of interest.',
      "You'll find me diving with sharks whenever the calendar allows it.",
    ],
    tags: ['Diving with sharks', 'Reef restoration', 'Plastic extraction'],
    links: [],
  },
  {
    id: 'dogs',
    realms: ['abyss'],
    at: 0.78,
    nav: 'Dogs',
    kicker: 'Interest',
    title: 'Dogs',
    image: './public/media/dog.jpg',
    aspect: 0.75,
    glyph: 'ring',
    radius: 18,
    body: ['No explanation needed.'],
    tags: [],
    links: [],
  },

  // ─────────────────────────────────────────────────────────────── foundry
  {
    id: 'robotics',
    realms: ['foundry'],
    at: 0.2,
    nav: 'Robotics',
    kicker: 'Dossier 02',
    title: 'What makes a robot interesting?',
    image: './public/media/battlebots.jpg',
    video: './public/media/turntable/complete-control.webm',
    aspect: 1.78,
    glyph: 'grid',
    body: [
      "Some of the biggest and most advanced robotics projects of today — read: autonomous cars — don't look like robots. Others, like my beloved battlebots, would be outcast by the academic neckbeards as not being robots at all.",
      'What makes a robot a robot, and what makes a robot… interesting?',
      "Complete Control competed on ABC's BattleBots.",
    ],
    tags: ['BattleBots', 'Complete Control', 'Autonomy'],
    links: [],
  },
  {
    id: 'hardware',
    realms: ['foundry', 'lattice'],
    at: 0.5,
    nav: 'Hardware',
    kicker: 'Dossier 03',
    title: 'Things built with hands',
    image: './public/media/robogames.jpg',
    aspect: 0.8,
    glyph: 'ring',
    body: [
      'A very creepy looking humanoid robot built for RoboGames. Alongside it: the Santa Barbot bartending robot, a ferrofluid fountain, and an LED display running openFrameworks on embedded Linux to simulate particle physics — as a refrigerator magnet.',
      'Also, a custom interactive game console and embedded electronics built to make chugging beer a competitive sport. Truly a collegiate engineering special.',
      'Hardware is where the ideas stop being negotiable.',
    ],
    tags: ['RoboGames', 'Santa Barbot', 'Ferrofluid', 'Embedded Linux'],
    links: [],
  },
  {
    id: 'fitness',
    realms: ['foundry'],
    at: 0.8,
    nav: 'Fitness',
    kicker: 'Interest',
    title: 'The body as a machine you maintain',
    image: null,
    glyph: 'grid',
    body: [
      "I'm a certified personal trainer, launched a venture-backed fitness tech company, and was training for a men's classic bodybuilding competition before covid.",
      'Always looking for a lifting buddy.',
    ],
    tags: ['Certified trainer', 'Fitness tech', 'Classic physique'],
    links: [],
  },

  // ────────────────────────────────────────────────────────────── velocity
  {
    id: 'professional',
    realms: ['velocity', 'foundry'],
    at: 0.16,
    nav: 'Apple SPG',
    kicker: 'Dossier 04',
    title: "Apple's Special Projects Group",
    image: null,
    glyph: 'run',
    body: [
      "Employed by Apple's Special Projects Group, an R&D division focusing on new technologies and products to be added to the Apple portfolio.",
      'Led an innovation and intellectual property group there before leaving to build my own.',
    ],
    tags: ['Apple SPG', 'R&D', 'IP leadership'],
    links: [],
  },
  {
    id: 'livewire',
    realms: ['velocity'],
    at: 0.42,
    nav: 'LiveWire',
    kicker: 'Dossier 05',
    title: 'Harley-Davidson LiveWire',
    image: './public/media/livewire.jpg',
    aspect: 1.5,
    glyph: 'run',
    body: [
      "Part of the amazing team behind Harley-Davidson's first electric motorcycle — a machine that had to convince the most tradition-bound audience in motorcycling that electric was worth wanting.",
      'Also part of the teams behind Boosted Boards and the Mugen Shinden.',
    ],
    tags: ['Harley-Davidson', 'Boosted Boards', 'Mugen Shinden'],
    links: [],
  },
  {
    id: 'mission-r',
    realms: ['velocity'],
    at: 0.68,
    nav: 'Mission R',
    kicker: 'Dossier 06',
    title: 'Mission R',
    image: './public/media/mission-r.jpg',
    aspect: 1.5,
    glyph: 'orbit',
    body: [
      'An electric superbike built when electric superbikes were not a category anyone believed in. Gold trellis, carbon bodywork, and a powertrain that embarrassed litre bikes off the line.',
      'Robots that carry humans at highway speeds are still the projects I find hardest to walk away from.',
    ],
    tags: ['Mission Motorcycles', 'Electric powertrain', 'Racing'],
    links: [],
  },
  {
    id: 'motorcycles',
    realms: ['velocity'],
    at: 0.9,
    nav: 'Motorcycles',
    kicker: 'Interest',
    title: 'Forty percent less traffic, if anyone would listen',
    image: null,
    glyph: 'run',
    body: [
      'A study found that if 10% of car drivers switched to traffic-filtering two-wheelers, overall vehicular congestion would be reduced by 40%.',
      'Could motorcycles ever hit that level of mainstream? Who knows — but they sure put a smile on my face.',
    ],
    tags: ['Lane filtering', 'Congestion', 'Two wheels'],
    links: [],
  },

  // ─────────────────────────────────────────────────────────────── atelier
  {
    id: 'patents',
    realms: ['atelier', 'foundry'],
    at: 0.3,
    nav: 'Patents',
    kicker: 'Portfolio',
    title: 'An eight-figure patent portfolio',
    image: './public/media/figure.jpg',
    aspect: 1.3,
    glyph: 'grid',
    body: [
      'IP leader at both the strategic and inventorship level. After leading an innovation and intellectual property group at Apple, I went on to develop an eight-figure patent portfolio for my own company.',
      'Numerous US and international patents filed; currently advising companies on IP strategy.',
    ],
    tags: ['US + International', 'IP strategy', 'Advisory'],
    links: [],
  },
  {
    id: 'design',
    realms: ['atelier'],
    at: 0.72,
    nav: 'Design',
    kicker: 'Formation',
    title: 'Industrial design, studied in Milan',
    image: null,
    glyph: 'ring',
    body: [
      'Industrial design in Milan, robotics in Osaka, technology entrepreneurship and product in the Bay Area. These formative pillars still shape the projects I work on and invest in.',
      "Find technology worth getting excited about, build something the humans around you love, position it to thrive in an open market — that's when you change the world.",
    ],
    tags: ['Milan', 'Industrial design', 'Product'],
    links: [],
  },

  // ─────────────────────────────────────────────────────────────── lattice
  {
    id: 'software',
    realms: ['lattice', 'foundry'],
    at: 0.2,
    nav: 'Morphologies',
    kicker: 'Dossier 07',
    title: 'Machine learning robot morphologies',
    image: './public/media/morphologies.jpg',
    aspect: 1.85,
    glyph: 'grid',
    body: [
      'Evolving robot body plans in simulation, then building the survivors. Parameters for limb lengths, masses, spring constants and joint damping, all left to the search rather than to my taste.',
      'The interesting result was never the winning morphology. It was how strange the winners looked.',
    ],
    tags: ['Evolutionary robotics', 'Simulation', 'Optimization'],
    links: [],
  },
  {
    id: 'dataviz',
    realms: ['lattice'],
    at: 0.5,
    nav: 'Data viz',
    kicker: 'Dossier 08',
    title: 'Making very large datasets legible',
    image: './public/media/whatsup-viz.jpg',
    aspect: 1.6,
    glyph: 'grid',
    body: [
      'What Up: a social media cloud-map visualization. Interactive visualization of large library datasets. A post-Fukushima radiation map. An automated pairs-trading algorithm.',
      'Different domains, same problem: too much data and no intuition, until you draw it.',
    ],
    tags: ['What Up', 'Pairs trading', 'Radiation mapping', 'Library data'],
    links: [],
  },
  {
    id: 'osint',
    realms: ['lattice'],
    at: 0.8,
    nav: 'Geospatial OSINT',
    kicker: 'Current',
    title: 'Institutional insight, individually accessible',
    image: null,
    glyph: 'sonar',
    body: [
      'Leveraging satellite imagery, maps, social media and other public data sources, individuals can uncover new levels of insight previously reserved for large and well-resourced institutions.',
      'It is a very interesting time, and the tools are more accessible than they have ever been.',
    ],
    tags: ['Satellite imagery', 'Open source intelligence', 'Geospatial'],
    links: [],
  },

  // ───────────────────────────────────────────────────────────────── orbit
  {
    id: 'travel',
    realms: ['orbit', 'velocity'],
    at: 0.3,
    nav: 'Travel',
    kicker: 'Interest',
    title: 'Japan, Italy, Korea, China, Hong Kong',
    image: './public/media/japan-robot.jpg',
    aspect: 0.75,
    glyph: 'orbit',
    body: [
      "I've been privileged to have the opportunity to take on international work, research and motorcycle rides in Japan, Italy, Korea, China and Hong Kong.",
      'Able to converse respectfully in Japanese, and swear loudly in Italian.',
    ],
    tags: ['Osaka', 'Milan', 'Seoul', 'Hong Kong'],
    links: [],
  },
  {
    id: 'contact',
    realms: ['orbit'],
    at: 0.78,
    nav: 'Contact',
    kicker: 'Uplink',
    title: 'Say hello',
    image: null,
    glyph: 'sonar',
    body: [
      'Always happy to talk about robots that carry humans, anything below the waterline, or a venture worth getting excited about.',
    ],
    tags: [],
    links: [{ label: 'zr@3na.co', href: 'mailto:zr@3na.co' }],
  },
];
