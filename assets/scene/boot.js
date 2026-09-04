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
   straight overhead, 0 is due right, and y grows downward. It sweeps once
   across the page — far enough to read as travel, and held inside the band of
   open sky above the argument, because a sun behind a scrim is a light source
   the reader cannot find. */
const SUN_BEARING_FROM = 280;
const SUN_BEARING_TO = 340;

/* A phone is a different sky: the planet sits near the middle and there are
   only a couple of hundred pixels either side of it, so the star crosses a
   shorter arc, high up, where nothing is being read. */
const SUN_BEARING_FROM_NARROW = 248;
const SUN_BEARING_TO_NARROW = 290;

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
/* How present the orbit is before the world is one. Enough to see the bodies
   move without being asked to; not enough to compete with the cover. */
const ORBIT_FLOOR = 0.45;

const SPIN_BOOST_GAIN = 26;
const SPIN_BOOST_MAX = 7;
const SPIN_EASE = 0.18;

/* The share of normal pace the satellites keep when motion is reduced. */
const CALM_ORBIT = 0.16;

/* Chosen so that at sixty frames a second the planet closes about six percent
   of its remaining distance per frame — the follow the stations were tuned
   against — and closes the same amount per second everywhere else. */
const DRIFT_EASE = 0.26;

/* How far the reference's key light sits toward the viewer relative to its
   spread across the frame. Holding the ratio keeps the surface's modelling
   while its direction changes. */
const FRONT_RATIO = 0.71;

/* ------------------------------------------------------------- The journey */

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

     Measured spans, this build: problem .048-.213 · approach .213-.377 ·
     deliver .377-.470 · workforce .470-.539 · valostack .539-.588 ·
     trust .588-.686 · people .686-.899 · outcome .899-.952 ·
     ecosystem .952-1.005. Re-measure before moving any of these.

     A leg is sized and placed by the easing, not by taste. The planet follows
     a moving target, so while the reader scrolls it trails by roughly the
     target's speed times the easing's time constant. Two things follow. A leg
     needs a real span of page — a short one arrives late however early the
     station is written. And it has to *end* before the chapter does not begin
     but arrive: each leg finishes about two hundredths of the page above its
     chapter's top, which is the half-second the planet needs to stop. Lag in
     the middle of a leg is invisible, because nothing is pinned to the planet
     while it travels; lag at the top of a chapter is the whole complaint. */
  { at: 0.0, x: 86, y: 48, scale: 1.15 },
  { at: 0.012, x: 86, y: 48, scale: 1.15 },
  /* The problem: argument right, planet and its bodies left. */
  { at: 0.046, x: 30, y: 54, scale: 1.0 },
  { at: 0.150, x: 30, y: 54, scale: 1.0 },
  /* The answer: the mirror of it. */
  { at: 0.193, x: 70, y: 54, scale: 1.0 },
  { at: 0.325, x: 70, y: 54, scale: 1.0 },
  /* From here every chapter holds its content left, so the planet keeps the
     right and only changes height and size as the story does. */
  { at: 0.357, x: 80, y: 52, scale: 0.9 },
  { at: 0.425, x: 80, y: 52, scale: 0.9 },
  { at: 0.450, x: 81, y: 46, scale: 0.84 },
  { at: 0.500, x: 81, y: 46, scale: 0.84 },
  { at: 0.519, x: 80, y: 52, scale: 0.88 },
  { at: 0.552, x: 80, y: 52, scale: 0.88 },
  { at: 0.568, x: 81, y: 44, scale: 0.82 },
  /* Held right until the trust chapter is nearly done. The leg home used to
     run its whole length, which walked the planet — and the bodies orbiting
     it — across the sentences the chapter left room beside. */
  { at: 0.638, x: 81, y: 46, scale: 0.86 },
  /* Home and centred through the mapping chapter. */
  { at: 0.666, x: 50, y: 56, scale: 0.9 },
  { at: 0.845, x: 50, y: 56, scale: 0.9 },
  { at: 0.879, x: 80, y: 46, scale: 0.84 },
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

   Two of them carry a name. They are the page's argument in orbit: your people
   and the AI workforce going round the same world. */
/* The two named bodies keep a vertical semi-axis wider than the planet, so
   they are never behind it: a satellite that spends half of each revolution
   occluded is a satellite the reader watching the cover never sees move. The
   third is deliberately close in and does cross the disc — one body passing
   behind is what makes the ring read as an orbit rather than a drawn ellipse. */
/* Periods on the same order as the world's own turn — it takes forty-eight
   seconds, and these take forty to fifty-six. A satellite whipping round in
   nine seconds beside a world that takes forty-eight reads as two unrelated
   animations rather than as one system. */
/* Three bodies, evenly spaced round the circle and on three distinct paths, so
   at any moment they stand apart rather than clustering — each one has to have
   room beside it for the label anchored to it. Periods are on the order of the
   world's own turn, and no two are equal, so the arrangement keeps changing
   without any two ever travelling together. */
