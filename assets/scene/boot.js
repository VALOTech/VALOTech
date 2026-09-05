/* Load the planet only where it can run, and place it against the document.
 *
 * The scene knows how to draw a planet; it does not know what a chapter is.
 * So the placement rules live here, with the document they are about, and the
 * scene reads one small state object every frame.
 *
 * This is a module so relative specifiers resolve against this file rather
 * than the page, and so a browser without module support never asks for the
 * graphics library at all. */

const container = document.getElementById('planet');
const sun = document.getElementById('sun');
const root = document.documentElement;

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    );
  } catch (e) {
    return false;
  }
}

/* Read by the scene every frame, written here. */
const motion = {
  scroll: 0,
  growth: 0,
  pointerX: 0,
  reducedMotion: false,
  visualScale: 1,
  /* Where the scene should believe the sun is. Written here because the page
     is what knows where the disc is painted; read by the scene so the
     terminator points at the star the reader can actually see. */
  lightDir: { x: -0.499, y: 0.643, z: 0.581 }
};

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/* An exponential approach expressed as a time constant rather than a
   per-frame fraction, so it converges at the same speed whatever the frame
   rate is. `tau` is roughly the time to close two-thirds of the gap. */
function ease(seconds, tau) {
  return 1 - Math.exp(-seconds / tau);
}

/* ---------------------------------------------------------------- The sun */

/* The planet is the origin. The camera rides with it, so the planet goes
   where the layout wants it and the orbit is carried by everything else: the
   sun swings around the sky and the star field slides against it, which is
   what an orbit looks like from the surface of the world making it. Curving
   the planet's own path around a fixed star does the opposite — it puts the
   reader outside the system, and it costs the layout every station it asked
   for, because a station on an arc is not the station that was written.

   The sun's apparent bearing from the planet, in degrees, screen axes: 270 is
   straight overhead, 0 is due right, and y grows downward. It crosses the sky
   once over the page, from one shoulder of the world to the other by way of
   directly above it. A narrower arc reads as a lamp clipped to the planet
   rather than as a star the planet is going round, and that is the whole point
   of putting the reader on the surface. Both ends stay well above the
   horizontal, because a sun level with the world grazes its limb and the
   surface goes to silhouette. */
const SUN_BEARING_FROM = 216;
const SUN_BEARING_TO = 324;

/* A phone is a different sky: the planet sits near the middle and there are
   only a couple of hundred pixels either side of it, so the star crosses a
   shorter arc, high up, where nothing is being read. */
const SUN_BEARING_FROM_NARROW = 232;
const SUN_BEARING_TO_NARROW = 308;

/* How far the star stands off the planet on screen. Wide screens measure it
   against the shorter axis; a phone measures it against its height, because
   the only clear sky on a phone is the strip above the copy. */
const SUN_DISTANCE = 0.395;
const SUN_DISTANCE_NARROW = 0.36;

/* Below this the light grazes the limb and the surface goes to silhouette.
   The sun may sit low against the planet; it may not sit on its horizon. */
const MIN_ELEVATION = 0.42;

/* Scrolling turns the world faster. The gain converts pages-per-second into a
   multiplier; the cap keeps a flick from spinning the surface into a blur. */
const SPIN_BOOST_GAIN = 26;
const SPIN_BOOST_MAX = 7;
const SPIN_EASE = 0.18;

/* The share of normal pace the satellites keep when motion is reduced. */
const CALM_ORBIT = 0.16;

/* Chosen so that at sixty frames a second the planet closes about six percent
   of its remaining distance per frame — the follow the stations were tuned
   against — and closes the same amount per second everywhere else. */
const DRIFT_EASE = 0.26;

/* The planet trails its target by the target's speed times the easing's time
   constant, which is why a chapter can be reached before the planet is in the
   space it left — a fault no amount of moving the stations earlier can fix,
   because moving a station moves the target and the trail with it. Reading the
   journey a little ahead of the reader cancels it instead: the lead is the
   same product, so the two subtract. It falls to nothing the moment scrolling
   stops, so a settled planet sits exactly on its station rather than past it.

   The measured rate is smoothed, because a wheel delivers scroll in steps and
   an unsmoothed lead would jump the planet on every notch, and it is capped,
   because a flick would otherwise read the journey most of a page ahead. */
/* One frame of an ordinary scroll covers well under a hundredth of the page;
   a flick at three thousand pixels a second covers about a four-hundredth. A
   fiftieth in a single frame is not scrolling. */
