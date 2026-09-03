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

/* ---------------------------------------------------------------- The sun */

/* The sun does not move. Everything else in the sky is placed relative to it,
   which is what lets the planet's journey read as an orbit rather than as a
   sprite sliding around the frame. */
/* Up and to the right, in open sky. The left of every chapter is under a
   scrim that keeps the argument legible, and a sun placed there is a sun
   nobody sees — which would leave the planet orbiting an invisible centre. */
const SUN = { x: 66, y: 16 };
const SUN_NARROW = { x: 74, y: 12 };

/* Below this the light grazes the limb and the surface goes to silhouette.
   The sun may sit low against the planet; it may not sit on its horizon. */
const MIN_ELEVATION = 0.42;

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
  { at: 0.0, x: 48, y: 52, scale: 1.0 },
  { at: 0.06, x: 48, y: 52, scale: 1.0 },
  /* Out: the planet swings under the sun and up its right side, shrinking as
     it goes. Each leg is a constant-radius arc, so it reads as travel rather
     than as falling away. */
  { at: 0.34, x: 70, y: 62, scale: 0.62 },
  { at: 0.5, x: 82, y: 50, scale: 0.55 },
  { at: 0.68, x: 78, y: 33, scale: 0.72 },
  /* Home: one long sweep of about ninety degrees, back down and across. This
     is the leg worth watching, so it takes a fifth of the page on its own. */
  { at: 0.86, x: 48, y: 52, scale: 0.95 },
  { at: 0.92, x: 48, y: 52, scale: 0.95 },
  { at: 1.0, x: 72, y: 46, scale: 0.86 }
];

/* Narrower on a phone: the planet sits behind the copy there, so a wide swing
   would drag the eye across the text rather than around the sun. */
const JOURNEY_NARROW = [
  { at: 0.0, x: 48, y: 56, scale: 1.0 },
  { at: 0.5, x: 62, y: 62, scale: 0.74 },
  { at: 0.68, x: 64, y: 44, scale: 0.82 },
  { at: 0.9, x: 48, y: 56, scale: 0.96 },
  { at: 1.0, x: 60, y: 48, scale: 0.82 }
];

const NARROW = 900;

