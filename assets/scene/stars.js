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

  /* Colour temperature. A sky drawn in one colour is the difference between a
     photograph and a texture, and it is the first thing a reader calls
     monotonous without being able to say why. The shares below are the naked-
     eye sky rounded off: mostly white and blue-white, a seam of yellow, a few
     orange, the odd red. Only the two nearer tiers carry it — the eye cannot
     resolve the colour of a faint star either, so tinting the far field would
     be a claim the sky itself does not make. */
  var SPECTRA = [
    [0.60, "233,238,255"],
    [0.78, "199,215,255"],
    [0.91, "255,246,220"],
    [0.975, "255,212,158"],
    [1.00, "255,176,136"]
  ];
  var NEUTRAL = "233,238,255";

  /* Scintillation, in two kinds, because one of them is not what the word
     describes. The slow kind is a pair of sines on a small share of the field:
     it is the sky breathing, and it must stay under notice. The fast kind is
     the twinkle itself — a single star flaring hard for a fifth of a second
     and gone. Sparse on purpose: the eye finds one flare in an empty sky and
     stops finding any when several run at once. */
  var TWINKLE_SHARE = 0.16;
  var TWINKLE_MS = 90;

  /* One flare at a time, this far apart. */
  var SPARK_GAP_MIN = 1500;
  var SPARK_GAP_MAX = 5200;
  var SPARK_MS = 460;
  var SPARK_GAIN = 2.7;

  /* A supernova. Rare enough that meeting one is luck rather than a feature:
     a reader on the cover for a minute may well see none. It rises fast, holds
     briefly, then falls over several seconds and leaves an expanding shell
     that thins to nothing — the shape of the light curve, not of a flash. */
  var NOVA_FIRST_MIN = 22000;
  var NOVA_FIRST_MAX = 55000;
  var NOVA_GAP_MIN = 55000;
  var NOVA_GAP_MAX = 145000;
  var NOVA_RISE = 900;
  var NOVA_HOLD = 620;
  var NOVA_FALL = 6200;
  var NOVA_SHELL = 150;

  /* How far the sky slides across one full turn of the orbit, in pixels at a
     tier parallax of 1. Each star takes its own share, so the near field
     travels and the far field barely moves — which is the whole of what
     parallax is, and the reason the sky reads as depth rather than wallpaper. */
  var ORBIT_PARALLAX = 440;

  var stars = [];
  var bearingX = 0;
  var bearingY = 0;
  var vw = 0;
  var vh = 0;
  var dpr = 1;
  var band = 0; /* the vertical span stars wrap within */
  var lastScroll = -1;
  var clock = 0;
  var twinkling = false;
  var twinkleTimer = 0;
  var raf = 0;
  var sparks = [];
  var sparkTimer = 0;
  var nova = null;
  var novaTimer = 0;

  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function spectrum() {
    var u = Math.random();
    for (var i = 0; i < SPECTRA.length; i++) {
      if (u <= SPECTRA[i][0]) return SPECTRA[i][1];
    }
    return NEUTRAL;
  }

  function sizeCanvas(el, c) {
    el.width = Math.round(vw * dpr);
    el.height = Math.round(vh * dpr);
    el.style.width = vw + "px";
    el.style.height = vh + "px";
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function build() {
    /* A flare holds a reference to a star. Rebuilding the field replaces every
       star, so a flare left over from the old one would go on brightening an
       object nothing draws. */
    sparks.length = 0;
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
          c: t === 0 ? NEUTRAL : spectrum(),
          halo: Math.random() < HALO_SHARE,
          tw: Math.random() < TWINKLE_SHARE ? rand(3.2, 9.0) : 0,
          tp: Math.random() * 6.2832,
          /* How hard this one is flaring right now, 0 at rest. */
          fl: 0
        });
      }
    }
    lastScroll = -1;
  }

  function draw(scrollY) {
    ctx.clearRect(0, 0, vw, vh);
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      /* Against the orbit, not with it: the world moves one way and the sky
         appears to move the other. Both axes wrap, so the field stays whole
         however far it has slid. */
      var x = (s.x - bearingX * s.p) % vw;
      if (x < 0) x += vw;
      var y = (s.y - scrollY * s.p - bearingY * s.p) % band;
      if (y < 0) y += band;
      /* The band is twice the viewport; only the visible half is painted. */
      if (y > vh + 2) continue;

      var alpha = s.a;
      if (s.tw && twinkling) {
        var w1 = 6.2832 / s.tw;
        var wave =
          Math.sin(clock * w1 + s.tp) * 0.62 +
          Math.sin(clock * w1 * 1.73 + s.tp * 2.3) * 0.38;
        alpha = s.a * (0.62 + 0.38 * (0.5 + 0.5 * wave));
      }

      var radius = s.r;
      if (s.fl > 0) {
        alpha = Math.min(1, alpha * (1 + s.fl * (SPARK_GAIN - 1)));
        radius = s.r * (1 + s.fl * 0.5);
      }

      if (s.halo || s.fl > 0.35) {
        var reach = s.halo ? radius * 7 : radius * 5.5 * s.fl;
        var lead = s.halo ? alpha : alpha * s.fl;
        var g = ctx.createRadialGradient(x, y, 0, x, y, reach);
        g.addColorStop(0, "rgba(" + s.c + "," + lead + ")");
        g.addColorStop(0.4, "rgba(178,196,255," + lead * 0.22 + ")");
        g.addColorStop(1, "rgba(140,158,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, reach, 0, 6.2832);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(" + s.c + "," + alpha + ")";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, 6.2832);
      ctx.fill();
    }

    if (nova) drawNova(scrollY);
  }

  /* A star at a place in the field, transformed the way every other star is:
     a supernova that did not travel with the sky it belongs to would read as
     a mark on the glass rather than as an event in the distance. */
  function drawNova(scrollY) {
    var x = (nova.x - bearingX * nova.p) % vw;
    if (x < 0) x += vw;
    var y = (nova.y - scrollY * nova.p - bearingY * nova.p) % band;
    if (y < 0) y += band;
    if (y > vh + NOVA_SHELL || y < -NOVA_SHELL) return;

    var lit = nova.lit;
    if (lit <= 0) return;

    /* The shell keeps expanding while the light falls, so the last thing the
       reader sees is a ring with nothing at its centre. */
    if (nova.shell > 0) {
      var rr = 6 + nova.shell * NOVA_SHELL;
      var ring = ctx.createRadialGradient(x, y, rr * 0.62, x, y, rr);
      var fade = (1 - nova.shell) * 0.5;
      ring.addColorStop(0, "rgba(120,150,255,0)");
      ring.addColorStop(0.72, "rgba(168,196,255," + fade * 0.5 + ")");
      ring.addColorStop(0.9, "rgba(226,236,255," + fade + ")");
      ring.addColorStop(1, "rgba(150,180,255,0)");
      ctx.fillStyle = ring;
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, 6.2832);
      ctx.fill();
    }

    var halo = 3 + lit * 34;
    var g = ctx.createRadialGradient(x, y, 0, x, y, halo);
    g.addColorStop(0, "rgba(255,253,246," + Math.min(1, lit * 1.1) + ")");
    g.addColorStop(0.18, "rgba(226,238,255," + lit * 0.7 + ")");
    g.addColorStop(0.52, "rgba(150,182,255," + lit * 0.22 + ")");
    g.addColorStop(1, "rgba(110,140,255,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, halo, 0, 6.2832);
    ctx.fill();

    /* Spikes. A point of light bright enough to bloom in a lens grows them,
       and their absence is what makes a bright dot read as a dot. */
    var arm = lit * lit * 74;
    if (arm > 2) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(nova.tilt);
      ctx.strokeStyle = "rgba(240,246,255," + lit * 0.6 + ")";
      ctx.lineCap = "round";
      for (var k = 0; k < 2; k++) {
        var len = k ? arm * 0.45 : arm;
        ctx.lineWidth = k ? 0.7 : 1.15;
        ctx.beginPath();
        ctx.moveTo(-len, 0);
        ctx.lineTo(len, 0);
        ctx.moveTo(0, -len);
        ctx.lineTo(0, len);
        ctx.stroke();
        ctx.rotate(0.7854);
      }
      ctx.restore();
    }

    ctx.fillStyle = "rgba(255,255,255," + Math.min(1, lit * 1.2) + ")";
    ctx.beginPath();
    ctx.arc(x, y, 0.8 + lit * 2.2, 0, 6.2832);
    ctx.fill();
  }

  /* Nothing here animates on its own: the field is redrawn when the page has
     moved under it, or when the orbit has carried the sky far enough to see. */
  function frame() {
    raf = 0;
    var scrollY = w.scrollY || doc.documentElement.scrollTop || 0;
    if (scrollY === lastScroll) return;
    lastScroll = scrollY;
    draw(scrollY);
  }

  /* The field is otherwise redrawn only when the page has moved under it. A
     twinkle has to keep its own slow time, so it runs on a tenth-of-a-second
     tick rather than a frame loop — a sky does not need sixty of them a
     second — and it stops entirely for a hidden tab or a reader who asked for
     less motion, which is when the promise of no idle animation matters. */
  function stamp() {
    return w.performance ? w.performance.now() : Date.now();
  }

  /* One flare, on one star. Chosen from the two nearer tiers, because a faint
     star flaring is a faint flare and the reader never finds it. Up in a fifth
     of the life and down over the rest: a glint that fades the way it rose
     reads as a pulse, which is a different thing entirely. */
  function spark() {
    sparkTimer = 0;
    if (!twinkling) return;
    for (var tries = 0; tries < 24; tries++) {
      var s = stars[(Math.random() * stars.length) | 0];
      if (s && s.p > 0.05 && s.fl === 0) {
        sparks.push({ s: s, t0: stamp() });
        break;
      }
    }
    scheduleSpark();
  }

  function scheduleSpark() {
    if (sparkTimer || !twinkling) return;
    sparkTimer = w.setTimeout(spark, rand(SPARK_GAP_MIN, SPARK_GAP_MAX));
  }

  /* A star that was there all along, and then is not. It is placed in the
     field's own coordinates so it travels with the sky, on a far tier so it
     reads as distant, and clear of the world — an event behind the disc is an
     event nobody sees. */
  function burst() {
    novaTimer = 0;
    if (!twinkling) return;
    var here = world();
    var scrolled = lastScroll < 0 ? w.scrollY || 0 : lastScroll;
    var tier = TIERS[Math.random() < 0.75 ? 0 : 1];
    for (var tries = 0; tries < 30; tries++) {
      var fx = rand(0.05, 0.95) * vw;
      var fy = Math.random() * band;
      var sx = (fx - bearingX * tier[4]) % vw;
      if (sx < 0) sx += vw;
      var sy = (fy - scrolled * tier[4] - bearingY * tier[4]) % band;
      if (sy < 0) sy += band;
      if (sy > vh * 0.92 || sy < vh * 0.06) continue;
      if (here && Math.hypot(sx - here.x, sy - here.y) < here.r * 2.7) continue;
      nova = {
        x: fx, y: fy, p: tier[4],
        tilt: Math.random() * 1.5708,
        t0: stamp(), lit: 0, shell: 0
      };
      return;
    }
    scheduleNova(4000, 12000);
  }

  function scheduleNova(lo, hi) {
    if (novaTimer || !twinkling) return;
    novaTimer = w.setTimeout(burst, rand(lo, hi));
  }

  /* Both kinds of event live on the twinkle's clock rather than on a frame
     loop of their own. The tick tightens only while one is running, so the
     promise the field makes when nothing is happening — no idle animation —
     is kept. */
  function advance(t) {
    for (var i = sparks.length - 1; i >= 0; i--) {
      var k = (t - sparks[i].t0) / SPARK_MS;
      if (k >= 1) {
        sparks[i].s.fl = 0;
        sparks.splice(i, 1);
        continue;
      }
      sparks[i].s.fl =
        k < 0.22 ? k / 0.22 : Math.pow(1 - (k - 0.22) / 0.78, 1.7);
    }
    if (!nova) return;
    var e = t - nova.t0;
    if (e < NOVA_RISE) nova.lit = Math.pow(e / NOVA_RISE, 0.55);
    else if (e < NOVA_RISE + NOVA_HOLD) nova.lit = 1;
    else nova.lit = Math.pow(Math.max(0, 1 - (e - NOVA_RISE - NOVA_HOLD) / NOVA_FALL), 2.4);
    nova.shell = Math.min(1, Math.max(0, (e - NOVA_RISE) / (NOVA_HOLD + NOVA_FALL)));
    if (e > NOVA_RISE + NOVA_HOLD + NOVA_FALL) {
      nova = null;
      scheduleNova(NOVA_GAP_MIN, NOVA_GAP_MAX);
    }
  }

  function twinkle() {
    twinkleTimer = 0;
    if (!twinkling) return;
    var t = stamp();
    clock = t / 1000;
    advance(t);
    draw(lastScroll < 0 ? w.scrollY || 0 : lastScroll);
    scheduleTwinkle();
  }

  function scheduleTwinkle() {
    if (twinkleTimer || !twinkling) return;
    twinkleTimer = w.setTimeout(
      twinkle,
      sparks.length || nova ? 42 : TWINKLE_MS
    );
  }

  function setTwinkling(on) {
    twinkling = !!on;
    if (twinkling) {
      scheduleTwinkle();
      scheduleSpark();
      scheduleNova(NOVA_FIRST_MIN, NOVA_FIRST_MAX);
      return;
    }
    if (twinkleTimer) {
      w.clearTimeout(twinkleTimer);
      twinkleTimer = 0;
    }
    if (sparkTimer) {
      w.clearTimeout(sparkTimer);
      sparkTimer = 0;
    }
    if (novaTimer) {
      w.clearTimeout(novaTimer);
      novaTimer = 0;
    }
    /* A star left mid-flare would stay bright for as long as the tab is
       hidden, and be found that way on return. */
    for (var i = 0; i < sparks.length; i++) sparks[i].s.fl = 0;
    sparks.length = 0;
    nova = null;
    draw(lastScroll < 0 ? w.scrollY || 0 : lastScroll);
  }

  function schedule() {
    if (!raf) raf = w.requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------- Meteors */

  /* Rare enough to stay an event, often enough to be seen. At a gap of seven
     to twenty-four seconds a reader watching the cover for half a minute
     could easily meet none, which is indistinguishable from none existing;
     measured, only a third of sampled frames carried a streak at all. Closer
     together, and more of them bright. */
  var GAP_MIN = 2600;
  var GAP_MAX = 7000;
  var MAX_ALIVE = 2;
  var BRIGHT_SHARE = 0.45;

  /* How many are on a course that ends at the world. Not all of them: a sky
     where every streak hits the same target stops reading as a sky. */
  var AIMED_SHARE = 0.5;

  /* The sky quiets as the world comes alive; it never empties. Once the surface
     is living they arrive about three times less often, which reads as a
     settling sky and still lets an absorption be seen — a world nothing is
     allowed to reach can never show what its atmosphere does to an arrival. */
  var QUIET_FACTOR = 0.9;

  /* Past this the world has an atmosphere, and an arriving body is swallowed
     and burns rather than cratering. Below it there is bare rock to hit. */
  var ABSORB_AT = 0.55;

  var meteors = [];
  /* An impact is what a meteor becomes when it reaches the world: a burst of
     debris and an expanding shock on the dead rock, a swallowed bloom on the
     living one. Two endings for the same object, because a body with an
     atmosphere does not let anything hit its surface. */
  var impacts = [];
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

    /* Some of them are on a course that ends at the world. Left to a random
       heading almost none ever would, and an impact nobody sees is an impact
       that does not exist. */
    var globe = world();
    if (globe && Math.random() < AIMED_SHARE) {
      var aimX = globe.x + rand(-0.62, 0.62) * globe.r;
      var aimY = globe.y + rand(-0.62, 0.62) * globe.r;
      var toward = Math.atan2(aimY - y, aimX - x);
      /* Only if it still reads as a shallow fall rather than a dive. */
      if (Math.sin(toward) > 0.06) angle = toward;
    }

    meteors.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      len: bright ? rand(320, 540) : rand(170, 300),
      width: bright ? rand(3.0, 4.2) : rand(1.9, 2.8),
      life: bright ? rand(1.9, 2.8) : rand(1.3, 2.1),
      age: 0,
      bright: bright
    });
  }

  /* The world's position and size, published by the page every frame. Read
     rather than assumed: the planet moves chapter by chapter, and an impact
     drawn at the middle of the screen would be an impact on nothing. */
  function world() {
    /* Handed over as an object: the scene used to publish this as custom
       properties on the root element, and reading them back cost a style
       resolution on every meteor frame. */
    var now = w.VALO_STAGE;
    if (!now) return null;
    var x = now.x;
    var y = now.y;
    var scale = now.scale;
    if (isNaN(x) || isNaN(y)) return null;
    /* The drawn sphere is 0.37 of its box across the radius, and the box is
       whatever the stylesheet gives it — measured rather than restated, so a
       change to the planet's size cannot leave meteors striking a circle that
       is no longer where the world is. */
    var el = doc.querySelector(".planet");
    if (!el) return null;
    var box = el.getBoundingClientRect();
    var side = Math.min(box.width, box.height);
    if (!side) return null;
    return { x: x, y: y, r: side * 0.37 * (isNaN(scale) ? 1 : scale) };
  }

  function strike(m, hit) {
    impacts.push({
      x: hit.x,
      y: hit.y,
      age: 0,
      life: growth >= ABSORB_AT ? 1.5 : 1.15,
      absorbed: growth >= ABSORB_AT,
      power: m.bright ? 1 : 0.66,
      /* Debris flies off along the shallow angle it arrived on, never back
         through the body it just struck. */
      dir: Math.atan2(m.vy, m.vx),
      sparks: []
    });
    var last = impacts[impacts.length - 1];
    if (!last.absorbed) {
      var n = m.bright ? 12 : 7;
      for (var k = 0; k < n; k++) {
        var spread = rand(-1.15, 1.15);
        var sp = rand(90, 320) * last.power;
        last.sparks.push({
          a: last.dir + Math.PI + spread,
          v: sp,
          len: rand(6, 20)
        });
      }
    }
  }

  function planNext() {
    scheduled = false;
    if (reduce.matches || doc.hidden) return;
    w.clearTimeout(timer);
    scheduled = true;
    timer = w.setTimeout(function () {
      scheduled = false;
      if (!doc.hidden && meteors.length < MAX_ALIVE) {
        spawn();
        startTrail();
      }
      planNext();
    }, rand(GAP_MIN, GAP_MAX) * (1 + growth * QUIET_FACTOR));
  }

  /* The page tells the sky how far the transformation has come. Where no
     module runs to tell it, it reads the same scrub off the scroll itself. */
  function setGrowth(value) {
    growth = value;
    /* Nothing to start or stop: the schedule reads growth when it sets the
       next gap, so a sky that has quieted picks up again on its own if the
       reader goes back up into the lunar half of the story. */
    if (!scheduled) planNext();
  }

  /* The page owns the orbit; the sky is told where it has reached. */
  function setBearing(radians) {
    var nx = Math.cos(radians) * ORBIT_PARALLAX;
    var ny = Math.sin(radians) * ORBIT_PARALLAX;
    if (Math.abs(nx - bearingX) < 0.2 && Math.abs(ny - bearingY) < 0.2) return;
    bearingX = nx;
    bearingY = ny;
    lastScroll = -1;
    schedule();
  }

  w.VALO_SKY = { setGrowth: setGrowth, rush: startRush, setBearing: setBearing };

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

    drawImpacts();
  }

  function drawImpacts() {
    for (var i = 0; i < impacts.length; i++) {
      var s = impacts[i];
      var t = s.age / s.life;
      var fade = Math.min(1, (1 - t) / 0.55);
      if (fade <= 0) continue;

      if (s.absorbed) {
        /* Swallowed. A living world takes the light in: a bloom that swells
           once, brightly, and settles into the surface rather than throwing
           anything back out. */
        var swell = 1 - Math.pow(1 - Math.min(1, t / 0.42), 3);
        var rad = (16 + 96 * swell) * s.power;
        var g1 = mctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rad);
        g1.addColorStop(0, "rgba(255,252,236," + fade * 0.95 + ")");
        g1.addColorStop(0.22, "rgba(196,238,255," + fade * 0.55 + ")");
        g1.addColorStop(0.6, "rgba(120,178,255," + fade * 0.2 + ")");
        g1.addColorStop(1, "rgba(90,140,255,0)");
        mctx.fillStyle = g1;
        mctx.beginPath();
        mctx.arc(s.x, s.y, rad, 0, 6.2832);
        mctx.fill();
        continue;
      }

      /* A dead rock has nothing to absorb it. The shock ring runs outward and
         thins, and the debris carries on the way the meteor was going. */
      var ring = (10 + 120 * Math.pow(t, 0.55)) * s.power;
      mctx.strokeStyle = "rgba(255,226,190," + fade * 0.5 * (1 - t) + ")";
      mctx.lineWidth = Math.max(0.6, 3.2 * (1 - t)) * s.power;
      mctx.beginPath();
      mctx.arc(s.x, s.y, ring, 0, 6.2832);
      mctx.stroke();

      var flash = 1 - Math.min(1, t / 0.2);
      if (flash > 0) {
        var g2 = mctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 46 * s.power);
        g2.addColorStop(0, "rgba(255,246,224," + flash * 0.95 + ")");
        g2.addColorStop(0.4, "rgba(255,190,128," + flash * 0.4 + ")");
        g2.addColorStop(1, "rgba(255,150,90,0)");
        mctx.fillStyle = g2;
        mctx.beginPath();
        mctx.arc(s.x, s.y, 46 * s.power, 0, 6.2832);
        mctx.fill();
      }

      for (var k = 0; k < s.sparks.length; k++) {
        var sp = s.sparks[k];
        var dist = sp.v * s.age * (1 - t * 0.5);
        var px = s.x + Math.cos(sp.a) * dist;
        var py = s.y + Math.sin(sp.a) * dist;
        var g3 = mctx.createLinearGradient(
          px, py,
          px - Math.cos(sp.a) * sp.len, py - Math.sin(sp.a) * sp.len
        );
        g3.addColorStop(0, "rgba(255,236,205," + fade * 0.85 + ")");
        g3.addColorStop(1, "rgba(255,170,110,0)");
        mctx.strokeStyle = g3;
        mctx.lineWidth = 1.6 * s.power;
        mctx.beginPath();
        mctx.moveTo(px, py);
        mctx.lineTo(px - Math.cos(sp.a) * sp.len, py - Math.sin(sp.a) * sp.len);
        mctx.stroke();
      }
    }
  }

  function tick(now) {
    mraf = 0;
    var delta = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
    last = now;

    var globe = world();
    for (var i = meteors.length - 1; i >= 0; i--) {
      var m = meteors[i];
      m.age += delta;
      m.x += m.vx * delta;
      m.y += m.vy * delta;
      /* Reaching the world ends the meteor and starts an impact. The test is
         against the drawn limb, so a streak that merely passes in front of the
         disc without crossing it keeps going. */
      if (globe && Math.hypot(m.x - globe.x, m.y - globe.y) <= globe.r) {
        strike(m, { x: m.x, y: m.y });
        meteors.splice(i, 1);
        continue;
      }
      var gone =
        m.age >= m.life ||
        m.y > vh + m.len ||
        m.x < -vw * 0.3 ||
        m.x > vw * 1.3;
      if (gone) meteors.splice(i, 1);
    }

    for (var j = impacts.length - 1; j >= 0; j--) {
      impacts[j].age += delta;
      if (impacts[j].age >= impacts[j].life) impacts.splice(j, 1);
    }

    drawMeteors();

    if (meteors.length || impacts.length) mraf = w.requestAnimationFrame(tick);
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
      scheduleTwinkle();
    }, 150);
  }

  build();
  schedule();
  setTwinkling(!reduce.matches && !doc.hidden);
  w.addEventListener("resize", onResize, { passive: true });
  w.addEventListener("scroll", schedule, { passive: true });
  if (reduce.addEventListener) {
    reduce.addEventListener("change", function () {
      lastScroll = -1;
      schedule();
      setTwinkling(!reduce.matches && !doc.hidden);
      if (reduce.matches) {
        w.clearTimeout(timer);
        meteors.length = 0;
      } else planNext();
    });
  }
  /* A meteor that fell while the tab was hidden is a frame budget spent on
     nobody, and so is a star pulsing at one. */
  doc.addEventListener("visibilitychange", function () {
    setTwinkling(!reduce.matches && !doc.hidden);
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
