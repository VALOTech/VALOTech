/* VALO Tech — the star field.
 *
 * Drawn on a 2D canvas rather than in the WebGL scene, so the page has a sky
 * even where the planet cannot run: a machine with WebGL disabled, or a visitor
 * who has asked for reduced motion, still gets depth rather than flat black.
 *
 * Three depth tiers scroll at different rates. That parallax is the whole
 * illusion — the stars themselves never move relative to each other. */
(function (w, doc) {
  "use strict";

  var canvas = doc.getElementById("stars");
  if (!canvas || !canvas.getContext) return;
  var ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;

  var reduce = w.matchMedia("(prefers-reduced-motion: reduce)");

  /* One star per this many CSS pixels of viewport. Tuned against the
     reference: dense enough to read as a sky, sparse enough that the
     headline still owns the screen. */
  var AREA_PER_STAR = 2600;
  var MAX_STARS = 1400;

  /* Depth tiers: [radius min, radius max, alpha min, alpha max, parallax,
     share of the population]. Parallax is how far a tier travels per pixel
     of page scroll. */
  var TIERS = [
    [0.4, 0.9, 0.16, 0.34, 0.04, 0.52],
    [0.6, 1.15, 0.32, 0.58, 0.1, 0.33],
    [0.85, 1.7, 0.58, 0.95, 0.19, 0.15]
  ];

  /* A few stars carry a soft halo. They are what makes the field read as a
     photograph of a sky rather than as noise. */
  var HALO_SHARE = 0.014;

  var stars = [];
  var vw = 0;
  var vh = 0;
  var dpr = 1;
  var band = 0; /* the vertical span stars wrap within */
  var lastScroll = -1;
  var raf = 0;

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function build() {
    vw = w.innerWidth || doc.documentElement.clientWidth;
    vh = w.innerHeight || doc.documentElement.clientHeight;
    dpr = Math.min(w.devicePixelRatio || 1, 2);

    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + "px";
    canvas.style.height = vh + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    /* Stars wrap over a band taller than the viewport so a tier can travel
       without the top edge running dry. */
    band = vh * 2;

    var total = Math.min(MAX_STARS, Math.round((vw * vh) / AREA_PER_STAR));
    stars = [];
    for (var t = 0; t < TIERS.length; t++) {
      var tier = TIERS[t];
      var n = Math.round(total * tier[5]);
      for (var i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * vw,
          y: Math.random() * band,
          r: rand(tier[0], tier[1]),
          a: rand(tier[2], tier[3]),
          p: tier[4],
          halo: Math.random() < HALO_SHARE
        });
      }
    }
    lastScroll = -1;
  }

  function draw(scrollY) {
    ctx.clearRect(0, 0, vw, vh);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var y = (s.y - scrollY * s.p) % band;
      if (y < 0) y += band;
      /* The band is twice the viewport; only the visible half is painted. */
      if (y > vh + 2) continue;

      if (s.halo) {
        var g = ctx.createRadialGradient(s.x, y, 0, s.x, y, s.r * 7);
        g.addColorStop(0, "rgba(226,232,255," + s.a + ")");
        g.addColorStop(0.4, "rgba(178,196,255," + s.a * 0.22 + ")");
        g.addColorStop(1, "rgba(140,158,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(s.x, y, s.r * 7, 0, 6.2832);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(233,238,255," + s.a + ")";
      ctx.beginPath();
      ctx.arc(s.x, y, s.r, 0, 6.2832);
      ctx.fill();
    }
  }

  /* The sky is fixed; parallax alone gives it depth. There is no idle
     animation to run, so nothing is scheduled between scrolls. */
  function frame() {
    raf = 0;
    var scrollY = w.scrollY || doc.documentElement.scrollTop || 0;
    if (scrollY === lastScroll) return;
    lastScroll = scrollY;
    draw(scrollY);
  }

  function schedule() {
    if (!raf) raf = w.requestAnimationFrame(frame);
  }

  var resizeTimer = 0;
  function onResize() {
    w.clearTimeout(resizeTimer);
    resizeTimer = w.setTimeout(function () {
      build();
      schedule();
    }, 150);
  }

  build();
  schedule();
  w.addEventListener("resize", onResize, { passive: true });
  w.addEventListener("scroll", schedule, { passive: true });
  if (reduce.addEventListener) {
    reduce.addEventListener("change", function () {
      lastScroll = -1;
      schedule();
    });
  }
})(window, document);
