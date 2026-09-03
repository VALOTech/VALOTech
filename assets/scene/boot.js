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
     is what knows where the glow is painted; read by the scene so the
     terminator points at the disc the reader can actually see. */
  lightDir: { x: -0.499, y: 0.643, z: 0.581 }
};

/* The sun keeps station with the planet rather than travelling its own path.
   Given as an offset in viewport units, so the two never drift apart: a sun on
   an independent course ends up behind the header at one end of the page and
   grazing the limb at the other, and both were measured before this was.

   The offset still changes — wider and a little higher as the story runs — so
   the light angle turns across the page and the terminator visibly swings. The
   starting pair reproduces the reference's key direction exactly while the
   planet is centred. */
const SUN_OFFSET_FROM = { x: -14, y: -29 };
const SUN_OFFSET_TO = { x: -19, y: -26 };

/* Narrow screens put the headline across the whole width, and the wide-screen
   offset lands the core on it. Lifting the sun above the text costs nothing
   and stops it reading as an accident. */
const SUN_OFFSET_NARROW = { x: -10, y: -37 };
const NARROW = 900;

/* However low it sits, it stays clear of the header. */
const SUN_MIN_VH = 13;

/* Below this the light is grazing the limb and the surface goes to silhouette.
   The sun may sit low; it may not sit on the horizon. */
const MIN_ELEVATION = 0.42;

/* The reference's key sits this far toward the viewer relative to its spread
   across the frame. Holding the ratio keeps the surface's modelling while its
   direction changes. */
const FRONT_RATIO = 0.71;

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

let driftVW = 0;
let scale = 1;
let offsetVH = 0;
let introStartedAt = 0;
let running = false;
let raf = 0;

function place(now) {
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  const total = root.scrollHeight - vh;
  const progress = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0;
  const still = reduce.matches;

  motion.scroll = progress;
  /* The cover stays lunar; life scrubs continuously across the story. */
  motion.growth = smoothstep((progress - 0.06) / 0.84);
  motion.reducedMotion = still;

  /* The recede curve: full at the top, small and to the side through the
     argument, full again at the close. The bias keeps it drifting after the
     midpoint so it does not simply retrace its path. */
  const curve = smoothstep(4 * progress * (1 - progress));
  let targetVW = curve * 26 + Math.max(0, progress - 0.5) * 20;
  let targetScale = 1 - curve * 0.45;
  let targetVH = 0;

  /* The people chapter is a pair of columns that want the planet between
     them, so it comes back to the centre while that section is on screen. */
  const people = document.getElementById('people');
  if (people) {
    const rect = people.getBoundingClientRect();
    const blend = Math.min(
      smoothstep((vh - rect.top) / (vh * 0.5)),
      smoothstep(rect.bottom / (vh * 0.5))
    );
    targetVW *= 1 - blend;
    targetScale = targetScale * (1 - blend) + 0.62 * blend;
    targetVH = 10 * blend;
  }

  /* At the close it comes back up to full presence on the right, with the
     argument on the left — the same shape the page opened with, now carrying
     a living planet instead of dead rock. */
  const footer = document.querySelector('.footer');
  if (footer) {
    const rect = footer.getBoundingClientRect();
    const blend = smoothstep((vh - rect.top) / (vh * 0.55));
    if (blend > 0) {
      const narrow = vw <= 900;
      const footerVW = narrow ? 22 : 17;
      const footerScale = narrow ? 0.6 : 0.86;
      const footerVH = narrow ? -22 : -8;
      targetVW = targetVW * (1 - blend) + footerVW * blend;
      targetScale = targetScale * (1 - blend) + footerScale * blend;
      targetVH = targetVH * (1 - blend) + footerVH * blend;
    }
  }

  /* Everything is eased toward its target rather than set, so a fast scroll
     reads as the planet following rather than snapping. */
  driftVW += (targetVW - driftVW) * 0.06;
  scale += (targetScale - scale) * 0.06;
  offsetVH += (targetVH - offsetVH) * 0.06;

  /* The approach. It runs once, after the surface is ready, and never under
     reduced motion. */
  let introScale = 1;
  let introOpacity = 1;
  if (introStartedAt && !still) {
    const eased = 1 - Math.pow(1 - Math.min(1, Math.max(0, (now - introStartedAt - 900) / 2600)), 3);
    introScale = 0.06 + eased * 0.94;
    introOpacity = eased;
  }

  motion.visualScale = scale * introScale;

  const floatX = still ? 0 : Math.sin(now / 1000 * 0.84) * 3;
  const floatY = still ? 0 : Math.cos(now / 1000 * 0.71) * 6;

  container.style.transform =
    `translate(calc(-50% + ${floatX.toFixed(1)}px + ${driftVW.toFixed(2)}vw),` +
    ` calc(-50% + ${floatY.toFixed(1)}px + ${offsetVH.toFixed(2)}vh))`;
  container.style.opacity = introOpacity.toFixed(3);

  /* Place the sun, then derive the light from where it landed rather than the
     other way round — so the two can never disagree. */
  const planetX = vw / 2 + floatX + (driftVW / 100) * vw;
  const planetY = vh / 2 + floatY + (offsetVH / 100) * vh;

  const wide = vw > NARROW;
  const offX = wide
    ? SUN_OFFSET_FROM.x + (SUN_OFFSET_TO.x - SUN_OFFSET_FROM.x) * motion.growth
    : SUN_OFFSET_NARROW.x;
  const offY = wide
    ? SUN_OFFSET_FROM.y + (SUN_OFFSET_TO.y - SUN_OFFSET_FROM.y) * motion.growth
    : SUN_OFFSET_NARROW.y;
  const sunX = planetX + (offX / 100) * vw;
  const sunY = Math.max((SUN_MIN_VH / 100) * vh, planetY + (offY / 100) * vh);
  if (sun) {
    sun.style.transform = `translate(${sunX.toFixed(1)}px, ${sunY.toFixed(1)}px)`;
    sun.style.opacity = introOpacity.toFixed(3);
  }

  let dx = planetX - sunX;
  let dy = planetY - sunY;
  const span = Math.hypot(dx, dy) || 1;
  let lx = -dx / span;
  let ly = dy / span;
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