let driftVW = 0;
let offsetVH = 0;
let scale = 1;
let introStartedAt = 0;
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
const SATELLITES = [
  { rx: 94, ry: 38, r: 4.0, period: 18, phase: 0.12, fill: 'mars', label: 'YOUR PEOPLE' },
  { rx: 66, ry: 27, r: 2.9, period: 9.5, phase: 0.62, fill: 'neptune', label: '' },
  { rx: 88, ry: 35.5, r: 3.4, period: 12.5, phase: 0.38, fill: 'venus', label: 'AI' }
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

    [[94, 38], [66, 27]].forEach(([rx, ry], n) =>
      body.appendChild(
        svg('ellipse', { class: 'orbit-ring orbit-ring--' + n, cx: 100, cy: 50, rx: rx, ry: ry })
      )
    );

    const marks = SATELLITES.map((sat) => {
      const g = svg('g', { class: 'orbit-body' });
      g.appendChild(
        svg('circle', {
          class: 'orbit-planet',
          r: sat.r,
          fill: 'url(#orbit-' + sat.fill + '-' + depth + ')'
        })
      );
      if (sat.label) {
        const text = svg('text', { class: 'orbit-label', 'text-anchor': 'middle', dy: -sat.r - 2.6 });
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

function toPolar(px, py, sx, sy) {
  const dx = px - sx;
  const dy = py - sy;
  return { r: Math.hypot(dx, dy), a: Math.atan2(dy, dx) };
}

function place(now) {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const total = root.scrollHeight - vh;
  const progress = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0;
  const still = reduce.matches;
  const wide = vw > NARROW;

  motion.scroll = progress;
  /* The cover stays lunar; life scrubs continuously across the story. */
  motion.growth = smoothstep((progress - 0.06) / 0.84);
  motion.reducedMotion = still;

  /* The sky is told how far the transformation has come, so the meteors can
     stop once there is a living world to look at. */
  if (window.VALO_SKY) window.VALO_SKY.setGrowth(motion.growth);

  const star = wide ? SUN : SUN_NARROW;
  const sunX = (star.x / 100) * vw;
  const sunY = (star.y / 100) * vh;

  /* Which leg of the journey this scroll position sits on. */
  const path = wide ? JOURNEY : JOURNEY_NARROW;
  let i = 0;
  while (i < path.length - 2 && progress > path[i + 1].at) i++;
  const from = path[i];
  const to = path[i + 1];
  const span = to.at - from.at || 1;
  const t = smoothstep((progress - from.at) / span);

  const a = toPolar((from.x / 100) * vw, (from.y / 100) * vh, sunX, sunY);
  const b = toPolar((to.x / 100) * vw, (to.y / 100) * vh, sunX, sunY);
  let sweep = b.a - a.a;
  /* Take the short way between two stations; the arc comes from where the
     stations are, not from a wrap nobody asked for. */
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  while (sweep < -Math.PI) sweep += Math.PI * 2;

  const r = a.r + (b.r - a.r) * t;
  const angle = a.a + sweep * t;
  const targetVW = ((sunX + Math.cos(angle) * r - vw / 2) / vw) * 100;
  const targetVH = ((sunY + Math.sin(angle) * r - vh / 2) / vh) * 100;
  const targetScale = from.scale + (to.scale - from.scale) * t;

  /* Eased toward the target rather than set, so a fast scroll reads as the
     planet following. On the first frame there is nothing to ease from. */
  const k = primed ? 0.06 : 1;
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

  if (sun) {
    sun.style.transform = `translate(${sunX.toFixed(1)}px, ${sunY.toFixed(1)}px)`;
    sun.style.opacity = introOpacity.toFixed(3);
  }

  /* The orbit layers are positioned from these, so they travel and shrink with
     the planet rather than being pinned to the viewport. */
  if (orbitNodes.length) {
    root.style.setProperty('--stone-x', `${(vw / 2 + floatX + (driftVW / 100) * vw).toFixed(1)}px`);
    root.style.setProperty('--stone-y', `${(vh / 2 + floatY + (offsetVH / 100) * vh).toFixed(1)}px`);
    root.style.setProperty('--stone-scale', motion.visualScale.toFixed(3));
    /* Under reduced motion the satellites hold a pose rather than circling. */
    moveOrbits(still ? 4 : now / 1000);
  }

  /* The light is derived from where the disc was drawn, never set beside it,
     so the two cannot disagree. */
  const planetX = vw / 2 + floatX + (driftVW / 100) * vw;
  const planetY = vh / 2 + floatY + (offsetVH / 100) * vh;
  let lx = -(planetX - sunX);
  let ly = planetY - sunY;
  const reach = Math.hypot(lx, ly) || 1;
  lx /= reach;
  ly /= reach;
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
   talking about the people they stand for. */
function watchNamedOrbit() {
  const people = document.getElementById('people');
  if (!people || !('IntersectionObserver' in window)) return;
  new IntersectionObserver(
    (entries) => root.classList.toggle('orbits-named', entries[0].isIntersecting),
    { rootMargin: '-25% 0px -25% 0px' }
  ).observe(people);
}

/* The placement runs whether or not the scene does. Without WebGL the planet
   is a still image and the sun is a gradient, and both still belong to the
   page's choreography — a sun parked at the origin bleeds a corona into the
   top-left corner, which is what happened when this was gated. */

const live = !!(container && hasWebGL());

if (live) {
  import('./planet.js')
    .then((module) => {
      module.mount(container, motion, () => {
        introStartedAt = performance.now();
      });
      root.classList.add('has-scene');
      buildOrbits();
      watchNamedOrbit();
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

  /* The scene renders every frame regardless, so the placement rides along. */
  running = true;
  raf = requestAnimationFrame(place);
  window.addEventListener('pagehide', () => cancelAnimationFrame(raf));
} else {
  /* Nothing is rendering, so a permanent frame loop would move a background
     image and nothing else. Place on the events that actually change it. */
  const once = () => {
    if (raf) return;
    raf = requestAnimationFrame((now) => {
      raf = 0;
      place(now);
    });
  };
  window.addEventListener('scroll', once, { passive: true });
  window.addEventListener('resize', once, { passive: true });
  once();
}
