/* Brickwork — behaviour. No inline handlers (CSP: script-src 'self'). */
document.documentElement.classList.add('js'); // gate reveal/brick so content shows if JS fails

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
      var btn = form.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
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
  var rate = { gbp: 1, usd: 1.27, eur: 1.17 }, sym = { gbp: '£', usd: '$', eur: '€' };
  function render(cur) {
    if (!rate[cur]) cur = 'gbp';
    prices.forEach(function (el) {
      var amt = parseFloat(el.getAttribute('data-amt'));
      if (isNaN(amt)) return;
      var nat = el.getAttribute('data-cur') || 'gbp';
      var v = amt * (rate[cur] / rate[nat]);
      v = v >= 100 ? Math.round(v / 5) * 5 : Math.round(v);
      el.textContent = sym[cur] + v.toLocaleString('en-US') + (el.getAttribute('data-suffix') || '');
    });
    sw.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-cur') === cur ? 'true' : 'false'); });
    document.querySelectorAll('.cur-note').forEach(function (n) { n.hidden = (cur === 'gbp'); });
    try { localStorage.setItem('bw_cur', cur); } catch (e) {}
  }
  sw.forEach(function (b) { b.addEventListener('click', function () { render(b.getAttribute('data-cur')); }); });
  /* default is always GBP so the rendered page matches the GBP prices in our
     JSON-LD — crawlers arrive with no stored preference and must not see $ */
  var pref; try { pref = localStorage.getItem('bw_cur'); } catch (e) {}
  render(pref || 'gbp');
});