const JUMP_STEP = 0.02;

const LEAD_EASE = 0.2;
const LEAD_MAX = 0.06;

/* How far the reference's key light sits toward the viewer relative to its
   spread across the frame. Holding the ratio keeps the surface's modelling
   while its direction changes. */
const FRONT_RATIO = 0.71;

/* ------------------------------------------------------------- The journey */

/* The stations below are written as fractions of the page, and the page is not
   one length. Reduced motion collapses the two scroll-driven chapters and the
   mapping chapter to their plain stacked height — three and a half thousand
   pixels shorter here — and a locale with longer sentences stretches it the
   other way. A station written at .377 then lands in a different chapter than
   the one it was tuned against, and that is not drift: the whole journey is
   reading a different story from the one on screen. A reader with animation
   turned off saw the bare rock parked on the left through a chapter that had
   asked for a finished world on the right.

   So the raw scroll fraction is remapped through the chapters themselves.
   Each chapter's measured top is mapped onto the fraction the journey was
   tuned against, piecewise-linearly between them, and the table always sees
   the page it was written for however long the real one is. */
const CHAPTER_SPINE = [
  ['problem', 0.048],
  ['approach', 0.213],
  ['deliver', 0.377],
  ['workforce', 0.47],
  ['valostack', 0.539],
  ['trust', 0.588],
  ['people', 0.686],
  ['outcome', 0.899],
  ['ecosystem', 0.952]
];

let spine = null;
let spineHeight = -1;

function measureSpine() {
  const total = root.scrollHeight - window.innerHeight;
  spineHeight = root.scrollHeight;
  if (total <= 0) {
    spine = null;
    return;
  }
  const points = [[0, 0]];
  for (let i = 0; i < CHAPTER_SPINE.length; i++) {
    const el = document.getElementById(CHAPTER_SPINE[i][0]);
    if (!el) continue;
    const at = (window.scrollY + el.getBoundingClientRect().top) / total;
    /* Strictly increasing, or the interpolation divides by nothing. A chapter
       that measures at or below its predecessor is one the layout has folded
       away; the pair either side of it still spans it correctly. */
    if (at > points[points.length - 1][0] + 1e-4 && at < 1) {
      points.push([at, CHAPTER_SPINE[i][1]]);
    }
  }
  points.push([1, 1]);
  spine = points.length > 2 ? points : null;
}

function onSpine(raw) {
  if (!spine) return raw;
  for (let i = 1; i < spine.length; i++) {
    if (raw <= spine[i][0]) {
      const from = spine[i - 1];
      const to = spine[i];
      const span = to[0] - from[0];
      const t = span > 1e-6 ? (raw - from[0]) / span : 0;
      return from[1] + (to[1] - from[1]) * t;
    }
  }
  return 1;
}

/* Stations, in viewport units. They are written as positions because that is
   how a page is laid out — but the planet is moved between them in polar
   coordinates about the sun, so every leg curves around it. A straight line
   between two points beside a star is the one path a planet would never take.

   The scroll spans are deliberate. Going out is quick, because the argument
   needs the frame. Coming home takes a third of the page, because that is the
   part worth watching. */
