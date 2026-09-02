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
  visualScale: 1
};

const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

function smoothstep(t) {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/* The sphere fills roughly this fraction of its square container's width.
   Markers are placed from it, so it is measured rather than guessed. */
const SPHERE_FRACTION = 0.767;

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

  /* Published so markers can hold their place against the planet rather than
     against the viewport. */
  const size = container.clientWidth;
  root.style.setProperty(
    '--stone-x',
    `calc(50vw + ${floatX.toFixed(1)}px + ${driftVW.toFixed(2)}vw)`
  );
  root.style.setProperty(
    '--stone-y',
    `calc(50vh + ${floatY.toFixed(1)}px + ${offsetVH.toFixed(2)}vh)`
  );
  root.style.setProperty(
    '--stone-r',
    `${((size * SPHERE_FRACTION) / 2) * motion.visualScale}px`
  );

  raf = requestAnimationFrame(place);
}

if (container && hasWebGL()) {
  import('./planet.js')
    .then((module) => {
      module.mount(container, motion, () => {
        introStartedAt = performance.now();
      });
      root.classList.add('has-scene');
      if (!running) {
        running = true;
        raf = requestAnimationFrame(place);
      }
    })
    .catch(() => {
      /* A failed context or a blocked request leaves the star field, which is
         a sky on its own. Nothing in the argument depended on the planet. */
    });

  window.addEventListener(
    'pointermove',
    (event) => {
      motion.pointerX = event.clientX / Math.max(1, window.innerWidth) - 0.5;
    },
    { passive: true }
  );

  window.addEventListener('pagehide', () => cancelAnimationFrame(raf));
}
