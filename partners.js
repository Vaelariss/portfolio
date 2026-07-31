/* Brickwork — partner self-signup. No inline handlers (CSP: script-src 'self').

   The point of this page is that nobody waits on the studio: submit, get your
   link on screen, start sending people. The code is derived from the name so
   the link is memorable and the partner can recognise their own referrals. */
document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  var form = document.getElementById('p-form');
  if (!form) return;

  var submit = document.getElementById('p-submit');
  var err = document.getElementById('p-err');
  var done = document.getElementById('p-done');
  var linkEl = document.getElementById('p-link');
  var copy = document.getElementById('p-copy');

  function fail(msg) {
    err.textContent = msg;
    err.hidden = false;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    err.hidden = true;

    var payload = {
      name: document.getElementById('p-name').value.trim(),
      email: document.getElementById('p-email').value.trim(),
      note: document.getElementById('p-note').value.trim(),
      company: document.getElementById('p-company').value, /* honeypot */
    };
    if (!payload.name) return fail('Please add your name.');
    if (!payload.email) return fail('Please add an email so you can be paid.');

    submit.disabled = true;
    submit.textContent = 'Creating…';

    fetch('/api/partner', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d || !d.ok) {
          fail((d && d.error) || 'That didn’t go through. Try WhatsApp and it’ll be sorted by hand.');
          return;
        }
        form.hidden = true;
        linkEl.textContent = d.link;
        done.hidden = false;
        if (typeof bwTrack === 'function') bwTrack('partner_signup');
      })
      .catch(function () {
        fail('That didn’t go through. Try WhatsApp and it’ll be sorted by hand: https://wa.me/447735785911');
      })
      .then(function () {
        submit.disabled = false;
        submit.textContent = 'Create my link';
      });
  });

  copy.addEventListener('click', function () {
    var text = linkEl.textContent;
    function ok() { copy.textContent = 'Copied'; setTimeout(function () { copy.textContent = 'Copy link'; }, 1800); }
    /* navigator.clipboard needs a secure context; the range fallback keeps this
       working over plain http on netlify dev. */
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, function () { selectFallback(); });
    } else {
      selectFallback();
    }
    function selectFallback() {
      var r = document.createRange();
      r.selectNodeContents(linkEl);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      copy.textContent = 'Press Ctrl+C';
    }
  });
});
