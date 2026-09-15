/* VALO Tech — the consent choice, and the banner that asks for it
   (`SITE-006/T2`, `/T3`, `/T4`, `/T5`; the posture is `LEGAL-GLOBAL-002`).

   One object in the visitor's own browser, and nothing about the answer ever
   reaches us. The banner is the only thing here that draws; everything else is
   reading a value, writing a value, and telling the page what it may load.

   **The banner's markup is in the page and starts hidden**, rather than being
   built here. A visitor with no JavaScript then never meets a question they
   could not answer -- and they are also a visitor for whom nothing optional
   could have loaded in the first place, so the two silences agree. It also
   means the strings are `data-i18n` nodes like every other, written into the
   served markup by `scripts/sync-static-copy.mjs` and translated by the same
   twenty dictionaries.

   **Nothing here animates.** The brand's own guidance is that this system is
   lit from inside and does not move unless a reader touches it, and a consent
   banner that slides in is the one that reads as a growth tactic. It is present
   or it is not. */
(function (w) {
  "use strict";

  var doc = w.document;

  /* Versioned, because the honest consequence of adding a fourth category later
     is that every stored answer stops covering the question. A bump re-asks; it
     never silently extends an old answer over something new
     (`LEGAL-GLOBAL-002/T5`). */
  var KEY = "valotech.consent";
  var VERSION = 1;

  /* The two categories a visitor decides. `necessary` is not here because it is
     not a choice: it is the session cookie their own sign-in creates and the
     language their own click stores, and a list that offered to switch those
     off would be offering something this page cannot do. */
  var OPTIONAL = ["analytics", "marketing"];

  /* The stored answer, or `null` for "nobody has answered".

     Read inside a `try` because a browser with storage disabled must render the
     page rather than fail (`SITE-006/T4`), and **an unreadable store is treated
     as no answer**, which is the fail-closed direction: the banner appears and
     nothing optional loads. The opposite reading -- treating an error as
     consent -- would turn a privacy setting into a reason to load more. */
  function stored() {
    var raw = null;
    try {
      raw = w.localStorage.getItem(KEY);
    } catch (e) {
      return null;
    }
    if (!raw) return null;

    var answer;
    try {
      answer = JSON.parse(raw);
    } catch (e) {
      return null;
    }
    if (!answer || typeof answer !== "object") return null;

    /* An answer to an older question is not an answer to this one. */
    if (answer.v !== VERSION) return null;

    var out = { v: VERSION };
    for (var i = 0; i < OPTIONAL.length; i++) {
      out[OPTIONAL[i]] = answer[OPTIONAL[i]] === true;
    }
    return out;
  }

  function remember(answer) {
    try {
      w.localStorage.setItem(KEY, JSON.stringify(answer));
    } catch (e) {
      /* Storage refused the write, so the answer cannot be remembered and the
         banner will ask again next time. That is the honest outcome: pretending
         to have stored a refusal would be the one failure that matters. */
    }
  }

  function answerOf(values) {
    var out = { v: VERSION };
    for (var i = 0; i < OPTIONAL.length; i++) {
      out[OPTIONAL[i]] = values === true ? true : values === false ? false : values[OPTIONAL[i]] === true;
    }
    return out;
  }

  /* What the page is allowed to load, published for whatever comes to need it.
     Nothing reads it today, because nothing optional exists yet -- which is the
     state `LEGAL-GLOBAL-002` describes and this keeps honest: a category with
     something behind it will ask here before it loads, rather than loading and
     then checking. */
  function apply(answer) {
    w.VALO_CONSENT = {
      version: VERSION,
      answered: answer !== null,
      analytics: answer !== null && answer.analytics === true,
      marketing: answer !== null && answer.marketing === true
    };
  }

  function checkboxes(scope) {
    return {
      analytics: scope.querySelector('[data-consent="analytics"]'),
      marketing: scope.querySelector('[data-consent="marketing"]')
    };
  }

  function readBoxes(boxes) {
    var values = {};
    for (var i = 0; i < OPTIONAL.length; i++) {
      var box = boxes[OPTIONAL[i]];
      values[OPTIONAL[i]] = !!(box && box.checked);
    }
    return values;
  }

  function writeBoxes(boxes, answer) {
    for (var i = 0; i < OPTIONAL.length; i++) {
      var box = boxes[OPTIONAL[i]];
      if (box) box.checked = answer !== null && answer[OPTIONAL[i]] === true;
    }
  }

  /* The banner on the gateway. It appears only when nobody has answered, and it
     is dismissed by answering: there is no close control that stores nothing,
     because a banner a visitor can wave away asks again on every page and
     teaches them to click whichever control is brightest. */
  function banner(answer) {
    var region = doc.getElementById("consent");
    if (!region) return;

    if (answer !== null) {
      region.hidden = true;
      return;
    }

    var boxes = checkboxes(region);
    region.hidden = false;

    /* Three controls of equal weight, and the markup gives them equal weight
       too (`SITE-006/T2`). A reject that is a grey link beside a bright accept
       is a dark pattern, and this company argues for audit-defensible systems. */
    function settle(values) {
      var chosen = answerOf(values);
      remember(chosen);
      apply(chosen);
      region.hidden = true;
    }

    var all = doc.getElementById("consentAll");
    var none = doc.getElementById("consentNone");
    var mine = doc.getElementById("consentMine");

    if (all) all.addEventListener("click", function () { settle(true); });
    if (none) none.addEventListener("click", function () { settle(false); });
    if (mine) mine.addEventListener("click", function () { settle(readBoxes(boxes)); });

    /* Escape is deliberately not bound. There is no dismissal without an answer,
       so a key that looked like one would be a control that does nothing -- and
       focus is never trapped here, because this is a region and not a modal:
       the page beneath stays readable and a visitor who wants to read the
       cookies page before answering can reach it (`SITE-006/T3`). */
  }

  /* The same choice, on `legal/cookies`, where somebody comes to change it
     (`SITE-006/T5`). It states what is stored now rather than opening blank,
     because a control that forgets the answer it is about is one a visitor
     answers twice. */
  function control(answer) {
    var form = doc.getElementById("consentControl");
    if (!form) return;

    var boxes = checkboxes(form);
    writeBoxes(boxes, answer);

    var said = doc.getElementById("consentSaid");
    function report(key) {
      if (!said) return;
      var source = doc.getElementById(key);
      said.textContent = source ? source.textContent : "";
    }

    report(answer === null ? "consentUnanswered" : "consentAnswered");

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var chosen = answerOf(readBoxes(boxes));
      remember(chosen);
      apply(chosen);
      report("consentSaved");
    });
  }

  var answer = stored();
  apply(answer);
  banner(answer);
  control(answer);
})(window);
