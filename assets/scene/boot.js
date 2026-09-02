/* Load the planet only where it can actually run, and feed it the page's
 * motion state.
 *
 * This is a module so that relative specifiers resolve against this file
 * rather than the document, and so that a browser without module support
 * never asks for the graphics library at all. */

const container = document.getElementById('planet');

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

/* One object, read by the scene every frame and written by the page. Keeping
   it here rather than inside the scene means the placement rules live with
   the document they are about. */
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

function readPage() {
  const doc = document.documentElement;
  const total = doc.scrollHeight - window.innerHeight;
  motion.scroll = total > 0 ? Math.min(1, Math.max(0, window.scrollY / total)) : 0;
  /* The cover stays lunar; life then scrubs continuously across the story. */
  motion.growth = smoothstep((motion.scroll - 0.06) / 0.84);
  motion.reducedMotion = reduce.matches;
}

window.addEventListener('scroll', readPage, { passive: true });
window.addEventListener('resize', readPage, { passive: true });
window.addEventListener(
  'pointermove',
  (event) => {
    motion.pointerX = event.clientX / Math.max(1, window.innerWidth) - 0.5;
  },
  { passive: true }
);
readPage();

/* Reduced motion does not remove the planet. Scroll is direct manipulation,
   so the surface still changes as the reader moves; what stops is everything
   that moves on its own — idle rotation, the intro approach, pointer drift. */
if (container && hasWebGL()) {
  import('./planet.js')
    .then((module) => {
      module.mount(container, motion);
      document.documentElement.classList.add('has-scene');
    })
    .catch(() => {
      /* A failed context or a blocked request leaves the star field, which
         is a sky on its own. Nothing in the argument depended on the planet. */
    });
}