const JOURNEY = [
  /* Stations are pinned to arrive *before* their chapter, never during it: the
     leg into a chapter finishes above its top edge, so by the time the reader
     is reading, the planet is already standing where the chapter left room for
     it and the labels pinned to it are not still travelling.

     The fractions are chapter positions, not page positions: CHAPTER_SPINE
     above pins each chapter's top to the number written here, and the page's
     real length is mapped onto it every time that length changes. So a station
     at .377 is the top of the deliver chapter on any page — the tall one, the
     short one a reader with motion turned off gets, the taller one a locale
     with longer sentences builds.

     A leg is sized and placed by the easing, not by taste. The planet follows
     a moving target, so while the reader scrolls it trails by roughly the
     target's speed times the easing's time constant. Two things follow. A leg
     needs a real span of page — a short one arrives late however early the
     station is written. And it has to *end* before the chapter does not begin
     but arrive: each leg finishes about two hundredths of the page above its
     chapter's top, which is the half-second the planet needs to stop. Lag in
     the middle of a leg is invisible, because nothing is pinned to the planet
     while it travels; lag at the top of a chapter is the whole complaint. */
  { at: 0.0, x: 54, y: 50, scale: 1.05 },
  { at: 0.012, x: 54, y: 50, scale: 1.05 },
  /* Two chapters a side. The planet settles once and stays, so a crossing is
     an event rather than the page's usual state, and the two long chapters
     that open the argument share one station instead of trading it. */
  { at: 0.044, x: 30, y: 54, scale: 1.0 },
  { at: 0.190, x: 30, y: 54, scale: 1.0 },
  { at: 0.215, x: 32, y: 50, scale: 0.96 },
  { at: 0.314, x: 32, y: 50, scale: 0.96 },
  /* Across to the right, in plain sight, in the window the page opens for it.
     The two arguments face each other: the chapter being left holds one side
     and the chapter being entered holds the other, and between the moment the
     first releases and the moment the second is level with the world there is
     a gap of about half a second of reading. The crossing is timed to that
     gap. It starts at the end of the pair it is leaving and is finished before
     the next pair is entered, which is the whole of what makes the change of
     side read as one movement rather than as a scramble. Leaving the frame
     instead solves the collision and loses the world, which is worse. */
  { at: 0.348, x: 75, y: 52, scale: 0.9 },
  { at: 0.430, x: 75, y: 52, scale: 0.9 },
  { at: 0.444, x: 76, y: 46, scale: 0.84 },
  { at: 0.486, x: 76, y: 46, scale: 0.84 },
  /* Back to the left, across the shortest stretch of page on the site. The
     two stations are pulled as close together as the arguments allow — a
     right station has to clear the column by the orbit's whole reach, and so
     does a left one — because every viewport-width of crossing is a second of
     scrolling during which neither chapter can name its bodies. */
  { at: 0.514, x: 25, y: 52, scale: 0.88 },
  { at: 0.586, x: 25, y: 52, scale: 0.88 },
  { at: 0.602, x: 24, y: 46, scale: 0.84 },
  { at: 0.644, x: 24, y: 46, scale: 0.84 },
  /* Home and centred through the mapping chapter. */
  { at: 0.674, x: 50, y: 56, scale: 0.9 },
  { at: 0.830, x: 50, y: 56, scale: 0.9 },
  /* Two on the right to close. */
  { at: 0.873, x: 80, y: 46, scale: 0.84 },
  { at: 1.0, x: 79, y: 46, scale: 0.9 }
];

/* Narrower on a phone: the planet sits behind the copy there, so a wide swing
   would drag the eye across the text rather than around the sun. */
const JOURNEY_NARROW = [
  { at: 0.0, x: 48, y: 56, scale: 1.0 },
  { at: 0.46, x: 62, y: 62, scale: 0.74 },
  { at: 0.6, x: 64, y: 44, scale: 0.8 },
  { at: 0.78, x: 48, y: 56, scale: 0.92 },
  { at: 0.86, x: 48, y: 56, scale: 0.92 },
  { at: 1.0, x: 62, y: 48, scale: 0.8 }
];

const NARROW = 900;

/* The hero markers are laid out from where the planet stands at the top of the
   page. Publishing it from the journey's own first station keeps the two from
   drifting apart — the alternative is the same pair of numbers written once in
   CSS and once here, which stays true exactly until one of them is tuned. */
document.documentElement.style.setProperty('--hero-x', JOURNEY[0].x + 'vw');
document.documentElement.style.setProperty('--hero-y', JOURNEY[0].y + 'vh');

let driftVW = 0;
let offsetVH = 0;
let scale = 1;
let introStartedAt = 0;
let lastTick = 0;
let lastProgress = 0;
let leadRate = 0;
let spinBoost = 0;
let orbitClock = 0;
let running = false;
let raf = 0;
let primed = false;

/* ---------------------------------------------------------- The satellites */

/* Three bodies on flat elliptical paths about the planet, drawn in two layers
   clipped to the top and bottom halves of the same box. The rear layer sits
   under the planet and the front layer over it, so a satellite passes behind
   on the far side of its orbit and in front on the near side — which is the
   whole reason the orbit reads as a three-dimensional thing at all.

   Two of them carry a name, and which name goes where follows from what the
   body is. The moon is the oldest thing in the sky, so it names the oldest
   thing the organisation has: its people. What was built names what is being
   built. */
/* Every path keeps a vertical semi-axis wider than the planet, so no body is
   ever behind it: one that spends half of each revolution occluded is one the
   reader watching the cover never sees move. All three take the world's own
   forty-eight seconds — a satellite whipping round in nine beside a world
   taking forty-eight reads as two unrelated animations rather than as one
   system. */
