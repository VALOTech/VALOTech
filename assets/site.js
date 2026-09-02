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
    els.forEach(function (el) {
      io.observe(el);
    });
    /* Tabbing lands on a control before the block around it has met the
       observer's threshold, so focus reveals its own block rather than
       leaving the reader on something invisible. */
    doc.addEventListener("focusin", function (e) {
      var block = e.target.closest && e.target.closest(".reveal:not(.in)");
      if (block) {
        /* The staggered delay is for reading down a page. A keyboard user has
           already arrived, so it would leave them on something invisible for
           the better part of a second. */
        block.style.transitionDelay = "0s";
        block.classList.add("in");
        io.unobserve(block);
      }
    });
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
    if (!("IntersectionObserver" in window)) return;
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
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var id = en.target.id;
          Object.keys(links).forEach(function (k) {
            if (k === id) links[k].setAttribute("aria-current", "true");
            else links[k].removeAttribute("aria-current");
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    secs.forEach(function (s) {
      spy.observe(s);
    });
  })();
})();
