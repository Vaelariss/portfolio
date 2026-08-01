/* Brickwork — behaviour. No inline handlers (CSP: script-src 'self'). */
document.documentElement.classList.add('js'); // gate reveal/brick so content shows if JS fails

/* Referral attribution — brickworkstudio.net/?ref=CODE
   ------------------------------------------------------------------
   There is no database and no affiliate platform here on purpose. All this
   does is remember who sent a visitor and stamp that onto the enquiry, so the
   lead arrives already labelled. Matching a payout to a sale is done by hand
   against the partner ledger — at this volume a spreadsheet beats $49/mo of
   SaaS built for subscription products we don't sell.

   FIRST-touch, not last: the person being paid is whoever made the
   introduction, and a later visit from a different link shouldn't quietly
   reassign their commission. A stored code is only replaced once it expires.

   The 90-day window is what stops a referrer claiming someone who wandered
   back a year later off a Google search. */
var BW_REF = (function () {
  var KEY = 'bw_ref', STAMP = 'bw_ref_at', DAYS = 90;
  var VALID = /^[a-z0-9][a-z0-9_-]{1,23}$/; /* also blocks anything HTML-ish reaching the form */

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
  function drop(k) { try { localStorage.removeItem(k); } catch (e) {} }

  function stored() {
    var code = get(KEY), at = parseInt(get(STAMP), 10);
    if (!code) return null;
    if (!at || (Date.now() - at) > DAYS * 864e5) { drop(KEY); drop(STAMP); return null; }
    return code;
  }

  function capture() {
    var code;
    try { code = (new URL(window.location.href)).searchParams.get('ref'); } catch (e) { return stored(); }
    if (!code) return stored();
    code = code.trim().toLowerCase();
    if (!VALID.test(code)) return stored();
    var existing = stored();
    if (existing) return existing;          /* first touch wins */
    set(KEY, code); set(STAMP, String(Date.now()));
    return code;
  }

  return { code: capture() };
})();

/* Analytics event helper.
   Umami is loaded same-origin via the /js/script.js proxy in _redirects, so
   script-src stays 'self' and ad-blockers that filter the vendor domain don't
   strip it. Every call is guarded: if the script is missing, blocked, or not
   yet configured, this is a no-op and nothing here can throw. */
function bwTrack(name, props) {
  try {
    if (window.umami && typeof window.umami.track === 'function') {
      window.umami.track(name, props || {});
    }
  } catch (e) { /* analytics must never break the page */ }
}