/* Three bodies, evenly spaced round the circle and on three distinct paths, so
   at any moment they stand apart rather than clustering — each one has to have
   room beside it for the label anchored to it.

   They arrive in the order the story does. A bare rock has nothing going round
   it, so the cover's sky is empty. A world gets a moon, on the widest path,
   because that is where ours is. The two the argument is about are built, not
   found, so they arrive last and they are drawn as what they are: a body with
   solar panels, on the closer paths a working satellite actually takes.

   They share one period, and
   that is the whole of what keeps them apart: on separate periods the phase
   offsets drift, and three bodies written a third of a turn apart close to
   thirty-five degrees within a minute. One period holds the third of a turn
   forever. The period is the planet's own, so the system reads as one thing.
   */
const SATELLITES = [
  { rx: 92, ry: 40, r: 6.4, period: 48, phase: 0.0, kind: 'moon', label: 'YOUR PEOPLE' },
  { rx: 78, ry: 35, r: 3.4, period: 48, phase: 0.3333, kind: 'craft', label: 'AI' },
  { rx: 64, ry: 32, r: 3.4, period: 48, phase: 0.6667, kind: 'craft', label: '' }
];

const SPHERES = {
  moon: [['0%', '#e8e6e0'], ['24%', '#bdbab4'], ['54%', '#8b8884'], ['78%', '#514f4d'], ['100%', '#141416']],
  mars: [['0%', '#f1c2a1'], ['22%', '#d58b69'], ['55%', '#ad5946'], ['80%', '#673129'], ['100%', '#24151a']],
  neptune: [['0%', '#eeeaff'], ['20%', '#aaa6ee'], ['46%', '#625bc8'], ['70%', '#38318e'], ['100%', '#090921']],
  venus: [['0%', '#fffdf1'], ['18%', '#fff0b8'], ['46%', '#e8bd62'], ['72%', '#a76d2c'], ['100%', '#241711']]
};

const NS = 'http://www.w3.org/2000/svg';
const orbitNodes = [];
const orbitStage = { moon: 0, craft: 0 };

