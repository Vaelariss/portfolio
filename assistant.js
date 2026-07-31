/* Brickwork — assistant widget. No inline handlers (CSP: script-src 'self').

   Privacy model, which is also the sales pitch:
   - The browser talks only to /api/assistant on our own origin
     (connect-src 'self' — the AI call happens server-side).
   - No cookies, no localStorage: the conversation lives in this closure and
     dies with the tab. Do not "improve" this by persisting history.
   - Analytics counts opens and message counts via the guarded bwTrack,
     never message content. */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  /* Skeleton is author-controlled markup; visitor/model text only ever enters
     the DOM through textContent (see addMsg). */
  var root = document.createElement('div');
  root.innerHTML =
    '<button class="bwa-launch" aria-expanded="false" aria-controls="bwa-panel">Ask us</button>' +
    '<section class="bwa" id="bwa-panel" role="dialog" aria-label="Brickwork assistant">' +
      '<header class="bwa__head">' +
        '<div><div class="bwa__title">Ask Brickwork</div>' +
        '<div class="bwa__sub">Private AI &middot; nothing stored</div></div>' +
        '<button class="bwa__close" aria-label="Close chat">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>' +
        '</button>' +
      '</header>' +
      '<div class="bwa__log" aria-live="polite"></div>' +
      '<div class="bwa__chips"></div>' +
      '<form class="bwa__form">' +
        '<input type="text" maxlength="500" placeholder="Ask about prices, process&hellip;" aria-label="Your question">' +
        '<button type="submit" class="bwa__send" aria-label="Send">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>' +
        '</button>' +
      '</form>' +
      '<div class="bwa__note">No account &middot; no cookies &middot; chat not stored. AI answers can slip &mdash; confirm anything important on WhatsApp.</div>' +
    '</section>';
  document.body.appendChild(root);

  var launch = root.querySelector('.bwa-launch');
  var panel = root.querySelector('.bwa');
  var log = root.querySelector('.bwa__log');
  var chips = root.querySelector('.bwa__chips');
  var form = root.querySelector('.bwa__form');
  var input = form.querySelector('input');
  var send = form.querySelector('.bwa__send');

  var history = []; /* in memory only, by design */
  var pending = false;
  var track = function (name, props) {
    if (typeof bwTrack === 'function') bwTrack(name, props);
  };

  var STARTERS = [
    'What does a website cost?',
    'How does the free mockup work?',
    'Can you build an assistant like this for my business?'
  ];

  var OFFLINE =
    'The assistant is offline at the moment. WhatsApp is the fastest way to reach the studio: https://wa.me/447735785911 — or use the contact form on this page.';

  /* Render plain text; the only transformation is linkifying bare https URLs
     (the model is instructed to answer in plain text with bare URLs). Text
     enters via createTextNode, so nothing the model or visitor types can
     become markup. */
  function addMsg(text, who) {
    var m = document.createElement('div');
    m.className = 'bwa-m bwa-m--' + who;
    var parts = String(text).split(/(https:\/\/[^\s)]+)/g);
    parts.forEach(function (p) {
      if (/^https:\/\//.test(p)) {
        var a = document.createElement('a');
        var clean = p.replace(/[.,;!?]+$/, '');
        a.href = clean;
        a.target = '_blank';
        a.rel = 'noopener';
        a.textContent = clean.replace(/^https:\/\/(www\.)?/, '');
        m.appendChild(a);
      } else if (p) {
        m.appendChild(document.createTextNode(p));
      }
    });
    log.appendChild(m);
    log.scrollTop = log.scrollHeight;
    return m;
  }

  function setTyping(on) {
    var t = log.querySelector('.bwa-typing');
    if (on && !t) {
      t = document.createElement('div');
      t.className = 'bwa-m bwa-m--a bwa-typing';
      t.innerHTML = '<i></i><i></i><i></i>';
      log.appendChild(t);
      log.scrollTop = log.scrollHeight;
    } else if (!on && t) {
      t.remove();
    }
  }

  function ask(text) {
    if (pending || !text) return;
    pending = true;
    send.disabled = true;
    chips.hidden = true; /* starters are for the first exchange only */
    addMsg(text, 'u');
    history.push({ role: 'user', content: text });
    setTyping(true);
    track('assistant_message', { n: Math.ceil(history.length / 2) });

    fetch('/api/assistant', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: history.slice(-10) })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var reply = (d && d.reply) || OFFLINE;
        /* an offline/fallback answer is not part of the model conversation */
        if (!(d && d.offline)) history.push({ role: 'assistant', content: reply });
        setTyping(false);
        addMsg(reply, 'a');
      })
      .catch(function () {
        setTyping(false);
        addMsg(OFFLINE, 'a');
      })
      .then(function () {
        pending = false;
        send.disabled = false;
        input.focus();
      });
  }

  /* greeting + starter chips — client-side, costs no API call */
  addMsg('Hi — I’m the studio’s AI assistant, running privately on this site: no account, no cookies, nothing stored. Ask about prices, the free mockup, or how the 7-day build works.', 'a');
  STARTERS.forEach(function (q) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = q;
    b.addEventListener('click', function () { ask(q); });
    chips.appendChild(b);
  });

  function open() {
    panel.classList.add('open');
    document.body.classList.add('bwa-open');
    launch.setAttribute('aria-expanded', 'true');
    input.focus();
    track('assistant_open');
  }
  function close() {
    panel.classList.remove('open');
    document.body.classList.remove('bwa-open');
    launch.setAttribute('aria-expanded', 'false');
    launch.focus();
  }

  launch.addEventListener('click', open);
  root.querySelector('.bwa__close').addEventListener('click', close);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && panel.classList.contains('open')) close();
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault(); /* this form never posts anywhere — not a Netlify form */
    var text = input.value.trim();
    input.value = '';
    ask(text);
  });
});
