/* VALO Tech — behaviour. Vanilla, dependency-free, motion-safe, no framework.
   Reads assets/i18n.js (window.VALO_I18N) and the markup's data-* hooks.
   The planet and the star field are separate; nothing here touches them. */
(function () {
  "use strict";
  var doc = document,
    root = doc.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var I = window.VALO_I18N;

  /* ---------------- i18n ---------------- */
  var LANG_KEY = "valotech-lang";

  function tr(loc, key) {
    var d = I.dict[loc];
    if (d && d[key] != null) return d[key];
    return I.dict.en[key] != null ? I.dict.en[key] : key;
  }

  function currentLang() {
    var saved = null;
    try {
      saved = localStorage.getItem(LANG_KEY);
    } catch (e) {}
    if (saved && I.locales.indexOf(saved) >= 0) return saved;
    var prefs = navigator.languages || [navigator.language || "en"];
    return I.match(prefs);
  }

  function applyLang(loc) {
    root.setAttribute("lang", I.bcp47[loc] || loc);
    root.setAttribute("dir", I.rtl.indexOf(loc) >= 0 ? "rtl" : "ltr");
    doc.querySelectorAll("[data-i18n]").forEach(function (el) {
      el.textContent = tr(loc, el.getAttribute("data-i18n"));
    });
    doc.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      el.innerHTML = tr(loc, el.getAttribute("data-i18n-html"));
    });
    doc.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      el.setAttribute("aria-label", tr(loc, el.getAttribute("data-i18n-aria")));
    });
    doc.title =
      "VALO Tech | " +
      tr(loc, "hero.h1")
        .replace(/<[^>]*>/g, "")
        .replace(/[.。।۔]\s*$/, "");
    var label = doc.getElementById("langLabel");
    if (label) label.textContent = loc.toUpperCase();
    var flag = doc.getElementById("langFlag");
    if (flag) flag.src = "assets/flags/" + I.flag[loc] + ".svg";
    doc.querySelectorAll(".lang-opt").forEach(function (b) {
      b.setAttribute("aria-selected", String(b.getAttribute("data-loc") === loc));
    });
  }

  function setLang(loc) {
    try {
      localStorage.setItem(LANG_KEY, loc);
    } catch (e) {}
    applyLang(loc);
  }

  var langEl = doc.getElementById("lang");

  function closeLang() {
    if (!langEl) return;
    langEl.removeAttribute("data-open");
    var b = doc.getElementById("langBtn");
    if (b) b.setAttribute("aria-expanded", "false");
  }

  function openLang() {
    if (!langEl) return;
    langEl.setAttribute("data-open", "1");
    doc.getElementById("langBtn").setAttribute("aria-expanded", "true");
    var menu = doc.getElementById("langMenu");
    if (menu) {
      var sel =
        menu.querySelector('.lang-opt[aria-selected="true"]') ||
        menu.querySelector(".lang-opt");
      if (sel) sel.focus();
    }
  }

  (function initLang() {
    var menu = doc.getElementById("langMenu");
    if (menu) {
      var frag = doc.createDocumentFragment();
      I.locales.forEach(function (loc) {
        var b = doc.createElement("button");
        b.type = "button";
        b.className = "lang-opt";
        b.setAttribute("data-loc", loc);
        b.setAttribute("role", "option");
        var fl = doc.createElement("img");
        fl.className = "lang-fl";
        fl.src = "assets/flags/" + I.flag[loc] + ".svg";
        fl.alt = "";
        fl.loading = "lazy";
        var code = doc.createElement("span");
        code.className = "code";
        code.textContent = loc.toUpperCase();
        var name = doc.createElement("span");
        name.className = "nm";
        name.textContent = I.labels[loc];
        var tick = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
        tick.setAttribute("class", "i tick");
        tick.setAttribute("aria-hidden", "true");
        var use = doc.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", "#i-check");
        tick.appendChild(use);
        b.append(fl, code, name, tick);
        b.addEventListener("click", function () {
          setLang(loc);
          closeLang();
          var t = doc.getElementById("langBtn");
          if (t) t.focus();
        });
        frag.appendChild(b);
      });
      menu.appendChild(frag);

      menu.addEventListener("keydown", function (e) {
        var opts = [].slice.call(menu.querySelectorAll(".lang-opt"));
        if (!opts.length) return;
        var i = opts.indexOf(doc.activeElement),
          n = -1;
        if (e.key === "ArrowDown") n = (i + 1) % opts.length;
        else if (e.key === "ArrowUp") n = (i - 1 + opts.length) % opts.length;
        else if (e.key === "Home") n = 0;
        else if (e.key === "End") n = opts.length - 1;
        if (n >= 0) {
          e.preventDefault();
          opts[n].focus();
        }
      });
    }

    var btn = doc.getElementById("langBtn");
    if (btn)
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (langEl.hasAttribute("data-open")) closeLang();
        else openLang();
      });

    doc.addEventListener("click", function (e) {
      if (langEl && !langEl.contains(e.target)) closeLang();
    });
    doc.addEventListener("focusin", function (e) {
      if (langEl && langEl.hasAttribute("data-open") && !langEl.contains(e.target))
        closeLang();
    });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && langEl && langEl.hasAttribute("data-open")) {
        closeLang();
        if (btn) btn.focus();
      }
    });

    applyLang(currentLang());
  })();

  /* ---------------- header state ---------------- */
  (function initHeader() {
    var hdr = doc.querySelector(".hdr");
    if (!hdr || !("IntersectionObserver" in window)) return;
    var probe = doc.createElement("div");
    probe.style.cssText =
      "position:absolute;top:0;left:0;height:1px;width:1px;pointer-events:none";
    doc.body.prepend(probe);
    new IntersectionObserver(function (e) {
      hdr.classList.toggle("scrolled", !e[0].isIntersecting);
    }).observe(probe);
  })();

  /* ---------------- scroll reveal ---------------- */
  (function initReveal() {
    var els = doc.querySelectorAll(".reveal");
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach(function (el) {
        el.classList.add("in");
      });
      return;
    }
    var io = new IntersectionObserver(
      function (ents) {
        ents.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add("in");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -8% 0px" }
    );
    var pending = [];
    els.forEach(function (el) {
      pending.push(el);
      io.observe(el);
    });

    /* A flick of the wheel, a dragged scrollbar or the End key can carry a
       block from below the fold to above it with no frame in between. The
       observer hears nothing: its ratio was zero before and is zero after,
       and a notification is only queued when a threshold is crossed. So the
       block would stay invisible for the rest of the session — content lost
       to the speed of the scroll. Anything the page has already carried past
       the top is revealed outright, and the sweep retires once nothing is
       left to reveal. */
    var sweepQueued = 0;
    function sweepPassed() {
      sweepQueued = 0;
      var left = [];
      for (var i = 0; i < pending.length; i++) {
        var el = pending[i];
        if (el.classList.contains("in")) continue;
        if (el.getBoundingClientRect().bottom <= 0) {
          el.classList.add("in", "revealed-now");
          io.unobserve(el);
        } else {
          left.push(el);
        }
      }
      pending = left;
      if (!pending.length) window.removeEventListener("scroll", queueSweep);
    }
    function queueSweep() {
      if (!sweepQueued) sweepQueued = requestAnimationFrame(sweepPassed);
    }
    window.addEventListener("scroll", queueSweep, { passive: true });
    /* Tabbing lands on a control before the block around it has met the
       observer's threshold, so focus reveals its own block rather than
       leaving the reader on something invisible. */
    doc.addEventListener("focusin", function (e) {
      /* Any enclosing block, not only one still hidden. Tabbing scrolls the
         block into view, which can let the observer start its fade a frame
         before focus lands — and then the reader is looking at something
         half-way through appearing. */
      var block = e.target.closest && e.target.closest(".reveal");
      if (block) {
        /* Revealed outright rather than transitioned. The stagger is for
           reading down a page; a keyboard user has already arrived, and a
           focused element that is still fading is a focused element the
           reader cannot see. Nothing here depends on a transition landing. */
        block.classList.add("in", "revealed-now");
        io.unobserve(block);
      }
    });
  })();

  /* ---------------- the orbiting chapters ---------------- */

  /* A chapter that declares `data-orbit` becomes a stage: its argument is
     pinned to one side and its cards ride an ellipse about the planet,
     passing behind it and returning. Two chapters use it; the mechanism knows
     about neither of them. */
  (function initOrbits() {
    var sections = [].slice.call(doc.querySelectorAll("[data-orbit]"));
    if (!sections.length) return;
    /* Matches the breakpoint the stage's styles are written under. */
    var wide = window.matchMedia("(min-width: 950px)");
    var EDGE = 24;
    var CLEAR = 28;

    var stages = sections
      .map(function (section) {
        return { section: section, cards: [].slice.call(section.querySelectorAll("[data-orbit-card]")) };
      })
      .filter(function (s) { return s.cards.length; });
    if (!stages.length) return;

    /* The ellipse the satellites already travel — but never wider than the
       frame allows. Bounded on one side by the pinned argument and on the
       other by the window edge, both measured, so a card cannot land on the
       reading column or leave the page at any viewport. */
    function radii(sx, head, cardHalf) {
      var wanted = Math.min(window.innerWidth * 0.54, 780) * 0.4;
      /* The pinned column is on the reading-start side, which swaps under
         Arabic and Urdu. Measure to whichever side of it the planet is on,
         and to the window edge beyond, rather than assuming either. */
      var past = sx > head.right;
      var toHead = past ? sx - head.right - CLEAR : head.left - sx - CLEAR;
      var toEdge = past ? window.innerWidth - EDGE - sx : sx - EDGE;
      var room = Math.min(toHead, toEdge) - cardHalf;
      return {
        x: Math.max(140, Math.min(wanted, room)),
        y: Math.min(window.innerWidth * 0.34, 540) * 0.35
      };
    }

    /* Half the drawn disc, which is inset within its own box and scaled by
       the scene. The cutout has to match what the reader sees, not the box. */
    function rockRadius() {
      var box = Math.min(window.innerWidth * 0.42, 620);
      var scale = parseFloat(getComputedStyle(root).getPropertyValue("--stone-scale")) || 1;
      return box * 0.37 * scale;
    }

    function readStone(axis, fallback) {
      var v = parseFloat(getComputedStyle(root).getPropertyValue("--stone-" + axis));
      return isNaN(v) ? fallback : v;
    }

    function place(stage, sx, sy, rock) {
      var rect = stage.section.getBoundingClientRect();
      /* Only while the chapter holds the frame. Outside it the cards are
         fixed-position elements with nothing to belong to. */
      var pinned = rect.top <= 0 && rect.bottom >= window.innerHeight;
      var travel = Math.max(1, rect.height - window.innerHeight);
      var progress = Math.min(1, Math.max(0, -rect.top / travel));
      var headEl = stage.section.querySelector(".chapter-head");
      var head = headEl ? headEl.getBoundingClientRect() : { left: 0, right: 0 };
      var cards = stage.cards;
      var r = radii(sx, head, cards[0].offsetWidth / 2);
      var step = 360 / cards.length;

      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        /* Evenly spaced, turning two thirds of a revolution across the
           chapter: enough for every card to pass behind the world once. */
        var radians = ((90 + i * step - progress * 240) * Math.PI) / 180;
        var depth = (Math.sin(radians) + 1) / 2;
        var scale = 0.74 + depth * 0.26;
        var dx = Math.cos(radians) * r.x;
        var dy = Math.sin(radians) * r.y;

        /* Placed by its own top-left, not by a percentage translate. A
           percentage translate composed with a scale resolves about the
           transform origin, which moves the drawn centre by half the box. */
        var w = card.offsetWidth;
        var h = card.offsetHeight;
        card.style.left = (sx + dx - w / 2).toFixed(1) + "px";
        card.style.top = (sy + dy - h / 2).toFixed(1) + "px";
        card.style.transform = "scale(" + scale.toFixed(3) + ")";
        card.style.opacity = pinned ? (0.48 + depth * 0.52).toFixed(3) : "0";
        /* Outside its own chapter the card is a fixed element sitting over
           whatever the reader is looking at. Transparent is not enough: it
           still occupies the frame and still costs a paint. */
        card.style.visibility = pinned ? "visible" : "hidden";
        card.style.filter = "blur(" + ((1 - depth) * 1.2).toFixed(2) + "px)";
        card.style.zIndex = String(2 + Math.round(depth * 4));
        card.setAttribute("data-depth", depth < 0.5 ? "rear" : "front");
        /* Where the planet sits inside this card, in the card's own
           coordinates: the card is scaled, so the offset and the radius are
           divided by that scale to keep the cutout the size of the disc. */
        card.style.setProperty("--rock-x", "calc(50% - " + (dx / scale).toFixed(2) + "px)");
        card.style.setProperty("--rock-y", "calc(50% - " + (dy / scale).toFixed(2) + "px)");
        card.style.setProperty("--rock-rx", (rock / scale).toFixed(2) + "px");
        card.style.setProperty("--rock-ry", (rock / scale).toFixed(2) + "px");
      }
    }

    function clear() {
      stages.forEach(function (stage) {
        stage.cards.forEach(function (card) {
          card.style.cssText = "";
          card.removeAttribute("data-depth");
        });
      });
    }

    var queued = 0;
    function update() {
      queued = 0;
      if (reduce || !wide.matches) {
        clear();
        return;
      }
      var sx = readStone("x", window.innerWidth / 2);
      var sy = readStone("y", window.innerHeight / 2);
      var rock = rockRadius();
      stages.forEach(function (stage) { place(stage, sx, sy, rock); });
    }

    function queue() {
      if (!queued) queued = requestAnimationFrame(update);
    }

    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue, { passive: true });
    if (wide.addEventListener) wide.addEventListener("change", queue);
    update();
  })();

  /* ---------------- the mapping stage ---------------- */
  (function initFitStage() {
    var section = doc.getElementById("people");
    var fit = section && section.querySelector(".fit");
    if (!fit) return;
    var rows = [].slice.call(fit.querySelectorAll(".fit-row"));
    if (!rows.length) return;
    /* Matches the breakpoint the stage's styles are written under. Below it
       the chapter is an ordinary stack and every pair is simply present. */
    var wide = window.matchMedia("(min-width: 950px)");

    /* The styles hide a pair until the stage reveals it, so they may only do
       that once this is running. Without the flag a stale or blocked script
       would leave the chapter blank rather than merely unanimated. */
    root.classList.add("fit-stage");

    function showAll() {
      rows.forEach(function (row) {
        row.classList.add("is-revealed");
        row.classList.remove("is-active");
      });
    }

    var queued = 0;
    function update() {
      queued = 0;
      if (reduce || !wide.matches) {
        showAll();
        return;
      }
      var rect = section.getBoundingClientRect();
      /* How far the section has travelled past the top of the viewport, as a
         fraction of the distance it can travel. The panel is sticky, so this
         is exactly the reader's progress through the chapter. */
      var distance = Math.max(1, rect.height - window.innerHeight);
      var progress = Math.min(0.9999, Math.max(0, -rect.top / distance));
      var stage = Math.min(rows.length - 1, Math.floor(progress * rows.length));
      rows.forEach(function (row, i) {
        row.classList.toggle("is-revealed", stage >= i);
        row.classList.toggle("is-active", stage === i);
      });
    }

    function queue() {
      if (!queued) queued = requestAnimationFrame(update);
    }

    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue, { passive: true });
    if (wide.addEventListener) wide.addEventListener("change", queue);
    update();
  })();

  /* ---------------- mobile menu ---------------- */
  (function initMenu() {
    var burger = doc.getElementById("burger"),
      menu = doc.getElementById("mmenu");
    if (!burger || !menu) return;
    var icon = burger.querySelector("use");

    function setOpen(open) {
      menu.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", String(open));
      if (icon) icon.setAttribute("href", open ? "#i-x" : "#i-list");
    }

    burger.addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(!menu.classList.contains("open"));
    });
    menu.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () {
        setOpen(false);
      });
    });
    doc.addEventListener("click", function (e) {
      if (
        menu.classList.contains("open") &&
        !menu.contains(e.target) &&
        !burger.contains(e.target)
      )
        setOpen(false);
    });
    doc.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || !menu.classList.contains("open")) return;
      var inside = menu.contains(doc.activeElement);
      setOpen(false);
      if (inside) burger.focus();
    });
  })();

  /* ---------------- back to top ---------------- */
  (function initTop() {
    var btn = doc.getElementById("toTop");
    if (!btn) return;
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    });
    if (!("IntersectionObserver" in window)) {
      btn.classList.add("show");
      return;
    }
    var probe = doc.querySelector(".hero");
    if (!probe) return;
    new IntersectionObserver(function (e) {
      btn.classList.toggle("show", !e[0].isIntersecting);
    }).observe(probe);
  })();

  /* ---------------- scroll-spy ---------------- */
  (function initSpy() {
    var links = {},
      secs = [];
    doc.querySelectorAll('.nav-links a[href^="#"]').forEach(function (a) {
      var id = a.getAttribute("href").slice(1);
      var s = doc.getElementById(id);
      if (s) {
        links[id] = a;
        secs.push(s);
      }
    });
    if (!secs.length) return;
    /* Read off the sections rather than off an observer's entries. An observer
       is notified only when a ratio crosses a threshold, and a jump — an
       anchor, the End key, a dragged scrollbar — can take a chapter from below
       the band to above it with no frame in between, crossing nothing and
       leaving the nav pointing at wherever the reader used to be. */
    function settle() {
      var best = null;
      var bestGap = Infinity;
      var middle = window.innerHeight / 2;
      for (var i = 0; i < secs.length; i++) {
        var box = secs[i].getBoundingClientRect();
        if (box.bottom < 0 || box.top > window.innerHeight) continue;
        var gap = box.top > middle ? box.top - middle : 0;
        if (box.bottom < middle) gap = middle - box.bottom;
        if (gap < bestGap) {
          bestGap = gap;
          best = secs[i].id;
        }
      }
      /* Chapters without a nav entry sit between the ones that have them. In
         those the mark stays where it was rather than blinking off, because a
         highlight that disappears mid-page reads as a bug, not as an answer. */
      if (!best) return;
      Object.keys(links).forEach(function (k) {
        if (k === best) links[k].setAttribute("aria-current", "true");
        else links[k].removeAttribute("aria-current");
      });
    }

    var queued = 0;
    function queueSettle() {
      if (!queued) {
        queued = requestAnimationFrame(function () {
          queued = 0;
          settle();
        });
      }
    }
    window.addEventListener("scroll", queueSettle, { passive: true });
    window.addEventListener("resize", queueSettle, { passive: true });
    settle();
  })();
})();