function svg(name, attrs) {
  const el = document.createElementNS(NS, name);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

function buildOrbits() {
  const scene = container.parentNode;
  if (!scene) return;

  ['rear', 'front'].forEach((depth) => {
    const root = svg('svg', {
      class: 'orbits orbits--' + depth,
      viewBox: '0 0 200 100',
      'aria-hidden': 'true'
    });

    const defs = svg('defs', {});
    const clip = svg('clipPath', { id: 'orbit-clip-' + depth });
    clip.appendChild(
      svg('rect', { x: -20, y: depth === 'rear' ? -20 : 50, width: 240, height: 70 })
    );
    defs.appendChild(clip);
    for (const key in SPHERES) {
      const grad = svg('radialGradient', {
        id: 'orbit-' + key + '-' + depth,
        cx: '31%',
        cy: '27%',
        r: '74%'
      });
      SPHERES[key].forEach(([offset, color]) =>
        grad.appendChild(svg('stop', { offset: offset, 'stop-color': color }))
      );
      defs.appendChild(grad);
    }
    /* A solar array reads as one by its stripes, not by its colour. */
    const panel = svg('linearGradient', {
      id: 'orbit-panel-' + depth,
      x1: '0%', y1: '0%', x2: '0%', y2: '100%'
    });
    [['0%', '#3b4a86'], ['34%', '#222c56'], ['36%', '#4a5c9e'],
     ['66%', '#222c56'], ['68%', '#4a5c9e'], ['100%', '#1a2244']]
      .forEach(([offset, color]) =>
        panel.appendChild(svg('stop', { offset: offset, 'stop-color': color }))
      );
    defs.appendChild(panel);
    root.appendChild(defs);

    const body = svg('g', { 'clip-path': 'url(#orbit-clip-' + depth + ')' });

    /* No drawn rings. Three bodies moving on their own paths read as an orbit
       on their own; the dashed ellipses only crowded the space the labels
       anchored to them need. */

    const marks = SATELLITES.map((sat) => {
      const g = svg('g', { class: 'orbit-body' });
      if (sat.kind === 'craft') {
        /* A body between two arrays, on a boom, with a dish looking back at
           the world. Drawn rather than shaded: at this size a sphere reads as
           another planet, and the point of these two is that they are ours. */
        const w = sat.r * 1.05;
        const arm = sat.r * 1.75;
        g.appendChild(svg('line', {
          class: 'orbit-boom', x1: -arm, y1: 0, x2: arm, y2: 0
        }));
        [-arm - w * 0.95, arm - w * 0.05].forEach((x) =>
          g.appendChild(svg('rect', {
            x: x, y: -w * 0.62, width: w * 1.9, height: w * 1.24, rx: w * 0.16,
            fill: 'url(#orbit-panel-' + depth + ')'
          }))
        );
        g.appendChild(svg('rect', {
          class: 'orbit-hull',
          x: -w * 0.5, y: -w * 0.62, width: w, height: w * 1.24, rx: w * 0.24
        }));
        g.appendChild(svg('line', {
          class: 'orbit-boom', x1: 0, y1: -w * 0.62, x2: 0, y2: -w * 1.7
        }));
        g.appendChild(svg('circle', {
          class: 'orbit-dish', cx: 0, cy: -w * 1.85, r: w * 0.34
        }));
      } else {
        g.appendChild(
          svg('circle', {
            class: 'orbit-planet',
            r: sat.r,
            fill: 'url(#orbit-moon-' + depth + ')'
          })
        );
        /* The maria. A grey ball is a bead; the dark seas are what makes a
           reader recognise this particular moon rather than a generic one. */
        [[-0.30, -0.28, 0.30], [0.16, -0.40, 0.19], [-0.10, 0.24, 0.26],
         [0.34, 0.20, 0.15], [-0.44, 0.16, 0.13]].forEach(([cx, cy, rr]) =>
          g.appendChild(svg('ellipse', {
            class: 'orbit-mare',
            cx: cx * sat.r, cy: cy * sat.r, rx: rr * sat.r, ry: rr * sat.r * 0.82
          }))
        );
      }
      /* Only the near half is named. A satellite on the far side is behind the
         world, and a label that survived the occlusion would read as a clipped
         word rather than as something passing behind. */
      if (sat.label && depth === 'front') {
        /* A chip rather than bare type: the label sits over whatever the
           orbit is passing, and a stroke alone leaves it fighting the
           surface behind it. The mono face makes the width predictable
           enough to size the plate from the character count. */
        const size = 3.4;
        const w = sat.label.length * size * 0.72 + size * 1.4;
        const y = -sat.r - size * 2.5;
        g.appendChild(
          svg('rect', {
            class: 'orbit-chip',
            x: -w / 2,
            y: y,
            width: w,
            height: size * 2,
            rx: size * 0.6
          })
        );
        const text = svg('text', {
          class: 'orbit-label',
          'text-anchor': 'middle',
          y: y + size * 1.35
        });
        text.textContent = sat.label;
        g.appendChild(text);
      }
      body.appendChild(g);
      return g;
    });

    root.appendChild(body);
    scene.insertBefore(root, depth === 'rear' ? container : null);
    orbitNodes.push({ root, marks });
  });
}

/* The header covers the top of the frame, so the middle of what a reader can
   actually see sits half a header below the middle of the window. Everything
   the scene places vertically is measured from there — the world, and with it
   the star it is lit by, since the sun is placed from the world. */
function sceneCentreY(vh) {
  const hdr = parseFloat(getComputedStyle(root).getPropertyValue('--hdr'));
  return vh / 2 + (isNaN(hdr) ? 0 : hdr / 2);
}

function moveOrbits(seconds, stage) {
  for (let n = 0; n < orbitNodes.length; n++) {
    const marks = orbitNodes[n].marks;
    for (let i = 0; i < SATELLITES.length; i++) {
      const sat = SATELLITES[i];
      const turn = (seconds / sat.period + sat.phase) * Math.PI * 2;
      const x = 100 + Math.cos(turn) * sat.rx;
      const y = 50 + Math.sin(turn) * sat.ry;
      marks[i].setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ')');
      marks[i].setAttribute('opacity', (sat.kind === 'craft' ? stage.craft : stage.moon).toFixed(3));
    }
  }
}

/* Where each body actually is on the screen this frame, published so a label
   can be pinned to it. The orbit is drawn inside a 200x100 box that is itself
   sized and scaled against the planet, so a body's viewport position is not
   something a stylesheet can work out — it has to be handed over. */
