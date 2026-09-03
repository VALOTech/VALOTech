/* VALO Tech — the sky: a fixed star field, and the meteors that cross it.
 *
 * Both are drawn on 2D canvases rather than in the WebGL scene, so the page
 * has a sky even where the planet cannot run: a machine with WebGL disabled
 * still gets depth rather than flat black.
 *
 * The star field never animates — three depth tiers scrolling at different
 * rates are the whole illusion, and parallax needs no frame loop. A meteor
 * does, so it gets its own canvas and its own loop, and that loop exists only
 * while a meteor is in flight. */
(function (w, doc) {
  "use strict";

  var sky = doc.getElementById("stars");
  var trail = doc.getElementById("meteors");
  if (!sky || !sky.getContext) return;
  var ctx = sky.getContext("2d", { alpha: true });
  var mctx = trail && trail.getContext ? trail.getContext("2d", { alpha: true }) : null;
  if (!ctx) return;

  var reduce = w.matchMedia("(prefers-reduced-motion: reduce)");

  /* ------------------------------------------------------------ Stars */

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

  function sizeCanvas(el, c) {
    el.width = Math.round(vw * dpr);
    el.height = Math.round(vh * dpr);
    el.style.width = vw + "px";
    el.style.height = vh + "px";
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function build() {
    vw = w.innerWidth || doc.documentElement.clientWidth;
    vh = w.innerHeight || doc.documentElement.clientHeight;
    dpr = Math.min(w.devicePixelRatio || 1, 2);

    sizeCanvas(sky, ctx);
    if (mctx) sizeCanvas(trail, mctx);

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

  /* ---------------------------------------------------------- Meteors */

  /* Rare enough to stay an event. Two in flight at once reads as a shower,
     which is a different and much busier thing. */
  var GAP_MIN = 7000;
  var GAP_MAX = 24000;
  var MAX_ALIVE = 2;
  var BRIGHT_SHARE = 0.18;

  /* Meteors belong to the dead sky. Once the surface has become a living
     world there is nothing left to fall, so they stop — and start again if the
     reader scrolls back up into the lunar half of the story. */
  var SETTLE_AT = 0.62;

  var meteors = [];
  var mraf = 0;
  var timer = 0;
  var last = 0;
  var growth = 0;
  var scheduled = false;

  function spawn() {
    /* Enter from the top edge or the upper part of a side, and travel down
       across the frame. The angle is shallow, so a streak reads as distance
       rather than as something falling. */
    var fromLeft = Math.random() < 0.62;
    var angle = fromLeft ? rand(0.22, 0.62) : Math.PI - rand(0.22, 0.62);
    var speed = rand(820, 1900);
    var bright = Math.random() < BRIGHT_SHARE;

    var x;
    var y;
    if (Math.random() < 0.55) {
      x = rand(-0.1, 1.1) * vw;
      y = rand(-0.12, 0.05) * vh;
    } else {
      x = fromLeft ? rand(-0.12, -0.02) * vw : rand(1.02, 1.12) * vw;
      y = rand(-0.05, 0.45) * vh;
    }

    meteors.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      len: bright ? rand(240, 420) : rand(110, 230),
      width: bright ? rand(2.4, 3.4) : rand(1.4, 2.2),
      life: bright ? rand(1.7, 2.5) : rand(1.1, 1.9),
      age: 0,
      bright: bright
    });
  }

  function planNext() {
    scheduled = false;
    if (reduce.matches || doc.hidden || growth >= SETTLE_AT) return;
    w.clearTimeout(timer);
    scheduled = true;
    timer = w.setTimeout(function () {
      scheduled = false;
      if (!doc.hidden && growth < SETTLE_AT && meteors.length < MAX_ALIVE) {
        spawn();
        startTrail();
      }
      planNext();
    }, rand(GAP_MIN, GAP_MAX));
  }

  /* The page tells the sky how far the transformation has come. Where no
     module runs to tell it, it reads the same scrub off the scroll itself. */
  function setGrowth(value) {
    var was = growth;
    growth = value;
    if (was >= SETTLE_AT && growth < SETTLE_AT) planNext();
    else if (growth >= SETTLE_AT) w.clearTimeout(timer);
  }

  w.VALO_SKY = { setGrowth: setGrowth, rush: startRush };

  function drawMeteors() {
    mctx.clearRect(0, 0, vw, vh);
    for (var i = 0; i < meteors.length; i++) {
      var m = meteors[i];
      var t = m.age / m.life;
      /* In fast, out slow: the head should already be moving when it
         appears, and the tail should thin out rather than blink off. */
      var alpha = Math.min(1, t / 0.12) * Math.min(1, (1 - t) / 0.42);
      if (alpha <= 0) continue;

      var speed = Math.sqrt(m.vx * m.vx + m.vy * m.vy) || 1;
      var tailX = m.x - (m.vx / speed) * m.len;
      var tailY = m.y - (m.vy / speed) * m.len;

      var g = mctx.createLinearGradient(m.x, m.y, tailX, tailY);
      g.addColorStop(0, "rgba(244,248,255," + alpha * 0.95 + ")");
      g.addColorStop(0.28, "rgba(196,212,255," + alpha * 0.45 + ")");
      g.addColorStop(1, "rgba(140,158,255,0)");
      mctx.strokeStyle = g;
      mctx.lineWidth = m.width;
      mctx.lineCap = "round";
      mctx.beginPath();
      mctx.moveTo(m.x, m.y);
      mctx.lineTo(tailX, tailY);
      mctx.stroke();

      var halo = m.bright ? 13 : 7;
      var h = mctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, halo);
      h.addColorStop(0, "rgba(255,255,255," + alpha * 0.9 + ")");
      h.addColorStop(0.35, "rgba(200,216,255," + alpha * 0.3 + ")");
      h.addColorStop(1, "rgba(140,158,255,0)");
      mctx.fillStyle = h;
      mctx.beginPath();
      mctx.arc(m.x, m.y, halo, 0, 6.2832);
      mctx.fill();
    }
  }

  function tick(now) {
    mraf = 0;
    var delta = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;

    for (var i = meteors.length - 1; i >= 0; i--) {
      var m = meteors[i];
      m.age += delta;
      m.x += m.vx * delta;
      m.y += m.vy * delta;
      var gone =
        m.age >= m.life ||
        m.y > vh + m.len ||
        m.x < -vw * 0.3 ||
        m.x > vw * 1.3;
      if (gone) meteors.splice(i, 1);
    }

    drawMeteors();

    if (meteors.length) mraf = w.requestAnimationFrame(tick);
    else {
      last = 0;
      mctx.clearRect(0, 0, vw, vh);
    }
  }

  function startTrail() {
    if (!mctx || mraf) return;
    last = 0;
    mraf = w.requestAnimationFrame(tick);
  }

  /* ------------------------------------------------------- The arrival */

  /* A rush of stars past the viewer, once, at the top of the page: the reader
     arrives somewhere rather than finding a page already assembled. Radial
     streaks from the centre outward, each one longer and faster the further
     out it already is — which is what travelling through a star field looks
     like from inside it. */
  var RUSH_COUNT = 190;
  var RUSH_MS = 1500;

  var rush = null;
  var rushStart = 0;
  var rraf = 0;

  function startRush() {
    if (!mctx || reduce.matches) return;
    rush = [];
    for (var i = 0; i < RUSH_COUNT; i++) {
      var angle = Math.random() * Math.PI * 2;
      rush.push({
        a: angle,
        /* Start spread through the depth of the field, not all at the centre. */
        d: Math.pow(Math.random(), 0.55) * 0.9 + 0.04,
        speed: rand(0.55, 1.75),
        width: rand(0.9, 2.4),
        tint: Math.random() < 0.2
      });
    }
    rushStart = 0;
    if (!rraf) rraf = w.requestAnimationFrame(rushFrame);
  }

  function rushFrame(now) {
    rraf = 0;
    if (!rushStart) rushStart = now;
    var t = Math.min(1, (now - rushStart) / RUSH_MS);
    /* In hard, out soft: the field is already moving when it appears. */
    var fade = Math.min(1, t / 0.1) * (1 - Math.pow(t, 2.2));
    var cx = vw / 2;
    var cy = vh / 2;
    var reach = Math.hypot(cx, cy);

    mctx.clearRect(0, 0, vw, vh);
    for (var i = 0; i < rush.length; i++) {
      var r = rush[i];
      /* Depth accelerates: the same star covers more ground each frame. */
      var d = r.d + t * t * r.speed * 1.35;
      if (d > 1.55) continue;
      var far = d * reach;
      var near = Math.max(0, far - (18 + d * d * 190));
      var ca = Math.cos(r.a);
      var sa = Math.sin(r.a);
      var g = mctx.createLinearGradient(cx + ca * far, cy + sa * far, cx + ca * near, cy + sa * near);
      var head = r.tint ? "rgba(206,220,255," : "rgba(240,246,255,";
      g.addColorStop(0, head + fade * 0.95 + ")");
      g.addColorStop(1, "rgba(140,158,255,0)");
      mctx.strokeStyle = g;
      mctx.lineWidth = r.width * (0.5 + d);
      mctx.lineCap = "round";
      mctx.beginPath();
      mctx.moveTo(cx + ca * far, cy + sa * far);
      mctx.lineTo(cx + ca * near, cy + sa * near);
      mctx.stroke();
    }

    if (t < 1) rraf = w.requestAnimationFrame(rushFrame);
    else {
      rush = null;
      mctx.clearRect(0, 0, vw, vh);
      /* Meteors were held back while the arrival ran. */
      if (!scheduled) planNext();
    }
  }

  /* ------------------------------------------------------------- Wire */

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
      if (reduce.matches) {
        w.clearTimeout(timer);
        meteors.length = 0;
      } else planNext();
    });
  }
  /* A meteor that fell while the tab was hidden is a frame budget spent on
     nobody. */
  doc.addEventListener("visibilitychange", function () {
    if (doc.hidden) w.clearTimeout(timer);
    else if (!scheduled) planNext();
  });

  if (mctx) {
    /* The arrival owns the first second and a half of the meteor canvas; the
       ordinary sky starts once it has passed. */
    if (doc.documentElement.classList.contains("intro")) startRush();
    else planNext();
  }
})(window, document);
