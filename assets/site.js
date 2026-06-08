/* VALO Tech - behavior. Vanilla, dependency-free, motion-safe, no framework.
   Coordinates with assets/i18n.js (window.VALO_I18N) and the markup data-* hooks. */
(function () {
  "use strict";
  var doc = document, root = doc.documentElement;
  root.classList.add("js");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var I = window.VALO_I18N;

  /* ---------------- i18n ---------------- */
  var LANG_KEY = "valotech-lang";
  function dictFor(loc) { return (I.dict[loc]) || I.dict.en; }
  function tr(loc, key) {
    var d = I.dict[loc]; if (d && d[key] != null) return d[key];
    return I.dict.en[key] != null ? I.dict.en[key] : key;
  }
  function currentLang() {
    var saved = null; try { saved = localStorage.getItem(LANG_KEY); } catch (e) {}
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
    var lbl = doc.getElementById("langLabel");
    if (lbl) lbl.textContent = loc.toUpperCase();
    var lf = doc.getElementById("langFlag");
    if (lf) lf.src = "assets/flags/" + I.flag[loc] + ".svg";
    doc.querySelectorAll(".lang-opt").forEach(function (b) {
      b.setAttribute("aria-selected", String(b.getAttribute("data-loc") === loc));
    });
  }
  function setLang(loc) {
    try { localStorage.setItem(LANG_KEY, loc); } catch (e) {}
    applyLang(loc);
  }
  function buildLangMenu() {
    var menu = doc.getElementById("langMenu"); if (!menu) return;
    var have = I.dict; var frag = doc.createDocumentFragment();
    I.locales.forEach(function (loc) {
      var b = doc.createElement("button");
      b.type = "button"; b.className = "lang-opt"; b.setAttribute("data-loc", loc); b.setAttribute("role", "option");
      b.innerHTML =
        '<img class="lang-fl" src="assets/flags/' + I.flag[loc] + '.svg" alt="" loading="lazy" />' +
        '<span class="code">' + loc.toUpperCase() + '</span>' +
        '<span class="nm">' + I.labels[loc] + '</span>' +
        (have[loc] ? '<svg class="i tick" aria-hidden="true"><use href="#i-check"/></svg>'
                   : '<span class="lang-seed" title="Shows English until translated">EN</span>');
      b.addEventListener("click", function () { setLang(loc); closeLang(); });
      frag.appendChild(b);
    });
    menu.appendChild(frag);
  }
  var langEl = doc.getElementById("lang");
  function openLang() { if (langEl) { langEl.setAttribute("data-open", "1"); doc.getElementById("langBtn").setAttribute("aria-expanded", "true"); } }
  function closeLang() { if (langEl) { langEl.removeAttribute("data-open"); var b = doc.getElementById("langBtn"); if (b) b.setAttribute("aria-expanded", "false"); } }
  (function initLang() {
    buildLangMenu();
    var btn = doc.getElementById("langBtn");
    if (btn) btn.addEventListener("click", function (e) { e.stopPropagation(); langEl.hasAttribute("data-open") ? closeLang() : openLang(); });
    doc.addEventListener("click", function (e) { if (langEl && !langEl.contains(e.target)) closeLang(); });
    doc.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLang(); });
    applyLang(currentLang());
  })();

  /* ---------------- theme (3-way: light / dark / system) ---------------- */
  var THEME_KEY = "valotech-theme";
  function savedTheme() { try { return localStorage.getItem(THEME_KEY) || "system"; } catch (e) { return "system"; } }
  function applyTheme(mode) {
    if (mode === "light" || mode === "dark") root.setAttribute("data-theme", mode);
    else root.removeAttribute("data-theme");
    doc.querySelectorAll(".theme-seg button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-theme-set") === mode);
    });
    movePill(mode);
  }
  function movePill(mode) {
    var seg = doc.querySelector(".theme-seg"), pill = doc.getElementById("themePill");
    if (!seg || !pill) return;
    var active = seg.querySelector('button[data-theme-set="' + mode + '"]'); if (!active) return;
    pill.style.transform = "translate(" + active.offsetLeft + "px," + active.offsetTop + "px)";
    pill.style.width = active.offsetWidth + "px"; pill.style.height = active.offsetHeight + "px";
  }
  (function initTheme() {
    var mode = savedTheme();
    doc.querySelectorAll(".theme-seg button").forEach(function (b) {
      b.addEventListener("click", function () {
        var m = b.getAttribute("data-theme-set");
        try { localStorage.setItem(THEME_KEY, m); } catch (e) {}
        applyTheme(m);
      });
    });
    applyTheme(mode);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(function () { movePill(savedTheme()); });
    window.addEventListener("resize", function () { movePill(savedTheme()); }, { passive: true });
  })();

  /* ---------------- header scrolled state (IO sentinel, no scroll listener) ---------------- */
  (function initHeader() {
    var hdr = doc.querySelector(".hdr"); if (!hdr) return;
    var s = doc.createElement("div");
    s.style.cssText = "position:absolute;top:0;left:0;height:1px;width:1px;pointer-events:none";
    doc.body.prepend(s);
    new IntersectionObserver(function (e) { hdr.classList.toggle("scrolled", !e[0].isIntersecting); }).observe(s);
  })();

  /* ---------------- scroll reveal ---------------- */
  (function initReveal() {
    var els = doc.querySelectorAll(".reveal");
    if (reduce || !("IntersectionObserver" in window)) { els.forEach(function (el) { el.classList.add("in"); }); return; }
    var io = new IntersectionObserver(function (ents) {
      ents.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { threshold: 0.14, rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (el) { io.observe(el); });
  })();

  /* ---------------- mobile menu ---------------- */
  (function initMenu() {
    var burger = doc.getElementById("burger"), menu = doc.getElementById("mmenu"); if (!burger || !menu) return;
    function close() { menu.classList.remove("open"); burger.setAttribute("aria-expanded", "false"); }
    burger.addEventListener("click", function () {
      var open = menu.classList.toggle("open"); burger.setAttribute("aria-expanded", String(open));
    });
    menu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", close); });
    doc.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  })();

  /* ---------------- tabs ---------------- */
  (function initTabs() {
    var tabs = [].slice.call(doc.querySelectorAll(".tab-btn")); if (!tabs.length) return;
    var panels = tabs.map(function (t) { return doc.getElementById(t.getAttribute("aria-controls")); });
    function sel(i) { tabs.forEach(function (t, j) { var on = i === j; t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1; panels[j].hidden = !on; }); }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { sel(i); });
      t.addEventListener("keydown", function (e) {
        var n = null;
        if (e.key === "ArrowRight") n = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft") n = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") n = 0; else if (e.key === "End") n = tabs.length - 1;
        if (n !== null) { e.preventDefault(); sel(n); tabs[n].focus(); }
      });
    });
  })();

  /* ---------------- back to top ---------------- */
  (function initTop() {
    var btn = doc.getElementById("gotop"); if (!btn) return;
    var probe = doc.createElement("div");
    probe.style.cssText = "position:absolute;top:90vh;height:1px;width:1px;pointer-events:none";
    doc.body.appendChild(probe);
    new IntersectionObserver(function (e) { btn.classList.toggle("show", !e[0].isIntersecting); }).observe(probe);
    btn.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); });
  })();

  /* ---------------- cursor wake ribbon ---------------- */
  (function initCursor() {
    if (reduce || window.matchMedia("(pointer: coarse)").matches) return;
    var NS = "http://www.w3.org/2000/svg", MAX = 26, LIFE = 380;
    var svg = doc.createElementNS(NS, "svg"); svg.setAttribute("class", "cursor-trail");
    svg.innerHTML =
      '<defs><linearGradient id="vt-trail" gradientUnits="userSpaceOnUse">' +
      '<stop offset="0%" stop-color="#1AA67E" stop-opacity="0"/>' +
      '<stop offset="55%" stop-color="#1AA67E" stop-opacity="0.22"/>' +
      '<stop offset="100%" stop-color="#34E2B0" stop-opacity="0.85"/></linearGradient>' +
      '<filter id="vt-blur"><feGaussianBlur stdDeviation="3"/></filter></defs>' +
      '<path id="vt-path" stroke="url(#vt-trail)" stroke-width="10" fill="none" stroke-linecap="round" filter="url(#vt-blur)"/>';
    doc.body.appendChild(svg);
    var path = svg.querySelector("#vt-path"), grad = svg.querySelector("#vt-trail");
    var pts = [], raf = 0;
    window.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      pts.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (pts.length > MAX) pts.shift();
      if (!raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
    function tick() {
      var now = performance.now();
      while (pts.length && now - pts[0].t > LIFE) pts.shift();
      if (pts.length < 2) { path.setAttribute("d", ""); raf = 0; return; }
      var d = "M " + pts[0].x.toFixed(1) + "," + pts[0].y.toFixed(1);
      for (var i = 1; i < pts.length; i++) d += " L " + pts[i].x.toFixed(1) + "," + pts[i].y.toFixed(1);
      path.setAttribute("d", d);
      var a = pts[0], b = pts[pts.length - 1];
      grad.setAttribute("x1", a.x); grad.setAttribute("y1", a.y); grad.setAttribute("x2", b.x); grad.setAttribute("y2", b.y);
      raf = requestAnimationFrame(tick);
    }
  })();

  /* ---------------- ecosystem hub: orbiting particles ---------------- */
  (function initHub() {
    var svg = doc.getElementById("ecoHub"); if (!svg) return;
    var layer = doc.getElementById("hubCoins"); if (!layer) return;
    var NS = "http://www.w3.org/2000/svg";
    var nodes = [].slice.call(svg.querySelectorAll(".pnode")).map(function (n) {
      return { el: n, x: parseFloat(n.getAttribute("data-x")), y: parseFloat(n.getAttribute("data-y")) };
    });
    if (!nodes.length) return;
    var cx = parseFloat(svg.getAttribute("data-cx")) || 200, cy = parseFloat(svg.getAttribute("data-cy")) || 190;
    function pulse(el) { el.classList.add("pulse"); setTimeout(function () { el.classList.remove("pulse"); }, 700); }
    function coin(node, outbound) {
      var c = doc.createElementNS(NS, "circle");
      c.setAttribute("r", "5"); c.setAttribute("cx", cx); c.setAttribute("cy", cy);
      c.setAttribute("class", "coin"); c.setAttribute("fill", "#62E2BC");
      var dx = node.x - cx, dy = node.y - cy;
      var from = outbound ? "0px,0px" : dx + "px," + dy + "px";
      var to = outbound ? dx + "px," + dy + "px" : "0px,0px";
      c.style.transform = "translate(" + from + ")"; c.style.opacity = "0";
      layer.appendChild(c); c.getBoundingClientRect();
      c.style.opacity = "1"; c.style.transform = "translate(" + to + ")";
      setTimeout(function () { pulse(outbound ? node.el : svg.querySelector("#hubCore")); }, 1300);
      setTimeout(function () { c.remove(); }, 1900);
    }
    var scenes = [
      nodes.map(function (n, i) { return { node: n, out: true, delay: i * 240 }; }),                 // foundation flows to every product
      nodes.map(function (n, i) { return { node: n, out: false, delay: i * 240 }; })                  // learning flows back to the core
    ];
    var si = 0, timer = 0;
    function tick() {
      scenes[si].forEach(function (f) { setTimeout(function () { coin(f.node, f.out); }, f.delay); });
      si = (si + 1) % scenes.length;
    }
    function start() { if (timer) return; tick(); timer = setInterval(tick, 2800); }
    function stop() { if (timer) { clearInterval(timer); timer = 0; } }
    if (reduce) return; // static diagram under reduced motion
    new IntersectionObserver(function (e) { e[0].isIntersecting ? start() : stop(); }, { threshold: 0.25 }).observe(svg);
  })();

  /* ---------------- scroll-spy: active nav link for the section in view ---------------- */
  (function initSpy() {
    if (!("IntersectionObserver" in window)) return;
    var ids = ["approach", "workforce", "trust", "ecosystem", "engage"], links = {}, secs = [];
    ids.forEach(function (id) {
      var a = doc.querySelector('.nav-links a[href="#' + id + '"]'), s = doc.getElementById(id);
      if (a && s) { links[id] = a; secs.push(s); }
    });
    if (!secs.length) return;
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var id = en.target.id;
          Object.keys(links).forEach(function (k) { links[k].classList.toggle("active", k === id); });
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });
    secs.forEach(function (s) { spy.observe(s); });
  })();
})();