function publishSatellites(seconds, cx, cy) {
  const layer = orbitNodes[0] && orbitNodes[0].root;
  if (!layer) return;
  const face = layer.getBoundingClientRect();
  /* How far the outermost body ever gets from the planet. Published from the
     same table that draws them, because anything reading it is deciding
     whether the orbit clears something — and a second copy of the number is
     true exactly until one of the two is tuned. */
  let reach = 0;
  for (let i = 0; i < SATELLITES.length; i++) {
    reach = Math.max(reach, (SATELLITES[i].rx / 200) * face.width);
  }
  root.style.setProperty('--orbit-reach', reach.toFixed(1) + 'px');
  for (let i = 0; i < SATELLITES.length; i++) {
    const sat = SATELLITES[i];
    const turn = (seconds / sat.period + sat.phase) * Math.PI * 2;
    const dx = ((Math.cos(turn) * sat.rx) / 200) * face.width;
    const dy = ((Math.sin(turn) * sat.ry) / 100) * face.height;
    root.style.setProperty('--sat' + i + '-x', (cx + dx).toFixed(1) + 'px');
    root.style.setProperty('--sat' + i + '-y', (cy + dy).toFixed(1) + 'px');
    /* Which way its label should open, so it never runs off the frame. */
    root.style.setProperty('--sat' + i + '-side', Math.cos(turn) >= 0 ? '1' : '-1');
    /* What a label has to clear, which is the drawn object rather than the
       radius it was sized from: a craft's arrays reach well past its hull. */
    const span = sat.kind === 'craft' ? sat.r * 2.9 : sat.r;
    root.style.setProperty('--sat' + i + '-r', ((span / 200) * face.width).toFixed(1) + 'px');
  }
}