document.addEventListener('DOMContentLoaded', function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* current year */
  var yr = document.getElementById('year');
  if (yr) yr.textContent = new Date().getFullYear();

  /* scroll reveal */
  var reveals = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('in'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* FAQ accordion (one open at a time) */
  document.querySelectorAll('.faq__q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.faq__item');
      var isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq__item.open').forEach(function (i) {
        i.classList.remove('open');
        i.querySelector('.faq__q').setAttribute('aria-expanded', 'false');
        i.querySelector('.faq__a').style.maxHeight = null;
      });
      if (!isOpen) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        var ans = item.querySelector('.faq__a');
        ans.style.maxHeight = ans.scrollHeight + 'px';
      }
    });
  });

  /* mobile menu */
  var burger = document.querySelector('.burger');
  var menu = document.getElementById('mobile');
  function closeMenu() {
    if (!menu) return;
    menu.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
  if (burger && menu) {
    burger.addEventListener('click', function () {
      var open = menu.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) {
        var navEl = document.querySelector('.nav');
        if (navEl) menu.style.top = navEl.getBoundingClientRect().bottom + 'px';
      }
    });
    menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeMenu); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  }

  /* active nav link on scroll */
  var secs = Array.prototype.slice.call(document.querySelectorAll('section[id]'));
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav__links a'));
  if (secs.length && links.length) {
    var onScroll = function () {
      var pos = window.scrollY + 90, cur = '';
      secs.forEach(function (s) { if (pos >= s.offsetTop && pos < s.offsetTop + s.offsetHeight) cur = s.id; });
      links.forEach(function (a) { a.style.color = (a.getAttribute('href') === '#' + cur) ? 'var(--ink)' : ''; });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* signature: lay the brick wall, then resolve into a site */
  var wall = document.getElementById('wall');
  if (wall) {
    var rows = [[34,22,30,14],[18,30,22,30],[28,18,26,28],[22,28,18,32],[30,22,28,20],[20,26,30,24]];
    var i = 0;
    rows.forEach(function (row) {
      row.forEach(function (w) {
        var b = document.createElement('span');
        b.className = 'brick';
        b.style.flexBasis = 'calc(' + w + '% - 6px)';
        b.style.flexGrow = '1';
        b.style.setProperty('--d', (i * 45) + 'ms');
        wall.appendChild(b);
        i++;
      });
    });
    var site = document.getElementById('bsite');
    if (reduce) {
      if (site) site.classList.add('show');
    } else {
      var bricks = wall.querySelectorAll('.brick');
      var started = false;
      var start = function () {
        if (started) return; started = true;
        bricks.forEach(function (b) { b.classList.add('lay'); });
        if (site) setTimeout(function () { site.classList.add('show'); }, i * 45 + 320);
      };
      var bo = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting) { start(); bo.disconnect(); } });
      }, { threshold: 0.3 });
      bo.observe(wall);
    }
  }

  /* The contact form posts natively to Netlify Forms and lands on /thanks.
     Deliberately NOT intercepted: an AJAX submit can fail invisibly, and a
     real navigation to /thanks gives us a pageview we can count as the
     conversion. Do not add a submit handler that calls preventDefault here —
     that would silently break the form. The honeypot is handled by Netlify
     via data-netlify-honeypot. */
  var form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', function () {
      var svc = form.querySelector('[name="service"]');
      bwTrack('form_submit', { service: svc ? svc.value : '' });
      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    });

    /* form_start — fires once, on the first real interaction with any field.
       The gap between form_view and form_start is "saw it, didn't try";
       between form_start and the /thanks pageview is "tried, gave up". */
    var started = false;
    form.addEventListener('input', function (e) {
      if (started) return;
      started = true;
      bwTrack('form_start', { field: e.target.name || '' });
    });

    /* form_view — did anyone actually reach the form? */
    if ('IntersectionObserver' in window) {
      var fo = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { bwTrack('form_view'); fo.disconnect(); }
        });
      }, { threshold: 0.3 });
      fo.observe(form);
    }
  }

  /* Delegated click tracking — one listener covers every CTA, including the
     14 niche links, without touching any markup. */
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var label = (a.textContent || '').trim().slice(0, 60);

    if (href.indexOf('#contact') > -1) {
      var sec = a.closest('section[id]');
      var chrome = a.closest('.nav, .mobile, .mbar, .announce, .footer');
      bwTrack('cta_click', {
        location: sec ? sec.id : (chrome ? chrome.className.split(' ')[0] : 'page'),
        label: label
      });
    } else if (href.indexOf('wa.me') > -1) {
      bwTrack('contact_alt_click', { channel: 'whatsapp' });
    } else if (href.indexOf('mailto:') === 0) {
      bwTrack('contact_alt_click', { channel: 'email' });
    } else if (href.indexOf('instagram.com') > -1) {
      bwTrack('contact_alt_click', { channel: 'instagram' });
    } else if (href.indexOf('/demo/') === 0) {
      bwTrack('demo_click', { demo: href.replace('/demo/', '') });
    }
  });

  /* 404_view — which dead URL did they hit, and where from? Tells us whether
     a cold-email recipient landed on a broken link. */
  if (document.body.getAttribute('data-page') === '404') {
    bwTrack('404_view', {
      path: location.pathname,
      ref: document.referrer || 'direct'
    });
  }

  /* hide the mobile sticky bar while the contact form is on screen */
  var contact = document.getElementById('contact');
  var mbar = document.querySelector('.mbar');
  if (contact && mbar && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { mbar.classList.toggle('mbar--hide', e.isIntersecting); });
    }, { threshold: 0.08 }).observe(contact);
  }
});

