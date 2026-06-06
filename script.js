/* StoreCraft — behaviour. No inline handlers (CSP: script-src 'self'). */
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js'); // gate reveal so content is visible if this file fails

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- current year ---- */
  var yr = document.getElementById('year');
  if (yr) yr.textContent = new Date().getFullYear();

  /* ---- scroll reveal ---- */
  var reveals = document.querySelectorAll('.reveal');
  if (reduce || !('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('visible'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  }

  /* ---- FAQ accordion ---- */
  document.querySelectorAll('.faq-q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.closest('.faq-item');
      var open = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function (i) {
        i.classList.remove('open');
        i.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
        i.querySelector('.faq-a').style.maxHeight = null;
      });
      if (!open) {
        item.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
        var ans = item.querySelector('.faq-a');
        ans.style.maxHeight = ans.scrollHeight + 'px';
      }
    });
  });

  /* ---- mobile menu ---- */
  var burger = document.querySelector('.burger');
  var menu = document.getElementById('mobile-menu');
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
    });
    menu.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', closeMenu); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMenu(); });
  }

  /* ---- active nav link on scroll ---- */
  var sections = Array.prototype.slice.call(document.querySelectorAll('section[id]'));
  var links = Array.prototype.slice.call(document.querySelectorAll('.nav-links a'));
  if (sections.length && links.length) {
    var onScroll = function () {
      var pos = window.scrollY + 90, current = '';
      sections.forEach(function (s) {
        if (pos >= s.offsetTop && pos < s.offsetTop + s.offsetHeight) current = s.id;
      });
      links.forEach(function (a) {
        a.classList.toggle('active', a.getAttribute('href') === '#' + current);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---- contact form via Formspree (with honeypot) ---- */
  var form = document.getElementById('contact-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      // honeypot: if filled, silently pretend success (bot)
      var hp = form.querySelector('[name="_gotcha"]');
      var btn = form.querySelector('button[type="submit"]');
      var ok = document.getElementById('form-ok');
      if (hp && hp.value) { form.style.display = 'none'; if (ok) ok.classList.add('show'); return; }
      var label = btn.textContent;
      btn.textContent = 'Sending…';
      btn.disabled = true;
      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { 'Accept': 'application/json' }
      }).then(function (res) {
        if (res.ok) {
          form.style.display = 'none';
          if (ok) ok.classList.add('show');
        } else {
          btn.textContent = 'Something went wrong — try Instagram DM';
          btn.disabled = false;
          setTimeout(function () { btn.textContent = label; }, 4000);
        }
      }).catch(function () {
        btn.textContent = 'Something went wrong — try Instagram DM';
        btn.disabled = false;
        setTimeout(function () { btn.textContent = label; }, 4000);
      });
    });
  }
})();
