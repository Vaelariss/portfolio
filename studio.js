/* Brickwork — studio inbox. Internal tool, noindex, never linked from the site.

   The key lives in localStorage on the studio's own machine and is sent as a
   header on every request; it is never in the markup or the repo. Losing the
   device means rotating STUDIO_KEY, which is one CLI command.

   Polling here is deliberately slow (15s). This page is open on one screen at
   most, so it is not a meaningful cost — but there is no reason for it to be
   fast either, since the email notification is what actually gets attention. */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var KEY_STORE = 'bw_studio_key';
  var POLL_MS = 15000;

  var gate = document.getElementById('st-gate');
  var app = document.getElementById('st-app');
  var keyInput = document.getElementById('st-key');
  var unlock = document.getElementById('st-unlock');
  var list = document.getElementById('st-list');
  var meta = document.getElementById('st-meta');
  var msgs = document.getElementById('st-msgs');
  var replyForm = document.getElementById('st-reply');
  var replyText = document.getElementById('st-text');
  var status = document.getElementById('st-status');

  var key = '';
  var convos = [];
  var currentId = location.hash.replace('#', '') || '';
  var timer = null;

  try { key = localStorage.getItem(KEY_STORE) || ''; } catch (e) {}

  function setStatus(t) { status.textContent = t; }

  function api(method, body) {
    return fetch('/api/studio', {
      method: method,
      headers: body
        ? { 'content-type': 'application/json', 'x-studio-key': key }
        : { 'x-studio-key': key },
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      if (r.status === 401) throw new Error('unauthorised');
      return r.json();
    });
  }

  function when(ts) {
    var d = new Date(ts);
    var today = new Date();
    var sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ' +
        d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /* Everything a visitor typed enters the DOM as text, never markup. */
  function renderThread(c) {
    msgs.textContent = '';
    meta.textContent = c.contact
      ? 'Contact: ' + c.contact + '  ·  ' + c.id
      : 'No contact given  ·  ' + c.id;
    c.msgs.forEach(function (m) {
      var el = document.createElement('div');
      el.className = 'st__m st__m--' + m.who;
      el.appendChild(document.createTextNode(m.t));
      var t = document.createElement('time');
      t.textContent = when(m.at);
      el.appendChild(t);
      msgs.appendChild(el);
    });
    msgs.scrollTop = msgs.scrollHeight;
    replyForm.hidden = false;
  }

  function renderList() {
    list.textContent = '';
    if (!convos.length) {
      var none = document.createElement('div');
      none.className = 'st__item st__empty';
      none.textContent = 'No conversations yet.';
      list.appendChild(none);
      return;
    }
    convos.forEach(function (c) {
      var b = document.createElement('button');
      b.className = 'st__item';
      b.type = 'button';
      b.setAttribute('aria-current', c.id === currentId ? 'true' : 'false');

      var title = document.createElement('b');
      if (c.unread) {
        var dot = document.createElement('span');
        dot.className = 'st__dot';
        title.appendChild(dot);
      }
      title.appendChild(document.createTextNode(c.contact || 'Anonymous visitor'));

      var last = c.msgs.length ? c.msgs[c.msgs.length - 1] : null;
      var sub = document.createElement('span');
      sub.textContent = last ? when(last.at) + ' — ' + last.t : 'Empty';

      b.appendChild(title);
      b.appendChild(sub);
      b.addEventListener('click', function () { select(c.id); });
      list.appendChild(b);
    });
  }

  function select(id) {
    currentId = id;
    location.hash = id;
    var c = convos.filter(function (x) { return x.id === id; })[0];
    if (c) {
      renderThread(c);
      /* A bare POST with no text marks it read without sending anything. */
      if (c.unread) api('POST', { id: id }).then(load).catch(function () {});
    }
    renderList();
  }

  function load() {
    return api('GET').then(function (data) {
      convos = data.convos || [];
      var unread = convos.filter(function (c) { return c.unread; }).length;
      setStatus(convos.length + ' conversation' + (convos.length === 1 ? '' : 's') +
        (unread ? ' · ' + unread + ' unread' : ''));
      document.title = unread ? '(' + unread + ') Studio inbox' : 'Studio inbox';
      renderList();
      var c = convos.filter(function (x) { return x.id === currentId; })[0];
      if (c) renderThread(c);
    }).catch(function (err) {
      if (err && err.message === 'unauthorised') {
        try { localStorage.removeItem(KEY_STORE); } catch (e) {}
        key = '';
        showGate();
        setStatus('Key rejected.');
      } else {
        setStatus('Offline — retrying.');
      }
    });
  }

  /* Partners are near-static — loaded once per unlock rather than polled, so
     the inbox poll stays a single request. */
  function loadPartners() {
    var wrap = document.getElementById('st-partners');
    var list = document.getElementById('st-plist');
    var count = document.getElementById('st-pcount');
    if (!wrap || !list) return;

    fetch('/api/partner', { headers: { 'x-studio-key': key } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var partners = (d && d.partners) || [];
        list.textContent = '';
        count.textContent = partners.length
          ? partners.length + (partners.length === 1 ? ' partner' : ' partners')
          : 'Nobody has signed up yet. The link to send is /partners';
        partners.forEach(function (p) {
          var tr = document.createElement('tr');
          [p.code, p.name, p.email, when(p.at), p.note || '—'].forEach(function (v) {
            var td = document.createElement('td');
            td.appendChild(document.createTextNode(String(v)));
            tr.appendChild(td);
          });
          var actions = document.createElement('td');
          var del = document.createElement('button');
          del.type = 'button';
          del.className = 'st__del';
          del.textContent = 'Remove';
          del.addEventListener('click', function () {
            /* Irreversible and the row is the only record of who owns the
               code, so make it deliberate. */
            if (!window.confirm('Remove partner "' + p.name + '" (' + p.code + ')?\n\nThis deletes the record of who owns that code. Anyone already using the link stays tagged, but there would be nobody to pay.')) return;
            fetch('/api/partner', {
              method: 'DELETE',
              headers: { 'content-type': 'application/json', 'x-studio-key': key },
              body: JSON.stringify({ code: p.code }),
            }).then(loadPartners).catch(function () {});
          });
          actions.appendChild(del);
          tr.appendChild(actions);
          list.appendChild(tr);
        });
        wrap.hidden = false;
      })
      .catch(function () { /* the inbox is the priority; partners can wait */ });
  }

  function showGate() {
    gate.hidden = false;
    app.hidden = true;
    var wrap = document.getElementById('st-partners');
    if (wrap) wrap.hidden = true;
    if (timer) { clearInterval(timer); timer = null; }
  }

  function showApp() {
    gate.hidden = true;
    app.hidden = false;
    load();
    loadPartners();
    if (timer) clearInterval(timer);
    /* Pause while the tab is hidden — no reason to poll a screen nobody is on. */
    timer = setInterval(function () { if (!document.hidden) load(); }, POLL_MS);
  }

  unlock.addEventListener('click', function () {
    key = keyInput.value.trim();
    if (!key) return;
    try { localStorage.setItem(KEY_STORE, key); } catch (e) {}
    showApp();
  });
  keyInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') unlock.click();
  });

  replyForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = replyText.value.trim();
    if (!text || !currentId) return;
    replyText.value = '';
    setStatus('Sending…');
    api('POST', { id: currentId, text: text })
      .then(load)
      .catch(function () { setStatus('Send failed — the text is still in your clipboard buffer, retype it.'); });
  });
  replyText.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      replyForm.dispatchEvent(new Event('submit'));
    }
  });

  if (key) showApp(); else showGate();
});