/* currency switcher — honest approx; you're billed in the listed currency */
document.addEventListener('DOMContentLoaded', function () {
  var prices = document.querySelectorAll('.price');
  var sw = document.querySelectorAll('.curswitch button');
  if (!prices.length || !sw.length) return;
  /* Fallback conversion rates. REVIEW DATE: 2026-10-31 — a rate set months ago
     silently misprices every package, so check these quarterly. GBP/USD checked
     against mid-market 2026-07-31; EUR is inherited and unverified.
     These only apply to figures with no explicit data-usd / data-eur override,
     i.e. the market-comparison numbers where precision doesn't matter. Every
     headline package price carries its own charm-priced value instead. */
  var rate = { gbp: 1, usd: 1.323, eur: 1.17 }, sym = { gbp: '£', usd: '$', eur: '€' };
  function render(cur) {
    if (!rate[cur]) cur = 'gbp';
    prices.forEach(function (el) {
      var amt = parseFloat(el.getAttribute('data-amt'));
      if (isNaN(amt)) return;
      var nat = el.getAttribute('data-cur') || 'gbp';
      var v, set = el.getAttribute('data-' + cur);
      if (cur !== nat && set !== null && set !== '') {
        /* A price someone chose, not a conversion artefact: $1,195 rather than
           the $1,184 a straight multiply produces. */
        v = parseFloat(set);
      } else {
        v = amt * (rate[cur] / rate[nat]);
        /* Rounding to the nearest 5 exists so converted amounts don't read as
           false precision ($1,264.65). It must not touch the native currency —
           that was silently turning £119/mo into £120/mo on every load. */
        if (cur !== nat) v = v >= 100 ? Math.round(v / 5) * 5 : Math.round(v);
      }
      el.textContent = sym[cur] + v.toLocaleString('en-US') + (el.getAttribute('data-suffix') || '');
    });
    sw.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cur') === cur ? 'true' : 'false'); });
    document.querySelectorAll('.cur-note').forEach(function (n) { n.hidden = (cur === 'gbp'); });
    try { localStorage.setItem('bw_cur', cur); } catch (e) {}
  }
  sw.forEach(function (b) {
    b.addEventListener('click', function () {
      var cur = b.getAttribute('data-cur');
      render(cur);
      /* only on a deliberate click, not the initial render */
      bwTrack('currency_switch', { cur: cur });
    });
  });
  /* A US visitor landing on £ is converting currency in their head at the exact
     moment they're deciding whether to trust an unknown brand. So default by
     locale rather than always GBP.

     Timezone, not geo-IP: it needs no third-party service and no edge function,
     and it fails safe. Headless crawlers run in UTC, so Googlebot still resolves
     to GBP and the rendered price keeps matching the GBP prices in our JSON-LD —
     which was the original reason this defaulted to GBP at all.

     A stored preference always wins: the switcher must not be overruled. */
  function localeCur() {
    var tz;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return 'gbp'; }
    if (/^America\//.test(tz)) return 'usd';
    if (/^Europe\//.test(tz) && !/^Europe\/(London|Dublin|Belfast|Guernsey|Isle_of_Man|Jersey)$/.test(tz)) return 'eur';
    return 'gbp';
  }
  var pref; try { pref = localStorage.getItem('bw_cur'); } catch (e) {}
  render(pref || localeCur());
});

/* Break-even calculator.
   The whole point of this block is that the persuasive number is computed from
   the visitor's inputs, not asserted by me. I have no client outcome data, so
   any figure I stated about what a site "brings in" would be an unsubstantiated
   earnings claim — the most heavily enforced category there is. Break-even
   claims nothing: it reports what would have to be true, and it is allowed to
   come back with an answer that says don't buy.

   Rules for anyone editing this later:
     - never predict a gain, only what it takes to cover the price
     - round the answer UP, so the number is never flattering by accident
     - the caveat text stays the same size as the result
     - if the inputs are missing or nonsense, say so; never fall back to a
       default that produces a rosy number the visitor didn't type */
document.addEventListener('DOMContentLoaded', function () {
  var box = document.getElementById('calc');
  if (!box) return;
  var job = document.getElementById('calc-job');
  var margin = document.getElementById('calc-margin');
  var out = document.getElementById('calc-out');
  var curEl = document.getElementById('calc-cur');
  /* Same published prices as the pricing table, so the two can never disagree. */
  var build = { gbp: 895, usd: 1195, eur: 1045 }, sym = { gbp: '£', usd: '$', eur: '€' };

  function currentCur() {
    var on = document.querySelector('.curswitch button[aria-pressed="true"]');
    if (on && build[on.getAttribute('data-cur')]) return on.getAttribute('data-cur');
    var pref; try { pref = localStorage.getItem('bw_cur'); } catch (e) {}
    return build[pref] ? pref : 'gbp';
  }

  function calc() {
    var cur = currentCur(), price = build[cur], s = sym[cur];
    if (curEl) curEl.textContent = s;
    var v = parseFloat(job.value), m = parseFloat(margin.value);
    if (!(v > 0) || !(m > 0) || m > 100) {
      out.textContent = 'Put in a job value and a rough margin and I’ll work out the rest.';
      return;
    }
    var perJob = v * (m / 100);
    /* Ceil, not round: 4.1 jobs is 5 jobs. Rounding down would quietly
       understate what the visitor has to do. */
    var jobs = Math.ceil(price / perJob);
    /* Spread over a year only while that reads as reassurance rather than
       spin. Past one a week it stops being a small ask and the sentence is
       dropped rather than made to sound manageable. */
    var spread = jobs <= 52 ? ' Across a year that\'s ' + (jobs <= 12 ? 'less than one a month.' : 'about ' + Math.ceil(jobs / 12) + ' a month.') : '';
    out.textContent = 'At ' + s + v.toLocaleString('en-US') + ' a job and ' + m + '% margin, you keep about ' + s + Math.round(perJob).toLocaleString('en-US') + ' per job. The ' + s + price.toLocaleString('en-US') + ' build covers itself after ' + jobs + (jobs === 1 ? ' extra job.' : ' extra jobs.') + spread;
  }

  [job, margin].forEach(function (el) { if (el) el.addEventListener('input', calc); });
  document.querySelectorAll('.curswitch button').forEach(function (b) { b.addEventListener('click', calc); });
  calc();
});

/* Referral — stamp the code onto every route a lead can actually arrive by.
   The form is the obvious one; WhatsApp matters more, because the only inbound
   lead this business has ever had came through WhatsApp and would have carried
   no attribution at all. */
document.addEventListener('DOMContentLoaded', function () {
  var code = BW_REF.code;
  if (!code) return;

  /* Netlify Forms reads the hidden input from the deployed HTML, so the field
     must exist in the markup — it cannot be created here. This only fills it. */
  var field = document.getElementById('referred-by');
  if (field) field.value = code;

  /* Shown, not hidden. The client can see who gets credited, which is both the
     honest version and the thing that settles a "who introduced them" dispute
     before it starts. */
  var note = document.getElementById('ref-note');
  if (note) {
    note.textContent = 'Referred by ' + code + ' — they will be credited for this enquiry.';
    note.hidden = false;
  }

  document.querySelectorAll('a[href*="wa.me/"]').forEach(function (a) {
    try {
      var u = new URL(a.href);
      var txt = u.searchParams.get('text') || '';
      if (/\(ref:/.test(txt)) return;
      u.searchParams.set('text', txt + ' (ref: ' + code + ')');
      a.href = u.toString();
    } catch (e) { /* leave the link exactly as authored */ }
  });

  /* Once per session, so a referrer's traffic is visible in analytics without
     every page view inflating the count. */
  try {
    if (!sessionStorage.getItem('bw_ref_seen')) {
      sessionStorage.setItem('bw_ref_seen', '1');
      bwTrack('referral_visit', { ref: code });
    }
  } catch (e) {}
});

/* Referral prompt — invites a visitor to introduce someone.

   Who it is NOT shown to, which is most of the point:
   - anyone who arrived through a referral link (they are the referred
     customer, not a prospective referrer)
   - anyone who has already dismissed it, ever
   - anyone on /partners, /studio or /thanks, which handle this themselves
   - anyone who has not both read most of the page and stayed a while

   That last rule is the important one. Someone still deciding whether to buy
   should not be asked to sell; this waits for a visitor who has read the whole
   thing and not enquired. It also keeps the commission rate off the page — the
   copy says you get paid, not how much, so a customer who sees it learns
   nothing about the margin in their own quote. */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var SEEN = 'bw_refer_dismissed';
  var path = location.pathname.replace(/\/$/, '');
  if (/\/(partners|studio|thanks)$/.test(path)) return;

  try {
    if (localStorage.getItem(SEEN)) return;
    if (localStorage.getItem('bw_ref')) return; /* they were referred here */
  } catch (e) { return; } /* no storage means no way to honour a dismissal */

  var el = document.createElement('aside');
  el.className = 'refer';
  el.setAttribute('aria-label', 'Refer a business');
  el.innerHTML =
    '<b>Know a business that needs a website?</b>' +
    '<p>Introduce them and you get paid when they buy. Setting up your link takes a minute.</p>' +
    '<div class="refer__row">' +
      '<a class="btn" href="/partners">How it works</a>' +
      '<button type="button" class="refer__no">Not for me</button>' +
    '</div>';

  var shown = false;
  var start = Date.now();

  function dismiss() {
    el.classList.remove('in');
    try { localStorage.setItem(SEEN, '1'); } catch (e) {}
    setTimeout(function () { if (el.parentNode) el.remove(); }, 320);
  }

  function maybeShow() {
    if (shown) return;
    /* Don't spend the one-and-only showing on a tab nobody is looking at.
       This also sidesteps requestAnimationFrame being paused while hidden,
       which would leave the card mounted at opacity 0 until they returned. */
    if (document.hidden) return;
    var scrolled = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
    if (scrolled < 0.6 || Date.now() - start < 30000) return;
    shown = true;
    document.body.appendChild(el);
    /* A timer rather than requestAnimationFrame: timers still fire if the tab
       is backgrounded between mount and reveal, rAF does not. */
    setTimeout(function () { el.classList.add('in'); }, 20);
    el.querySelector('.refer__no').addEventListener('click', dismiss);
    el.querySelector('.btn').addEventListener('click', function () {
      try { localStorage.setItem(SEEN, '1'); } catch (e) {}
      if (typeof bwTrack === 'function') bwTrack('refer_prompt_click');
    });
    if (typeof bwTrack === 'function') bwTrack('refer_prompt_shown');
    window.removeEventListener('scroll', maybeShow);
  }

  window.addEventListener('scroll', maybeShow, { passive: true });
  document.addEventListener('visibilitychange', maybeShow);
  setTimeout(maybeShow, 30500);
});