const SATELLITES = [
  { rx: 92, ry: 40, r: 6.4, period: 52, phase: 0.0, fill: 'mars', label: 'YOUR PEOPLE' },
  { rx: 78, ry: 35, r: 4.6, period: 44, phase: 0.3333, fill: 'neptune', label: '' },
  { rx: 64, ry: 32, r: 5.4, period: 38, phase: 0.6667, fill: 'venus', label: 'AI' }
];

const SPHERES = {
  mars: [['0%', '#f1c2a1'], ['22%', '#d58b69'], ['55%', '#ad5946'], ['80%', '#673129'], ['100%', '#24151a']],
  neptune: [['0%', '#eeeaff'], ['20%', '#aaa6ee'], ['46%', '#625bc8'], ['70%', '#38318e'], ['100%', '#090921']],
  venus: [['0%', '#fffdf1'], ['18%', '#fff0b8'], ['46%', '#e8bd62'], ['72%', '#a76d2c'], ['100%', '#241711']]
};

const NS = 'http://www.w3.org/2000/svg';
const orbitNodes = [];

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
    root.appendChild(defs);

    const body = svg('g', { 'clip-path': 'url(#orbit-clip-' + depth + ')' });

    /* No drawn rings. Three bodies moving on their own paths read as an orbit
       on their own; the dashed ellipses only crowded the space the labels
       anchored to them need. */

    const marks = SATELLITES.map((sat) => {
      const g = svg('g', { class: 'orbit-body' });
      g.appendChild(
        svg('circle', {
          class: 'orbit-planet',
          r: sat.r,
          fill: 'url(#orbit-' + sat.fill + '-' + depth + ')'
        })
      );
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

function moveOrbits(seconds) {
  for (let n = 0; n < orbitNodes.length; n++) {
    const marks = orbitNodes[n].marks;
    for (let i = 0; i < SATELLITES.length; i++) {
      const sat = SATELLITES[i];
      const turn = (seconds / sat.period + sat.phase) * Math.PI * 2;
      const x = 100 + Math.cos(turn) * sat.rx;
      const y = 50 + Math.sin(turn) * sat.ry;
      marks[i].setAttribute('transform', 'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ')');
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
    root.style.setProperty('--sat' + i + '-r', ((sat.r / 200) * face.width).toFixed(1) + 'px');
  }
}

function place(now) {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const total = root.scrollHeight - vh;
  const progress = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0;
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

  /* Which leg of the journey this scroll position sits on. The stations are
     layout, so they are honoured as written. */
  const path = wide ? JOURNEY : JOURNEY_NARROW;
  let i = 0;
  while (i < path.length - 2 && progress > path[i + 1].at) i++;
  const from = path[i];
  const to = path[i + 1];
  const span = to.at - from.at || 1;
  const t = smoothstep((progress - from.at) / span);

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

  /* How fast the reader is moving through the page, as a bounded multiplier
     on everything that turns. Eased in both directions, so a flick reads as a
     surge and a stop as a coast rather than as a jump. */
  const tick = now / 1000;
  const gap = Math.min(0.25, Math.max(1 / 120, tick - lastTick));
  const rate = Math.abs(progress - lastProgress) / gap;
  lastTick = tick;
  lastProgress = progress;
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
    ` calc(-50% + ${floatY.toFixed(1)}px + ${offsetVH.toFixed(2)}vh))`;
  container.style.opacity = introOpacity.toFixed(3);

  /* The star, placed from the planet rather than from the frame. Its bearing
     is the orbit; its distance holds it in the band of open sky. */
  const planetX = vw / 2 + floatX + (driftVW / 100) * vw;
  const planetY = vh / 2 + floatY + (offsetVH / 100) * vh;
  const reach = wide ? Math.min(vw, vh) * SUN_DISTANCE : vh * SUN_DISTANCE_NARROW;
  const sunX = planetX + Math.cos(bearing) * reach * mirror;
  const sunY = planetY + Math.sin(bearing) * reach;

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
    root.style.setProperty('--stone-y', `${(vh / 2 + floatY + (offsetVH / 100) * vh).toFixed(1)}px`);
    root.style.setProperty('--stone-scale', motion.visualScale.toFixed(3));
    /* The orbit is present from the cover, faintly — three bodies going round
       a world that has not become one yet — and comes fully forward as the
       atmosphere does, so it is whole by the time the mapping chapter asks
       the reader to look at it. Held back entirely until then, the page opens
       on a sky with nothing moving in it. */
    root.style.setProperty(
      '--orbit-reveal',
      ((ORBIT_FLOOR + (1 - ORBIT_FLOOR) * smoothstep((motion.growth - 0.4) / 0.4)) *
        introOpacity).toFixed(3)
    );
    /* The satellites keep their own time — they circle whether or not anyone
       scrolls, and quicker while someone does. Under reduced motion they keep
       circling too, at a sixth of the pace and with no scroll boost: slow
       enough that nothing appears to move without being watched for. */
    orbitClock += gap * (still ? CALM_ORBIT : motion.spin);
    moveOrbits(orbitClock);
    publishSatellites(
      orbitClock,
      vw / 2 + floatX + (driftVW / 100) * vw,
      vh / 2 + floatY + (offsetVH / 100) * vh
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