function place(now) {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const total = root.scrollHeight - vh;
  const raw = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0;
  /* Re-measured whenever the document's own height changes, which is what a
     locale switch, a reveal that reflows, and turning motion off all do. */
  if (root.scrollHeight !== spineHeight) measureSpine();
  const progress = onSpine(raw);
  const still = reduce.matches;
  const wide = vw > NARROW;

  motion.scroll = progress;
  /* The cover stays lunar; life scrubs across the argument and is complete by
     the time the mapping chapter opens, because that chapter is about a
     finished world standing between the people and the workforce. */
  motion.growth = smoothstep((progress - 0.05) / 0.5);
  motion.reducedMotion = still;

  /* The sky is told how far the transformation has come, so the meteors can
     stop once there is a living world to look at. */
  if (window.VALO_SKY) window.VALO_SKY.setGrowth(motion.growth);

  /* How fast the reader is moving through the page, signed, in page-fractions
     per second. It feeds two things: the lead below, and the bounded spin
     multiplier further down. */
  const tick = now / 1000;
  const gap = Math.min(0.25, Math.max(1 / 120, tick - lastTick));
  const drift = (progress - lastProgress) / gap;
  const rate = Math.abs(drift);
  lastTick = tick;
  lastProgress = progress;
  /* A jump is not a scroll. Dragging the scrollbar, clicking a nav anchor or
     restoring a position on reload moves the page further in one frame than
     any reader ever does, and easing across that gap leaves the world drifting
     over the argument for a second or two after the reader has arrived — which
     is indistinguishable, from the chair, from a world that went to the wrong
     place. Past this step the scene is placed rather than eased, exactly as it
     is on the first frame. */
  if (Math.abs(progress - lastProgress) > JUMP_STEP) {
    primed = false;
    leadRate = 0;
  }
  leadRate += (drift - leadRate) * ease(gap, LEAD_EASE);
  const lead = Math.max(-LEAD_MAX, Math.min(LEAD_MAX, leadRate * DRIFT_EASE));
  const look = Math.max(0, Math.min(1, progress + lead));

  /* Which leg of the journey this position sits on. The stations are layout,
     so they are honoured as written — the lead moves when they are read, never
     what they say. Only the journey is read ahead: the growth scrub and the
     star's bearing stay honest to where the reader actually is. */
  const path = wide ? JOURNEY : JOURNEY_NARROW;
  let i = 0;
  while (i < path.length - 2 && look > path[i + 1].at) i++;
  const from = path[i];
  const to = path[i + 1];
  const span = to.at - from.at || 1;
  const t = smoothstep((look - from.at) / span);

  /* The stations are written for a page that reads left to right. Under
     Arabic and Urdu the argument is pinned to the other side, so the whole
     journey mirrors with it — otherwise the planet parks on top of the column
     it is supposed to be standing beside. */
  const mirror = root.getAttribute('dir') === 'rtl' ? -1 : 1;
  const targetVW = (from.x + (to.x - from.x) * t - 50) * mirror;
  const targetVH = from.y + (to.y - from.y) * t - 50;
  const targetScale = from.scale + (to.scale - from.scale) * t;

  /* How much of the orbit has been travelled, as a bearing to the star. */
  const arcFrom = wide ? SUN_BEARING_FROM : SUN_BEARING_FROM_NARROW;
  const arcTo = wide ? SUN_BEARING_TO : SUN_BEARING_TO_NARROW;
  const bearing = ((arcFrom + (arcTo - arcFrom) * progress) * Math.PI) / 180;
  motion.bearing = bearing;

  /* The same rate, as a bounded multiplier on everything that turns. Eased in
     both directions, so a flick reads as a surge and a stop as a coast rather
     than as a jump. */
  const wanted = still ? 0 : Math.min(SPIN_BOOST_MAX, rate * SPIN_BOOST_GAIN);
  spinBoost += (wanted - spinBoost) * ease(gap, SPIN_EASE);
  motion.spin = 1 + spinBoost;

  /* Eased toward the target rather than set, so a fast scroll reads as the
     planet following. On the first frame there is nothing to ease from.

     The rate is per second, not per frame: a frame-counted easing follows at
     one speed on a machine drawing sixty and at another on a machine drawing
     six, so the same page reads as a different animation on slower hardware —
     exactly the hardware least able to afford the difference. */
  const k = primed ? ease(gap, DRIFT_EASE) : 1;
  /* How far the planet still has to go, in viewport units, published so the
     page can wait for it to arrive before pinning anything to it. */
  root.style.setProperty(
    '--stone-travel',
    (Math.hypot(targetVW - driftVW, targetVH - offsetVH) * 10).toFixed(1)
  );
  driftVW += (targetVW - driftVW) * k;
  offsetVH += (targetVH - offsetVH) * k;
  scale += (targetScale - scale) * k;
  primed = true;

  /* The approach. It runs once, after the surface is ready, and never under
     reduced motion. */
  let introScale = 1;
  let introOpacity = 1;
  if (introStartedAt && !still) {
    const eased =
      1 - Math.pow(1 - Math.min(1, Math.max(0, (now - introStartedAt - 700) / 1650)), 3);
    introScale = 0.06 + eased * 0.94;
    introOpacity = eased;
  }

  motion.visualScale = scale * introScale;

  const floatX = still ? 0 : Math.sin((now / 1000) * 0.84) * 3;
  const floatY = still ? 0 : Math.cos((now / 1000) * 0.71) * 6;

  container.style.transform =
    `translate(calc(-50% + ${floatX.toFixed(1)}px + ${driftVW.toFixed(2)}vw),` +
    ` calc(-50% + var(--hdr) / 2 + ${floatY.toFixed(1)}px + ${offsetVH.toFixed(2)}vh))`;
  container.style.opacity = introOpacity.toFixed(3);

  /* The star, placed from the planet rather than from the frame. Its bearing
     is the orbit; its distance holds it in the band of open sky. */
  const planetX = vw / 2 + floatX + (driftVW / 100) * vw;
  const planetY = sceneCentreY(vh) + floatY + (offsetVH / 100) * vh;
  /* The distance breathes as the bearing swings. An orbit is an ellipse, and a
     star held at one radius for a whole page reads as a lamp on a bracket. */
  const swing = 1 + Math.cos((progress - 0.5) * Math.PI) * 0.18;
  const reach =
    (wide ? Math.min(vw, vh) * SUN_DISTANCE : vh * SUN_DISTANCE_NARROW) * swing;
  /* Held inside the frame. The star is a screen-space glow, and one pushed
     past an edge is a light source the reader cannot find — which is worse
     than a bearing a few degrees off the arc. The surface is lit from where
     the glow is actually drawn, so the two never disagree. */
  const edge = 26;
  const sunX = Math.max(
    edge,
    Math.min(vw - edge, planetX + Math.cos(bearing) * reach * mirror)
  );
  const sunY = Math.max(
    edge,
    Math.min(vh - edge, planetY + Math.sin(bearing) * reach)
  );

  if (sun) {
    sun.style.transform = `translate(${sunX.toFixed(1)}px, ${sunY.toFixed(1)}px)`;
    sun.style.opacity = introOpacity.toFixed(3);
  }

  /* The sky slides against the orbit too: the nearer a star is drawn, the
     further it travels, which is the parallax a year of orbiting produces. */
  if (window.VALO_SKY && window.VALO_SKY.setBearing) window.VALO_SKY.setBearing(bearing);

  /* The orbit layers are positioned from these, so they travel and shrink with
     the planet rather than being pinned to the viewport. */
  if (orbitNodes.length) {
    root.style.setProperty('--stone-x', `${(vw / 2 + floatX + (driftVW / 100) * vw).toFixed(1)}px`);
    root.style.setProperty('--stone-y', `${(sceneCentreY(vh) + floatY + (offsetVH / 100) * vh).toFixed(1)}px`);
    root.style.setProperty('--stone-scale', motion.visualScale.toFixed(3));
    /* Nothing orbits the bare rock: the cover's sky has a world in it and
       nothing else. The moon arrives with the surface it belongs to, and the
       two built ones arrive where the argument first needs something to pin a
       label to. The container carries whichever is furthest along, so it is
       out of the way while both are. */
    const moonStage = smoothstep((motion.growth - 0.30) / 0.32);
    const craftStage = smoothstep((progress - 0.335) / 0.055);
    orbitStage.moon = moonStage;
    orbitStage.craft = craftStage;
    root.style.setProperty(
      '--orbit-reveal',
      (Math.max(moonStage, craftStage) * introOpacity).toFixed(3)
    );
    /* The satellites keep their own time — they circle whether or not anyone
       scrolls, and quicker while someone does. Under reduced motion they keep
       circling too, at a sixth of the pace and with no scroll boost: slow
       enough that nothing appears to move without being watched for. */
    orbitClock += gap * (still ? CALM_ORBIT : motion.spin);
    moveOrbits(orbitClock, orbitStage);
    publishSatellites(
      orbitClock,
      vw / 2 + floatX + (driftVW / 100) * vw,
      sceneCentreY(vh) + floatY + (offsetVH / 100) * vh
    );
    nameOrbits();
  }

  /* The light is derived from where the disc was drawn, never set beside it,
     so the two cannot disagree. */
  let lx = -(planetX - sunX);
  let ly = planetY - sunY;
  const len = Math.hypot(lx, ly) || 1;
  lx /= len;
  ly /= len;
  if (ly < MIN_ELEVATION) {
    ly = MIN_ELEVATION;
    const flat = Math.hypot(lx, ly) || 1;
    lx /= flat;
    ly /= flat;
  }
  motion.lightDir.x = lx;
  motion.lightDir.y = ly;
  motion.lightDir.z = FRONT_RATIO;

  if (running) raf = requestAnimationFrame(place);
}

