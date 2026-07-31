/* Brickwork — assistant widget. No inline handlers (CSP: script-src 'self').

   Two lanes, and the difference between them is a promise made on the page:

   AI lane (/api/assistant) — the sales pitch, unchanged:
   - The browser talks only to our own origin (connect-src 'self'); the model
     call happens server-side.
   - No cookies, no localStorage: the conversation lives in this closure and
     dies with the tab. Do not "improve" this by persisting history.

   Human lane (/api/chat) — storage is unavoidable here:
   - A person replies minutes or hours later, so the thread has to outlive the
     tab. It is kept server-side for 7 days and the conversation id goes in
     localStorage so a returning visitor finds their reply.
   - The visitor is told this at the moment they switch, and the note under the
     input is rewritten to match. If you change the retention, change both.
   - Nothing is written anywhere until they deliberately press the button.

   Analytics counts opens, message counts and lane switches via the guarded
   bwTrack, never message content. */
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
      '<button type="button" class="bwa__human">Talk to a person instead</button>' +
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

  var human = root.querySelector('.bwa__human');
  var note = root.querySelector('.bwa__note');

  var history = []; /* in memory only, by design */
  var pending = false;

  /* ---- Human lane state ----------------------------------------------------
     The AI lane above stores nothing, ever. This lane has to: a person replies
     minutes later, so the thread outlives the tab. The only client-side state
     is the conversation id — the visitor's own handle on their thread — and it
     is written only after they deliberately switch lanes, never before. */
  var CONVO_STORE = 'bw_chat_id';
  var mode = 'ai';
  var convo = { id: '', seen: 0 };
  var pollTimer = null;
  var laneStartedAt = 0;

  /* Polling schedule. This is the only thing here that runs repeatedly, so it
     is the only thing that can cost anything: each tick is one function
     invocation. Backing off from 4s to 25s and stopping entirely after ten
     minutes turns a ~200-invocation conversation into roughly 60. */
  function pollDelay() {
    var elapsed = Date.now() - laneStartedAt;
    if (elapsed < 120000) return 4000;
    if (elapsed < 300000) return 10000;
    if (elapsed < 600000) return 25000;
    return 0; /* give up quietly; the studio replies by email instead */
  }
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

  /* ---- Human lane ---------------------------------------------------------- */

  function stopPolling() {
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  }

  function schedulePoll() {
    stopPolling();
    var delay = pollDelay();
    if (!delay) {
      addMsg('I’ll stop checking for now so this doesn’t sit spinning. Your message is with the studio either way — you’ll get a reply by email, or reach us on WhatsApp: https://wa.me/447735785911', 'a');
      return;
    }
    pollTimer = setTimeout(function () {
      /* A hidden tab is a tab nobody is reading. Skip the invocation entirely
         and try again on the next tick. */
      if (document.hidden) { schedulePoll(); return; }
      pollOnce();
    }, delay);
  }

  function pollOnce() {
    fetch('/api/chat?id=' + encodeURIComponent(convo.id) + '&since=' + convo.seen)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d && d.msgs && d.msgs.length) {
          setTyping(false);
          d.msgs.forEach(function (m) { addMsg(m.t, 'a'); });
          convo.seen = d.total;
          /* A real reply means someone is at the other end — go back to the
             fast cadence rather than continuing to decay. */
          laneStartedAt = Date.now();
          track('chat_reply_received');
        }
      })
      .catch(function () { /* transient; the next tick retries */ })
      .then(schedulePoll);
  }

  function sendHuman(text) {
    if (pending || !text) return;
    pending = true;
    send.disabled = true;
    addMsg(text, 'u');
    setTyping(true);

    fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: convo.id, text: text })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        setTyping(false);
        if (d && d.blocked) { addMsg(d.reply, 'a'); stopPolling(); return; }
        if (d && d.id) {
          convo.id = d.id;
          try { localStorage.setItem(CONVO_STORE, d.id); } catch (e) {}
          if (d.isNew) {
            addMsg('Sent. Safa will see this — replies usually come within a few hours, and this window will show them if you keep it open. Leave your email or number in a message if you’d rather be reached directly.', 'a');
          }
          laneStartedAt = Date.now();
          schedulePoll();
        }
      })
      .catch(function () {
        setTyping(false);
        addMsg('That didn’t send. WhatsApp is the reliable route: https://wa.me/447735785911', 'a');
      })
      .then(function () {
        pending = false;
        send.disabled = false;
        input.focus();
      });
  }

  function enterHumanLane(resumed) {
    mode = 'human';
    human.hidden = true;
    chips.hidden = true;
    laneStartedAt = Date.now();
    root.querySelector('.bwa__sub').textContent = 'Talking to Safa · stored so he can reply';
    /* The page-level privacy claim is true of the AI lane and false of this
       one. Say so here rather than leaving the old note contradicting it. */
    note.textContent = 'This conversation is kept on the studio’s own server for up to 7 days so your message can be answered. Nothing is shared with anyone else.';
    input.placeholder = 'Write your message…';
    if (resumed) {
      addMsg('Picking up where you left off. Anything new to add?', 'a');
      schedulePoll();
    } else {
      addMsg('You’re through to the studio now — a real person, not the AI. Say what you need and Safa will pick it up. Heads up: unlike the AI chat, this one is stored so it can be replied to.', 'a');
    }
    track('chat_human_lane', { resumed: !!resumed });
    input.focus();
  }

  human.addEventListener('click', function () { enterHumanLane(false); });

  /* Coming back to the tab should feel instant. Without this the visitor waits
     out whatever backoff was running when they left — up to 25 seconds staring
     at a reply that already arrived. */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || mode !== 'human' || !convo.id || !pollTimer) return;
    stopPolling();
    pollOnce();
  });

  /* Resume an existing thread so a returning visitor sees the reply they were
     waiting for. Ids carry a base36 timestamp; anything past the server's
     7-day window is dropped rather than resumed into a dead thread. */
  function resumeSaved() {
    var saved = '';
    try { saved = localStorage.getItem(CONVO_STORE) || ''; } catch (e) {}
    if (!saved || !/^[a-z0-9]{6,10}-[a-z0-9]{4,8}$/.test(saved)) return false;
    var startedAt = parseInt(saved.split('-')[0], 36);
    if (!startedAt || Date.now() - startedAt > 7 * 864e5) {
      try { localStorage.removeItem(CONVO_STORE); } catch (e) {}
      return false;
    }
    convo.id = saved;
    enterHumanLane(true);
    return true;
  }

  /* A returning visitor mid-conversation gets their thread, not a fresh AI
     greeting that reads as though the studio forgot them. */
  if (!resumeSaved()) {
    addMsg('Hi — I’m the studio’s AI assistant, running privately on this site: no account, no cookies, nothing stored. Ask about prices, the free mockup, or how the 7-day build works.', 'a');
    STARTERS.forEach(function (q) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = q;
      b.addEventListener('click', function () { ask(q); });
      chips.appendChild(b);
    });
  }

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
    if (mode === 'human') sendHuman(text); else ask(text);
  });
});