/* The two named satellites only introduce themselves where the page is
   talking about the people they stand for.

   Read from the chapter's position on every frame rather than from an
   observer. An observer is notified only when a ratio crosses a threshold, so
   a jump — an anchor, the End key, a dragged scrollbar — can land inside the
   chapter without one, and the names then never appear for that reader. */
let namedSection = null;

function nameOrbits() {
  if (!namedSection) namedSection = document.getElementById('people');
  if (!namedSection) return;
  const box = namedSection.getBoundingClientRect();
  const band = window.innerHeight * 0.25;
  root.classList.toggle(
    'orbits-named',
    box.top < window.innerHeight - band && box.bottom > band
  );
}

/* The placement runs whether or not the scene does. Without WebGL the planet
   is a still image and the sun is a gradient, and both still belong to the
   page's choreography — a sun parked at the origin bleeds a corona into the
   top-left corner, which is what happened when this was gated. */

const live = !!(container && hasWebGL());

/* The satellites are SVG and arithmetic. They were built inside the branch
   that loads the graphics library only because that is where the code
   happened to sit, which left a machine without WebGL looking at a still
   photograph with nothing moving anywhere on it. They belong to every
   machine. */
if (container) buildOrbits();

if (live) {
  import('./planet.js')
    .then((module) => {
      module.mount(container, motion, () => {
        introStartedAt = performance.now();
      });
      root.classList.add('has-scene');
    })
    .catch(() => {
      /* A failed context or a blocked request leaves the sky, which is a sky
         on its own. Nothing in the argument depended on the planet. */
    });

  window.addEventListener(
    'pointermove',
    (event) => {
      motion.pointerX = event.clientX / Math.max(1, window.innerWidth) - 0.5;
    },
    { passive: true }
  );
}

/* One loop, whether or not the graphics library ever arrives: without it the
   planet is a still image, but the bodies going round it are not. */
running = true;
raf = requestAnimationFrame(place);
window.addEventListener('pagehide', () => cancelAnimationFrame(raf));

